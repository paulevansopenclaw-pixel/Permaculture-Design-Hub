import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { eq, and } from "drizzle-orm";
import {
  db,
  clientBriefsTable,
  propertiesTable,
  sectorsTable,
  zonesTable,
} from "@workspace/db";
import { GoogleGenerativeAI } from "@google/generative-ai";

const router: IRouter = Router();

function bearingLabel(startAngle: number, endAngle: number): string {
  const mid = (startAngle + endAngle) / 2;
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const idx = Math.round(((mid % 360) + 360) % 360 / 45) % 8;
  return dirs[idx];
}

/**
 * Approximate region label from WGS-84 coordinates, used to bias plant recommendations
 * toward locally appropriate, non-invasive species.
 */
function deriveRegion(lat: number, lng: number): string {
  const hemi = lat < 0 ? "Southern Hemisphere" : "Northern Hemisphere";
  // Australia
  if (lat < -10 && lat > -45 && lng > 110 && lng < 156) {
    if (lat < -28 && lng > 135) return `Eastern Australia (NSW / VIC / SE QLD), ${hemi}`;
    if (lng < 130)              return `Western Australia, ${hemi}`;
    if (lat > -28)              return `Tropical / Sub-tropical Northern Australia (QLD / NT), ${hemi}`;
    return `Australia, ${hemi}`;
  }
  // New Zealand
  if (lat < -34 && lat > -48 && lng > 166 && lng < 179) return `New Zealand, ${hemi}`;
  // South Africa
  if (lat < -22 && lat > -35 && lng > 16 && lng < 33) return `South Africa, ${hemi}`;
  // South America
  if (lat < 0 && lng > -82 && lng < -34) return `South America, ${hemi}`;
  // North America
  if (lat > 24 && lat < 72 && lng > -168 && lng < -52) {
    if (lat > 50) return `Canada / Pacific Northwest, ${hemi}`;
    if (lng < -100) return `Western USA, ${hemi}`;
    return `Eastern / Central USA, ${hemi}`;
  }
  // Europe
  if (lat > 36 && lat < 72 && lng > -12 && lng < 45) return `Europe, ${hemi}`;
  // East Asia
  if (lat > 20 && lat < 55 && lng > 100 && lng < 145) return `East Asia, ${hemi}`;
  // South / SE Asia
  if (lat > -10 && lat < 30 && lng > 65 && lng < 140) return `South / Southeast Asia, ${hemi}`;
  // Sub-Saharan Africa
  if (lat > -35 && lat < 18 && lng > -18 && lng < 51) return `Sub-Saharan Africa, ${hemi}`;
  // Middle East / North Africa
  if (lat > 15 && lat < 40 && lng > 30 && lng < 65) return `Middle East, ${hemi}`;
  return `Coordinates ${lat.toFixed(1)}°, ${lng.toFixed(1)}° (${hemi})`;
}

/** Rough bbox centroid from a GeoJSON Polygon or MultiPolygon (accepts raw string or parsed object). */
function roughCentroid(geojson: unknown): { lat: number; lng: number } | null {
  try {
    const parsed = typeof geojson === "string" ? JSON.parse(geojson) : geojson;
    const geo = parsed as { type: string; coordinates: number[][][] | number[][][][] };
    let coords: number[][] = [];
    if (geo.type === "Polygon") {
      coords = geo.coordinates[0] as number[][];
    } else if (geo.type === "MultiPolygon") {
      coords = (geo.coordinates[0] as number[][][])[0] as number[][];
    }
    if (!coords.length) return null;
    const lng = coords.reduce((s, c) => s + c[0], 0) / coords.length;
    const lat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
    return { lat, lng };
  } catch {
    return null;
  }
}

