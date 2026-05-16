import { contours as d3contours } from "d3-contour";
import { min as d3min, max as d3max } from "d3-array";
import * as turf from "@turf/turf";

function lngToTileX(lng: number, z: number): number {
  return Math.floor(((lng + 180) / 360) * Math.pow(2, z));
}

function latToTileY(lat: number, z: number): number {
  const latRad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      Math.pow(2, z),
  );
}

function tileXYToLng(tx: number, z: number): number {
  return (tx / Math.pow(2, z)) * 360 - 180;
}

function tileXYToLat(ty: number, z: number): number {
  const n = Math.pow(2, z);
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * ty) / n)));
  return (latRad * 180) / Math.PI;
}

async function fetchElevationTile(
  tx: number,
  ty: number,
  z: number,
  token: string,
): Promise<{ data: Float32Array; width: number; height: number }> {
  const url = `https://api.mapbox.com/v4/mapbox.terrain-rgb/${z}/${tx}/${ty}.pngraw?access_token=${token}`;

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Tile fetch failed: ${response.status}`);
  const blob = await response.blob();
  const objectURL = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(objectURL);
        reject(new Error("No canvas context"));
        return;
      }
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      const pixels = imageData.data;
      const elevation = new Float32Array(img.width * img.height);
      for (let i = 0; i < elevation.length; i++) {
        const r = pixels[i * 4];
        const g = pixels[i * 4 + 1];
        const b = pixels[i * 4 + 2];
        elevation[i] = -10000 + (r * 65536 + g * 256 + b) * 0.1;
      }
      URL.revokeObjectURL(objectURL);
      resolve({ data: elevation, width: img.width, height: img.height });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectURL);
      reject(new Error("Image load failed"));
    };
    img.src = objectURL;
  });
}

export async function generateContours(
  boundaryGeojson: GeoJSON.Feature | GeoJSON.FeatureCollection | GeoJSON.Geometry,
  token: string,
  intervalMeters = 1,
): Promise<GeoJSON.FeatureCollection> {
  const bbox = turf.bbox(boundaryGeojson as turf.AllGeoJSON);
  const [minLng, minLat, maxLng, maxLat] = bbox;

  // Choose zoom level based on area size (14 is good for 1-100+ acres)
  const z = 14;
  const tileSize = 256;

  const txMin = lngToTileX(minLng, z);
  const txMax = lngToTileX(maxLng, z);
  const tyMin = latToTileY(maxLat, z); // top tile (smaller y = higher lat)
  const tyMax = latToTileY(minLat, z); // bottom tile

  const tilesWide = txMax - txMin + 1;
  const tilesTall = tyMax - tyMin + 1;
  const gridWidth = tilesWide * tileSize;
  const gridHeight = tilesTall * tileSize;

  const elevation = new Float32Array(gridWidth * gridHeight);

  // Fetch all tiles in parallel
  const tilePromises: Promise<void>[] = [];
  for (let tx = txMin; tx <= txMax; tx++) {
    for (let ty = tyMin; ty <= tyMax; ty++) {
      tilePromises.push(
        fetchElevationTile(tx, ty, z, token).then(({ data, width, height }) => {
          const offsetX = (tx - txMin) * tileSize;
          const offsetY = (ty - tyMin) * tileSize;
          for (let py = 0; py < height; py++) {
            for (let px = 0; px < width; px++) {
              const dstIdx = (offsetY + py) * gridWidth + (offsetX + px);
              elevation[dstIdx] = data[py * width + px];
            }
          }
        }),
      );
    }
  }

  await Promise.all(tilePromises);

  const minElev = d3min(elevation) ?? 0;
  const maxElev = d3max(elevation) ?? 0;

  if (maxElev - minElev < intervalMeters) {
    return { type: "FeatureCollection", features: [] };
  }

  // Build thresholds at intervalMeters intervals
  const thresholds: number[] = [];
  for (
    let e = Math.ceil(minElev / intervalMeters) * intervalMeters;
    e <= maxElev;
    e += intervalMeters
  ) {
    thresholds.push(e);
  }

  // Cap at 500 thresholds for performance
  const cappedThresholds =
    thresholds.length > 500 ? thresholds.slice(0, 500) : thresholds;

  const contourGenerator = d3contours()
    .size([gridWidth, gridHeight])
    .thresholds(cappedThresholds);

  const rawContours = contourGenerator(Array.from(elevation));

  // Convert pixel coords to lng/lat using tile math
  const topLeftLng = tileXYToLng(txMin, z);
  const topLeftLat = tileXYToLat(tyMin, z);
  const bottomRightLng = tileXYToLng(txMax + 1, z);
  const bottomRightLat = tileXYToLat(tyMax + 1, z);

  function pixelToLngLat(px: number, py: number): [number, number] {
    // Fraction across the tile grid
    const fracX = px / gridWidth;
    const fracY = py / gridHeight;
    // Tile position in tile coords
    const tileX = txMin + fracX * tilesWide;
    const tileY = tyMin + fracY * tilesTall;
    const n = Math.pow(2, z);
    const lng = (tileX / n) * 360 - 180;
    const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * tileY) / n)));
    const lat = (latRad * 180) / Math.PI;
    return [lng, lat];
  }

  const bboxTurf: [number, number, number, number] = [minLng, minLat, maxLng, maxLat];
  const features: GeoJSON.Feature[] = [];

  for (const contour of rawContours) {
    const elevation = contour.value;
    // contour.coordinates is MultiPolygon rings — each ring is a closed contour line
    for (const polygon of contour.coordinates) {
      for (const ring of polygon) {
        if (ring.length < 2) continue;
        const coords = ring.map((pt: number[]) => pixelToLngLat(pt[0], pt[1]));
        if (coords.length < 2) continue;

        try {
          const line: GeoJSON.Feature<GeoJSON.LineString> = {
            type: "Feature",
            geometry: { type: "LineString", coordinates: coords },
            properties: { elevation },
          };
          const clipped = turf.bboxClip(line, bboxTurf);
          if (
            clipped.geometry.coordinates.length > 0 &&
            (clipped.geometry.coordinates as number[][]).length > 1
          ) {
            features.push({
              ...clipped,
              properties: { elevation },
            });
          }
        } catch {
          // Skip invalid geometry
        }
      }
    }
  }

  return { type: "FeatureCollection", features };
}
