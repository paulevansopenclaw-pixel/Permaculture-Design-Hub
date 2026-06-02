import { useEffect, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import L from "leaflet";
import patternMark from "@assets/pattern-mark.png";
import "leaflet/dist/leaflet.css";
import {
  useGetProperty,
  useGetClientBrief,
  useListZones,
  getGetPropertyQueryKey,
  getGetClientBriefQueryKey,
  getListZonesQueryKey,
} from "@workspace/api-client-react";
import type { SiteAnalysisReport } from "@workspace/api-client-react";

async function fetchMapboxToken(): Promise<string> {
  try {
    const res = await fetch("/api/config");
    if (!res.ok) return "";
    const data = await res.json();
    return data.mapboxToken ?? "";
  } catch {
    return "";
  }
}

const ZONE_COLORS: Record<number, { fill: string; stroke: string }> = {
  1: { fill: "#FDE68A", stroke: "#CA8A04" },
  2: { fill: "#86EFAC", stroke: "#16A34A" },
  3: { fill: "#4ADE80", stroke: "#15803D" },
  4: { fill: "#D4A27A", stroke: "#92400E" },
  5: { fill: "#94A3B8", stroke: "#475569" },
};

function PresentationMap({
  boundaryGeojson,
  zones,
}: {
  boundaryGeojson: unknown;
  zones: Array<{ zoneNumber: number; zoneGeojson: string }>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const [token, setToken] = useState("");

  useEffect(() => {
    fetchMapboxToken().then(setToken);
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [-33, 147],
      zoom: 4,
      zoomControl: true,
      attributionControl: false,
      dragging: true,
      scrollWheelZoom: true,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      tileRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !token) return;
    if (tileRef.current) {
      map.removeLayer(tileRef.current);
    }
    const tile = L.tileLayer(
      `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/{z}/{x}/{y}?access_token=${token}`,
      { tileSize: 512, zoomOffset: -1, maxZoom: 22, attribution: "© Mapbox" }
    ).addTo(map);
    tileRef.current = tile;
  }, [token]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !boundaryGeojson) return;

    let geo: GeoJSON.Geometry | null = null;
    try {
      geo = typeof boundaryGeojson === "string"
        ? JSON.parse(boundaryGeojson)
        : (boundaryGeojson as GeoJSON.Geometry);
    } catch { return; }

    const boundaryLayer = L.geoJSON(
      { type: "Feature", geometry: geo, properties: {} } as GeoJSON.Feature,
      {
        style: {
          color: "#4a8a64",
          weight: 2.5,
          fillColor: "#4a8a64",
          fillOpacity: 0.08,
          dashArray: "6 4",
        },
      }
    ).addTo(map);

    zones.forEach((z) => {
      let zGeo: GeoJSON.Geometry | null = null;
      try {
        zGeo = typeof z.zoneGeojson === "string"
          ? JSON.parse(z.zoneGeojson)
          : (z.zoneGeojson as GeoJSON.Geometry);
      } catch { return; }
      const colors = ZONE_COLORS[z.zoneNumber] ?? { fill: "#94A3B8", stroke: "#475569" };
      L.geoJSON(
        { type: "Feature", geometry: zGeo, properties: {} } as GeoJSON.Feature,
        {
          style: {
            color: colors.stroke,
            weight: 1.5,
            fillColor: colors.fill,
            fillOpacity: 0.25,
          },
        }
      ).addTo(map);
    });

    try {
      map.fitBounds(boundaryLayer.getBounds(), { padding: [40, 40] });
    } catch { /* empty */ }
  }, [boundaryGeojson, zones]);

  return <div ref={containerRef} className="w-full h-full" />;
}

