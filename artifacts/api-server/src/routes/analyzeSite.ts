import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { eq, and } from "drizzle-orm";
import {
  db,
  clientBriefsTable,
  propertiesTable,
  sectorsTable,
  zonesTable,
  structuresTable,
  designedSwalesTable,
  sensoryVectorsTable,
} from "@workspace/db";
import { GoogleGenerativeAI } from "@google/generative-ai";

interface SpatialRecommendation {
  id: string;
  label: string;
  ecologicalFunction: string;
  priority: "critical" | "high" | "medium";
  bearingRange: [number, number];
  radiusFraction: number;
  suggestedZones?: number[];
  rationale: string;
}

const router: IRouter = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function bearingLabel(startAngle: number, endAngle: number): string {
  const mid = (startAngle + endAngle) / 2;
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const idx = Math.round(((mid % 360) + 360) % 360 / 45) % 8;
  return dirs[idx];
}

function bearingToCompass(deg: number): string {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
}

function deriveRegion(lat: number, lng: number): string {
  const hemi = lat < 0 ? "Southern Hemisphere" : "Northern Hemisphere";
  if (lat < -10 && lat > -45 && lng > 110 && lng < 156) {
    if (lat < -28 && lng > 135) return `Eastern Australia (NSW / VIC / SE QLD), ${hemi}`;
    if (lng < 130)              return `Western Australia, ${hemi}`;
    if (lat > -28)              return `Tropical / Sub-tropical Northern Australia (QLD / NT), ${hemi}`;
    return `Australia, ${hemi}`;
  }
  if (lat < -34 && lat > -48 && lng > 166 && lng < 179) return `New Zealand, ${hemi}`;
  if (lat < -22 && lat > -35 && lng > 16 && lng < 33)   return `South Africa, ${hemi}`;
  if (lat < 0 && lng > -82 && lng < -34)                 return `South America, ${hemi}`;
  if (lat > 24 && lat < 72 && lng > -168 && lng < -52) {
    if (lat > 50) return `Canada / Pacific Northwest, ${hemi}`;
    if (lng < -100) return `Western USA, ${hemi}`;
    return `Eastern / Central USA, ${hemi}`;
  }
  if (lat > 36 && lat < 72 && lng > -12 && lng < 45)    return `Europe, ${hemi}`;
  if (lat > 20 && lat < 55 && lng > 100 && lng < 145)   return `East Asia, ${hemi}`;
  if (lat > -10 && lat < 30 && lng > 65 && lng < 140)   return `South / Southeast Asia, ${hemi}`;
  if (lat > -35 && lat < 18 && lng > -18 && lng < 51)   return `Sub-Saharan Africa, ${hemi}`;
  if (lat > 15 && lat < 40 && lng > 30 && lng < 65)     return `Middle East, ${hemi}`;
  return `Coordinates ${lat.toFixed(1)}°, ${lng.toFixed(1)}° (${hemi})`;
}

function roughCentroid(geojson: unknown): { lat: number; lng: number } | null {
  try {
    const parsed = typeof geojson === "string" ? JSON.parse(geojson) : geojson;
    const geo = parsed as { type: string; coordinates: number[][][] | number[][][][] };
    let coords: number[][] = [];
    if (geo.type === "Polygon")            coords = geo.coordinates[0] as number[][];
    else if (geo.type === "MultiPolygon")  coords = (geo.coordinates[0] as number[][][])[0] as number[][];
    if (!coords.length) return null;
    const lng = coords.reduce((s, c) => s + c[0], 0) / coords.length;
    const lat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
    return { lat, lng };
  } catch { return null; }
}

// ─── JSON sanitization & repair pipeline ──────────────────────────────────────

/**
 * Stage 1 — Sanitize: strips markdown fences, trailing commas, and unescaped
 * control characters inside string literals. Safe to run on any raw LLM output.
 */
function sanitizeJson(raw: string): string {
  let s = raw.trim();

  // Strip leading/trailing markdown code fences  (```json … ``` or ``` … ```)
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

  // Remove trailing commas before } or ]  — LLMs emit these constantly
  s = s.replace(/,(\s*[}\]])/g, "$1");

  // Fix unescaped literal newlines / CR / tabs that appear INSIDE string literals.
  // Walk char-by-char so we only touch characters inside JSON strings.
  const chars: string[] = [];
  let inStr = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (ch === "\\") {
        chars.push(ch);
        if (i + 1 < s.length) chars.push(s[++i]);
        continue;
      }
      if (ch === '"') { inStr = false; chars.push(ch); continue; }
      if (ch === "\n") { chars.push("\\n"); continue; }
      if (ch === "\r") { chars.push("\\r"); continue; }
      if (ch === "\t") { chars.push("\\t"); continue; }
    } else {
      if (ch === '"') inStr = true;
    }
    chars.push(ch);
  }
  return chars.join("");
}

