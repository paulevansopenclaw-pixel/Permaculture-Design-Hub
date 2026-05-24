import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetProperty,
  useGetClientBrief,
  useListZones,
  useListStructures,
  getGetClientBriefQueryKey,
  getGetPropertyQueryKey,
  getListZonesQueryKey,
  getListStructuresQueryKey,
  getListSectorsQueryKey,
} from "@workspace/api-client-react";
import { useAppStore } from "@/store/useAppStore";
import { AiAnalysisPanel } from "@/components/AiAnalysisPanel";
import { StepNav } from "@/components/StepNav";

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

function PropertyMiniMap({
  boundaryGeojson,
  zones,
  structures,
}: {
  boundaryGeojson: unknown;
  zones: Array<{ zoneNumber: number; zoneGeojson: string }>;
  structures: Array<{ lng: number; lat: number; label: string; structureType: string }>;
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
    });
    const tile = L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      { maxZoom: 19 }
    ).addTo(map);
    tileRef.current = tile;
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
    const prev = tileRef.current;
    const sat = L.tileLayer(
      `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/{z}/{x}/{y}?access_token=${token}`,
      { tileSize: 512, zoomOffset: -1, maxZoom: 20 }
    );
    if (prev) map.removeLayer(prev);
    sat.addTo(map);
    tileRef.current = sat;
  }, [token]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !boundaryGeojson) return;
    const layer = L.geoJSON(
      { type: "Feature", geometry: boundaryGeojson, properties: {} } as any,
      { style: () => ({ color: "#4a9a28", weight: 2.5, opacity: 0.9, fillColor: "#2D6A1A", fillOpacity: 0.12 }) }
    ).addTo(map);
    try {
      const bounds = layer.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20] });
    } catch { /* no-op */ }
    return () => { map.removeLayer(layer); };
  }, [boundaryGeojson]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layers: L.GeoJSON[] = [];
    zones.forEach((z) => {
      try {
        const geo = JSON.parse(z.zoneGeojson);
        const c = ZONE_COLORS[z.zoneNumber] ?? { fill: "#ccc", stroke: "#888" };
        const l = L.geoJSON({ type: "Feature", geometry: geo, properties: {} } as any, {
          style: () => ({ color: c.stroke, weight: 1.5, fillColor: c.fill, fillOpacity: 0.3, opacity: 0.8 }),
        }).addTo(map);
        layers.push(l);
      } catch { /* ignore */ }
    });
    return () => { layers.forEach((l) => map.removeLayer(l)); };
  }, [zones]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const markers: L.CircleMarker[] = [];
    structures.forEach((s) => {
      const m = L.circleMarker([s.lat, s.lng], {
        radius: 5, color: "#fff", weight: 1.5, fillColor: "#1e3a5f", fillOpacity: 1,
      }).bindTooltip(s.label, { permanent: false, direction: "top", className: "text-[10px]" }).addTo(map);
      markers.push(m);
    });
    return () => { markers.forEach((m) => map.removeLayer(m)); };
  }, [structures]);

  return <div ref={containerRef} className="w-full h-full" />;
}