export default function PresentationPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();

  const { data: property, isLoading: propLoading } = useGetProperty(id ?? "", {
    query: { enabled: !!id, queryKey: getGetPropertyQueryKey(id ?? "") },
  });
  const { data: brief, isLoading: briefLoading } = useGetClientBrief(id ?? "", {
    query: { enabled: !!id, queryKey: getGetClientBriefQueryKey(id ?? "") },
  });
  const { data: zones = [] } = useListZones(id ?? "", {
    query: { enabled: !!id, queryKey: getListZonesQueryKey(id ?? "") },
  });

  const aiReport: SiteAnalysisReport | null = (() => {
    if (!brief?.aiAnalysisReport) return null;
    try { return JSON.parse(brief.aiAnalysisReport); } catch { return null; }
  })();

  const isLoading = propLoading || briefLoading;

  if (!id) {
    return (
      <div style={{ height: "100vh", width: "100vw", display: "flex", alignItems: "center", justifyContent: "center", background: "#fff" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: "monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.18em", color: "#1f6b7a", marginBottom: 12 }}>Error</div>
          <p style={{ fontFamily: "monospace", fontSize: 12, color: "#888" }}>No site ID in this link.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: "100vh", width: "100vw", display: "flex", flexDirection: "column", overflow: "hidden", background: "#fff" }}>

      {/* ── TOP BAR ──────────────────────────────────────────────── */}
      <header style={{ flexShrink: 0, height: 44, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", borderBottom: "2px solid #111", background: "#fff", zIndex: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src={patternMark} alt="Pattern" style={{ height: 18, width: "auto" }} />
          <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 900, letterSpacing: "-0.01em", color: "#111" }}>Pattern</span>
          <div style={{ width: 1, height: 14, background: "#ddd" }} />
          <span style={{ fontFamily: "monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.14em", color: "#1f6b7a" }}>Client View</span>
          {property && (
            <>
              <div style={{ width: 1, height: 14, background: "#ddd" }} />
              <span style={{ fontFamily: "monospace", fontSize: 11, color: "#555" }}>{property.name}</span>
            </>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {(property?.areaHectares ?? 0) > 0 && (
            <span style={{ fontFamily: "monospace", fontSize: 9, color: "#1f6b7a", border: "1px solid #1f6b7a", padding: "2px 8px", letterSpacing: "0.06em" }}>
              {property?.areaHectares?.toFixed(2)} ha
            </span>
          )}
          <span style={{ fontFamily: "monospace", fontSize: 9, color: "#888", border: "1px solid #ddd", padding: "2px 8px", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Read Only
          </span>
        </div>
      </header>

      {/* ── MAIN SPLIT ───────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* MAP ── left panel */}
        <div className="flex-1 relative min-w-0">
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center" style={{ background: "#f7f7f7" }}>
              <div className="flex flex-col items-center gap-3">
                <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#1f6b7a" }} />
                <p className="text-[11px] font-mono uppercase tracking-widest" style={{ color: "#bbb" }}>Loading terrain...</p>
              </div>
            </div>
          ) : (
            <PresentationMap
              boundaryGeojson={property?.boundaryGeojson ?? null}
              zones={zones as Array<{ zoneNumber: number; zoneGeojson: string }>}
            />
          )}

          {/* Map legend */}
          {zones.length > 0 && (
            <div className="absolute bottom-4 left-4 z-10 px-3 py-2 space-y-1" style={{ background: "rgba(255,255,255,0.92)", border: "1px solid #ddd" }}>
              <div className="text-[9px] font-mono uppercase tracking-widest mb-1.5" style={{ color: "#888" }}>Zone Legend</div>
              {[1, 2, 3, 4, 5]
                .filter((n) => zones.some((z) => z.zoneNumber === n))
                .map((n) => (
                  <div key={n} className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 border"
                      style={{ background: ZONE_COLORS[n]?.fill, borderColor: ZONE_COLORS[n]?.stroke }}
                    />
                    <span className="text-[10px]" style={{ color: "#555" }}>Zone {n}</span>
                  </div>
                ))}
            </div>
          )}

          {/* No boundary notice */}
          {!isLoading && !property?.boundaryGeojson && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 px-4 py-2" style={{ background: "rgba(255,255,255,0.92)", border: "1px solid #ddd" }}>
              <p className="text-[11px] font-mono" style={{ color: "#888" }}>No boundary mapped yet</p>
            </div>
          )}
        </div>

        {/* SIDEBAR ── right panel */}
        <aside className="w-[380px] shrink-0 flex flex-col overflow-hidden" style={{ background: "#fff", borderLeft: "2px solid #111" }}>

          {/* Sidebar header */}
          <div className="shrink-0 px-5 py-4" style={{ borderBottom: "2px solid #111" }}>
            <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] mb-0.5" style={{ color: "#1f6b7a" }}>
              Property Resilience Dossier
            </h2>
            <p className="text-[10px] font-mono" style={{ color: "#bbb" }}>
              {property?.name ?? "—"} · {brief?.aiAnalysisGeneratedAt
                ? `Analysis ${new Date(brief.aiAnalysisGeneratedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`
                : "Awaiting analysis"}
            </p>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">

            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#1f6b7a" }} />
              </div>
            )}

            {!isLoading && !brief && (
              <div className="p-4 text-center" style={{ background: "#f7f7f7", border: "1px solid #e5e5e5" }}>
                <p className="text-[12px]" style={{ color: "#555" }}>Site survey not completed yet.</p>
                <p className="text-[11px] mt-1" style={{ color: "#bbb" }}>Check back once your designer finishes the intake.</p>
              </div>
            )}

            {brief && (
              <>
                {/* Site Profile */}
                <PresentSection title="Site Profile">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                    {brief.climateZone && <PresentField label="Climate Zone" value={brief.climateZone} />}
                    {brief.elevationM != null && <PresentField label="Elevation" value={`${brief.elevationM} m ASL`} />}
                    {brief.annualRainfallMm != null && <PresentField label="Rainfall" value={`${brief.annualRainfallMm.toLocaleString()} mm/yr`} />}
                    {brief.meanAnnualTempC != null && <PresentField label="Mean Temp" value={`${brief.meanAnnualTempC} °C`} />}
                    {brief.summerMaxTempC != null && <PresentField label="Summer Max" value={`${brief.summerMaxTempC} °C`} />}
                    {brief.winterMinTempC != null && <PresentField label="Winter Min" value={`${brief.winterMinTempC} °C`} />}
                    {brief.frostDaysPerYear != null && <PresentField label="Frost Days" value={`${brief.frostDaysPerYear}/yr`} />}
                    {brief.prevailingWindDir && <PresentField label="Wind Dir." value={brief.prevailingWindDir} />}
                  </div>
                </PresentSection>

                {/* Soil */}
                {(brief.soilTextureClass || brief.soilPH != null) && (
                  <PresentSection title="Soil Analysis">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                      {brief.soilTextureClass && <PresentField label="Texture" value={brief.soilTextureClass} />}
                      {brief.soilPH != null && <PresentField label="pH" value={String(brief.soilPH)} />}
                      {brief.soilClay != null && <PresentField label="Clay" value={`${brief.soilClay}%`} />}
                      {brief.soilSand != null && <PresentField label="Sand" value={`${brief.soilSand}%`} />}
                      {brief.soilOrganicCarbonGkg != null && <PresentField label="Organic C" value={`${brief.soilOrganicCarbonGkg} g/kg`} />}
                    </div>
                  </PresentSection>
                )}

                {/* Goals */}
                {(brief.primaryGoal || brief.maintenanceCapacity) && (
                  <PresentSection title="Design Goals">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                      {brief.primaryGoal && <PresentField label="Primary Goal" value={brief.primaryGoal} />}
                      {brief.maintenanceCapacity && <PresentField label="Maintenance" value={brief.maintenanceCapacity} />}
                    </div>
                  </PresentSection>
                )}

                {/* AI Report */}
                {aiReport ? (
                  <PresentSection title="AI Resilience Analysis">
                    <div className="space-y-3">
                      {[
                        { key: "WaterStrategy",          title: "Water Strategy",         accent: "#3b82f6" },
                        { key: "SunAndEnergy",           title: "Sun & Energy",            accent: "#ca8a04" },
                        { key: "LandAndBiodiversity",    title: "Land & Biodiversity",     accent: "#4a6b2e" },
                        { key: "ClimateResilience",      title: "Climate Resilience",      accent: "#6366f1" },
                        { key: "InfrastructureCritique", title: "Infrastructure Critique", accent: "#ea580c" },
                      ].map(({ key, title, accent }) => {
                        const val = (aiReport as unknown as Record<string, unknown>)[key];
                        if (val === undefined || val === null) return null;
                        return (
                          <div
                            key={key}
                            className="overflow-hidden"
                            style={{ border: "1px solid #e5e5e5", borderLeft: `3px solid ${accent}`, background: "#fff" }}
                          >
                            <div
                              className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest"
                              style={{ color: accent, borderBottom: "1px solid #f0f0f0", background: "#fafafa" }}
                            >
                              {title}
                            </div>
                            <div className="px-3 pb-3 text-[11px] leading-relaxed" style={{ color: "#444" }}>
                              {typeof val === "string" ? (
                                <p className="whitespace-pre-wrap">{val}</p>
                              ) : Array.isArray(val) ? (
                                <ul className="list-disc pl-3 space-y-0.5" style={{ color: "#666" }}>
                                  {val.map((item, i) => (
                                    <li key={i}>{typeof item === "object" ? JSON.stringify(item) : String(item)}</li>
                                  ))}
                                </ul>
                              ) : (
                                <p>{JSON.stringify(val)}</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </PresentSection>
                ) : (
                  <PresentSection title="AI Resilience Analysis">
                    <div className="p-4 text-center" style={{ background: "#f7f7f7", border: "1px dashed #ddd" }}>
                      <p className="text-[12px]" style={{ color: "#888" }}>Analysis not yet generated.</p>
                      <p className="text-[11px] mt-1" style={{ color: "#bbb" }}>Your designer will share results here once complete.</p>
                    </div>
                  </PresentSection>
                )}
              </>
            )}
          </div>

          {/* Sidebar footer */}
          <div className="shrink-0 px-5 py-3 flex items-center justify-between" style={{ borderTop: "1px solid #e5e5e5" }}>
            <span className="text-[9px] font-mono uppercase tracking-widest" style={{ color: "#bbb" }}>Pattern</span>
            <span className="text-[9px] font-mono" style={{ color: "#bbb" }}>Read-only · Client access</span>
          </div>
        </aside>
      </div>
    </div>
  );
}

function PresentSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-[9px] font-bold uppercase tracking-[0.18em]" style={{ color: "#888" }}>{title}</h3>
        <div className="flex-1 h-px" style={{ background: "#e5e5e5" }} />
      </div>
      {children}
    </section>
  );
}

function PresentField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] uppercase tracking-wide font-semibold" style={{ color: "#bbb" }}>{label}</span>
      <span className="text-[12px] font-medium" style={{ color: "#111" }}>{value}</span>
    </div>
  );
}
