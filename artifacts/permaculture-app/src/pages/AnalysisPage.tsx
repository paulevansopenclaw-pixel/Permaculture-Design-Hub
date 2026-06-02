import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import * as turf from "@turf/turf";
import patternMark from "@assets/pattern-mark.png";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetProperty,
  useGetClientBrief,
  useListZones,
  useListStructures,
  useListSectors,
  useListDesignedSwales,
  useListPathways,
  useListSensoryVectors,
  getGetClientBriefQueryKey,
  getGetPropertyQueryKey,
  getListZonesQueryKey,
  getListStructuresQueryKey,
  getListSectorsQueryKey,
  getListDesignedSwalesQueryKey,
  getListPathwaysQueryKey,
  getListSensoryVectorsQueryKey,
  type Sector,
  type Structure,
  type Zone,
  type DesignedSwale,
  type Pathway,
  type SensoryVector,
  type SiteAnalysisReport,
  type SiteAnalysisReportDesignRecommendationsDesignElementsItem,
} from "@workspace/api-client-react";
import { useAppStore } from "@/store/useAppStore";
import { AiAnalysisPanel } from "@/components/AiAnalysisPanel";
import { StepNav } from "@/components/StepNav";
import { generateContours } from "@/lib/contourEngine";

// ── helpers ──────────────────────────────────────────────────────────────────

async function fetchMapboxToken(): Promise<string> {
  try {
    const res = await fetch("/api/config");
    if (!res.ok) return "";
    const data = await res.json();
    return data.mapboxToken ?? "";
  } catch { return ""; }
}

const ZONE_COLORS: Record<number, { fill: string; stroke: string }> = {
  1: { fill: "#FDE68A", stroke: "#CA8A04" },
  2: { fill: "#86EFAC", stroke: "#16A34A" },
  3: { fill: "#4ADE80", stroke: "#15803D" },
  4: { fill: "#D4A27A", stroke: "#92400E" },
  5: { fill: "#94A3B8", stroke: "#475569" },
};

const SECTOR_COLORS: Record<string, string> = {
  wind: "#3b82f6",
  noise: "#dc2626",
  winter_solar: "#f97316",
  custom_view: "#d4a800",
};

const PATHWAY_COLORS: Record<string, string> = {
  driveway: "#8B6914", footpath: "#C4975A", farm_track: "#6B4C2A",
  fenceline: "#6B7280", firebreak: "#DC2626",
};

const SENSORY_COLORS: Record<string, string> = {
  road_noise: "#ef4444", view_corridor: "#22d3ee", privacy_threat: "#a855f7",
};

const PRIORITY_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  High:   { bg: "#fef2f2", text: "#991b1b", border: "#fca5a5" },
  Medium: { bg: "#fffbeb", text: "#92400e", border: "#fcd34d" },
  Low:    { bg: "#f0fdf4", text: "#166534", border: "#86efac" },
};

function sectorWedgePath(
  cx: number, cy: number, r: number,
  startDeg: number, endDeg: number,
  toXY: (lng: number, lat: number) => L.Point,
  centerLng: number, centerLat: number,
  radiusKm: number,
): string {
  const steps = 24;
  let d = "";
  const bearing = (deg: number): [number, number] => {
    const rad = (deg * Math.PI) / 180;
    const dx = Math.sin(rad) * radiusKm * 1000;
    const dy = Math.cos(rad) * radiusKm * 1000;
    const destLat = centerLat + (dy / 111320);
    const destLng = centerLng + (dx / (111320 * Math.cos((centerLat * Math.PI) / 180)));
    return [destLng, destLat];
  };
  const origin = toXY(centerLng, centerLat);
  d += `M${origin.x},${origin.y}`;
  for (let i = 0; i <= steps; i++) {
    const angle = startDeg + ((endDeg - startDeg) * i) / steps;
    const [lng, lat] = bearing(angle);
    const p = toXY(lng, lat);
    d += ` L${p.x},${p.y}`;
  }
  d += " Z";
  return d;
}

// ── single-purpose mini-map component ────────────────────────────────────────

type MiniMapMode = "boundary" | "contour" | "zones" | "swales" | "sectors" | "structures";

