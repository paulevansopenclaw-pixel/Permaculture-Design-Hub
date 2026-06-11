import * as turf from "@turf/turf";
import { analyzeWaterPaths, type WaterAnalysisResult } from "./keylineEngine";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AutoDesignInput {
  boundary: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
  centroid: [number, number];
  areaHa: number;
  brief: {
    primaryGoal?: string | null;
    maintenanceCapacity?: string | null;
    householdSize?: number | null;
    prevailingWindDir?: string | null;
    meanWindSpeedMs?: number | null;
    annualRainfallMm?: number | null;
    climateZone?: string | null;
    soilTextureClass?: string | null;
    elevationM?: number | null;
    frostDaysPerYear?: number | null;
    solarIrradianceKwhM2?: number | null;
    challengeHighWind?: boolean | null;
    challengeWinterFlooding?: boolean | null;
    challengeSevereErosion?: boolean | null;
    machineryWidthM?: number | null;
  };
  analysis?: Record<string, unknown> | null;
}

export interface AutoDesignResult {
  zones: Array<{ zoneNumber: number; name: string; geojson: string; rationale: string }>;
  structures: Array<{ type: string; label: string; lng: number; lat: number; rationale: string }>;
  swales: Array<{ geojson: string; elevation: number; rationale: string }>;
  sectors: Array<{ sectorType: string; label: string; geojson: string; rationale: string }>;
  pathways: Array<{ type: string; label: string; geojson: string; rationale: string }>;
  water: { damSite?: { lng: number; lat: number; elevation: number } | null };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getBoundaryCenter(geom: GeoJSON.Polygon | GeoJSON.MultiPolygon): [number, number] {
  try {
    const c = turf.centroid({ type: "Feature", geometry: geom, properties: {} });
    return c.geometry.coordinates as [number, number];
  } catch {
    if (geom.type === "Polygon") return geom.coordinates[0][0] as [number, number];
    return geom.coordinates[0][0][0] as [number, number];
  }
}

function boundaryBbox(geom: GeoJSON.Polygon | GeoJSON.MultiPolygon): [number, number, number, number] {
  try {
    return turf.bbox({ type: "Feature", geometry: geom, properties: {} }) as [number, number, number, number];
  } catch {
    return [0, 0, 0, 0];
  }
}

function bufferMeters(feature: GeoJSON.Feature, meters: number): GeoJSON.Feature<GeoJSON.Polygon> {
  try {
    return turf.buffer(feature, meters, { units: "meters", steps: 32 }) as GeoJSON.Feature<GeoJSON.Polygon>;
  } catch {
    return feature as GeoJSON.Feature<GeoJSON.Polygon>;
  }
}

function innerBufferPercent(feature: GeoJSON.Feature<GeoJSON.Polygon>, pct: number): GeoJSON.Feature<GeoJSON.Polygon> {
  const bb = turf.bbox(feature) as [number, number, number, number];
  const area = (bb[2] - bb[0]) * (bb[3] - bb[1]);
  const sideKm = Math.sqrt(area) / 2;
  const bufM = sideKm * pct * 1000;
  return bufferMeters(feature, bufM);
}

function radialSlice(center: [number, number], angleDeg: number, radiusKm: number): GeoJSON.Feature<GeoJSON.Polygon> {
  try {
    const p = turf.point(center);
    return turf.sector(p, radiusKm, angleDeg - 12, angleDeg + 12, {
      units: "kilometers",
      steps: 48,
    }) as GeoJSON.Feature<GeoJSON.Polygon>;
  } catch {
    return turf.bboxPolygon([center[0] - radiusKm, center[1] - radiusKm, center[0] + radiusKm, center[1] + radiusKm]) as GeoJSON.Feature<GeoJSON.Polygon>;
  }
}

function clipToBoundary(feature: GeoJSON.Feature, boundary: GeoJSON.Feature): GeoJSON.Feature {
  try {
    const i = turf.intersect(feature, boundary);
    return i ?? feature;
  } catch {
    return feature;
  }
}

function makeWedge(center: [number, number], dirDeg: number, boundary: GeoJSON.Feature<GeoJSON.Polygon>, radiusKm: number): GeoJSON.Feature<GeoJSON.Polygon> {
  const sector = radialSlice(center, dirDeg, radiusKm);
  const clipped = clipToBoundary(sector, { type: "Feature", geometry: (boundary.geometry), properties: {} });
  if (!clipped || clipped.geometry.type === "GeometryCollection") {
    return turf.bboxPolygon(boundaryBbox(boundary)) as GeoJSON.Feature<GeoJSON.Polygon>;
  }
  return clipped as GeoJSON.Feature<GeoJSON.Polygon>;
}

function toGeojsonString(feature: GeoJSON.Feature): string {
  return JSON.stringify(feature);
}

// ─── Main engine ──────────────────────────────────────────────────────────────

export function generateAutoDesign(input: AutoDesignInput): AutoDesignResult {
  const boundaryFeature = {
    type: "Feature" as const,
    geometry: input.boundary,
    properties: {},
  };
  const center = input.centroid;
  const areaHa = input.areaHa || 1;
  const radiusKm = Math.max(0.15, Math.sqrt(areaHa / 100) * 0.6);

  // ─── Zones ────────────────────────────────────────────────────────────────
  const winterSunAz = 180;
  const winterSunWedge = makeWedge(center, winterSunAz, boundaryFeature as GeoJSON.Feature<GeoJSON.Polygon>, radiusKm * 1.2);
  const accessWedge = makeWedge(center, 90, boundaryFeature as GeoJSON.Feature<GeoJSON.Polygon>, radiusKm * 1.2);
  const zone1Poly = clipToBoundary(
    turf.intersect(winterSunWedge, accessWedge) ?? winterSunWedge,
    boundaryFeature,
  );
  const zone1 = {
    zoneNumber: 1 as const,
    name: "Daily Use",
    geojson: toGeojsonString(
      zone1Poly && zone1Poly.geometry.type !== "GeometryCollection"
        ? zone1Poly
        : (innerBufferPercent(boundaryFeature as GeoJSON.Feature<GeoJSON.Polygon>, 0.25) as GeoJSON.Feature<GeoJSON.Polygon>),
    ),
    rationale: "Close to the house and access, on the winter-sun aspect.",
  };

  const zone2Poly = innerBufferPercent(boundaryFeature as GeoJSON.Feature<GeoJSON.Polygon>, 0.48);
  const zone2 = {
    zoneNumber: 2 as const,
    name: "Semi-Daily",
    geojson: toGeojsonString(zone2Poly),
    rationale: "Within easy walking distance, accessed from Zone 1.",
  };

  const zone3Poly = innerBufferPercent(boundaryFeature as GeoJSON.Feature<GeoJSON.Polygon>, 0.72);
  const zone3 = {
    zoneNumber: 3 as const,
    name: "Farm / Pasture",
    geojson: toGeojsonString(zone3Poly),
    rationale: "Further from the house, suited to larger-scale production.",
  };

  const zone4Poly = innerBufferPercent(boundaryFeature as GeoJSON.Feature<GeoJSON.Polygon>, 0.88);
  const zone4 = {
    zoneNumber: 4 as const,
    name: "Semi-Wild / Timber",
    geojson: toGeojsonString(zone4Poly),
    rationale: "Managed for yield with minimal intervention; windbreak edge.",
  };

  const zone5 = {
    zoneNumber: 5 as const,
    name: "Wilderness",
    geojson: toGeojsonString({ type: "Feature", geometry: input.boundary, properties: {} }),
    rationale: "No intervention zone — wildlife sanctuary and ecological reserve.",
  };

  const zones = [zone1, zone2, zone3, zone4, zone5];

  // ─── Structures ───────────────────────────────────────────────────────────
  const housePt = getBoundaryCenter(input.boundary);
  const structures = [
    {
      type: "house",
      label: "House",
      lng: housePt[0] + 0.00005,
      lat: housePt[1] + 0.00004,
      rationale: "Central position, winter sun aspect, sheltered by tree canopy.",
    },
    {
      type: "greenhouse",
      label: "Greenhouse",
      lng: housePt[0] + 0.00012,
      lat: housePt[1] + 0.00008,
      rationale: "Adjacent to house, next to kitchen garden, winter-sun orientation.",
    },
    {
      type: "shed",
      label: "Tool Shed",
      lng: housePt[0] - 0.0001,
      lat: housePt[1] + 0.00006,
      rationale: "Access from driveway, near Zone 2 for orchard and compost.",
    },
    {
      type: "tank",
      label: "Rainwater Tank",
      lng: housePt[0] + 0.00008,
      lat: housePt[1] - 0.00005,
      rationale: "High point near house, maximises gravity-fed pressure.",
    },
  ];

  // ─── Swales + dam (from keyline analysis) ─────────────────────────────────
  const contourFc = { type: "FeatureCollection", features: [] } as unknown as GeoJSON.FeatureCollection;
  const waterAnalysis: WaterAnalysisResult = analyzeWaterPaths(
    contourFc,
    { type: "Feature", geometry: input.boundary, properties: {} } as GeoJSON.Feature<GeoJSON.Polygon>,
  );

  const swales = (waterAnalysis.longestSwales ?? []).map((s, i) => ({
    geojson: JSON.stringify({
      type: "Feature",
      geometry: s.geometry,
      properties: { rank: i + 1, ...s.properties },
    }),
    elevation: s.properties.elevation,
    rationale: `Keyline swale #${i + 1}: ${Math.round(s.properties.lengthM)} m, ranked by water flow length.`,
  }));

  const water = {
    damSite: waterAnalysis.damSite
      ? {
          lng: waterAnalysis.damSite.geometry.coordinates[0],
          lat: waterAnalysis.damSite.geometry.coordinates[1],
          elevation: waterAnalysis.damSite.properties.elevation,
        }
      : null,
  };

  // ─── Sectors ──────────────────────────────────────────────────────────────
  const windDir = parseWindDeg(input.brief.prevailingWindDir);
  const sectors: AutoDesignResult["sectors"] = [];

  if (Number.isFinite(windDir)) {
    const windWedge = makeWedge(center, windDir, boundaryFeature as GeoJSON.Feature<GeoJSON.Polygon>, radiusKm * 1.3);
    sectors.push({
      sectorType: "wind",
      label: `Prevailing wind (${input.brief.prevailingWindDir})`,
      geojson: toGeojsonString(windWedge),
      rationale: "Windbreaks planted on this edge reduce exposure to the property.",
    });
  }

  const arc = makeSolarArcPolygon(center, radiusKm * 1.1);
  sectors.push({
    sectorType: "winter_solar",
    label: "Winter solar arc",
    geojson: toGeojsonString(arc),
    rationale: "Keep this arc clear of tall trees and structures to maximise winter sun.",
  });

  // ─── Pathways ─────────────────────────────────────────────────────────────
  const drivewayGeo = turf.lineString(
    [
      [center[0] - 0.0008, center[1] - 0.0006],
      [housePt[0] + 0.00005, housePt[1] + 0.00004],
    ],
    { type: "Feature", properties: { type: "driveway" } },
  );
  const pathways = [
    {
      type: "driveway",
      label: "Main Driveway",
      geojson: toGeojsonString(drivewayGeo as GeoJSON.Feature<GeoJSON.LineString>),
      rationale: "Primary vehicle access from road to house.",
    },
  ];

  return { zones, structures, swales, sectors, pathways, water };
}

function parseWindDeg(dir?: string | null): number | null {
  if (!dir) return null;
  const map: Record<string, number> = {
    N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
    S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
  };
  return map[dir.trim().toUpperCase()] ?? null;
}

function makeSolarArcPolygon(center: [number, number], radiusKm: number): GeoJSON.Feature<GeoJSON.Polygon> {
  try {
    const pts: [number, number][] = [];
    const steps = 40;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const angleDeg = 60 + t * 60;
      const angleRad = (angleDeg * Math.PI) / 180;
      const dist = radiusKm * (0.6 + 0.4 * Math.sin(t * Math.PI));
      const dx = dist * Math.sin(angleRad);
      const dy = dist * Math.cos(angleRad);
      pts.push([center[0] + dx, center[1] + dy]);
    }
    return turf.polygon([pts], { type: "Feature", properties: { kind: "winter_solar" } }) as GeoJSON.Feature<GeoJSON.Polygon>;
  } catch {
    return turf.bboxPolygon([center[0] - radiusKm, center[1] - radiusKm, center[0] + radiusKm, center[1] + radiusKm]) as GeoJSON.Feature<GeoJSON.Polygon>;
  }
}