/**
 * Stage 2 — Repair: closes any unclosed strings/objects/arrays left behind by
 * LLM token-limit truncation. Must run AFTER sanitizeJson.
 */
function repairJson(raw: string): string {
  const stack: string[] = [];
  let inString = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (ch === "\\" && i + 1 < raw.length) { i++; continue; }
      if (ch === '"') inString = false;
    } else {
      if (ch === '"')                    { inString = true; }
      else if (ch === "{")               { stack.push("}"); }
      else if (ch === "[")               { stack.push("]"); }
      else if (ch === "}" || ch === "]") { if (stack.length > 0) stack.pop(); }
    }
  }
  let out = raw;
  if (inString) out += '"';
  while (stack.length > 0) out += stack.pop()!;
  return out;
}

/**
 * Stage 3 — Partial extractor: regex-scans raw text for the known top-level
 * keys and bracket-matches nested objects. Returns whatever is readable so the
 * caller always gets a usable object instead of throwing.
 */
function extractPartialAnalysis(raw: string): {
  WaterStrategy: unknown; SunAndEnergy: unknown; LandAndBiodiversity: unknown;
  ClimateResilience: unknown; InfrastructureCritique: unknown;
  PatternStrategy: unknown; DesignRecommendations: unknown;
  SpatialRecommendations: unknown;
} {
  function extractStr(key: string): string {
    const m = raw.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, "s"));
    if (!m) return "";
    return m[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\t/g, "\t");
  }

  function extractObj(key: string): unknown {
    const sm = raw.match(new RegExp(`"${key}"\\s*:\\s*(\\{|\\[)`));
    if (!sm || sm.index === undefined) return null;
    const openIdx = sm.index + sm[0].length - 1;
    const open = raw[openIdx];
    const close = open === "{" ? "}" : "]";
    let depth = 0, inStr2 = false, end = openIdx;
    for (let i = openIdx; i < raw.length; i++) {
      const ch = raw[i];
      if (inStr2) {
        if (ch === "\\") { i++; continue; }
        if (ch === '"') inStr2 = false;
      } else {
        if (ch === '"') inStr2 = true;
        else if (ch === open)  depth++;
        else if (ch === close) { depth--; if (depth === 0) { end = i; break; } }
      }
    }
    try { return JSON.parse(raw.slice(openIdx, end + 1)); } catch { return null; }
  }

  return {
    WaterStrategy:          extractStr("WaterStrategy"),
    SunAndEnergy:           extractStr("SunAndEnergy"),
    LandAndBiodiversity:    extractStr("LandAndBiodiversity"),
    ClimateResilience:      extractStr("ClimateResilience"),
    InfrastructureCritique: extractStr("InfrastructureCritique"),
    PatternStrategy:        extractObj("PatternStrategy"),
    DesignRecommendations:  extractObj("DesignRecommendations"),
    SpatialRecommendations: extractObj("SpatialRecommendations"),
  };
}

// ─── Live climate fetch (Open-Meteo + NASA POWER) ─────────────────────────────

interface LiveClimate {
  annualPrecipMm:   number | null;
  prevailingWind:   string | null;
  meanWindSpeedMs:  number | null;
  meanAnnualTempC:  number | null;
  summerMaxTempC:   number | null;
  winterMinTempC:   number | null;
  frostDaysPerYear: number | null;
  solarKwhM2:       number | null;
  source: "live" | "failed";
}

