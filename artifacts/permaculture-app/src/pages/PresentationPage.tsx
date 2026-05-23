import { useEffect, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import L from "leaflet";
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
          color: "#10b981",
          weight: 2.5,
          fillColor: "#10b981",
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
      <div className="h-screen w-screen flex items-center justify-center bg-slate-950">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-slate-500">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <p className="text-slate-400 font-mono text-sm">No site ID in this link.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-slate-950">

      {/* ── TOP BAR ──────────────────────────────────────────────── */}
      <header className="shrink-0 h-11 flex items-center justify-between px-5 border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm z-20">
        <div className="flex items-center gap-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-emerald-500">
            <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7L12 2z"/>
          </svg>
          <span className="text-[13px] font-bold tracking-tight text-slate-100">TerraGuard</span>
          <div className="w-px h-3.5 bg-slate-700" />
          <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500">Client View</span>
          {property && (
            <>
              <div className="w-px h-3.5 bg-slate-700" />
              <span className="text-[12px] font-medium text-slate-300 truncate max-w-[200px]">{property.name}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {(property?.areaHectares ?? 0) > 0 && (
            <span className="text-[10px] font-mono bg-emerald-600/10 text-emerald-500 border border-emerald-600/20 px-2 py-0.5 rounded">
              {property?.areaHectares?.toFixed(2)} ha
            </span>
          )}
          <span className="text-[10px] font-mono bg-slate-800 text-slate-500 border border-slate-700 px-2 py-0.5 rounded uppercase tracking-wider">
            Read Only
          </span>
        </div>
      </header>

      {/* ── MAIN SPLIT ───────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* MAP ── left panel */}
        <div className="flex-1 relative min-w-0">
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
              <div className="flex flex-col items-center gap-3">
                <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin border-emerald-500" />
                <p className="text-[11px] text-slate-500 font-mono uppercase tracking-widest">Loading terrain...</p>
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
            <div className="absolute bottom-4 left-4 z-10 bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 space-y-1 backdrop-blur-sm">
              <div className="text-[9px] font-mono uppercase tracking-widest text-slate-500 mb-1.5">Zone Legend</div>
              {[1, 2, 3, 4, 5]
                .filter((n) => zones.some((z) => z.zoneNumber === n))
                .map((n) => (
                  <div key={n} className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-sm border"
                      style={{ background: ZONE_COLORS[n]?.fill, borderColor: ZONE_COLORS[n]?.stroke }}
                    />
                    <span className="text-[10px] text-slate-400">Zone {n}</span>
                  </div>
                ))}
            </div>
          )}

          {/* No boundary notice */}
          {!isLoading && !property?.boundaryGeojson && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-slate-900/90 border border-slate-700 rounded-lg px-4 py-2 backdrop-blur-sm">
              <p className="text-[11px] text-slate-400 font-mono">No boundary mapped yet</p>
            </div>
          )}
        </div>

        {/* SIDEBAR ── right panel */}
        <aside className="w-[380px] shrink-0 flex flex-col bg-slate-900 border-l border-slate-800 overflow-hidden">

          {/* Sidebar header */}
          <div className="shrink-0 px-5 py-4 border-b border-slate-800">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-emerald-500 mb-0.5">
              Property Resilience Dossier
            </h2>
            <p className="text-[10px] text-slate-500 font-mono">
              {property?.name ?? "—"} · {brief?.aiAnalysisGeneratedAt
                ? `Analysis ${new Date(brief.aiAnalysisGeneratedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`
                : "Awaiting analysis"}
            </p>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">

            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin border-emerald-500" />
              </div>
            )}

            {!isLoading && !brief && (
              <div className="rounded-lg bg-slate-800 border border-slate-700 p-4 text-center">
                <p className="text-[12px] text-slate-400">Site survey not completed yet.</p>
                <p className="text-[11px] text-slate-500 mt-1">Check back once your designer finishes the intake.</p>
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
                        { key: "LandAndBiodiversity",    title: "Land & Biodiversity",     accent: "#16a34a" },
                        { key: "ClimateResilience",      title: "Climate Resilience",      accent: "#6366f1" },
                        { key: "InfrastructureCritique", title: "Infrastructure Critique", accent: "#ea580c" },
                      ].map(({ key, title, accent }) => {
                        const val = (aiReport as unknown as Record<string, unknown>)[key];
                        if (val === undefined || val === null) return null;
                        return (
                          <div
                            key={key}
                            className="rounded-lg bg-slate-800 border border-slate-700 overflow-hidden"
                            style={{ borderLeft: `3px solid ${accent}` }}
                          >
                            <div
                              className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest"
                              style={{ color: accent }}
                            >
                              {title}
                            </div>
                            <div className="px-3 pb-3 text-[11px] leading-relaxed text-slate-300">
                              {typeof val === "string" ? (
                                <p className="whitespace-pre-wrap">{val}</p>
                              ) : Array.isArray(val) ? (
                                <ul className="list-disc pl-3 space-y-0.5 text-slate-400">
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
                    <div className="rounded-lg bg-slate-800 border border-slate-700 border-dashed p-4 text-center">
                      <p className="text-[12px] text-slate-500">Analysis not yet generated.</p>
                      <p className="text-[11px] text-slate-600 mt-1">Your designer will share results here once complete.</p>
                    </div>
                  </PresentSection>
                )}
              </>
            )}
          </div>

          {/* Sidebar footer */}
          <div className="shrink-0 px-5 py-3 border-t border-slate-800 flex items-center justify-between">
            <span className="text-[9px] font-mono uppercase tracking-widest text-slate-600">TerraGuard OS</span>
            <span className="text-[9px] font-mono text-slate-600">Read-only · Client access</span>
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
        <h3 className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500">{title}</h3>
        <div className="flex-1 h-px bg-slate-800" />
      </div>
      {children}
    </section>
  );
}

function PresentField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] uppercase tracking-wide font-semibold text-slate-600">{label}</span>
      <span className="text-[12px] font-medium text-slate-200">{value}</span>
    </div>
  );
}
