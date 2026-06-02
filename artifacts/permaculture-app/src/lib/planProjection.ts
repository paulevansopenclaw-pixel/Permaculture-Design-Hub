import * as turf from "@turf/turf";

// ─── GeoJSON parsing helpers ────────────────────────────────────────────────────

/** Parse a GeoJSON value that may arrive as a JSON string or an already-parsed object. */
export type AnyGeo = GeoJSON.Feature | GeoJSON.FeatureCollection | GeoJSON.Geometry;

export function parseGeo(
  g: string | Record<string, unknown> | null | undefined,
): AnyGeo | null {
  if (!g) return null;
  try {
    const parsed = typeof g === "string" ? JSON.parse(g) : g;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as AnyGeo;
  } catch {
    return null;
  }
}

/** Coerce any parsed GeoJSON into a Feature (wrapping bare geometries). */
export function toFeature(g: AnyGeo | null): GeoJSON.Feature | null {
  if (!g) return null;
  if (g.type === "Feature") return g as GeoJSON.Feature;
  if (g.type === "FeatureCollection") {
    return (g as GeoJSON.FeatureCollection).features[0] ?? null;
  }
  return { type: "Feature", geometry: g as GeoJSON.Geometry, properties: {} };
}

/** Extract the outer ring (array of [lng,lat]) from a Polygon/MultiPolygon feature. */
export function outerRing(
  g: string | Record<string, unknown> | null | undefined,
): [number, number][] | null {
  const feat = toFeature(parseGeo(g));
  if (!feat || !feat.geometry) return null;
  const geom = feat.geometry;
  if (geom.type === "Polygon") {
    return (geom.coordinates[0] as [number, number][]) ?? null;
  }
  if (geom.type === "MultiPolygon") {
    return (geom.coordinates[0]?.[0] as [number, number][]) ?? null;
  }
  return null;
}

/** Extract a LineString coordinate array from a parsed value. */
export function lineCoords(
  g: string | Record<string, unknown> | null | undefined,
): [number, number][] | null {
  const feat = toFeature(parseGeo(g));
  if (!feat || !feat.geometry) return null;
  const geom = feat.geometry;
  if (geom.type === "LineString") return geom.coordinates as [number, number][];
  if (geom.type === "MultiLineString") return geom.coordinates[0] as [number, number][];
  if (geom.type === "Polygon") return geom.coordinates[0] as [number, number][];
  return null;
}

// ─── Projection ─────────────────────────────────────────────────────────────────

export interface PlanProjection {
  /** Project lng/lat to plate pixel coordinates. */
  project: (lng: number, lat: number) => [number, number];
  /** Project a [lng,lat] ring to an SVG path "M..L..Z" string (closed). */
  ringPath: (ring: [number, number][], close?: boolean) => string;
  width: number;
  height: number;
  /** Drawing area inside the frame margins. */
  pad: number;
  metersPerPixel: number;
  centerLng: number;
  centerLat: number;
  widthMeters: number;
  heightMeters: number;
  bbox: [number, number, number, number];
}

/**
 * Build a local-meters projection that fits a boundary feature into a plate of
 * `width` x `height` pixels, leaving `pad` px of margin for the cartographic frame.
 *
 * Uses an equirectangular local projection centred on the boundary centroid —
 * accurate at parcel scale (sub-kilometre) and gives a faithful graphic scale bar.
 */
export function makeProjection(
  boundary: string | Record<string, unknown> | null | undefined,
  width: number,
  height: number,
  pad: number,
): PlanProjection | null {
  const feat = toFeature(parseGeo(boundary));
  if (!feat) return null;

  let bbox: [number, number, number, number];
  try {
    bbox = turf.bbox(feat as turf.AllGeoJSON) as [number, number, number, number];
  } catch {
    return null;
  }
  const [minLng, minLat, maxLng, maxLat] = bbox;
  if (![minLng, minLat, maxLng, maxLat].every(Number.isFinite)) return null;

  const centerLng = (minLng + maxLng) / 2;
  const centerLat = (minLat + maxLat) / 2;
  const cosLat = Math.cos((centerLat * Math.PI) / 180);

  // Boundary extent in metres.
  const widthMeters = Math.max(1, (maxLng - minLng) * 111320 * cosLat);
  const heightMeters = Math.max(1, (maxLat - minLat) * 111320);

  const innerW = width - pad * 2;
  const innerH = height - pad * 2;

  // Fit preserving aspect ratio (north up).
  const scale = Math.min(innerW / widthMeters, innerH / heightMeters);
  const drawW = widthMeters * scale;
  const drawH = heightMeters * scale;
  const offsetX = pad + (innerW - drawW) / 2;
  const offsetY = pad + (innerH - drawH) / 2;

  const project = (lng: number, lat: number): [number, number] => {
    const xm = (lng - centerLng) * 111320 * cosLat;
    const ym = (lat - centerLat) * 111320;
    const px = offsetX + drawW / 2 + xm * scale;
    // SVG y grows downward; north (higher lat) is up.
    const py = offsetY + drawH / 2 - ym * scale;
    return [px, py];
  };

  const ringPath = (ring: [number, number][], close = true): string => {
    if (!ring || ring.length === 0) return "";
    let d = "";
    ring.forEach((pt, i) => {
      const [x, y] = project(pt[0], pt[1]);
      d += `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    });
    if (close) d += "Z";
    return d;
  };

  return {
    project,
    ringPath,
    width,
    height,
    pad,
    metersPerPixel: 1 / scale,
    centerLng,
    centerLat,
    widthMeters,
    heightMeters,
    bbox,
  };
}

// ─── Graphic scale bar ──────────────────────────────────────────────────────────

export interface ScaleBar {
  meters: number;
  pixels: number;
  label: string;
}

/** Pick a "nice" round distance whose bar is close to `targetPx` wide. */
export function niceScaleBar(metersPerPixel: number, targetPx = 130): ScaleBar {
  const rawMeters = targetPx * metersPerPixel;
  const pow = Math.pow(10, Math.floor(Math.log10(rawMeters)));
  const candidates = [1, 2, 2.5, 5, 10].map((m) => m * pow);
  let best = candidates[0];
  for (const c of candidates) {
    if (Math.abs(c - rawMeters) < Math.abs(best - rawMeters)) best = c;
  }
  const pixels = best / metersPerPixel;
  const label = best >= 1000 ? `${(best / 1000).toFixed(best % 1000 === 0 ? 0 : 1)} km` : `${Math.round(best)} m`;
  return { meters: best, pixels, label };
}

/** Bearing helper for sector wedges — destination lng/lat from a centre + bearing. */
export function bearingDest(
  centerLng: number,
  centerLat: number,
  deg: number,
  meters: number,
): [number, number] {
  const rad = (deg * Math.PI) / 180;
  const dx = Math.sin(rad) * meters;
  const dy = Math.cos(rad) * meters;
  const destLat = centerLat + dy / 111320;
  const destLng = centerLng + dx / (111320 * Math.cos((centerLat * Math.PI) / 180));
  return [destLng, destLat];
}