async function fetchLiveClimate(lat: number, lng: number): Promise<LiveClimate> {
  const failed: LiveClimate = {
    annualPrecipMm: null, prevailingWind: null, meanWindSpeedMs: null,
    meanAnnualTempC: null, summerMaxTempC: null, winterMinTempC: null,
    frostDaysPerYear: null, solarKwhM2: null, source: "failed",
  };
  try {
    const today     = new Date();
    const endDate   = today.toISOString().slice(0, 10);
    const startDate = new Date(today.getFullYear() - 3, today.getMonth(), today.getDate())
      .toISOString().slice(0, 10);

    const [meteoRes, nasaRes] = await Promise.allSettled([
      fetch(
        `https://archive-api.open-meteo.com/v1/archive` +
        `?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}` +
        `&start_date=${startDate}&end_date=${endDate}` +
        `&daily=precipitation_sum,temperature_2m_mean,temperature_2m_max,temperature_2m_min` +
        `&timezone=UTC`,
        { signal: AbortSignal.timeout(12_000) },
      ),
      fetch(
        `https://power.larc.nasa.gov/api/temporal/climatology/point` +
        `?parameters=ALLSKY_SFC_SW_DWN,WS10M,WD10M` +
        `&community=AG` +
        `&longitude=${lng.toFixed(4)}&latitude=${lat.toFixed(4)}` +
        `&format=JSON`,
        { signal: AbortSignal.timeout(12_000) },
      ),
    ]);

    // ── Open-Meteo ──
    let annualPrecipMm: number | null = null;
    let meanAnnualTempC: number | null = null;
    let summerMaxTempC: number | null = null;
    let winterMinTempC: number | null = null;
    let frostDaysPerYear: number | null = null;

    if (meteoRes.status === "fulfilled" && meteoRes.value.ok) {
      const d = await meteoRes.value.json() as {
        daily: {
          time: string[];
          precipitation_sum: (number | null)[];
          temperature_2m_mean: (number | null)[];
          temperature_2m_max: (number | null)[];
          temperature_2m_min: (number | null)[];
        };
      };
      const { time, precipitation_sum, temperature_2m_mean, temperature_2m_max, temperature_2m_min } = d.daily;

      annualPrecipMm = Math.round(precipitation_sum.reduce<number>((s, v) => s + (v ?? 0), 0) / 3);

      const means = temperature_2m_mean.filter((v): v is number => v !== null);
      meanAnnualTempC = means.length ? Math.round(means.reduce((s, v) => s + v, 0) / means.length * 10) / 10 : null;

      frostDaysPerYear = Math.round(
        temperature_2m_min.filter((v): v is number => v !== null && v < 0).length / 3,
      );

      // Monthly buckets for summer/winter extremes
      const mxSums = Array(12).fill(0); const mxN = Array(12).fill(0);
      const mnSums = Array(12).fill(0); const mnN = Array(12).fill(0);
      for (let i = 0; i < time.length; i++) {
        const m = new Date(time[i]).getMonth();
        const mx = temperature_2m_max[i]; const mn = temperature_2m_min[i];
        if (mx !== null) { mxSums[m] += mx; mxN[m]++; }
        if (mn !== null) { mnSums[m] += mn; mnN[m]++; }
      }
      const mxAvg = mxSums.map((s, i) => mxN[i] > 0 ? s / mxN[i] : null);
      const mnAvg = mnSums.map((s, i) => mnN[i] > 0 ? s / mnN[i] : null);
      const top3Max = [...mxAvg].sort((a, b) => (b ?? -99) - (a ?? -99)).slice(0, 3).filter((v): v is number => v !== null);
      const bot3Min = [...mnAvg].sort((a, b) => (a ?? 99) - (b ?? 99)).slice(0, 3).filter((v): v is number => v !== null);
      summerMaxTempC = top3Max.length ? Math.round(top3Max.reduce((s, v) => s + v, 0) / top3Max.length * 10) / 10 : null;
      winterMinTempC = bot3Min.length ? Math.round(bot3Min.reduce((s, v) => s + v, 0) / bot3Min.length * 10) / 10 : null;
    }

    // ── NASA POWER ──
    let prevailingWind: string | null = null;
    let meanWindSpeedMs: number | null = null;
    let solarKwhM2: number | null = null;

    if (nasaRes.status === "fulfilled" && nasaRes.value.ok) {
      const nd = await nasaRes.value.json() as { properties: { parameter: Record<string, Record<string, number>> } };
      const p = nd.properties.parameter;
      const windDeg = p["WD10M"]?.["ANN"] ?? null;
      if (windDeg !== null) prevailingWind = bearingToCompass(windDeg);
      const ws = p["WS10M"]?.["ANN"] ?? null;
      if (ws !== null) meanWindSpeedMs = Math.round(ws * 10) / 10;
      const sol = p["ALLSKY_SFC_SW_DWN"]?.["ANN"] ?? null;
      if (sol !== null) solarKwhM2 = Math.round(sol * 365);
    }

    return {
      annualPrecipMm, prevailingWind, meanWindSpeedMs,
      meanAnnualTempC, summerMaxTempC, winterMinTempC, frostDaysPerYear,
      solarKwhM2, source: "live",
    };
  } catch { return failed; }
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

function formatCoord(lng: number, lat: number) {
  return `${Math.abs(lat).toFixed(5)}°${lat >= 0 ? "N" : "S"}, ${Math.abs(lng).toFixed(5)}°${lng >= 0 ? "E" : "W"}`;
}

function geomSummary(geojson: string): string {
  try {
    const g = JSON.parse(geojson) as { type: string; coordinates: unknown };
    if (g.type === "Point") {
      const [lng, lat] = g.coordinates as [number, number];
      return `point at ${formatCoord(lng, lat)}`;
    }
    if (g.type === "LineString") {
      const coords = g.coordinates as [number, number][];
      const first = coords[0];
      const last  = coords[coords.length - 1];
      return `line from ${formatCoord(first[0], first[1])} → ${formatCoord(last[0], last[1])} (${coords.length} nodes)`;
    }
    return g.type;
  } catch { return "unknown geometry"; }
}

function buildPrompt(
  property: typeof propertiesTable.$inferSelect,
  brief: typeof clientBriefsTable.$inferSelect,
  sectors: Array<typeof sectorsTable.$inferSelect>,
  zoneCount: number,
  climate: LiveClimate,
  structures: Array<typeof structuresTable.$inferSelect>,
  swales: Array<typeof designedSwalesTable.$inferSelect>,
  sensoryVectors: Array<typeof sensoryVectorsTable.$inferSelect>,
): string {
  const centroid = roughCentroid(property.boundaryGeojson);
  const region   = centroid ? deriveRegion(centroid.lat, centroid.lng) : "unknown region";

  const challenges: string[] = [];
  if (brief.challengeSevereErosion)  challenges.push("severe erosion");
  if (brief.challengeWinterFlooding) challenges.push("winter flooding");
  if (brief.challengeHighWind)       challenges.push("high wind exposure");
  if (brief.challengeWildlifePressure) challenges.push("wildlife pressure");

  const utilities: string[] = [];
  if (brief.utilitiesOverheadPower)   utilities.push("overhead power lines");
  if (brief.utilitiesBuriedPipes)     utilities.push("buried pipes");
  if (brief.utilitiesLegalEasements)  utilities.push("legal easements");
  if (brief.utilitiesActiveWell)      utilities.push("active well");

  // Climate — live data overrides user brief where available
  const precipDisplay = climate.annualPrecipMm != null
    ? `${climate.annualPrecipMm} mm/yr  [LIVE — 3yr Open-Meteo archive]`
    : brief.annualRainfallMm != null ? `${brief.annualRainfallMm} mm/yr  [user estimate]`
    : "unknown";
  const windDisplay = climate.prevailingWind != null
    ? `${climate.prevailingWind}${climate.meanWindSpeedMs != null ? ` @ ${climate.meanWindSpeedMs} m/s` : ""}  [LIVE — NASA POWER 30yr]`
    : brief.prevailingWindDir ? `${brief.prevailingWindDir}  [user estimate]`
    : "unknown";
  const solarDisplay = climate.solarKwhM2 != null
    ? `${climate.solarKwhM2} kWh/m²/yr  [LIVE — NASA POWER]`
    : brief.solarIrradianceKwhM2 != null ? `${brief.solarIrradianceKwhM2} kWh/m²/yr  [user estimate]`
    : "unknown";
  const summerTempDisplay = climate.summerMaxTempC != null
    ? `${climate.summerMaxTempC} °C  [LIVE]`
    : brief.summerMaxTempC != null ? `${brief.summerMaxTempC} °C  [user estimate]`
    : "unknown";
  const winterTempDisplay = climate.winterMinTempC != null
    ? `${climate.winterMinTempC} °C  [LIVE]`
    : brief.winterMinTempC != null ? `${brief.winterMinTempC} °C  [user estimate]`
    : "unknown";
  const frostDisplay = climate.frostDaysPerYear != null
    ? `${climate.frostDaysPerYear} days/yr  [LIVE]`
    : brief.frostDaysPerYear != null ? `${brief.frostDaysPerYear} days/yr  [user estimate]`
    : "unknown";

  // Sectors
  const sectorSummary = sectors.length > 0
    ? sectors.map(s => `  - ${s.label || s.sectorType} (${bearingLabel(s.startAngle, s.endAngle)}, ${s.startAngle}°–${s.endAngle}°, R=${s.radiusKm}km)`).join("\n")
    : "  - None mapped";

  // ── User-drawn infrastructure ──
  const structureSummary = structures.length > 0
    ? structures.map(s => `  - [STRUCTURE] ${s.label} (type: ${s.structureType}) @ ${formatCoord(s.lng, s.lat)}${s.footprintGeojson ? " — has footprint polygon" : ""}`)
        .join("\n")
    : "  - None placed";

  const swaleSummary = swales.length > 0
    ? swales.map(s => `  - [SWALE] "${s.name}" (${s.swaleType}) — ${s.lengthM.toFixed(0)} m @ elev ${s.elevationM.toFixed(1)} m`)
        .join("\n")
    : "  - None designed";

  const svSummary = sensoryVectors.length > 0
    ? sensoryVectors.map(sv =>
        `  - [${sv.vectorType.toUpperCase().replace(/_/g, "-")}] "${sv.label || sv.vectorType}" — ${geomSummary(sv.geojsonGeometry)}`
      ).join("\n")
    : "  - None mapped";

  return `You are a Lead Resilience Engineer and Autonomous Site Architect. Your objective is to design a high-security, off-grid, autonomous property that maximises resource capture, off-grid power generation, and caloric security.

Analyse the following site data and return a highly technical, structured JSON report. Do not use generic gardening terminology; use infrastructure and resilience terminology.

=== SITE METRICS ===
Project: ${property.name}
Usable Area: ${property.areaHectares?.toFixed(2) ?? "unknown"} ha / ${property.areaAcres?.toFixed(2) ?? "unknown"} acres
Geographic Threat Region: ${region}
Permaculture Zones Mapped: ${zoneCount}

=== LIVE CLIMATE DATA ===
Annual Rainfall Yield:     ${precipDisplay}
Prevailing Wind Direction: ${windDisplay}
Solar Irradiance:          ${solarDisplay}
Thermal Maximum (summer):  ${summerTempDisplay}
Thermal Minimum (winter):  ${winterTempDisplay}
Frost Exposure:            ${frostDisplay}
Köppen Classification:     ${brief.climateZone ?? (climate.meanAnnualTempC != null ? "derived from live temps" : "unknown")}

=== USER-REPORTED SITE DATA ===
Soil Type: ${brief.estimatedSoilType ?? "unknown"}
Soil pH: ${brief.soilPH != null ? brief.soilPH : "unknown"}
Elevation: ${brief.elevationM != null ? `${brief.elevationM} m` : "unknown"}
Utilities on site: ${utilities.length > 0 ? utilities.join(", ") : "none"}

=== SITE VULNERABILITIES ===
${challenges.length > 0 ? challenges.map(c => `  - ${c}`).join("\n") : "  - None reported"}

=== SOLAR & SECTOR OVERLAYS ===
${sectorSummary}

=== USER-DRAWN INFRASTRUCTURE ===
Structures:
${structureSummary}

Designed Swales / Water Channels:
${swaleSummary}

Sensory Vectors:
${svSummary}

=== ANALYSIS DIRECTIVE ===
Review the "User-Drawn Infrastructure" and "Sensory Vectors" sections above. Provide specific, localised critiques and optimisations based on the ACTUAL coordinates and geometry provided. For example:
  - If a structure is placed in a topographic flood zone (low elevation swale lines nearby), flag it and suggest a precise new placement.
  - If a water tank lacks a gravity-feed relationship to higher-elevation swales, flag it.
  - If a HOUSE or GREENHOUSE is directly exposed to a "road_noise" or "privacy_threat" sensory vector, flag the bearing and recommend a windbreak, berm, or setback with estimated dimensions.
  - If a "view_corridor" vector is blocked by a proposed structure, recommend relocating the structure.
  - Cross-reference swale elevations against structure placements for flood/drainage risk.
  - Be specific: mention structure names, vector labels, and compass bearings in your critiques.

BASED ON ALL OF THE ABOVE, RETURN A JSON OBJECT WITH THE EXACT FOLLOWING STRUCTURE:
1. "WaterStrategy": Actionable advice on water catchment, tank sizing, and drainage/swale placement based on live rainfall yield and slope data.
2. "SunAndEnergy": Solar optimisation, microclimate creation, and thermal mass strategies based on live irradiance vectors and temperature extremes.
3. "LandAndBiodiversity": Soil protection, erosion mitigation, and defensive/caloric planting recommendations tailored to this specific hardiness zone.
4. "ClimateResilience": A summary of the property's ability to survive extreme weather, grid collapse, or drought, and the immediate steps to secure it.
5. "InfrastructureCritique": Specific, localised critiques of the user-drawn structures, swales, and sensory vectors — flag conflicts, risks, and precise relocation recommendations.
6. "PatternStrategy": Apply the permaculture principle of "Design from Patterns to Details". Based on this site's unique climate, hydrology, wind exposure, and terrain, identify the single most powerful spatial design pattern to impose order and resilience across the whole property. This key must contain exactly three sub-keys:
   - "recommendedPattern": The name of the pattern — choose from or adapt: Fibonacci Spiral, Keyhole, Branching Net-and-Pan, Wind Sector Wedge, Mandala Grid, Broadacre Keyline, Sector Radial, Swale Contour Cascade. Select the one that is most physically appropriate for this site's rainfall, slope, and wind data.
   - "rationale": Why nature uses this shape or flow form in similar environments. Explain the physical or biological principle behind it (e.g., Fibonacci optimises light interception; Net-and-Pan maximises infiltration on flat clay soils). Reference this site's actual climate and soil data. 2–3 sentences.
   - "application": Concrete, site-specific instructions for physically implementing this pattern. Reference cardinal directions, estimated dimensions in metres, and how it integrates with the existing swales, structures, or zone layout already described. 3–4 sentences.
7. "DesignRecommendations": A final compiled design output synthesising ALL of the above analysis into a deployable plant palette and design element list. Use the site's actual region, climate data, soil type, pH, challenges, and goals. Do NOT use generic plants — every species must be suitable for this hardiness zone and climate. This key must contain exactly four sub-keys:
   - "plantingPrinciples": A 2–3 sentence summary of the overall planting philosophy and layering strategy appropriate to this site's climate, rainfall, and soil.
   - "plants": An array of 15–25 plant objects, each with: "name" (common name), "latinName" (binomial), "layer" (one of: Canopy, Understory, Shrub, Herbaceous, Ground Cover, Vine, Root), "purpose" (primary function: food/calories, nitrogen-fixation, windbreak, medicine, habitat corridor, erosion control, etc.), "zones" (permaculture zone placement e.g. "Zone 1–2"), "notes" (spacing, planting time, any site-specific caveats). Cover all seven canopy layers. Include caloric staples, nitrogen-fixers, dynamic accumulators, windbreak species, and at least 3 medicinal plants. Choose species native or well-adapted to the property's geographic region.
   - "designElements": An array of 8–12 design element objects, each with: "type" (e.g. Swale, Dam, Windbreak Belt, Keyhole Bed, Compost System, Greenhouse, Chicken Tractor Circuit, Food Forest Guild, Living Fence, Rainwater Tank), "name" (a short descriptive name), "description" (what it is and how it functions), "rationale" (why this element is critical for THIS site given its specific climate, soil, or challenges), "placement" (specific: cardinal direction, zone, or relationship to existing structures/swales from the Infrastructure data), "priority" (High, Medium, or Low — based on urgency and resilience impact).
   - "implementationPhases": An array of 3–5 phase objects covering Year 1 through Year 3+, each with: "phase" (integer), "title" (e.g. "Foundation Earthworks"), "duration" (e.g. "Months 1–3"), "elements" (array of element names or plant groups to install in this phase), "rationale" (why this sequence — explain the dependency logic, e.g. water infrastructure before food forest).
8. "SpatialRecommendations": An array of 3–6 spatially-explicit design interventions derived from the vulnerabilities, climate data, and sector analysis above. Each object must be physically locatable on this property using compass bearings and relative distance. Each object must contain EXACTLY these keys:
   - "id": a unique kebab-case slug (e.g. "west-shelterbelt", "north-food-forest", "swale-cascade-south")
   - "label": human-readable short name (e.g. "Western Windbreak Shelterbelt", "Northern Food Forest Guild")
   - "ecologicalFunction": exactly one of: "windbreak", "swale", "food-forest", "habitat-corridor", "water-harvesting", "other"
   - "priority": exactly one of: "critical", "high", "medium" — based on urgency and resilience impact
   - "bearingRange": an array of exactly two numbers [startDegrees, endDegrees] representing the compass sector where this intervention should be placed (clockwise from North: 0=N, 90=E, 180=S, 270=W). Example: a western windbreak = [247, 293]. The range should be 30–90 degrees wide.
   - "radiusFraction": a decimal 0.3–0.95 representing how far from the property centroid this feature should be placed, as a fraction of the property diagonal. Use 0.3–0.5 for central features, 0.6–0.8 for mid-boundary, 0.85–0.95 for perimeter features.
   - "suggestedZones": an array of 1–3 permaculture zone integers (1–5) where this intervention is most appropriate
   - "rationale": exactly one sentence explaining why this compass sector and distance is optimal for this ecological function on this specific site
Ensure the response is raw, valid JSON only.`;
}

// ─── Compass → bearing (degrees clockwise from North) ──────────────────────────

const COMPASS_BEARINGS: Record<string, number> = {
  N: 0, NNE: 22.5, NE: 45, ENE: 67.5,
  E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
  S: 180, SSW: 202.5, SW: 225, WSW: 247.5,
  W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
};

function compassToBearing(dir: string): number | null {
  // Normalise: strip whitespace, uppercase, handle "NW wind", "from NW", etc.
  const clean = dir.trim().toUpperCase().replace(/^FROM\s+/, "").split(/\s+/)[0];
  return COMPASS_BEARINGS[clean] ?? null;
}

// ─── Rate limiter ─────────────────────────────────────────────────────────────

const analyzeRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: { error: "Too many analysis requests — please wait before running another analysis." },
});

