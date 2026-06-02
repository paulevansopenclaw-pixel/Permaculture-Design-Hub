import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { eq, and } from "drizzle-orm";
import {
  db,
  clientBriefsTable,
  propertiesTable,
  structuresTable,
  designedSwalesTable,
} from "@workspace/db";
import { GoogleGenerativeAI } from "@google/generative-ai";

const router: IRouter = Router();

// ─── Geo helpers ──────────────────────────────────────────────────────────────

function polygonAreaM2(coords: number[][]): number {
  if (coords.length < 3) return 0;
  const avgLat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  const mPerDegLat = 111_320;
  const mPerDegLng = 111_320 * Math.cos((avgLat * Math.PI) / 180);
  let area = 0;
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    area += coords[j][0] * mPerDegLng * (coords[i][1] * mPerDegLat);
    area -= coords[i][0] * mPerDegLng * (coords[j][1] * mPerDegLat);
  }
  return Math.abs(area / 2);
}

function extractFootprintCoords(geojson: unknown): number[][] | null {
  try {
    const parsed = typeof geojson === "string" ? JSON.parse(geojson) : geojson;
    const geo = parsed as { type: string; coordinates: unknown };
    if (geo.type === "Polygon") return (geo.coordinates as number[][][])[0];
    if (geo.type === "MultiPolygon") return ((geo.coordinates as number[][][][])[0])[0];
    return null;
  } catch { return null; }
}

function roughCentroid(geojson: unknown): { lat: number; lng: number } | null {
  try {
    const parsed = typeof geojson === "string" ? JSON.parse(geojson) : geojson;
    const geo = parsed as { type: string; coordinates: number[][][] | number[][][][] };
    let coords: number[][] = [];
    if (geo.type === "Polygon")           coords = geo.coordinates[0] as number[][];
    else if (geo.type === "MultiPolygon") coords = (geo.coordinates[0] as number[][][])[0] as number[][];
    if (!coords.length) return null;
    return {
      lng: coords.reduce((s, c) => s + c[0], 0) / coords.length,
      lat: coords.reduce((s, c) => s + c[1], 0) / coords.length,
    };
  } catch { return null; }
}

function deriveRegion(lat: number, lng: number): string {
  const hemi = lat < 0 ? "Southern Hemisphere" : "Northern Hemisphere";
  if (lat < -10 && lat > -45 && lng > 110 && lng < 156) {
    if (lat < -28 && lng > 135) return `Eastern Australia (NSW/VIC/SE QLD), ${hemi}`;
    if (lng < 130)              return `Western Australia, ${hemi}`;
    if (lat > -28)              return `Tropical/Sub-tropical Northern Australia, ${hemi}`;
    return `Australia, ${hemi}`;
  }
  if (lat < -34 && lat > -48 && lng > 166 && lng < 179) return `New Zealand, ${hemi}`;
  if (lat < 0 && lng > -82 && lng < -34)                 return `South America, ${hemi}`;
  if (lat < -22 && lat > -35 && lng > 16 && lng < 33)   return `South Africa, ${hemi}`;
  if (lat > 24 && lat < 72 && lng > -168 && lng < -52)  return `North America, ${hemi}`;
  if (lat > 36 && lat < 72 && lng > -12 && lng < 45)    return `Europe, ${hemi}`;
  if (lat > 20 && lat < 55 && lng > 100 && lng < 145)   return `East Asia, ${hemi}`;
  if (lat > -10 && lat < 30 && lng > 65 && lng < 140)   return `South/Southeast Asia, ${hemi}`;
  return `Coordinates ${lat.toFixed(1)}°, ${lng.toFixed(1)}° (${hemi})`;
}

// ─── Rate limiter ─────────────────────────────────────────────────────────────

const waterBudgetRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: { error: "Too many water budget requests — please wait before running another analysis." },
});

// ─── Route ────────────────────────────────────────────────────────────────────

