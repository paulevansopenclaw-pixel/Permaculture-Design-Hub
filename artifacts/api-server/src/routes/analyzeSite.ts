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

  return `You are a Lead Resilience Engineer and Autonomous Site Architect. Your objective is to design a high-security, off-grid, autonomous property that maximizes resource capture, off-grid power generation, and caloric security.

Analyse the following site data and return a highly technical, structured JSON report. Do not use generic gardening terminology; use infrastructure and resilience terminology.

=== SITE METRICS ===
Project: ${property.name}
Usable Area: ${brief ? `${property.areaHectares?.toFixed(2) ?? "unknown"} ha / ${property.areaAcres?.toFixed(2) ?? "unknown"} acres` : "unknown"}
Geographic Threat Region: ${region}

=== CLIMATE & THREAT DATA ===
Köppen Classification: ${brief.climateZone ?? "unknown"}
Annual Rainfall Yield: ${brief.annualRainfallMm != null ? `${brief.annualRainfallMm} mm/yr` : "unknown"}
Thermal Maximum: ${brief.summerMaxTempC != null ? `${brief.summerMaxTempC} °C` : "unknown"}
Thermal Minimum: ${brief.winterMinTempC != null ? `${brief.winterMinTempC} °C` : "unknown"}

=== SITE VULNERABILITIES ===
${challenges.length > 0 ? challenges.map(c => `  - ${c}`).join("\n") : "  - None mapped"}

=== SOLAR & WIND VECTORS ===
${sectorSummary}

BASED ON THIS DATA, RETURN A JSON OBJECT WITH THE EXACT FOLLOWING STRUCTURE:
1. "WaterStrategy": Actionable advice on water catchment, tank sizing, and drainage/swale placement based on the rainfall yield and slope.
2. "SunAndEnergy": Solar optimization, microclimate creation, and thermal mass strategies based on the provided vectors and temperature extremes.
3. "LandAndBiodiversity": Soil protection, erosion mitigation, and defensive/caloric planting recommendations tailored to this specific hardiness zone.
4. "ClimateResilience": A summary of the property's ability to survive extreme weather, grid collapse, or drought, and the immediate steps to secure it.
Ensure the response is raw, valid JSON only.`;
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

    let parsed: { WaterStrategy: unknown; SunAndEnergy: unknown; LandAndBiodiversity: unknown; ClimateResilience: unknown };
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
      WaterStrategy: parsed.WaterStrategy ?? "",
      SunAndEnergy: parsed.SunAndEnergy ?? "",
      LandAndBiodiversity: parsed.LandAndBiodiversity ?? "",
      ClimateResilience: parsed.ClimateResilience ?? "",
      generatedAt: generatedAt.toISOString(),
      rawJson,
    });
  },
);

export default router;
