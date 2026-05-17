import * as turf from "@turf/turf";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ContourLine {
  type: "Feature";
  geometry: GeoJSON.LineString;
  properties: { elevation: number; [key: string]: unknown };
}

export interface AnalyzedSwale {
  type: "Feature";
  geometry: GeoJSON.LineString;
  properties: {
    elevation: number;
    lengthM: number;
    rank?: number;
    swaleKind: "longest" | "highest";
    uphillAreaAcres?: number;
    [key: string]: unknown;
  };
}

export interface WaterAnalysisResult {
  damSite: GeoJSON.Feature<GeoJSON.Point, { elevation: number; label: string; interContourSpacingM: number }> | null;
  longestSwales: AnalyzedSwale[];
  highestSwale: AnalyzedSwale | null;
  minElev: number;
  maxElev: number;
  totalAreaAcres: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function valleyBottomPoint(contour: ContourLine): [number, number] {
  const coords = contour.geometry.coordinates as [number, number][];
  let lowest = coords[0];
  for (const c of coords) {
    if (c[1] < lowest[1]) lowest = c;
  }
  return lowest;
}

/**
 * Average 2D distance between the two contour lines sampled at 12 points.
 */
function averageInterContourSpacingM(lower: ContourLine, upper: ContourLine): number {
  const lowerFeature: GeoJSON.Feature<GeoJSON.LineString> = lower as GeoJSON.Feature<GeoJSON.LineString>;
  const upperFeature: GeoJSON.Feature<GeoJSON.LineString> = upper as GeoJSON.Feature<GeoJSON.LineString>;
  const lenM = turf.length(lowerFeature, { units: "meters" });
  if (lenM === 0) return Infinity;
  const n = Math.min(12, lower.geometry.coordinates.length);
  const step = lenM / n;
  let total = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    try {
      const pt = turf.along(lowerFeature, i * step, { units: "meters" });
      const nearest = turf.nearestPointOnLine(upperFeature, pt, { units: "meters" });
      const dist = nearest.properties?.dist;
      if (typeof dist === "number") { total += dist; count++; }
    } catch {
      // skip degenerate samples
    }
  }
  return count > 0 ? total / count : Infinity;
}

/**
 * Returns true if the contour does NOT touch the property boundary edge
 * (i.e. it is a fully interior contour ring, not clipped).
 */