router.post(
  "/properties/:propertyId/water-budget",
  waterBudgetRateLimit,
  async (req, res): Promise<void> => {
    if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

    const propertyId = req.params.propertyId as string;
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

    const [structures, swales] = await Promise.all([
      db.select().from(structuresTable).where(eq(structuresTable.propertyId, propertyId)),
      db.select().from(designedSwalesTable).where(eq(designedSwalesTable.propertyId, propertyId)),
    ]);

    // ── Existing tank inventory ─────────────────────────────────────────────
    const tankStructures = structures.filter((s) => s.structureType === "tank" && s.volumeLiters != null && s.volumeLiters > 0);
    const existingTankTotalL  = tankStructures.reduce((sum, s) => sum + (s.volumeLiters ?? 0), 0);
    const existingTankTotalKL = +(existingTankTotalL / 1000).toFixed(1);

    // ── Roof catchment ─────────────────────────────────────────────────────
    const RUNOFF_COEFF = 0.85;
    const rainfallMm = brief.annualRainfallMm ?? 600;

    const roofStructures: { label: string; type: string; areaM2: number }[] = [];
    for (const s of structures) {
      if (!s.footprintGeojson) continue;
      const coords = extractFootprintCoords(s.footprintGeojson);
      if (!coords) continue;
      const areaM2 = polygonAreaM2(coords);
      if (areaM2 > 0) roofStructures.push({ label: s.label, type: s.structureType, areaM2 });
    }

    const totalRoofM2 = roofStructures.reduce((sum, r) => sum + r.areaM2, 0);

    if (totalRoofM2 === 0) {
      res.status(400).json({ error: "No structures with footprint polygons found. Draw roof footprints on the map first." });
      return;
    }

    const annualCatchmentKL = Math.round((totalRoofM2 * rainfallMm * RUNOFF_COEFF) / 1000);

    // ── Household demand ────────────────────────────────────────────────────
    const occupants = brief.householdSize ?? 4;
    const annualHouseholdKL = Math.round((occupants * 150 * 365) / 1000);
    const bufferKL = Math.round(annualHouseholdKL * 0.2);
    const totalHouseholdAllocationKL = annualHouseholdKL + bufferKL;
    const availableForProductionKL = Math.max(0, annualCatchmentKL - totalHouseholdAllocationKL);

    // ── Build prompt ────────────────────────────────────────────────────────
    const centroid = roughCentroid(property.boundaryGeojson);
    const region = centroid ? deriveRegion(centroid.lat, centroid.lng) : "unknown region";

    const structureLines = roofStructures
      .map(r => `  - ${r.label} (${r.type}): ${r.areaM2.toFixed(1)} m²`)
      .join("\n");

    const tankLines = tankStructures.length > 0
      ? tankStructures.map(t => `  - ${t.label}${t.attachedToBuilding ? ` (feeds from: ${t.attachedToBuilding})` : ""}: ${((t.volumeLiters ?? 0) / 1000).toFixed(1)} kL`)
      .join("\n")
      : "  - None recorded yet";

    const swaleLines = swales.length > 0
      ? swales.map(s => `  - "${s.name}" (${s.swaleType}): ${s.lengthM.toFixed(0)} m @ ${s.elevationM.toFixed(1)} m elev`).join("\n")
      : "  - None designed yet";

    const prompt = `You are a Rainwater Harvesting and Food Systems Engineer specialising in off-grid permaculture. Produce a rigorous, site-specific water budget and tank sizing report.

=== SITE ===
Property: ${property.name}
Region: ${region}
Area: ${property.areaHectares?.toFixed(2) ?? "unknown"} ha / ${property.areaAcres?.toFixed(2) ?? "unknown"} acres
Köppen Climate Zone: ${brief.climateZone ?? "unknown"}
Annual Rainfall: ${brief.annualRainfallMm != null ? `${brief.annualRainfallMm} mm/yr [live data]` : `${rainfallMm} mm/yr [fallback estimate]`}
Summer Max Temp: ${brief.summerMaxTempC != null ? `${brief.summerMaxTempC} °C` : "unknown"}
Winter Min Temp: ${brief.winterMinTempC != null ? `${brief.winterMinTempC} °C` : "unknown"}
Mean Annual Temp: ${brief.meanAnnualTempC != null ? `${brief.meanAnnualTempC} °C` : "unknown"}
Frost Days: ${brief.frostDaysPerYear != null ? `${brief.frostDaysPerYear} days/yr` : "unknown"}
Soil Texture: ${brief.soilTextureClass ?? brief.estimatedSoilType ?? "unknown"}
Soil Clay: ${brief.soilClay != null ? `${brief.soilClay}%` : "unknown"} — determines water-holding capacity
Elevation: ${brief.elevationM != null ? `${brief.elevationM} m ASL` : "unknown"}

=== ROOF CATCHMENT INFRASTRUCTURE ===
Mapped roof footprints:
${structureLines}
Total roof area: ${totalRoofM2.toFixed(1)} m²
Collection efficiency: ${RUNOFF_COEFF * 100}% (mixed roofing, first-flush excluded)
Annual catchment yield: ${annualCatchmentKL} kL/yr [pre-calculated]

=== EXISTING TANK INVENTORY (mapped by designer) ===
${tankLines}
Total existing storage: ${existingTankTotalKL} kL

=== DESIGNED SWALES & WATER CHANNELS ===
${swaleLines}

=== HOUSEHOLD WATER DEMAND ===
Occupants: ${occupants}
Baseline consumption: 150 L/person/day (potable + cooking + sanitation + washing)
Annual household demand: ${annualHouseholdKL} kL/yr [pre-calculated]
20% contingency reserve: ${bufferKL} kL/yr
Total household allocation: ${totalHouseholdAllocationKL} kL/yr [pre-calculated]

=== WATER BALANCE ===
Annual catchment:             ${annualCatchmentKL} kL
Less household allocation:   -${totalHouseholdAllocationKL} kL
Surplus for food production:  ${availableForProductionKL} kL/yr [pre-calculated]

=== DIRECTIVE ===
Produce a complete water budget. Adjust figures where your climate knowledge warrants it (e.g. hot/dry climates need more per person; cool temperate need less; seasonal rainfall changes tank sizing). Reference the specific region and climate zone in your reasoning.

1. HOUSEHOLD BUDGET — validate/adjust the 150 L/person/day for this climate. Show final totals.
2. TANK CONFIGURATION — the designer has already mapped ${existingTankTotalKL} kL of existing storage (see inventory above). Size the recommended system to bridge the longest typical dry period (60–90 days standard; extend for strongly seasonal climates). Recommend:
   - Household potable tank(s): capacity, material (corrugated steel / poly / ferrocement), placement (gravity-feed from highest roof)
   - Irrigation buffer tank(s) if surplus > 10 kL: separate from potable
   - Total system capacity in kL and state design dry period in days
   - Additional storage required beyond existing inventory: max(0, recommendedTotalCapacityKL - ${existingTankTotalKL}) kL
3. FOOD PRODUCTION BUDGET — calculate max sustainable growing areas:
   - Vegetable beds: 600 L/m²/yr base irrigation (adjust for ET and soil retention)
   - Food forest/orchard (established): 400 L/m²/yr
   - Provide a recommended split and total area in m² and ha
4. RISK ASSESSMENT — model a 20% below-average rainfall year. State deficit (if any) and list 3–5 specific contingency measures for this site.

RETURN RAW JSON ONLY — no markdown fences, no text outside the JSON object:
{
  "HouseholdBudget": {
    "adjustedDailyLitresPerPerson": <number>,
    "adjustedDailyTotalLitres": <number>,
    "annualHouseholdKL": <number>,
    "contingencyBufferKL": <number>,
    "totalHouseholdAllocationKL": <number>,
    "catchmentSurplusOrDeficitKL": <number>,
    "assessment": "<one clear paragraph>"
  },
  "TankConfiguration": {
    "designDryDays": <number>,
    "recommendedTotalCapacityKL": <number>,
    "tanks": [
      { "label": "<string>", "capacityKL": <number>, "purpose": "<string>", "material": "<string>", "placementNote": "<string>" }
    ],
    "designRationale": "<one clear paragraph>"
  },
  "FoodProductionBudget": {
    "availableIrrigationKL": <number>,
    "vegetableBedIrrigationLPerM2": <number>,
    "orchardIrrigationLPerM2": <number>,
    "maxVegetableBedM2": <number>,
    "maxOrchardM2": <number>,
    "recommendedSplit": { "vegetablesM2": <number>, "orchardM2": <number>, "totalM2": <number>, "totalHa": <number> },
    "irrigationEfficiencyNote": "<one clear paragraph>"
  },
  "RiskAssessment": {
    "reducedRainfallMm": <number>,
    "reducedCatchmentKL": <number>,
    "systemDeficitKL": <number or null>,
    "droughtRiskLevel": "<Low|Moderate|High|Critical>",
    "contingencyMeasures": ["<string>", "<string>", "<string>"]
  }
}`;

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: { responseMimeType: "application/json", maxOutputTokens: 4096 },
    });

    req.log.info(
      { propertyId, totalRoofM2, annualCatchmentKL, occupants, availableForProductionKL },
      "water-budget: running AI analysis",
    );

    const result   = await model.generateContent(prompt);
    const rawJson  = result.response.text().trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      req.log.error({ rawJson }, "water-budget: Gemini returned invalid JSON");
      res.status(500).json({ error: "AI returned malformed JSON", raw: rawJson });
      return;
    }

    res.json({
      propertyId,
      roofAreaM2: totalRoofM2,
      annualCatchmentKL,
      occupants,
      existingTankTotalKL,
      tankInventory: tankStructures.map((t) => ({
        label: t.label,
        volumeKL: +((t.volumeLiters ?? 0) / 1000).toFixed(1),
        attachedToBuilding: t.attachedToBuilding ?? null,
      })),
      ...(parsed as object),
    });
  },
);

export default router;
