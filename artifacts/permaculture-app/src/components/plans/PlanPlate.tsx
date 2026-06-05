import { forwardRef, useMemo } from "react";
import * as turf from "@turf/turf";
import type {
  Property,
  Zone,
  Sector,
  Structure,
  DesignedSwale,
  Pathway,
  SensoryVector,
} from "@workspace/api-client-react";
import type { WaterAnalysisResult } from "@/lib/keylineEngine";
import {
  makeProjection,
  niceScaleBar,
  outerRing,
  lineCoords,
  bearingDest,
  parseGeo,
  toFeature,
  type PlanProjection,
} from "@/lib/planProjection";

// ─── Palette ────────────────────────────────────────────────────────────────────
const PARCHMENT = "#efe6d3";
const PARCHMENT_2 = "#e7dcc4";
const INK = "#2c2416";
const RULE = "#6b5f4e";

const ZONE_COLORS: Record<number, { fill: string; stroke: string }> = {
  1: { fill: "#2d7a1e", stroke: "#1a5210" },  // Zone 1 — strong green (home & intensive)
  2: { fill: "#6aaa44", stroke: "#3d7828" },  // Zone 2 — medium green (food forest)
  3: { fill: "#9dc48a", stroke: "#5a8a45" },  // Zone 3 — soft sage green (farmland)
  4: { fill: "#D4A27A", stroke: "#92400E" },  // Zone 4 — earth tone (woodlot)
  5: { fill: "#94A3B8", stroke: "#475569" },  // Zone 5 — grey-blue (wild/unmanaged)
};
const SECTOR_COLORS: Record<string, string> = {
  wind: "#5577A8",
  noise: "#B45032",
  winter_solar: "#D28A20",
  custom_view: "#C8971A",
};
const PATHWAY_COLORS: Record<string, string> = {
  driveway: "#8B6914",
  footpath: "#C4975A",
  farm_track: "#6B4C2A",
  fenceline: "#6B7280",
  firebreak: "#DC2626",
};
const SENSORY_COLORS: Record<string, string> = {
  road_noise: "#B85232",
  view_corridor: "#2A9D8F",
  privacy_threat: "#7C4F7E",
};

export type PlanLayerKey = "boundary" | "water" | "zones" | "sectors" | "structures";