export default function AnalysisPage() {
  const [, navigate] = useLocation();
  const { activePropertyId } = useAppStore();
  const queryClient = useQueryClient();

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

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: "hsl(103, 18%, 7%)" }}>
      {/* ── TOP BAR ── */}
      <header
        className="shrink-0 flex items-center justify-between px-5 py-3 border-b"
        style={{ background: "hsl(103, 22%, 9%)", borderColor: "hsl(103, 30%, 15%)", zIndex: 10 }}
      >
        <div className="flex items-center gap-4 min-w-0">
          <button
            onClick={() => navigate("/properties")}
            className="flex items-center gap-2 shrink-0 transition-opacity hover:opacity-70"
            style={{ color: "hsl(42, 28%, 85%)" }}
          >
            <span className="text-base">🛡</span>
            <span className="text-[13px] font-bold tracking-tight hidden sm:inline">TerraGuard</span>
          </button>
          <div className="w-px h-4 shrink-0 hidden sm:block" style={{ background: "hsl(103, 22%, 22%)" }} />
          <span className="text-[11px] font-semibold uppercase tracking-widest shrink-0" style={{ color: "hsl(84, 40%, 55%)" }}>
            The War Room
          </span>
          {property?.name && (
            <>
              <div className="w-px h-4 shrink-0" style={{ background: "hsl(103, 22%, 22%)" }} />
              <span className="text-[12px] truncate" style={{ color: "hsl(42, 20%, 60%)" }}>{property.name}</span>
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
            <h3 className="text-base font-semibold" style={{ color: "hsl(42, 28%, 82%)" }}>No property selected</h3>
            <p className="text-sm" style={{ color: "hsl(42, 15%, 50%)" }}>
              Select a property and complete the site intake survey first.
            </p>
            <button
              onClick={() => navigate("/intake")}
              className="mt-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold"
              style={{ background: "hsl(84, 38%, 22%)", color: "hsl(84, 55%, 80%)", border: "1px solid hsl(84, 35%, 30%)" }}
            >
              ← Go to Intake
            </button>
          </div>
        </div>
      )}

      {/* ── SPLIT LAYOUT ── */}
      {activePropertyId && (
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* LEFT — Mini Map */}
          <div
            className="lg:w-[40%] shrink-0 relative border-r"
            style={{
              borderColor: "hsl(103, 28%, 16%)",
              minHeight: "220px",
              height: "40vh",
            }}
          >
            <div className="absolute inset-0">
              {property?.boundaryGeojson ? (
                <PropertyMiniMap
                  boundaryGeojson={property.boundaryGeojson}
                  zones={zones}
                  structures={structures}
                />
              ) : (
                <div
                  className="w-full h-full flex flex-col items-center justify-center gap-2"
                  style={{ background: "hsl(103, 18%, 9%)" }}
                >
                  <span className="text-3xl opacity-30">🗺</span>
                  <p className="text-[11px]" style={{ color: "hsl(42, 15%, 40%)" }}>
                    No boundary drawn
                  </p>
                  <button
                    onClick={() => navigate("/workspace")}
                    className="text-[11px] px-3 py-1.5 rounded-lg mt-1"
                    style={{ background: "hsl(103, 22%, 14%)", color: "hsl(42, 20%, 60%)", border: "1px solid hsl(103, 22%, 22%)" }}
                  >
                    Draw in Sandbox →
                  </button>
                </div>
              )}
            </div>

            {/* Map label overlay */}
            <div
              className="absolute bottom-2 left-2 px-2 py-1 rounded text-[9px] font-bold uppercase tracking-widest pointer-events-none"
              style={{ background: "rgba(4,10,4,0.7)", color: "hsl(84, 40%, 55%)", zIndex: 20 }}
            >
              Site Overview
            </div>
          </div>

          {/* RIGHT — AI Analysis */}
          <div
            className="flex-1 overflow-y-auto"
            style={{ background: "hsl(103, 18%, 8%)" }}
          >
            <div className="px-6 py-6 max-w-2xl">
              {/* No brief warning */}
              {!brief && (
                <div
                  className="rounded-xl p-4 mb-6 text-[12px]"
                  style={{ background: "hsl(38, 30%, 10%)", border: "1px solid hsl(38, 30%, 20%)", color: "hsl(38, 70%, 65%)" }}
                >
                  <span className="font-bold">Site survey incomplete.</span>{" "}
                  <button onClick={() => navigate("/intake")} className="underline">
                    Complete the intake →
                  </button>
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

            {/* Bottom navigation */}
            <div
              className="px-6 py-4 border-t flex items-center justify-between sticky bottom-0"
              style={{ background: "hsl(103, 22%, 9%)", borderColor: "hsl(103, 22%, 16%)" }}
            >
              <button
                onClick={() => navigate("/workspace")}
                className="text-[11px] px-3 py-1.5 rounded-lg"
                style={{ color: "hsl(42, 20%, 55%)", border: "1px solid hsl(103, 22%, 20%)", background: "transparent" }}
              >
                ← Sandbox
              </button>
              <button
                onClick={() => navigate("/dossier")}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-[12px] font-semibold"
                style={{ background: "linear-gradient(135deg, #1a4a0d, #3a8220)", color: "#e8f5e2", border: "1px solid #4a9a28" }}
              >
                Next: Export Studio →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
