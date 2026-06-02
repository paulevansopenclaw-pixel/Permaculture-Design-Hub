import { useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import patternMark from "@assets/pattern-mark.png";
import {
  useGetProperty,
  useGetClientBrief,
  useListZones,
  useListStructures,
  useListSectors,
  useListDesignedSwales,
  useListPathways,
  useListSensoryVectors,
  useListPlanRenders,
  useGenerateConceptRender,
  getGetPropertyQueryKey,
  getGetClientBriefQueryKey,
  getListZonesQueryKey,
  getListStructuresQueryKey,
  getListSectorsQueryKey,
  getListDesignedSwalesQueryKey,
  getListPathwaysQueryKey,
  getListSensoryVectorsQueryKey,
  getListPlanRendersQueryKey,
} from "@workspace/api-client-react";
import { useAppStore } from "@/store/useAppStore";
import { StepNav } from "@/components/StepNav";
import { PlanPlate, type PlanLayerKey } from "@/components/plans/PlanPlate";
import { SoilPlate } from "@/components/plans/SoilPlate";
import { generateContours } from "@/lib/contourEngine";
import { analyzeWaterPaths, type WaterAnalysisResult } from "@/lib/keylineEngine";
import { parseGeo, toFeature } from "@/lib/planProjection";
import { layerSourceHash, type PlanSourceContext } from "@/lib/planSource";

const INK = "#2c2416";
const GREEN = "#2d6a4f";
const LIGHT = "#f8f5f0";
const RULE = "1px solid #ddd6cc";

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

const PLATE_W = 1000;
const PLATE_H = 720;

/** Rasterize a plan plate SVG element to a PNG data URL for image-to-image restyling. */
function svgToPngDataUrl(svg: SVGSVGElement): Promise<string> {
  return new Promise((resolve, reject) => {
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("width", String(PLATE_W));
    clone.setAttribute("height", String(PLATE_H));
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const xml = new XMLSerializer().serializeToString(clone);
    const svg64 = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(xml)));
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = PLATE_W;
        canvas.height = PLATE_H;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas not supported"));
          return;
        }
        ctx.fillStyle = "#f4ecd8";
        ctx.fillRect(0, 0, PLATE_W, PLATE_H);
        ctx.drawImage(img, 0, 0, PLATE_W, PLATE_H);
        resolve(canvas.toDataURL("image/png"));
      } catch (e) {
        reject(e instanceof Error ? e : new Error("Rasterization failed"));
      }
    };
    img.onerror = () => reject(new Error("Could not rasterize plate"));
    img.src = svg64;
  });
}

interface LayerDef {
  key: PlanLayerKey | "soil";
  label: string;
  hint: string;
}
const LAYER_DEFS: LayerDef[] = [
  { key: "boundary", label: "Boundary", hint: "Property survey outline" },
  { key: "water", label: "Water & Contour", hint: "1 m contours, swales, dam" },
  { key: "zones", label: "Zones", hint: "Permaculture zones 1–5" },
  { key: "sectors", label: "Sectors", hint: "Sun, wind, noise, views" },
  { key: "structures", label: "Structures", hint: "Buildings, tanks, access" },
  { key: "soil", label: "Soil Profile", hint: "Texture triangle & horizons" },
];