export interface PlanPlateProps {
  property: Property;
  width?: number;
  height?: number;
  visible: Record<PlanLayerKey, boolean>;
  zones?: Zone[];
  sectors?: Sector[];
  structures?: Structure[];
  swales?: DesignedSwale[];
  pathways?: Pathway[];
  sensoryVectors?: SensoryVector[];
  contours?: GeoJSON.FeatureCollection | null;
  waterAnalysis?: WaterAnalysisResult | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function centroidXY(
  proj: PlanProjection,
  geo: string | Record<string, unknown> | null | undefined,
): [number, number] | null {
  const feat = toFeature(parseGeo(geo));
  if (!feat) return null;
  try {
    const c = turf.centroid(feat as turf.AllGeoJSON);
    const [lng, lat] = c.geometry.coordinates;
    return proj.project(lng, lat);
  } catch {
    return null;
  }
}

function fmtArea(property: Property): string {
  const ha = property.areaHectares ?? 0;
  const ac = property.areaAcres ?? 0;
  if (ha <= 0 && ac <= 0) return "—";
  return `${ha.toFixed(2)} ha · ${ac.toFixed(2)} ac`;
}

const LAYER_TITLES: Record<PlanLayerKey, string> = {
  boundary: "Boundary Survey",
  water: "Water & Contour",
  zones: "Zone Plan",
  sectors: "Sector Analysis",
  structures: "Structures & Access",
};

// ─── Component ──────────────────────────────────────────────────────────────────

export const PlanPlate = forwardRef<SVGSVGElement, PlanPlateProps>(function PlanPlate(
  {
    property,
    width = 1000,
    height = 720,
    visible,
    zones = [],
    sectors = [],
    structures = [],
    swales = [],
    pathways = [],
    sensoryVectors = [],
    contours = null,
    waterAnalysis = null,
  },
  ref,
) {
  const PAD = 64;
  const proj = useMemo(
    () => makeProjection(property.boundaryGeojson as unknown as string, width, height, PAD),
    [property.boundaryGeojson, width, height],
  );

  if (!proj) {
    return (
      <div
        style={{
          width: "100%",
          aspectRatio: `${width} / ${height}`,
          background: PARCHMENT,
          border: `1px solid ${RULE}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: RULE,
          fontFamily: "monospace",
          fontSize: 12,
        }}
      >
        No boundary drawn yet — draw the property in the Map workspace.
      </div>
    );
  }

  const scaleBar = niceScaleBar(proj.metersPerPixel, 150);
  const repFraction = Math.round(proj.metersPerPixel / 0.0002646);
  const activeLayers = (Object.keys(visible) as PlanLayerKey[]).filter((k) => visible[k]);
  const boundary = outerRing(property.boundaryGeojson as unknown as string);

  // ─── Legend entries (depend on active layers) ──────────────────────────────
  const legend: { color: string; label: string; dashed?: boolean }[] = [];
  if (visible.boundary) legend.push({ color: INK, label: "Property boundary" });
  if (visible.water) {
    legend.push({ color: "#2A7C8E", label: "Contour (1 m)" });
    if (swales.length) legend.push({ color: "#0077CC", label: "Designed swale", dashed: true });
    if (waterAnalysis?.damSite) legend.push({ color: "#0077CC", label: "Keyline Dam Site (Passive Water Catchment & Drought Buffering)" });
  }
  if (visible.zones) {
    const ZONE_LABELS: Record<number, string> = {
      1: "Zone 1 (Home & Intensive Production — High Frequency Access)",
      2: "Zone 2 (Food Forest & Small Orchards — Semi-Frequent Access)",
      3: "Zone 3 (Farmland & Managed Grazing — Low Frequency Maintenance)",
      4: "Zone 4 (Managed Woodlot & Foraging — Minimal Management)",
      5: "Zone 5 (Wild & Unmanaged — Observation Only)",
    };
    const nums = [...new Set(zones.map((z) => z.zoneNumber))].sort();
    nums.forEach((n) =>
      legend.push({ color: ZONE_COLORS[n]?.stroke ?? "#888", label: ZONE_LABELS[n] ?? `Zone ${n}` }),
    );
  }
  if (visible.sectors) {
    const types = [...new Set(sectors.map((s) => s.sectorType))];
    types.forEach((t) =>
      legend.push({ color: SECTOR_COLORS[t] ?? "#888", label: t.replace(/_/g, " ") }),
    );
  }
  if (visible.structures) {
    legend.push({ color: INK, label: "Structure" });
    const pts = [...new Set(pathways.map((p) => p.pathwayType))];
    pts.forEach((t) =>
      legend.push({ color: PATHWAY_COLORS[t] ?? "#888", label: t.replace(/_/g, " "), dashed: true }),
    );
  }

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      style={{ display: "block", background: PARCHMENT, fontFamily: "'Inter', system-ui, sans-serif" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern id="pp-grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0 L0 0 0 40" fill="none" stroke="#d8ccb0" strokeWidth="0.5" strokeOpacity="0.3" />
        </pattern>
        <radialGradient id="pp-vignette" cx="50%" cy="42%" r="70%">
          <stop offset="0%" stopColor={PARCHMENT} />
          <stop offset="100%" stopColor={PARCHMENT_2} />
        </radialGradient>
        <marker id="pp-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={INK} />
        </marker>
      </defs>

      {/* Plate background + grid + frame */}
      <rect x="0" y="0" width={width} height={height} fill="url(#pp-vignette)" />
      <rect x={PAD} y={PAD} width={width - PAD * 2} height={height - PAD * 2} fill="url(#pp-grid)" />
      <rect
        x={26}
        y={26}
        width={width - 52}
        height={height - 52}
        fill="none"
        stroke={RULE}
        strokeWidth="2.5"
      />
      <rect
        x={32}
        y={32}
        width={width - 64}
        height={height - 64}
        fill="none"
        stroke={RULE}
        strokeWidth="0.75"
      />

      {/* ── BOUNDARY ── */}
      {visible.boundary && boundary && (
        <g>
          <path d={proj.ringPath(boundary)} fill="rgba(107,95,78,0.06)" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
          {boundary.slice(0, -1).map((pt, i) => {
            const [x, y] = proj.project(pt[0], pt[1]);
            return <circle key={i} cx={x} cy={y} r={2.5} fill={INK} />;
          })}
        </g>
      )}

      {/* ── ZONES ── */}
      {visible.zones &&
        zones.map((z) => {
          const ring = outerRing(z.zoneGeojson);
          if (!ring) return null;
          const c = ZONE_COLORS[z.zoneNumber] ?? { fill: "#ccc", stroke: "#888" };
          const cen = centroidXY(proj, z.zoneGeojson);
          return (
            <g key={z.id}>
              <path d={proj.ringPath(ring)} fill={c.fill} fillOpacity={0.4} stroke={c.stroke} strokeWidth="1.5" />
              {cen && (
                <text x={cen[0]} y={cen[1]} textAnchor="middle" dominantBaseline="middle" fontSize="13" fontWeight={800} fill={c.stroke}>
                  Z{z.zoneNumber}
                </text>
              )}
            </g>
          );
        })}

      {/* ── SECTORS ── */}
      {visible.sectors && (
        <g>
          {sectors.map((s) => {
            const col = SECTOR_COLORS[s.sectorType] ?? "#888";
            const rMeters = s.radiusKm * 1000;
            const steps = 28;
            let d = "";
            const [ox, oy] = proj.project(s.centerLng, s.centerLat);
            d += `M${ox},${oy}`;
            for (let i = 0; i <= steps; i++) {
              const ang = s.startAngle + ((s.endAngle - s.startAngle) * i) / steps;
              const [lng, lat] = bearingDest(s.centerLng, s.centerLat, ang, rMeters);
              const [x, y] = proj.project(lng, lat);
              d += ` L${x.toFixed(2)},${y.toFixed(2)}`;
            }
            d += " Z";
            const midAng = (s.startAngle + s.endAngle) / 2;
            const [llng, llat] = bearingDest(s.centerLng, s.centerLat, midAng, rMeters * 0.7);
            const [lx, ly] = proj.project(llng, llat);
            return (
              <g key={s.id}>
                <path d={d} fill={col} fillOpacity={0.16} stroke={col} strokeWidth="1.25" />
                <text x={lx} y={ly} textAnchor="middle" fontSize="10" fontWeight={700} fill={col} stroke={PARCHMENT} strokeWidth="2.5" paintOrder="stroke">
                  {s.label || s.sectorType.replace(/_/g, " ")}
                </text>
              </g>
            );
          })}
          {/* sensory vectors fold into directional analysis */}
          {sensoryVectors.map((sv) => {
            const coords = lineCoords(sv.geojsonGeometry);
            const col = SENSORY_COLORS[sv.vectorType] ?? "#888";
            if (coords && coords.length >= 2) {
              let d = "";
              coords.forEach((pt, i) => {
                const [x, y] = proj.project(pt[0], pt[1]);
                d += `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
              });
              return <path key={sv.id} d={d} fill="none" stroke={col} strokeWidth="2" strokeDasharray="2 4" markerEnd="url(#pp-arrow)" />;
            }
            const cen = centroidXY(proj, sv.geojsonGeometry);
            if (!cen) return null;
            return <circle key={sv.id} cx={cen[0]} cy={cen[1]} r={4} fill="none" stroke={col} strokeWidth="2" />;
          })}
        </g>
      )}

      {/* ── WATER & CONTOUR ── */}
      {visible.water && (
        <g>
          {contours?.features.map((f, i) => {
            if (f.geometry?.type !== "LineString") return null;
            const coords = f.geometry.coordinates as [number, number][];
            if (coords.length < 2) return null;
            const elev = (f.properties as { elevation?: number })?.elevation ?? 0;
            const index = elev % 5 === 0;
            let d = "";
            coords.forEach((pt, j) => {
              const [x, y] = proj.project(pt[0], pt[1]);
              d += `${j === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
            });
            return (
              <path
                key={`c${i}`}
                d={d}
                fill="none"
                stroke={index ? "#2A7C8E" : "#5A9EBF"}
                strokeWidth={index ? 1.0 : 0.5}
                strokeOpacity={index ? 0.25 : 0.35}
              />
            );
          })}
          {swales.map((sw) => {
            const coords = lineCoords(sw.geojsonLinestring);
            if (!coords || coords.length < 2) return null;
            let d = "";
            coords.forEach((pt, i) => {
              const [x, y] = proj.project(pt[0], pt[1]);
              d += `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
            });
            const mid = coords[Math.floor(coords.length / 2)];
            const [mx, my] = proj.project(mid[0], mid[1]);
            return (
              <g key={sw.id}>
                <path d={d} fill="none" stroke="#0077CC" strokeWidth="2.5" strokeDasharray="7 4" strokeLinecap="round" />
                <text x={mx} y={my - 5} textAnchor="middle" fontSize="9" fontWeight={700} fill="#0055AA" stroke={PARCHMENT} strokeWidth="2.5" paintOrder="stroke">
                  {sw.name} · {sw.lengthM} m
                </text>
              </g>
            );
          })}
          {waterAnalysis?.damSite &&
            (() => {
              const [lng, lat] = waterAnalysis.damSite!.geometry.coordinates as [number, number];
              const [x, y] = proj.project(lng, lat);
              return (
                <g>
                  <path d={`M${x},${y - 9} L${x + 8},${y + 6} L${x - 8},${y + 6} Z`} fill="#0077CC" stroke="#fff" strokeWidth="1" />
                  <text x={x + 11} y={y + 3} fontSize="9" fontWeight={700} fill="#0055AA" stroke={PARCHMENT} strokeWidth="2.5" paintOrder="stroke">
                    Dam site
                  </text>
                </g>
              );
            })()}
        </g>
      )}

      {/* ── STRUCTURES & ACCESS ── */}
      {visible.structures && (
        <g>
          {pathways.map((pw) => {
            const coords = lineCoords(pw.lineGeojson);
            if (!coords || coords.length < 2) return null;
            const col = PATHWAY_COLORS[pw.pathwayType] ?? "#888";
            let d = "";
            coords.forEach((pt, i) => {
              const [x, y] = proj.project(pt[0], pt[1]);
              d += `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
            });
            return <path key={pw.id} d={d} fill="none" stroke={col} strokeWidth="2.5" strokeDasharray={pw.pathwayType === "fenceline" ? "1 4" : "8 5"} strokeLinecap="round" />;
          })}
          {structures.map((st) => {
            const footprint = st.footprintGeojson ? outerRing(st.footprintGeojson) : null;
            const [x, y] = proj.project(st.lng, st.lat);
            return (
              <g key={st.id}>
                {footprint && <path d={proj.ringPath(footprint)} fill="rgba(44,36,22,0.18)" stroke={INK} strokeWidth="1.25" />}
                <rect x={x - 4} y={y - 4} width={8} height={8} fill={INK} transform={`rotate(45 ${x} ${y})`} />
                <text x={x + 8} y={y + 3} fontSize="9" fontWeight={600} fill={INK} stroke={PARCHMENT} strokeWidth="2.5" paintOrder="stroke">
                  {st.label}
                </text>
              </g>
            );
          })}
        </g>
      )}

      {/* ── NORTH ARROW (top-right) ── */}
      <g transform={`translate(${width - 86}, 92)`}>
        <line x1="0" y1="26" x2="0" y2="-22" stroke={INK} strokeWidth="1.5" />
        <path d="M0,-30 L7,-12 L0,-17 L-7,-12 Z" fill={INK} />
        <text x="0" y="42" textAnchor="middle" fontSize="13" fontWeight={800} fill={INK}>
          N
        </text>
      </g>

      {/* ── GRAPHIC SCALE BAR (bottom-left) ── */}
      <g transform={`translate(${PAD + 4}, ${height - 58})`}>
        <rect x="0" y="0" width={scaleBar.pixels / 2} height="7" fill={INK} />
        <rect x={scaleBar.pixels / 2} y="0" width={scaleBar.pixels / 2} height="7" fill="none" stroke={INK} strokeWidth="1" />
        <line x1="0" y1="-3" x2="0" y2="10" stroke={INK} strokeWidth="1" />
        <line x1={scaleBar.pixels} y1="-3" x2={scaleBar.pixels} y2="10" stroke={INK} strokeWidth="1" />
        <text x="0" y="22" fontSize="9" fill={INK} fontFamily="monospace">
          0
        </text>
        <text x={scaleBar.pixels} y="22" textAnchor="middle" fontSize="9" fill={INK} fontFamily="monospace">
          {scaleBar.label}
        </text>
      </g>

      {/* ── TITLE BLOCK (bottom-right) ── */}
      {(() => {
        const tbW = 320;
        const tbH = 92;
        const tx = width - 36 - tbW;
        const ty = height - 36 - tbH;
        const layerNames = activeLayers.map((k) => LAYER_TITLES[k]).join(" · ");
        return (
          <g transform={`translate(${tx}, ${ty})`}>
            <rect x="0" y="0" width={tbW} height={tbH} fill="#fffdf8" stroke={INK} strokeWidth="1.5" />
            <line x1="0" y1="30" x2={tbW} y2="30" stroke={RULE} strokeWidth="0.75" />
            <line x1="0" y1="62" x2={tbW} y2="62" stroke={RULE} strokeWidth="0.75" />
            <text x="12" y="20" fontSize="14" fontWeight={800} fill={INK} fontFamily="Georgia, serif">
              {property.name}
            </text>
            <text x={tbW - 12} y="20" textAnchor="end" fontSize="9" fill={RULE} fontFamily="monospace">
              TERRAGUARD OS
            </text>
            <text x="12" y="50" fontSize="11" fontWeight={600} fill={INK}>
              {layerNames || "Site Plan"}
            </text>
            <text x="12" y="78" fontSize="9" fill={RULE} fontFamily="monospace">
              {fmtArea(property)}
            </text>
            <text x={tbW - 12} y="50" textAnchor="end" fontSize="9" fill={RULE} fontFamily="monospace">
              1:{repFraction.toLocaleString()} approx
            </text>
            <text x={tbW - 12} y="78" textAnchor="end" fontSize="9" fill={RULE} fontFamily="monospace">
              {new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
            </text>
          </g>
        );
      })()}

      {/* ── LEGEND (top-left) ── */}
      {legend.length > 0 && (
        <g transform={`translate(${PAD + 4}, ${PAD + 4})`}>
          <rect x="0" y="0" width="318" height={18 + legend.length * 17} fill="#fffdf8" fillOpacity={0.94} stroke={INK} strokeWidth="1" />
          <text x="10" y="14" fontSize="9" fontWeight={800} fill={INK} fontFamily="monospace" letterSpacing="0.1em">
            LEGEND
          </text>
          {legend.map((l, i) => {
            const yy = 22 + i * 17;
            return (
              <g key={i} transform={`translate(10, ${yy})`}>
                {l.dashed ? (
                  <line x1="0" y1="6" x2="18" y2="6" stroke={l.color} strokeWidth="2.5" strokeDasharray="5 3" />
                ) : (
                  <rect x="0" y="2" width="18" height="9" fill={l.color} fillOpacity={0.5} stroke={l.color} strokeWidth="1" />
                )}
                <text x="26" y="10" fontSize="8.5" fill={INK}>
                  {l.label}
                </text>
              </g>
            );
          })}
        </g>
      )}
    </svg>
  );
});