interface MiniMapProps {
  mode: MiniMapMode;
  boundaryGeojson: unknown;
  token: string;
  zones?: Zone[];
  structures?: Structure[];
  sectors?: Sector[];
  swales?: DesignedSwale[];
  pathways?: Pathway[];
  sensoryVectors?: SensoryVector[];
}

function MiniMap({ mode, boundaryGeojson, token, zones = [], structures = [], sectors = [], swales = [], pathways = [], sensoryVectors = [] }: MiniMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const svgOverlayRef = useRef<SVGSVGElement | null>(null);
  const [contoursReady, setContoursReady] = useState<GeoJSON.FeatureCollection | null>(null);
  const [contourLoading, setContourLoading] = useState(false);

  // Init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [-33, 147], zoom: 4,
      zoomControl: false, attributionControl: false,
      dragging: false, scrollWheelZoom: false,
      doubleClickZoom: false, touchZoom: false, keyboard: false,
    });

    const osmTile = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
    tileRef.current = osmTile;
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Upgrade to satellite (except contour mode — keep plain OSM for readability)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !token || mode === "contour") return;
    const prev = tileRef.current;
    const sat = L.tileLayer(
      `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/{z}/{x}/{y}?access_token=${token}`,
      { tileSize: 512, zoomOffset: -1, maxZoom: 20 }
    );
    if (prev) map.removeLayer(prev);
    sat.addTo(map);
    tileRef.current = sat;
  }, [token, mode]);

  // Fit to boundary + draw boundary ring on all modes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !boundaryGeojson) return;
    const layer = L.geoJSON(
      { type: "Feature", geometry: boundaryGeojson, properties: {} } as any,
      { style: () => ({ color: "#4a9a28", weight: 2, opacity: 0.85, fillColor: "#2D6A1A", fillOpacity: mode === "boundary" ? 0.15 : 0.04 }) }
    ).addTo(map);
    try {
      const b = layer.getBounds();
      if (b.isValid()) map.fitBounds(b, { padding: [12, 12] });
    } catch { /* no-op */ }
    return () => { map.removeLayer(layer); };
  }, [boundaryGeojson, mode]);

  // Contour fetch
  useEffect(() => {
    if (mode !== "contour" || !boundaryGeojson || !token || contoursReady) return;
    setContourLoading(true);
    generateContours({ type: "Feature", geometry: boundaryGeojson as any, properties: {} }, token, 5)
      .then((fc) => { setContoursReady(fc); setContourLoading(false); })
      .catch(() => setContourLoading(false));
  }, [mode, boundaryGeojson, token, contoursReady]);

  // Draw contours
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !contoursReady) return;
    const layer = L.geoJSON(contoursReady as any, {
      style: (f) => {
        const elev = (f?.properties?.elevation ?? 0) as number;
        const isMajor = elev % 10 === 0;
        return { color: "#1f6b7a", weight: isMajor ? 1.5 : 0.7, opacity: isMajor ? 0.75 : 0.45, fill: false };
      },
    }).addTo(map);
    return () => { map.removeLayer(layer); };
  }, [contoursReady]);

  // Draw zones
  useEffect(() => {
    const map = mapRef.current;
    if (!map || mode !== "zones") return;
    const layers: L.GeoJSON[] = [];
    zones.forEach((z) => {
      try {
        const geo = JSON.parse(z.zoneGeojson);
        const c = ZONE_COLORS[z.zoneNumber] ?? { fill: "#ccc", stroke: "#888" };
        layers.push(
          L.geoJSON({ type: "Feature", geometry: geo, properties: {} } as any, {
            style: () => ({ color: c.stroke, weight: 1.5, fillColor: c.fill, fillOpacity: 0.4, opacity: 0.9 }),
          }).addTo(map)
        );
      } catch { /* ignore */ }
    });
    return () => { layers.forEach((l) => map.removeLayer(l)); };
  }, [zones, mode]);

  // Draw swales + pathways
  useEffect(() => {
    const map = mapRef.current;
    if (!map || mode !== "swales") return;
    const layers: (L.GeoJSON | L.Polyline)[] = [];
    swales.forEach((sw) => {
      try {
        const geo = JSON.parse(sw.geojsonLinestring);
        const isDashed = sw.swaleType === "keyline";
        layers.push(
          L.geoJSON({ type: "Feature", geometry: geo, properties: {} } as any, {
            style: () => ({ color: "#0ea5e9", weight: 2.5, opacity: 0.9, fill: false, ...(isDashed ? { dashArray: "6 4" } : {}) }),
          }).addTo(map)
        );
      } catch { /* ignore */ }
    });
    pathways.forEach((pw) => {
      try {
        const geo = JSON.parse(pw.lineGeojson);
        const col = PATHWAY_COLORS[pw.pathwayType] ?? "#888";
        layers.push(
          L.geoJSON({ type: "Feature", geometry: geo, properties: {} } as any, {
            style: () => ({ color: col, weight: 2, opacity: 0.85, fill: false }),
          }).addTo(map)
        );
      } catch { /* ignore */ }
    });
    return () => { layers.forEach((l) => map.removeLayer(l)); };
  }, [swales, pathways, mode]);

  // Structures
  useEffect(() => {
    const map = mapRef.current;
    if (!map || mode !== "structures") return;
    const markers: L.CircleMarker[] = [];
    structures.forEach((s) => {
      const m = L.circleMarker([s.lat, s.lng], {
        radius: 5, color: "#fff", weight: 1.5, fillColor: "#1e3a5f", fillOpacity: 1,
      }).bindTooltip(s.label, { permanent: false, direction: "top" }).addTo(map);
      markers.push(m);
    });
    sensoryVectors.forEach((sv) => {
      try {
        const geo = JSON.parse(sv.geojsonGeometry);
        const col = SENSORY_COLORS[sv.vectorType] ?? "#888";
        L.geoJSON({ type: "Feature", geometry: geo, properties: {} } as any, {
          style: () => ({ color: col, weight: 1.5, opacity: 0.7, fill: false, dashArray: "4 3" }),
          pointToLayer: (_, latlng) => L.circleMarker(latlng, { radius: 4, color: col, weight: 1.5, fillOpacity: 0.8 }),
        }).addTo(map);
      } catch { /* ignore */ }
    });
    return () => { markers.forEach((m) => map.removeLayer(m)); };
  }, [structures, sensoryVectors, mode]);

  // Sectors — SVG overlay
  useEffect(() => {
    const map = mapRef.current;
    if (!map || mode !== "sectors" || !sectors.length) return;

    const updateSVG = () => {
      const container = containerRef.current;
      if (!container) return;
      const existing = container.querySelector("svg.sector-svg");
      if (existing) existing.remove();
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "sector-svg");
      svg.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:400;overflow:visible;";
      const toXY = (lng: number, lat: number) => map.latLngToContainerPoint([lat, lng]);
      sectors.forEach((sec) => {
        const col = SECTOR_COLORS[sec.sectorType] ?? "#aaa";
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", sectorWedgePath(0, 0, 0, sec.startAngle, sec.endAngle, toXY, sec.centerLng, sec.centerLat, sec.radiusKm));
        path.setAttribute("fill", col);
        path.setAttribute("fill-opacity", "0.25");
        path.setAttribute("stroke", col);
        path.setAttribute("stroke-width", "1.5");
        path.setAttribute("stroke-opacity", "0.7");
        svg.appendChild(path);
      });
      container.appendChild(svg);
      svgOverlayRef.current = svg;
    };

    updateSVG();
    map.on("moveend zoomend", updateSVG);
    return () => {
      map.off("moveend zoomend", updateSVG);
      const existing = containerRef.current?.querySelector("svg.sector-svg");
      if (existing) existing.remove();
    };
  }, [sectors, mode]);

  return (
    <div ref={containerRef} className="w-full h-full relative">
      {contourLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none">
          <div className="text-[10px] px-2 py-1 rounded" style={{ background: "rgba(0,0,0,0.6)", color: "#93c5fd" }}>
            Loading elevation…
          </div>
        </div>
      )}
    </div>
  );
}

