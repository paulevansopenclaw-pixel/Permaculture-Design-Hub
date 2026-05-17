import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
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

function buildPrompt(
  property: { name: string; areaHectares: number | null; areaAcres: number | null },
  brief: typeof clientBriefsTable.$inferSelect,
  sectors: Array<typeof sectorsTable.$inferSelect>,
  zoneCount: number,
): string {
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
      "commonName": "string",
      "scientificName": "string",
      "rationale": "1–2 sentences explaining why this plant suits the exact site conditions above"
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
- Include 8–12 plants covering at least 4 different roles.
- Include 5–8 spatial recommendations.
- All species must be suited to the identified climate zone and hardiness conditions.
- Reference actual sector bearings and challenges in your reasoning.
- Do not include any text outside the JSON object.`;
}

router.post(
  "/properties/:propertyId/analyze-site",
  async (req, res): Promise<void> => {
    const { propertyId } = req.params;
    if (!propertyId) { res.status(400).json({ error: "propertyId required" }); return; }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) { res.status(500).json({ error: "GEMINI_API_KEY not configured" }); return; }

    const [property] = await db
      .select()
      .from(propertiesTable)
      .where(eq(propertiesTable.id, propertyId));
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

    let parsed: { plant_palette: unknown[]; spatial_recommendations: unknown[] };
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
      spatial_recommendations: parsed.spatial_recommendations ?? [],
      generatedAt: generatedAt.toISOString(),
      rawJson,
    });
  },
);

export default router;