function isInteriorContour(contour: ContourLine, boundaryLine: GeoJSON.Feature<GeoJSON.LineString>): boolean {
  const coords = contour.geometry.coordinates as [number, number][];
  const start = turf.point(coords[0]);
  const end = turf.point(coords[coords.length - 1]);
  try {
    const ds = turf.pointToLineDistance(start, boundaryLine as GeoJSON.Feature<GeoJSON.LineString>, { units: "meters" });
    const de = turf.pointToLineDistance(end, boundaryLine as GeoJSON.Feature<GeoJSON.LineString>, { units: "meters" });
    return ds > 15 && de > 15;
  } catch {
    return false;
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Analyzes a contour FeatureCollection using Yeomans' Keyline principles.
 *
 * @param contourFC  – output of generateContours() (features have `properties.elevation`)
 * @param boundary   – the property boundary polygon feature
 * @param minUphillAcres – threshold for "highest practical swale" (default 0.5 ac)
 */
export function analyzeWaterPaths(
  contourFC: GeoJSON.FeatureCollection,
  boundary: GeoJSON.Feature<GeoJSON.Polygon>,
  minUphillAcres = 0.5,
): WaterAnalysisResult {
  const contours: ContourLine[] = contourFC.features.filter((f: GeoJSON.Feature): f is ContourLine =>
    f.geometry?.type === "LineString" &&
    typeof (f.properties as Record<string, unknown>)?.elevation === "number",
  );

  const totalAreaM2 = turf.area(boundary as GeoJSON.Feature<GeoJSON.Polygon>);
  const totalAreaAcres = totalAreaM2 / 4046.86;

  if (contours.length < 3) {
    return { damSite: null, longestSwales: [], highestSwale: null, minElev: 0, maxElev: 0, totalAreaAcres };
  }

  const sortedAsc = [...contours].sort((a, b) => a.properties.elevation - b.properties.elevation);
  const minElev = sortedAsc[0].properties.elevation;
  const maxElev = sortedAsc[sortedAsc.length - 1].properties.elevation;
  const elevRange = maxElev - minElev;

  // ─── 1. Keyline Dam Site — inter-contour inflection point ─────────────────
  let damSite: WaterAnalysisResult["damSite"] = null;

  if (sortedAsc.length >= 4) {
    // Group by elevation level (multiple linestrings can share same elevation)
    const elevGroups = new Map<number, ContourLine[]>();
    for (const c of sortedAsc) {
      const e = c.properties.elevation;
      if (!elevGroups.has(e)) elevGroups.set(e, []);
      elevGroups.get(e)!.push(c);
    }
    const elevLevels = [...elevGroups.keys()].sort((a, b) => a - b);

    // For each consecutive pair, compute average inter-contour spacing
    const spacings: { elev: number; spacingM: number; lower: ContourLine }[] = [];
    for (let i = 0; i < elevLevels.length - 1; i++) {
      const lowers = elevGroups.get(elevLevels[i])!;
      const uppers = elevGroups.get(elevLevels[i + 1])!;
      const lower = lowers.reduce((a, b) =>
        turf.length(a as GeoJSON.Feature<GeoJSON.LineString>, { units: "meters" }) >=
        turf.length(b as GeoJSON.Feature<GeoJSON.LineString>, { units: "meters" }) ? a : b
      );
      const upper = uppers.reduce((a, b) =>
        turf.length(a as GeoJSON.Feature<GeoJSON.LineString>, { units: "meters" }) >=
        turf.length(b as GeoJSON.Feature<GeoJSON.LineString>, { units: "meters" }) ? a : b
      );
      try {
        const spacingM = averageInterContourSpacingM(lower, upper);
        spacings.push({ elev: elevLevels[i], spacingM, lower });
      } catch {
        // skip
      }
    }

    if (spacings.length >= 3) {
      // Smooth with a 3-point moving average to reduce noise
      const smoothed = spacings.map((s, i) => {
        const prev = spacings[Math.max(0, i - 1)].spacingM;
        const curr = s.spacingM;
        const next = spacings[Math.min(spacings.length - 1, i + 1)].spacingM;
        return (prev + curr + next) / 3;
      });

      // Find the minimum smoothed spacing (valley pinch point)
      let minIdx = 0;
      for (let i = 1; i < smoothed.length; i++) {
        if (smoothed[i] < smoothed[minIdx]) minIdx = i;
      }

      const damContour = spacings[minIdx].lower;
      const damPoint = valleyBottomPoint(damContour);

      damSite = {
        type: "Feature",
        geometry: { type: "Point", coordinates: damPoint },
        properties: {
          elevation: spacings[minIdx].elev,
          label: "Suggested Keyline Dam Site",
          interContourSpacingM: Math.round(spacings[minIdx].spacingM),
        },
      };
    }
  }

  // ─── 2. Interior contours (not clipped to boundary edge) ─────────────────
  let boundaryLine: GeoJSON.Feature<GeoJSON.LineString>;
  try {
    boundaryLine = turf.polygonToLine(boundary as GeoJSON.Feature<GeoJSON.Polygon>) as GeoJSON.Feature<GeoJSON.LineString>;
  } catch {
    return { damSite, longestSwales: [], highestSwale: null, minElev, maxElev, totalAreaAcres };
  }

  const interior = contours.filter((c) => isInteriorContour(c, boundaryLine));

  const withLength: AnalyzedSwale[] = interior.map((c) => ({
    type: "Feature" as const,
    geometry: c.geometry,
    properties: {
      ...c.properties,
      lengthM: Math.round(turf.length(c as GeoJSON.Feature<GeoJSON.LineString>, { units: "meters" })),
      swaleKind: "longest" as const,
    },
  }));

  // ─── 3. Top 3 longest interior contours ──────────────────────────────────
  const longestSwales: AnalyzedSwale[] = [...withLength]
    .sort((a, b) => b.properties.lengthM - a.properties.lengthM)
    .slice(0, 3)
    .map((s, i) => ({ ...s, properties: { ...s.properties, rank: i + 1 } }));

  // ─── 4. Highest practical swale ──────────────────────────────────────────
  // Linear approximation: uphill area ≈ totalArea × (maxElev − E) / elevRange
  const sortedDesc = [...withLength].sort((a, b) => b.properties.elevation - a.properties.elevation);

  let highestSwale: AnalyzedSwale | null = null;
  for (const c of sortedDesc) {
    const elev = c.properties.elevation;
    const uphillFraction = elevRange > 0 ? (maxElev - elev) / elevRange : 0;
    const uphillAreaM2 = totalAreaM2 * uphillFraction;
    const uphillAcres = uphillAreaM2 / 4046.86;
    if (uphillAreaM2 >= minUphillAcres * 4046.86) {
      highestSwale = {
        ...c,
        properties: { ...c.properties, swaleKind: "highest", uphillAreaAcres: Math.round(uphillAcres * 100) / 100 },
      };
      break;
    }
  }

  return { damSite, longestSwales, highestSwale, minElev, maxElev, totalAreaAcres };
}