// ── map card wrapper ──────────────────────────────────────────────────────────

const MAP_CONFIGS: { mode: MiniMapMode; label: string; icon: string; accent: string }[] = [
  { mode: "boundary",   label: "Boundary",   icon: "⬡", accent: "#4a6b2e" },
  { mode: "contour",    label: "Terrain",    icon: "⛰", accent: "#1f6b7a" },
  { mode: "zones",      label: "Zones",      icon: "🗺", accent: "#ca8a04" },
  { mode: "swales",     label: "Swales",     icon: "💧", accent: "#0ea5e9" },
  { mode: "sectors",    label: "Sectors",    icon: "🧭", accent: "#f97316" },
  { mode: "structures", label: "Structures", icon: "🏗", accent: "#7c3aed" },
];

function ReportMapCard({
  cfg, boundaryGeojson, token, zones, structures, sectors, swales, pathways, sensoryVectors,
}: {
  cfg: typeof MAP_CONFIGS[number];
  boundaryGeojson: unknown;
  token: string;
  zones: Zone[];
  structures: Structure[];
  sectors: Sector[];
  swales: DesignedSwale[];
  pathways: Pathway[];
  sensoryVectors: SensoryVector[];
}) {
  return (
    <div className="flex flex-col overflow-hidden" style={{ border: "2px solid #111", borderRadius: 0 }}>
      <div
        className="px-3 py-1.5 flex items-center gap-1.5 shrink-0"
        style={{ background: "#111", borderBottom: "1px solid #222" }}
      >
        <span style={{ fontSize: 11 }}>{cfg.icon}</span>
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: cfg.accent }}>
          {cfg.label} Map
        </span>
      </div>
      <div className="relative" style={{ height: 180, background: "#0a0a0a" }}>
        {boundaryGeojson ? (
          <MiniMap
            mode={cfg.mode}
            boundaryGeojson={boundaryGeojson}
            token={token}
            zones={zones}
            structures={structures}
            sectors={sectors}
            swales={swales}
            pathways={pathways}
            sensoryVectors={sensoryVectors}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[10px]" style={{ color: "#444" }}>No boundary</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── design element card ───────────────────────────────────────────────────────

function DesignElementCard({
  el,
  onAddToMap,
}: {
  el: SiteAnalysisReportDesignRecommendationsDesignElementsItem;
  onAddToMap: () => void;
}) {
  const pc = PRIORITY_COLOR[el.priority ?? "Low"] ?? PRIORITY_COLOR.Low;
  return (
    <div className="flex flex-col gap-2 p-3" style={{ border: "2px solid #e5e5e5", background: "#fff" }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#555" }}>{el.type}</span>
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded"
              style={{ background: pc.bg, color: pc.text, border: `1px solid ${pc.border}` }}
            >
              {el.priority}
            </span>
          </div>
          <div className="text-[13px] font-bold mt-0.5" style={{ color: "#111" }}>{el.name}</div>
        </div>
        <button
          onClick={onAddToMap}
          className="shrink-0 flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 transition-all"
          style={{ background: "#1f6b7a", color: "#fff", border: "2px solid #1f6b7a", whiteSpace: "nowrap" }}
        >
          + Map →
        </button>
      </div>
      {el.description && (
        <p className="text-[11px] leading-relaxed" style={{ color: "#444" }}>{el.description}</p>
      )}
      {el.placement && (
        <div className="flex items-start gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-widest shrink-0 mt-px" style={{ color: "#1f6b7a" }}>Placement</span>
          <span className="text-[11px] leading-relaxed" style={{ color: "#666" }}>{el.placement}</span>
        </div>
      )}
      {el.rationale && (
        <div className="flex items-start gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-widest shrink-0 mt-px" style={{ color: "#555" }}>Why</span>
          <span className="text-[11px] leading-relaxed" style={{ color: "#666" }}>{el.rationale}</span>
        </div>
      )}
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function AnalysisPage() {
  const [, navigate] = useLocation();
  const { activePropertyId, setPendingMapElement } = useAppStore();
  const queryClient = useQueryClient();
  const [token, setToken] = useState("");
  const [reportTab, setReportTab] = useState<"analysis" | "maps" | "elements">("analysis");

  useEffect(() => { fetchMapboxToken().then(setToken); }, []);

  const { data: property } = useGetProperty(activePropertyId ?? "", {
    query: { enabled: !!activePropertyId, queryKey: getGetPropertyQueryKey(activePropertyId ?? "") },
  });
  const { data: brief } = useGetClientBrief(activePropertyId ?? "", {
    query: { enabled: !!activePropertyId, queryKey: getGetClientBriefQueryKey(activePropertyId ?? "") },
  });
  const { data: zones = [] } = useListZones(activePropertyId ?? "", {
    query: { enabled: !!activePropertyId, queryKey: getListZonesQueryKey(activePropertyId ?? "") },
  });
  const { data: structures = [] } = useListStructures(activePropertyId ?? "", {
    query: { enabled: !!activePropertyId, queryKey: getListStructuresQueryKey(activePropertyId ?? "") },
  });
  const { data: sectors = [] } = useListSectors(activePropertyId ?? "", {
    query: { enabled: !!activePropertyId, queryKey: getListSectorsQueryKey(activePropertyId ?? "") },
  });
  const { data: swales = [] } = useListDesignedSwales(activePropertyId ?? "", {
    query: { enabled: !!activePropertyId, queryKey: getListDesignedSwalesQueryKey(activePropertyId ?? "") },
  });
  const { data: pathways = [] } = useListPathways(activePropertyId ?? "", {
    query: { enabled: !!activePropertyId, queryKey: getListPathwaysQueryKey(activePropertyId ?? "") },
  });
  const { data: sensoryVectors = [] } = useListSensoryVectors(activePropertyId ?? "", {
    query: { enabled: !!activePropertyId, queryKey: getListSensoryVectorsQueryKey(activePropertyId ?? "") },
  });

  const report: SiteAnalysisReport | null = (() => {
    if (!brief?.aiAnalysisReport) return null;
    try { return JSON.parse(brief.aiAnalysisReport); } catch { return null; }
  })();

  const designElements = report?.DesignRecommendations?.designElements ?? [];
  const implementationPhases = report?.DesignRecommendations?.implementationPhases ?? [];

  const handleAddToMap = useCallback((el: SiteAnalysisReportDesignRecommendationsDesignElementsItem) => {
    setPendingMapElement({
      type: el.type ?? "",
      name: el.name ?? "",
      description: el.description ?? "",
      placement: el.placement ?? "",
      priority: el.priority ?? "Medium",
    });
    navigate("/workspace");
  }, [setPendingMapElement, navigate]);

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: "#f8f5f0", fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* ── TOP BAR ── */}
      <header
        className="shrink-0 flex items-center justify-between px-5"
        style={{ height: 54, background: "#fff", borderBottom: "1px solid #ddd6cc", boxShadow: "0 2px 6px rgba(44,36,22,0.06)", zIndex: 10 }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate("/properties")}
            className="flex items-center gap-2 shrink-0"
            style={{ color: "#2c2416", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}
          >
            <img src={patternMark} alt="Pattern" style={{ height: 26, width: "auto", flexShrink: 0 }} />
            <span className="hidden sm:inline" style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 14, color: "#2c2416" }}>Pattern</span>
          </button>
          <div className="w-px h-4 shrink-0 hidden sm:block" style={{ background: "#ddd6cc" }} />
          <span className="hidden sm:inline shrink-0" style={{ fontSize: 11, fontWeight: 600, color: "#6b5f4e" }}>
            AI Analysis
          </span>
          {property?.name && (
            <>
              <div className="w-px h-4 shrink-0" style={{ background: "#ddd6cc" }} />
              <span className="text-[12px] truncate" style={{ color: "#a89880" }}>{property.name}</span>
            </>
          )}
        </div>
        <StepNav />
      </header>

      {/* ── NO PROPERTY ── */}
      {!activePropertyId && (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center space-y-3">
            <div className="text-4xl">⚡</div>
            <h3 className="text-base font-semibold" style={{ color: "#111" }}>No property selected</h3>
            <p className="text-sm" style={{ color: "#888" }}>Select a property and complete the site intake survey first.</p>
            <button
              onClick={() => navigate("/intake")}
              className="mt-2 px-5 py-2.5 text-[13px] font-semibold"
              style={{ background: "#1f6b7a", color: "#fff", border: "2px solid #1f6b7a" }}
            >
              ← Go to Intake
            </button>
          </div>
        </div>
      )}

      {activePropertyId && (
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* ── REPORT TABS ── */}
          <div className="shrink-0 flex border-b" style={{ borderColor: "#e5e5e5" }}>
            {([
              { id: "analysis", label: "AI Analysis" },
              { id: "maps",     label: `Report Maps` },
              { id: "elements", label: `Design Elements${designElements.length ? ` (${designElements.length})` : ""}` },
            ] as const).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setReportTab(tab.id)}
                className="px-5 py-3 text-[12px] font-semibold border-b-2 transition-colors"
                style={{
                  borderColor: reportTab === tab.id ? "#1f6b7a" : "transparent",
                  color: reportTab === tab.id ? "#1f6b7a" : "#888",
                  background: "transparent",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ── ANALYSIS TAB ── */}
          {reportTab === "analysis" && (
            <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
              {/* Left mini-map — boundary + zones overview */}
              <div
                className="lg:w-[38%] shrink-0 relative border-r"
                style={{ borderColor: "#e5e5e5", minHeight: 220, height: "40vh" }}
              >
                <div className="absolute inset-0">
                  {property?.boundaryGeojson ? (
                    <MiniMap
                      mode="zones"
                      boundaryGeojson={property.boundaryGeojson}
                      token={token}
                      zones={zones}
                      structures={structures}
                      sectors={sectors}
                      swales={swales}
                      pathways={pathways}
                      sensoryVectors={sensoryVectors}
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2" style={{ background: "#f7f7f7" }}>
                      <span className="text-3xl opacity-30">🗺</span>
                      <p className="text-[11px]" style={{ color: "#bbb" }}>No boundary drawn</p>
                      <button
                        onClick={() => navigate("/workspace")}
                        className="text-[11px] px-3 py-1.5 mt-1"
                        style={{ background: "#fff", color: "#555", border: "1px solid #ddd" }}
                      >
                        Draw in Workspace →
                      </button>
                    </div>
                  )}
                </div>
                <div
                  className="absolute bottom-2 left-2 px-2 py-1 text-[9px] font-bold uppercase tracking-widest pointer-events-none"
                  style={{ background: "rgba(0,0,0,0.55)", color: "#fff", zIndex: 20 }}
                >
                  Site Overview
                </div>
              </div>

              {/* Right — AI analysis */}
              <div className="flex-1 overflow-y-auto" style={{ background: "#fff" }}>
                <div className="px-6 py-6 max-w-2xl">
                  {!brief && (
                    <div className="p-4 mb-6 text-[12px]" style={{ background: "#fffbeb", border: "1px solid #fbbf24", color: "#92400e" }}>
                      <span className="font-bold">Site survey incomplete.</span>{" "}
                      <button onClick={() => navigate("/intake")} className="underline">Complete the intake →</button>
                      {" "}before running the AI analysis.
                    </div>
                  )}
                  <AiAnalysisPanel
                    propertyId={activePropertyId}
                    hasBrief={!!brief}
                    savedReport={brief?.aiAnalysisReport}
                    savedAt={brief?.aiAnalysisGeneratedAt ?? null}
                    onReportSaved={() => {
                      queryClient.invalidateQueries({ queryKey: getGetClientBriefQueryKey(activePropertyId) });
                      queryClient.invalidateQueries({ queryKey: getListSectorsQueryKey(activePropertyId) });
                    }}
                  />
                </div>

                <div
                  className="px-6 py-4 border-t flex items-center justify-between sticky bottom-0"
                  style={{ background: "#fff", borderColor: "#e5e5e5" }}
                >
                  <button
                    onClick={() => navigate("/workspace")}
                    className="text-[11px] px-3 py-1.5"
                    style={{ color: "#888", border: "1px solid #ddd", background: "transparent" }}
                  >
                    ← Workspace
                  </button>
                  <button
                    onClick={() => navigate("/dossier")}
                    className="flex items-center gap-2 px-5 py-2 text-[12px] font-semibold"
                    style={{ background: "#1f6b7a", color: "#fff", border: "2px solid #1f6b7a" }}
                  >
                    Next: Export Studio →
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── MAPS TAB ── */}
          {reportTab === "maps" && (
            <div className="flex-1 overflow-y-auto p-5" style={{ background: "#f7f7f7" }}>
              {!property?.boundaryGeojson && (
                <div className="p-4 mb-4 text-[12px]" style={{ background: "#fffbeb", border: "2px solid #fbbf24", color: "#92400e" }}>
                  No boundary has been drawn yet. Go to the Workspace to define the property boundary first.
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {MAP_CONFIGS.map((cfg) => (
                  <ReportMapCard
                    key={cfg.mode}
                    cfg={cfg}
                    boundaryGeojson={property?.boundaryGeojson ?? null}
                    token={token}
                    zones={zones}
                    structures={structures}
                    sectors={sectors}
                    swales={swales}
                    pathways={pathways}
                    sensoryVectors={sensoryVectors}
                  />
                ))}
              </div>

              {/* Zone legend */}
              {zones.length > 0 && (
                <div className="mt-6">
                  <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "#555" }}>Zone Legend</div>
                  <div className="flex flex-wrap gap-2">
                    {[1,2,3,4,5].map((n) => {
                      const c = ZONE_COLORS[n];
                      const hasZone = zones.some((z) => z.zoneNumber === n);
                      if (!hasZone) return null;
                      return (
                        <div key={n} className="flex items-center gap-1.5 px-2 py-1" style={{ border: `2px solid ${c.stroke}`, background: c.fill + "55" }}>
                          <div className="w-3 h-3 rounded-sm" style={{ background: c.fill, border: `1px solid ${c.stroke}` }} />
                          <span className="text-[10px] font-semibold" style={{ color: "#333" }}>Zone {n}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Swale legend */}
              {swales.length > 0 && (
                <div className="mt-4">
                  <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "#555" }}>Swale Legend</div>
                  <div className="flex flex-wrap gap-2">
                    {Array.from(new Set(swales.map((s) => s.swaleType))).map((t) => (
                      <div key={t} className="flex items-center gap-1.5 px-2 py-1" style={{ border: "2px solid #0ea5e9" }}>
                        <div className="w-5 h-0.5" style={{ background: "#0ea5e9", borderTop: t === "keyline" ? "2px dashed #0ea5e9" : "2px solid #0ea5e9" }} />
                        <span className="text-[10px] font-semibold" style={{ color: "#333" }}>{t}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sector legend */}
              {sectors.length > 0 && (
                <div className="mt-4">
                  <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "#555" }}>Sector Legend</div>
                  <div className="flex flex-wrap gap-2">
                    {Array.from(new Set(sectors.map((s) => s.sectorType))).map((t) => {
                      const col = SECTOR_COLORS[t] ?? "#aaa";
                      const labels: Record<string, string> = { wind: "Damaging Wind", noise: "Road Noise", winter_solar: "Winter Solar", custom_view: "View Corridor" };
                      return (
                        <div key={t} className="flex items-center gap-1.5 px-2 py-1" style={{ border: `2px solid ${col}`, background: col + "22" }}>
                          <div className="w-3 h-3 rounded-sm" style={{ background: col + "44", border: `1px solid ${col}` }} />
                          <span className="text-[10px] font-semibold" style={{ color: "#333" }}>{labels[t] ?? t}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── DESIGN ELEMENTS TAB ── */}
          {reportTab === "elements" && (
            <div className="flex-1 overflow-y-auto p-5" style={{ background: "#f7f7f7" }}>
              {!report && (
                <div className="p-5 text-center" style={{ border: "2px solid #e5e5e5", background: "#fff" }}>
                  <div className="text-2xl mb-2">⚡</div>
                  <div className="text-[13px] font-semibold mb-1" style={{ color: "#111" }}>No report yet</div>
                  <p className="text-[12px] mb-3" style={{ color: "#888" }}>Run the AI analysis first to get design recommendations.</p>
                  <button
                    onClick={() => setReportTab("analysis")}
                    className="px-4 py-2 text-[12px] font-semibold"
                    style={{ background: "#1f6b7a", color: "#fff", border: "2px solid #1f6b7a" }}
                  >
                    Run Analysis →
                  </button>
                </div>
              )}

              {report && (
                <div className="space-y-5">

                  {/* Design elements grid */}
                  {designElements.length > 0 && (
                    <div>
                      <div className="flex items-center gap-3 mb-3">
                        <div className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "#111" }}>
                          Recommended Design Elements
                        </div>
                        <div className="flex-1 h-px" style={{ background: "#e5e5e5" }} />
                        <span className="text-[10px]" style={{ color: "#888" }}>Click "+ Map" to place on the workspace</span>
                      </div>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        {designElements.map((el, i) => (
                          <DesignElementCard
                            key={i}
                            el={el}
                            onAddToMap={() => handleAddToMap(el)}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Plant list */}
                  {(report.DesignRecommendations?.plants ?? []).length > 0 && (
                    <div>
                      <div className="flex items-center gap-3 mb-3">
                        <div className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "#111" }}>Plant Schedule</div>
                        <div className="flex-1 h-px" style={{ background: "#e5e5e5" }} />
                      </div>
                      <div style={{ border: "2px solid #111", background: "#fff", overflow: "hidden" }}>
                        <table className="w-full text-[11px]" style={{ borderCollapse: "collapse" }}>
                          <thead>
                            <tr style={{ background: "#111" }}>
                              {["Plant", "Layer", "Purpose", "Zones", "Notes"].map((h) => (
                                <th key={h} className="text-left px-3 py-2 text-[9px] font-bold uppercase tracking-widest" style={{ color: "#fff" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {report.DesignRecommendations!.plants!.map((p, i) => (
                              <tr key={i} style={{ borderBottom: "1px solid #e5e5e5", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                                <td className="px-3 py-2">
                                  <div className="font-semibold" style={{ color: "#111" }}>{p.name}</div>
                                  <div className="text-[9px] italic" style={{ color: "#888" }}>{p.latinName}</div>
                                </td>
                                <td className="px-3 py-2" style={{ color: "#555" }}>{p.layer}</td>
                                <td className="px-3 py-2" style={{ color: "#555" }}>{p.purpose}</td>
                                <td className="px-3 py-2" style={{ color: "#1f6b7a", fontWeight: 600 }}>{p.zones}</td>
                                <td className="px-3 py-2 text-[10px]" style={{ color: "#888", maxWidth: 200 }}>{p.notes}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Implementation phases */}
                  {implementationPhases.length > 0 && (
                    <div>
                      <div className="flex items-center gap-3 mb-3">
                        <div className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "#111" }}>Implementation Phases</div>
                        <div className="flex-1 h-px" style={{ background: "#e5e5e5" }} />
                      </div>
                      <div className="space-y-2">
                        {implementationPhases.map((ph, i) => (
                          <div key={i} style={{ border: "2px solid #e5e5e5", background: "#fff" }}>
                            <div className="flex items-center gap-3 px-4 py-2.5" style={{ borderBottom: "1px solid #e5e5e5", background: "#f7f7f7" }}>
                              <div className="w-7 h-7 flex items-center justify-center text-[12px] font-black" style={{ background: "#1f6b7a", color: "#fff" }}>
                                {ph.phase}
                              </div>
                              <div className="flex-1">
                                <div className="text-[12px] font-bold" style={{ color: "#111" }}>{ph.title}</div>
                                {ph.duration && <div className="text-[10px]" style={{ color: "#888" }}>{ph.duration}</div>}
                              </div>
                            </div>
                            <div className="px-4 py-3 space-y-2">
                              {ph.rationale && <p className="text-[11px] leading-relaxed" style={{ color: "#555" }}>{ph.rationale}</p>}
                              {(ph.elements ?? []).length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                  {ph.elements!.map((el, j) => (
                                    <span key={j} className="text-[10px] px-2 py-0.5 font-medium" style={{ background: "#eff6ff", color: "#1f6b7a", border: "1px solid #bfdbfe" }}>
                                      {el}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