export default function PlansPage() {
  const [, navigate] = useLocation();
  const { activePropertyId } = useAppStore();
  const [token, setToken] = useState("");
  const [style, setStyle] = useState<"professional" | "concept">("professional");
  const [visible, setVisible] = useState<Record<string, boolean>>({
    boundary: true,
    water: false,
    zones: true,
    sectors: false,
    structures: true,
    soil: false,
  });

  const [contours, setContours] = useState<GeoJSON.FeatureCollection | null>(null);
  const [contourLoading, setContourLoading] = useState(false);
  const [contourError, setContourError] = useState<string | null>(null);
  const [waterAnalysis, setWaterAnalysis] = useState<WaterAnalysisResult | null>(null);
  const requestedContours = useRef(false);
  const soilRef = useRef<SVGSVGElement>(null);
  const layerRefs = useRef<Record<string, SVGSVGElement | null>>({});
  const setLayerRef = (key: string) => (el: SVGSVGElement | null) => {
    layerRefs.current[key] = el;
  };
  const queryClient = useQueryClient();

  useEffect(() => {
    fetchMapboxToken().then(setToken);
  }, []);

  const q = (key: ReturnType<typeof getGetPropertyQueryKey>) => ({
    query: { enabled: !!activePropertyId, queryKey: key },
  });
  const pid = activePropertyId ?? "";
  const { data: property } = useGetProperty(pid, q(getGetPropertyQueryKey(pid)));
  const { data: brief } = useGetClientBrief(pid, q(getGetClientBriefQueryKey(pid)));
  const { data: zones = [] } = useListZones(pid, q(getListZonesQueryKey(pid)));
  const { data: structures = [] } = useListStructures(pid, q(getListStructuresQueryKey(pid)));
  const { data: sectors = [] } = useListSectors(pid, q(getListSectorsQueryKey(pid)));
  const { data: swales = [] } = useListDesignedSwales(pid, q(getListDesignedSwalesQueryKey(pid)));
  const { data: pathways = [] } = useListPathways(pid, q(getListPathwaysQueryKey(pid)));
  const { data: sensoryVectors = [] } = useListSensoryVectors(pid, q(getListSensoryVectorsQueryKey(pid)));
  const { data: planRenders = [] } = useListPlanRenders(pid, q(getListPlanRendersQueryKey(pid)));

  const srcCtx: PlanSourceContext = {
    boundary: property?.boundaryGeojson,
    zones,
    sectors,
    structures,
    swales,
    pathways,
    sensoryVectors,
    brief,
  };

  const generateConcept = useGenerateConceptRender();
  const [conceptError, setConceptError] = useState<string | null>(null);
  const [rendering, setRendering] = useState<string | null>(null);

  // A cached render is stale when its stored source hash no longer matches the
  // current source data for that layer (design edits since it was generated).
  function isStale(layerKey: string): boolean {
    const r = planRenders.find((x) => x.layerKey === layerKey);
    return !!(r && r.sourceHash && r.sourceHash !== layerSourceHash(layerKey, srcCtx));
  }

  async function runConcept(layerKey: string, svg: SVGSVGElement | null) {
    if (!svg || !activePropertyId) return;
    setConceptError(null);
    setRendering(layerKey);
    try {
      const plateImage = await svgToPngDataUrl(svg);
      await generateConcept.mutateAsync({
        propertyId: activePropertyId,
        data: { layerKey, plateImage, style: "concept", sourceHash: layerSourceHash(layerKey, srcCtx) },
      });
      await queryClient.invalidateQueries({
        queryKey: getListPlanRendersQueryKey(activePropertyId),
      });
    } catch {
      setConceptError("Concept render failed. Try again in a moment.");
    } finally {
      setRendering(null);
    }
  }

  // Lazily generate contours the first time the Water layer is enabled.
  useEffect(() => {
    if (!visible.water || !token || !property?.boundaryGeojson || requestedContours.current) return;
    requestedContours.current = true;
    setContourLoading(true);
    setContourError(null);
    const feat = toFeature(parseGeo(property.boundaryGeojson as unknown as string));
    if (!feat) {
      setContourLoading(false);
      return;
    }
    generateContours(feat as GeoJSON.Feature, token, 1)
      .then((fc) => {
        setContours(fc);
        try {
          if (feat.geometry?.type === "Polygon") {
            setWaterAnalysis(
              analyzeWaterPaths(fc, feat as GeoJSON.Feature<GeoJSON.Polygon>),
            );
          }
        } catch {
          /* analysis is best-effort */
        }
      })
      .catch(() => setContourError("Could not load terrain — contours need elevation tiles."))
      .finally(() => setContourLoading(false));
  }, [visible.water, token, property?.boundaryGeojson]);

  const geoVisible: Record<PlanLayerKey, boolean> = {
    boundary: !!visible.boundary,
    water: !!visible.water,
    zones: !!visible.zones,
    sectors: !!visible.sectors,
    structures: !!visible.structures,
  };
  const anyGeo = Object.values(geoVisible).some(Boolean);
  const hasBoundary = !!property?.boundaryGeojson;

  // Visibility for a single-layer plate: the property boundary as base context
  // plus the one layer being concept-rendered.
  function soloVisible(key: PlanLayerKey): Record<PlanLayerKey, boolean> {
    return {
      boundary: key === "boundary",
      water: key === "water",
      zones: key === "zones",
      sectors: key === "sectors",
      structures: key === "structures",
      [key]: true,
    };
  }
  const enabledGeoLayers = (LAYER_DEFS.filter(
    (l) => l.key !== "soil" && geoVisible[l.key as PlanLayerKey],
  ) as { key: PlanLayerKey; label: string; hint: string }[]);

  function toggle(key: string) {
    setVisible((v) => ({ ...v, [key]: !v[key] }));
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: LIGHT, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <header
        className="shrink-0 flex items-center justify-between px-5"
        style={{ height: 54, background: "#fff", borderBottom: RULE, boxShadow: "0 2px 6px rgba(44,36,22,0.06)" }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/properties")}
            className="flex items-center gap-2"
            style={{ color: INK, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}
          >
            <img src={patternMark} alt="Pattern" style={{ height: 26, width: "auto" }} />
            <span style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 14, color: INK }} className="hidden sm:inline">Pattern</span>
          </button>
          <div className="hidden sm:block" style={{ width: 1, height: 16, background: "#ddd6cc" }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: "#6b5f4e" }} className="hidden sm:inline">Design Plans</span>
        </div>
        <StepNav />
      </header>

      <main className="flex-1 w-full max-w-[1500px] mx-auto px-4 sm:px-8 py-6">
        {!activePropertyId ? (
          <EmptyState title="No property selected" body="Pick a property from the Properties page to view its design plans." onGo={() => navigate("/properties")} goLabel="Go to Properties →" />
        ) : !hasBoundary ? (
          <EmptyState title="No boundary drawn yet" body="Draw the property boundary in the Map workspace before generating plans." onGo={() => navigate("/workspace")} goLabel="Go to Map →" />
        ) : (
          <div className="grid gap-6" style={{ gridTemplateColumns: "minmax(220px, 260px) 1fr" }}>
            {/* ── Control panel ── */}
            <aside className="space-y-5">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "#888" }}>Style</div>
                <div className="flex gap-1 p-1" style={{ background: "#f1ece2", border: RULE }}>
                  {(["professional", "concept"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setStyle(s)}
                      className="flex-1 px-3 py-1.5 text-[12px] font-semibold transition-all capitalize"
                      style={
                        style === s
                          ? { background: "#fff", color: GREEN, border: "1px solid #ddd6cc", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }
                          : { background: "transparent", color: "#998", border: "1px solid transparent" }
                      }
                    >
                      {s === "professional" ? "📐 Plan" : "🎨 Concept"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "#888" }}>Layers</div>
                <div className="space-y-1.5">
                  {LAYER_DEFS.map((l) => {
                    const on = !!visible[l.key];
                    return (
                      <button
                        key={l.key}
                        onClick={() => toggle(l.key)}
                        className="w-full flex items-start gap-2.5 px-3 py-2 text-left transition-all"
                        style={{
                          background: on ? "#fff" : "transparent",
                          border: `1px solid ${on ? GREEN : "#e5ddd0"}`,
                        }}
                      >
                        <div
                          className="mt-0.5 shrink-0 flex items-center justify-center"
                          style={{ width: 16, height: 16, borderRadius: 4, background: on ? GREEN : "#fff", border: `1.5px solid ${on ? GREEN : "#c9bfaf"}` }}
                        >
                          {on && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                          )}
                        </div>
                        <div>
                          <div className="text-[12.5px] font-semibold" style={{ color: on ? INK : "#777" }}>{l.label}</div>
                          <div className="text-[10px]" style={{ color: "#a89880" }}>{l.hint}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {visible.water && (
                <div className="text-[10.5px] px-3 py-2" style={{ background: "#eef4f0", border: "1px solid #cfe0d6", color: "#3a5a4a" }}>
                  {contourLoading ? "Generating 1 m contours from terrain…" : contourError ? contourError : contours ? `${contours.features.length} contour lines rendered.` : "Contours load when enabled."}
                </div>
              )}
            </aside>

            {/* ── Plates ── */}
            <section className="space-y-6 min-w-0">
              {style === "professional" ? (
                <>
                  {anyGeo && property && (
                    <figure className="m-0" style={{ border: RULE, boxShadow: "0 4px 20px rgba(44,36,22,0.1)" }}>
                      <PlanPlate
                        property={property}
                        visible={geoVisible}
                        zones={zones}
                        sectors={sectors}
                        structures={structures}
                        swales={swales}
                        pathways={pathways}
                        sensoryVectors={sensoryVectors}
                        contours={contours}
                        waterAnalysis={waterAnalysis}
                      />
                    </figure>
                  )}
                  {visible.soil && property && (
                    <figure className="m-0" style={{ border: RULE, boxShadow: "0 4px 20px rgba(44,36,22,0.1)" }}>
                      <SoilPlate property={property} brief={brief} />
                    </figure>
                  )}
                  {!anyGeo && !visible.soil && (
                    <div className="p-12 text-center" style={{ border: "1px dashed #c9bfaf", color: "#a89880", background: "#fff" }}>
                      Enable a layer to render its plan plate.
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* Offscreen accurate single-layer plates — each rasterized as the
                      source for that layer's restyle. */}
                  <div aria-hidden style={{ position: "absolute", left: -99999, top: 0, width: PLATE_W, pointerEvents: "none", opacity: 0 }}>
                    {property &&
                      enabledGeoLayers.map((l) => (
                        <PlanPlate
                          key={l.key}
                          ref={setLayerRef(l.key)}
                          property={property}
                          visible={soloVisible(l.key)}
                          zones={zones}
                          sectors={sectors}
                          structures={structures}
                          swales={swales}
                          pathways={pathways}
                          sensoryVectors={sensoryVectors}
                          contours={contours}
                          waterAnalysis={waterAnalysis}
                        />
                      ))}
                    {property && anyGeo && (
                      <PlanPlate
                        ref={setLayerRef("composite")}
                        property={property}
                        visible={geoVisible}
                        zones={zones}
                        sectors={sectors}
                        structures={structures}
                        swales={swales}
                        pathways={pathways}
                        sensoryVectors={sensoryVectors}
                        contours={contours}
                        waterAnalysis={waterAnalysis}
                      />
                    )}
                    {property && <SoilPlate ref={soilRef} property={property} brief={brief} />}
                  </div>

                  {conceptError && (
                    <div className="text-[12px] px-3 py-2" style={{ background: "#fbeaea", border: "1px solid #e6c3c3", color: "#8a3a3a" }}>
                      {conceptError}
                    </div>
                  )}

                  {anyGeo && (
                    <ConceptCard
                      title="Composite masterplan — illustrated"
                      subtitle="Watercolour restyle blending all enabled design layers"
                      render={planRenders.find((r) => r.layerKey === "composite")}
                      busy={rendering === "composite"}
                      stale={isStale("composite")}
                      onGenerate={() => runConcept("composite", layerRefs.current["composite"])}
                    />
                  )}
                  {enabledGeoLayers.map((l) => (
                    <ConceptCard
                      key={l.key}
                      title={`${l.label} — illustrated`}
                      subtitle={`Watercolour restyle of the ${l.label.toLowerCase()} layer`}
                      render={planRenders.find((r) => r.layerKey === l.key)}
                      busy={rendering === l.key}
                      stale={isStale(l.key)}
                      onGenerate={() => runConcept(l.key, layerRefs.current[l.key])}
                    />
                  ))}
                  {visible.soil && (
                    <ConceptCard
                      title="Soil profile — illustrated"
                      subtitle="Earthy geological restyle of the soil plate"
                      render={planRenders.find((r) => r.layerKey === "soil")}
                      busy={rendering === "soil"}
                      stale={isStale("soil")}
                      onGenerate={() => runConcept("soil", soilRef.current)}
                    />
                  )}
                  {!anyGeo && !visible.soil && (
                    <div className="p-12 text-center" style={{ border: "1px dashed #c9bfaf", color: "#a89880", background: "#fff" }}>
                      Enable a layer to generate its concept art.
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

interface RenderItem {
  url: string;
  updatedAt?: string;
}

function ConceptCard({
  title,
  subtitle,
  render,
  busy,
  stale,
  onGenerate,
}: {
  title: string;
  subtitle: string;
  render?: RenderItem;
  busy: boolean;
  stale?: boolean;
  onGenerate: () => void;
}) {
  return (
    <figure className="m-0" style={{ border: RULE, background: "#fff", boxShadow: "0 4px 20px rgba(44,36,22,0.1)" }}>
      <figcaption className="flex items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: RULE }}>
        <div>
          <div className="text-[13px] font-bold" style={{ color: INK }}>{title}</div>
          <div className="text-[10.5px]" style={{ color: "#a89880" }}>{subtitle}</div>
        </div>
        <button
          onClick={onGenerate}
          disabled={busy}
          className="px-3.5 py-1.5 text-[12px] font-semibold shrink-0"
          style={{
            background: busy ? "#cfc6b6" : GREEN,
            color: "#fff",
            border: "none",
            cursor: busy ? "wait" : "pointer",
          }}
        >
          {busy ? "Rendering…" : render ? "🎨 Regenerate" : "🎨 Generate"}
        </button>
      </figcaption>
      {render && stale && (
        <div className="text-[11px] px-4 py-2" style={{ background: "#fdf3e3", borderBottom: "1px solid #ecd9b5", color: "#8a6d2f" }}>
          ⚠ Design data has changed since this concept was generated — regenerate to refresh.
        </div>
      )}
      <div className="relative">
        {render ? (
          <img
            src={render.updatedAt ? `${render.url}?v=${encodeURIComponent(render.updatedAt)}` : render.url}
            alt={title}
            style={{ display: "block", width: "100%" }}
          />
        ) : (
          <div className="p-12 text-center space-y-2" style={{ color: "#a89880" }}>
            <div className="text-3xl">🖼</div>
            <p className="text-[12.5px] max-w-sm mx-auto">
              Generate an illustrated concept restyle of the accurate plan above.
            </p>
          </div>
        )}
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(248,245,240,0.78)" }}>
            <div className="text-[12.5px] font-semibold" style={{ color: GREEN }}>Painting your concept…</div>
          </div>
        )}
      </div>
    </figure>
  );
}

function EmptyState({ title, body, onGo, goLabel }: { title: string; body: string; onGo: () => void; goLabel: string }) {
  return (
    <div className="p-10 text-center space-y-4 max-w-md mx-auto mt-10" style={{ background: "#fff", border: "2px solid #111" }}>
      <div className="text-4xl">🗺</div>
      <h2 className="text-lg font-bold" style={{ color: "#111" }}>{title}</h2>
      <p className="text-sm" style={{ color: "#666" }}>{body}</p>
      <button onClick={onGo} className="px-5 py-2.5 text-[13px] font-semibold" style={{ background: GREEN, color: "#fff", border: `2px solid ${GREEN}` }}>
        {goLabel}
      </button>
    </div>
  );
}