// ─── Route ────────────────────────────────────────────────────────────────────

router.post(
  "/properties/:propertyId/analyze-site",
  analyzeRateLimit,
  async (req, res): Promise<void> => {
    if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

    const propertyId = req.params.propertyId as string;
    if (!propertyId) { res.status(400).json({ error: "propertyId required" }); return; }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) { res.status(500).json({ error: "GEMINI_API_KEY not configured" }); return; }

    const [property] = await db
      .select()
      .from(propertiesTable)
      .where(and(eq(propertiesTable.id, propertyId), eq(propertiesTable.ownerId, req.user.id)));
    if (!property) { res.status(404).json({ error: "Property not found" }); return; }

    const [brief] = await db
      .select()
      .from(clientBriefsTable)
      .where(eq(clientBriefsTable.propertyId, propertyId));
    if (!brief) {
      res.status(404).json({ error: "No client brief found — complete the site survey first" });
      return;
    }

    // Fetch all layer data in parallel
    const [sectors, zones, structures, swales, sensoryVectors] = await Promise.all([
      db.select().from(sectorsTable)       .where(eq(sectorsTable.propertyId,        propertyId)),
      db.select().from(zonesTable)         .where(eq(zonesTable.propertyId,           propertyId)),
      db.select().from(structuresTable)    .where(eq(structuresTable.propertyId,      propertyId)),
      db.select().from(designedSwalesTable).where(eq(designedSwalesTable.propertyId,  propertyId)),
      db.select().from(sensoryVectorsTable).where(eq(sensoryVectorsTable.propertyId,  propertyId)),
    ]);

    // Fetch live climate data — runs concurrently with DB queries above are already done
    const centroid = roughCentroid(property.boundaryGeojson);
    const climate  = centroid
      ? await fetchLiveClimate(centroid.lat, centroid.lng)
      : {
          annualPrecipMm: null, prevailingWind: null, meanWindSpeedMs: null,
          meanAnnualTempC: null, summerMaxTempC: null, winterMinTempC: null,
          frostDaysPerYear: null, solarKwhM2: null, source: "failed" as const,
        };

    req.log.info(
      { propertyId, climateSource: climate.source, structureCount: structures.length,
        swaleCount: swales.length, svCount: sensoryVectors.length },
      "analyze-site: payload assembled",
    );

    // ── Return cached result if available (saves Gemini quota) ─────────────────
    const forceRefresh = req.query.refresh === "1";
    if (!forceRefresh && brief.aiAnalysisReport && brief.aiAnalysisGeneratedAt) {
      const ageMs = Date.now() - new Date(brief.aiAnalysisGeneratedAt).getTime();
      const cacheTtlMs = 23 * 60 * 60 * 1000; // 23 hours
      if (ageMs < cacheTtlMs) {
        try {
          const cachedParsed = JSON.parse(brief.aiAnalysisReport);
          req.log.info({ propertyId, ageMs }, "analyze-site: returning cached result");
          res.json({
            propertyId,
            WaterStrategy:          cachedParsed.WaterStrategy          ?? "",
            SunAndEnergy:           cachedParsed.SunAndEnergy           ?? "",
            LandAndBiodiversity:    cachedParsed.LandAndBiodiversity    ?? "",
            ClimateResilience:      cachedParsed.ClimateResilience      ?? "",
            InfrastructureCritique: cachedParsed.InfrastructureCritique ?? "",
            PatternStrategy:        cachedParsed.PatternStrategy        ?? null,
            DesignRecommendations:  cachedParsed.DesignRecommendations  ?? null,
            spatialRecommendations: cachedParsed.SpatialRecommendations ?? null,
            autoCreatedWindSector: false,
            generatedAt: brief.aiAnalysisGeneratedAt,
            climateSource: "cached",
            cached: true,
            rawJson: brief.aiAnalysisReport,
          });
          return;
        } catch { /* cached JSON corrupt — fall through to regenerate */ }
      }
    }

    const prompt = buildPrompt(property, brief, sectors, zones.length, climate, structures, swales, sensoryVectors);

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { responseMimeType: "application/json", maxOutputTokens: 65536 },
    });

    let rawJson: string;
    try {
      const result = await model.generateContent(prompt);
      rawJson = result.response.text().trim();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const is429 = msg.includes("429") || msg.toLowerCase().includes("quota") || msg.toLowerCase().includes("too many");
      req.log.warn({ err, propertyId }, "Gemini generateContent failed");
      res.status(is429 ? 429 : 502).json({
        error: is429
          ? "The AI analysis service is busy — please wait a minute and try again. Your previous analysis (if any) is still available."
          : "AI service temporarily unavailable. Please try again shortly.",
      });
      return;
    }

    interface PlantRec { name: string; latinName: string; layer: string; purpose: string; zones: string; notes: string; }
    interface DesignElement { type: string; name: string; description: string; rationale: string; placement: string; priority: string; }
    interface ImplementationPhase { phase: number; title: string; duration: string; elements: string[]; rationale: string; }
    interface DesignRecs { plantingPrinciples: string; plants: PlantRec[]; designElements: DesignElement[]; implementationPhases: ImplementationPhase[]; }

    let parsed: {
      WaterStrategy: unknown; SunAndEnergy: unknown; LandAndBiodiversity: unknown;
      ClimateResilience: unknown; InfrastructureCritique: unknown;
      PatternStrategy: { recommendedPattern: string; rationale: string; application: string } | undefined;
      DesignRecommendations: DesignRecs | undefined;
      SpatialRecommendations: SpatialRecommendation[] | undefined;
    };
    let wasRepaired = false;

    // ── 3-stage parse pipeline ────────────────────────────────────────────────
    // Stage 1: strip markdown fences, trailing commas, bare control chars in strings
    const sanitized = sanitizeJson(rawJson);
    try {
      parsed = JSON.parse(sanitized);
    } catch {
      // Stage 2: structural repair — close brackets/strings truncated at token limit
      try {
        const repaired = repairJson(sanitized);
        parsed = JSON.parse(repaired);
        wasRepaired = true;
        rawJson = repaired;
        req.log.warn(
          { propertyId, sanitizedLen: sanitized.length, repairedLen: repaired.length },
          "Gemini JSON sanitized+repaired successfully",
        );
      } catch {
        // Stage 3: regex partial extractor — recovers whatever fields are readable,
        // ensuring a clean object is always returned instead of a 500 error.
        req.log.error(
          { rawSnippet: rawJson.slice(0, 300) },
          "Gemini JSON all-repair failed — falling back to partial field extraction",
        );
        parsed = extractPartialAnalysis(sanitized) as typeof parsed;
        wasRepaired = true;
        rawJson = JSON.stringify(parsed);
      }
    }

    const generatedAt = new Date();
    const spatialRecsJson = parsed.SpatialRecommendations?.length
      ? JSON.stringify(parsed.SpatialRecommendations)
      : null;

    await Promise.all([
      db.update(clientBriefsTable)
        .set({ aiAnalysisReport: rawJson, aiAnalysisGeneratedAt: generatedAt, updatedAt: generatedAt })
        .where(eq(clientBriefsTable.propertyId, propertyId)),
      spatialRecsJson
        ? db.update(propertiesTable)
            .set({ spatialRecommendations: spatialRecsJson })
            .where(eq(propertiesTable.id, propertyId))
        : Promise.resolve(),
    ]);

    // ── Auto-create (or replace) damaging wind sector ────────────────────────
    let autoCreatedWindSector = false;
    const windDirRaw = climate.prevailingWind ?? brief.prevailingWindDir ?? null;
    if (windDirRaw && centroid) {
      // Delete any existing wind sectors first so the AI-derived one is always current
      await db.delete(sectorsTable).where(
        and(eq(sectorsTable.propertyId, propertyId), eq(sectorsTable.sectorType, "wind")),
      );
      const bearing = compassToBearing(windDirRaw);
      if (bearing !== null) {
        const spread = 22; // ±22° ≈ 45° total wedge (integer-safe)
        let startAngle = Math.round(bearing - spread);
        let endAngle   = Math.round(bearing + spread);
        // Normalise to [0, 360)
        startAngle = ((startAngle % 360) + 360) % 360;
        endAngle   = ((endAngle   % 360) + 360) % 360;
        // Radius: scale to property, capped 0.4–2 km
        const radiusKm = Math.min(2, Math.max(0.4, Math.sqrt(property.areaHectares ?? 1) * 0.3));
        const compassLabel = windDirRaw.trim().toUpperCase().replace(/^FROM\s+/, "").split(/\s+/)[0];
        await db.insert(sectorsTable).values({
          id: crypto.randomUUID(),
          propertyId,
          sectorType: "wind",
          centerLng:  centroid.lng,
          centerLat:  centroid.lat,
          radiusKm,
          startAngle,
          endAngle,
          label: `Damaging Winds (${compassLabel})`,
        });
        autoCreatedWindSector = true;
        req.log.info({ propertyId, bearing, startAngle, endAngle, radiusKm }, "auto-created wind sector");
      }
    }

    res.json({
      propertyId,
      WaterStrategy:            parsed.WaterStrategy            ?? "",
      SunAndEnergy:             parsed.SunAndEnergy             ?? "",
      LandAndBiodiversity:      parsed.LandAndBiodiversity      ?? "",
      ClimateResilience:        parsed.ClimateResilience        ?? "",
      InfrastructureCritique:   parsed.InfrastructureCritique   ?? "",
      PatternStrategy:          parsed.PatternStrategy          ?? null,
      DesignRecommendations:    parsed.DesignRecommendations    ?? null,
      spatialRecommendations:   parsed.SpatialRecommendations   ?? null,
      autoCreatedWindSector,
      generatedAt: generatedAt.toISOString(),
      climateSource: climate.source,
      rawJson,
    });
  },
);

export default router;