function buildPrompt(
  property: { name: string; areaHectares: number | null; areaAcres: number | null; boundaryGeojson: unknown },
  brief: typeof clientBriefsTable.$inferSelect,
  sectors: Array<typeof sectorsTable.$inferSelect>,
  zoneCount: number,
): string {
  const centroid = roughCentroid(property.boundaryGeojson);
  const region = centroid ? deriveRegion(centroid.lat, centroid.lng) : "unknown region";
  const challenges: string[] = [];
  if (brief.challengeSevereErosion) challenges.push("severe erosion");
  if (brief.challengeWinterFlooding) challenges.push("winter flooding");
  if (brief.challengeHighWind) challenges.push("high wind exposure");
  if (brief.challengeWildlifePressure) challenges.push("wildlife pressure");

  const utilities: string[] = [];
  if (brief.utilitiesOverheadPower) utilities.push("overhead power lines");
  if (brief.utilitiesBuriedPipes) utilities.push("buried pipes");
  if (brief.utilitiesLegalEasements) utilities.push("legal easements");
  if (brief.utilitiesActiveWell) utilities.push("active well");

  const sectorSummary = sectors.map((s) => {
    const dir = bearingLabel(s.startAngle, s.endAngle);
    return `  - ${s.label || s.sectorType} (${dir}, ${s.startAngle}°–${s.endAngle}°)`;
  }).join("\n") || "  - None mapped yet";

  return `You are an expert Permaculture Designer with deep knowledge of ecological design, plant guilds, and site planning.

Analyse the following site data and return a structured JSON report.

=== PROPERTY ===
Name: ${property.name}
Area: ${brief ? `${property.areaHectares?.toFixed(2) ?? "unknown"} ha / ${property.areaAcres?.toFixed(2) ?? "unknown"} acres` : "unknown"}
Geographic region: ${region}

=== CLIMATE & ENVIRONMENT ===
Climate zone (Köppen): ${brief.climateZone ?? "unknown"}
Annual rainfall: ${brief.annualRainfallMm != null ? `${brief.annualRainfallMm} mm/yr` : "unknown"}
Mean annual temperature: ${brief.meanAnnualTempC != null ? `${brief.meanAnnualTempC} °C` : "unknown"}
Summer maximum: ${brief.summerMaxTempC != null ? `${brief.summerMaxTempC} °C` : "unknown"}
Winter minimum: ${brief.winterMinTempC != null ? `${brief.winterMinTempC} °C` : "unknown"}
Frost days per year: ${brief.frostDaysPerYear != null ? brief.frostDaysPerYear : "unknown"}
Annual humidity: ${brief.annualHumidityPct != null ? `${brief.annualHumidityPct}%` : "unknown"}
Elevation: ${brief.elevationM != null ? `${brief.elevationM} m ASL` : "unknown"}
Solar irradiance: ${brief.solarIrradianceKwhM2 != null ? `${brief.solarIrradianceKwhM2} kWh/m²/yr` : "unknown"}
Prevailing wind: ${brief.prevailingWindDir ?? "unknown"} at ${brief.meanWindSpeedMs != null ? `${brief.meanWindSpeedMs} m/s` : "unknown speed"}

=== SOIL (0–5 cm) ===
Texture class: ${brief.soilTextureClass ?? "unknown"}
Clay: ${brief.soilClay != null ? `${brief.soilClay}%` : "unknown"}, Sand: ${brief.soilSand != null ? `${brief.soilSand}%` : "unknown"}, Silt: ${brief.soilSilt != null ? `${brief.soilSilt}%` : "unknown"}
pH: ${brief.soilPH != null ? brief.soilPH : "unknown"}
Organic carbon: ${brief.soilOrganicCarbonGkg != null ? `${brief.soilOrganicCarbonGkg} g/kg` : "unknown"}
Climate-inferred soil order: ${brief.estimatedSoilType ?? "unknown"}

=== SITE SECTORS (mapped compass arcs) ===
${sectorSummary}

=== CONSTRAINTS ===
Machinery access width: ${brief.machineryWidthM} m
Utilities on site: ${utilities.length > 0 ? utilities.join(", ") : "none"}
Site challenges: ${challenges.length > 0 ? challenges.join(", ") : "none identified"}

=== DESIGN INTENT ===
Primary goal: ${brief.primaryGoal ?? "not specified"}
Maintenance capacity: ${brief.maintenanceCapacity ?? "not specified"}
Permaculture zones mapped: ${zoneCount}

=== INSTRUCTIONS ===
Return ONLY a valid JSON object — no markdown, no explanation, no code fences. The JSON must conform exactly to this shape:

{
  "plant_palette": [
    {
      "role": "Overstory Tree" | "Nitrogen Fixer" | "Dynamic Accumulator" | "Insectary" | "Ground Cover" | "Root Crop",
      "commonName": "string — use the locally recognised common name for the geographic region above",
      "scientificName": "string",
      "rationale": "1–2 sentences explaining why this plant suits the exact site conditions above",
      "heightM": <mature height in metres, as a number>,
      "spreadM": <mature canopy or ground-cover spread radius in metres, as a number>,
      "yearsToMaturity": <approximate years to reach functional/productive maturity, as a number>
    }
  ],
  "comprehensive_plant_list": [
    {
      "layer": "Canopy" | "Sub-Canopy" | "Shrub" | "Herbaceous" | "Ground Cover" | "Climber" | "Root Zone",
      "role": "Overstory Tree" | "Fruit Tree" | "Nitrogen Fixer" | "Dynamic Accumulator" | "Insectary" | "Ground Cover" | "Root Crop" | "Windbreak" | "Coppice" | "Medicinal" | "Edible Foliage",
      "commonName": "string — locally recognised name for the geographic region",
      "scientificName": "string",
      "heightM": <number>,
      "spreadM": <number>,
      "yearsToMaturity": <number>,
      "notes": "One sentence on key uses, benefits, or important planting notes"
    }
  ],
  "spatial_recommendations": [
    {
      "element": "Windbreak" | "Vegetable Beds" | "Chicken Coop" | "Fencing" | "Swale" | "Water Storage" | "Orchard" | "Nursery Area",
      "placement": "Concise placement instruction referencing actual compass directions or zone numbers",
      "rationale": "1–2 sentences of reasoning tied to the sectors and site data above"
    }
  ]
}

Rules:
- plant_palette: 8–12 curated guild species (the best integrated picks for THIS site's conditions).
- comprehensive_plant_list: 30–45 species covering ALL 7 layers — aim for: Canopy 6–8, Sub-Canopy 6–8, Shrub 5–7, Herbaceous 5–6, Ground Cover 4–5, Climber 3–4, Root Zone 3–4. Prioritise edible, medicinal, nitrogen-fixing, and multi-function species. Include both productive staples and ecological support species.
- Include 5–8 spatial recommendations.
- CRITICAL — Regional flora: All species in BOTH lists MUST be native to, endemic to, or long-proven non-invasive cultivars for the specified geographic region. Do NOT recommend plants from other continents when suitable local alternatives exist. Examples for Eastern Australia: use Acacia species (not Robinia/Black Locust), Allocasuarina/Casuarina (not Alder), Eucalyptus/Angophora/Corymbia (not foreign oaks), Lomandra/Microlaena (not foreign grasses), native Kennedia/Hardenbergia (not exotic legume vines). For other regions, apply the same principle — always prefer locally native or well-adapted species.
- heightM, spreadM, and yearsToMaturity must be realistic numeric values for the specific species and local growing conditions.
- All species must be suited to the identified climate zone and hardiness conditions.
- Reference actual sector bearings and challenges in your reasoning (plant_palette rationale + spatial_recommendations).
- Do not include any text outside the JSON object.`;
}

const analyzeRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many analysis requests — please wait before running another analysis." },
});

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
    if (!brief) { res.status(404).json({ error: "No client brief found — complete the site survey first" }); return; }

    const sectors = await db
      .select()
      .from(sectorsTable)
      .where(eq(sectorsTable.propertyId, propertyId));

    const zones = await db
      .select()
      .from(zonesTable)
      .where(eq(zonesTable.propertyId, propertyId));

    const prompt = buildPrompt(property, brief, sectors, zones.length);

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-pro",
      generationConfig: { responseMimeType: "application/json", maxOutputTokens: 8192 },
    });

    const result = await model.generateContent(prompt);
    const rawJson = result.response.text().trim();

    let parsed: { plant_palette: unknown[]; comprehensive_plant_list: unknown[]; spatial_recommendations: unknown[] };
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      req.log.error({ rawJson }, "Gemini returned invalid JSON");
      res.status(500).json({ error: "AI returned malformed JSON", raw: rawJson });
      return;
    }

    const generatedAt = new Date();

    await db
      .update(clientBriefsTable)
      .set({ aiAnalysisReport: rawJson, aiAnalysisGeneratedAt: generatedAt, updatedAt: generatedAt })
      .where(eq(clientBriefsTable.propertyId, propertyId));

    res.json({
      propertyId,
      plant_palette: parsed.plant_palette ?? [],
      comprehensive_plant_list: parsed.comprehensive_plant_list ?? [],
      spatial_recommendations: parsed.spatial_recommendations ?? [],
      generatedAt: generatedAt.toISOString(),
      rawJson,
    });
  },
);

export default router;
