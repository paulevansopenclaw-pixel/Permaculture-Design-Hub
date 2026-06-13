import { useEffect, useState } from "react";
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
import { PlanPlate, type PlanLayerKey } from "@/components/plans/PlanPlate";
import { SoilPlate } from "@/components/plans/SoilPlate";
import { generateContours } from "@/lib/contourEngine";
import { analyzeWaterPaths, type WaterAnalysisResult } from "@/lib/keylineEngine";
import { parseGeo, toFeature } from "@/lib/planProjection";
import { layerSourceHash, type PlanSourceContext } from "@/lib/planSource";

const INK = "#2c2416";
const GREEN = "#4a6b2e";
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

export default function AutoDesignPage() {
  const [, navigate] = useLocation();
  const { activePropertyId } = useAppStore();
  const [token, setToken] = useState("");
  const queryClient = useQueryClient();

  const pid = activePropertyId ?? "";

  const { data: property } = useGetProperty(pid, {
    query: { enabled: !!pid, queryKey: getGetPropertyQueryKey(pid) },
  });
  const { data: brief } = useGetClientBrief(pid, {
    query: { enabled: !!pid, queryKey: getGetClientBriefQueryKey(pid) },
  });
  const { data: zones = [] } = useListZones(pid, {
    query: { enabled: !!pid, queryKey: getListZonesQueryKey(pid) },
  });
  const { data: structures = [] } = useListStructures(pid, {
    query: { enabled: !!pid, queryKey: getListStructuresQueryKey(pid) },
  });
  const { data: sectors = [] } = useListSectors(pid, {
    query: { enabled: !!pid, queryKey: getListSectorsQueryKey(pid) },
  });
  const { data: swales = [] } = useListDesignedSwales(pid, {
    query: { enabled: !!pid, queryKey: getListDesignedSwalesQueryKey(pid) },
  });
  const { data: pathways = [] } = useListPathways(pid, {
    query: { enabled: !!pid, queryKey: getListPathwaysQueryKey(pid) },
  });
  const { data: sensoryVectors = [] } = useListSensoryVectors(pid, {
    query: { enabled: !!pid, queryKey: getListSensoryVectorsQueryKey(pid) },
  });
  const { data: planRenders = [] } = useListPlanRenders(pid, {
    query: { enabled: !!pid, queryKey: getListPlanRendersQueryKey(pid) },
  });

  const generateConcept = useGenerateConceptRender();

  const srcCtx = {
    boundary: property?.boundaryGeojson,
    zones,
    sectors,
    structures,
    swales,
    pathways,
    sensoryVectors,
    brief,
  };

  const [style, setStyle] = useState<"professional" | "concept">("professional");
  const [masterError, setMasterError] = useState<string | null>(null);
  const [rendering, setRendering] = useState<string | null>(null);
  const [renders, setRenders] = useState<Record<string, string | undefined>>({});

  const required: PlanLayerKey[] = ["boundary", "water", "zones", "sectors", "structures", "soil"];

  useEffect(() => {
    fetchMapboxToken().then(setToken);
  }, []);

  useEffect(() => {
    setRenders((prev) => {
      const next: Record<string, string | undefined> = { ...prev };
      for (const layerKey of required) {
        const cached = planRenders.find((x) => x.layerKey === layerKey);
        if (cached?.imageUrl && !next[layerKey]) {
          next[layerKey] = cached.imageUrl;
        }
      }
      if (Object.keys(next).length !== Object.keys(prev).length) return next;
      return prev;
    });
  }, [planRenders]);

  async function ensureRender(layerKey: PlanLayerKey, svg: SVGSVGElement | null) {
    if (!svg || !activePropertyId) return;
    const cached = planRenders.find((x) => x.layerKey === layerKey && x.style === style);
    if (cached?.imageUrl) {
      setRenders((prev) => ({ ...prev, [layerKey]: cached.imageUrl }));
      return;
    }
    setRendering(layerKey);
    try {
      const plateImage = await svgToPngDataUrl(svg);
      await generateConcept.mutateAsync({
        propertyId: activePropertyId,
        data: {
          layerKey,
          plateImage,
          style,
          sourceHash: layerSourceHash(layerKey, srcCtx),
        },
      });
      await queryClient.invalidateQueries({
        queryKey: getListPlanRendersQueryKey(activePropertyId),
      });
    } catch {
      setMasterError("A layer failed to render. Try again.");
    } finally {
      setRendering(null);
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: LIGHT, fontFamily: "'Inter', system-ui, sans-serif" }}
    >
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
            <span style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 14, color: INK }} className="hidden sm:inline">
              Pattern
            </span>
          </button>
          <div className="hidden sm:block" style={{ width: 1, height: 16, background: "#ddd6cc" }} />
          <span style={{ color: "#6b5f4e", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.14em" }}>
            Client Master Plan
          </span>
        </div>

        <div className="flex items-center gap-3">
          <label style={{ display: "flex", alignItems: "center", gap: 8, color: INK, fontSize: 11, fontWeight: 600 }}>
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value as "professional" | "concept")}
              style={{ background: "#f8f5f0", border: "1px solid #ddd6cc", borderRadius: 7, padding: "4px 8px", color: INK, cursor: "pointer" }}
            >
              <option value="professional">Professional</option>
              <option value="concept">Concept</option>
            </select>
          </label>
          <button
            onClick={() => navigate("/plans")}
            style={{ background: "none", border: "1px solid #ddd6cc", borderRadius: 7, padding: "6px 10px", color: INK, cursor: "pointer", fontSize: 11, fontWeight: 600 }}
          >
            Editor
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 py-6">
        {!pid ? (
          <div className="mx-auto flex max-w-2xl flex-col items-center justify-center gap-4 py-24 text-center">
            <span style={{ fontFamily: "Georgia, serif", fontSize: 40, fontWeight: 700, color: INK }}>No property selected</span>
            <p style={{ color: "#6b5f4e", maxWidth: 500, lineHeight: 1.6 }}>
              Open a property from your studio first. Pattern will then generate its master plan automatically from your map data.
            </p>
            <button
              onClick={() => navigate("/properties")}
              style={{ background: GREEN, color: "#fff", border: "none", borderRadius: 9, padding: "10px 14px", cursor: "pointer", fontWeight: 700, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase" }}
            >
              Go to Properties
            </button>
          </div>
        ) : (
          <div className="mx-auto max-w-7xl">
            {masterError && (
              <div className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">{masterError}</div>
            )}

            <div
              className="mb-6 grid gap-4 md:grid-cols-3"
              style={{ background: "#fff", borderRadius: 14, border: RULE, padding: "18px 18px 14px" }}
            >
              <div style={{ color: INK, fontWeight: 700, fontSize: 14, lineHeight: 1.4 }}>
                {property?.name ?? "Untitled property"}
              </div>
              <div style={{ color: "#6b5f4e", fontSize: 12, lineHeight: 1.55 }}>
                Pattern turns the site analysis, zones, sectors and water data into a single client-ready master plan.
              </div>
              <div style={{ color: "#6b5f4e", fontSize: 12, lineHeight: 1.55 }}>
                This page generates the key layers and stores them so you can use them in proposals without rebuilding each time.
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
              <div className="flex flex-col gap-5">
                {required.map((layerKey) => (
                  <div key={layerKey} className="rounded-xl bg-white" style={{ border: RULE, boxShadow: "0 1px 3px rgba(44,36,22,0.04)" }}>
                    <PlanPlate
                      title={layerKey === "water" ? "Contour & Water" : layerKey === "soil" ? "Soil Profile" : layerKey.charAt(0).toUpperCase() + layerKey.slice(1)}
                      subtitle={layerKey === "soil" ? "Texture & horizon sketch" : "Primary layer"}
                      width={PLATE_W}
                      height={PLATE_H}
                      boundaryGeojson={property?.boundaryGeojson}
                      token={token}
                      zones={zones}
                      structures={structures}
                      sectors={sectors}
                      swales={swales}
                      pathways={pathways}
                      sensoryVectors={sensoryVectors}
                      layers={{ [layerKey]: true, boundary: true }}
                      onReady={(svg) => {
                        ensureRender(layerKey, svg);
                      }}
                      style={style}
                    >
                      {renders[layerKey] ? (
                        <img src={renders[layerKey]} alt={layerKey} style={{ width: "100%", height: "auto", borderRadius: 10, border: RULE }} />
                      ) : (
                        <div className="flex items-center justify-center rounded-lg border border-dashed" style={{ background: "#fbf8f2", borderColor: "#ddd6cc", height: PLATE_H * 0.35 }}>
                          <span style={{ color: "#a89880", fontSize: 12, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                            {rendering === layerKey ? "Rendering…" : "Ready when layers are saved"}
                          </span>
                        </div>
                      )}
                    </PlanPlate>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-4">
                <div className="rounded-xl bg-white" style={{ border: RULE, padding: 14 }}>
                  <div style={{ color: INK, fontSize: 12, fontWeight: 700, marginBottom: 8, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    Deliverable layers
                  </div>
                  <ul className="flex flex-col gap-2">
                    {required.map((layer) => (
                      <li key={layer} className="flex items-center justify-between gap-2" style={{ fontSize: 12, color: "#4a5042" }}>
                        <span>{layer === "water" ? "Contour & Water" : layer === "soil" ? "Soil Profile" : layer.charAt(0).toUpperCase() + layer.slice(1)}</span>
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: renders[layer] ? "#2d6a1e" : "#e4ddd2",
                            boxShadow: "0 0 0 1px rgba(44,36,22,0.06)",
                          }}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-xl bg-white" style={{ border: RULE, padding: 14 }}>
                  <div style={{ color: INK, fontSize: 12, fontWeight: 700, marginBottom: 8, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    How to use
                  </div>
                  <ol style={{ color: "#6b5f4e", fontSize: 12, lineHeight: 1.6, paddingLeft: 16, margin: 0 }}>
                    <li>Edit layers in the editor.</li>
                    <li>Switch render style.</li>
                    <li>Use renders in client proposals.</li>
                  </ol>
                </div>
              </div>
            </div>

            <div className="mt-6 py-4">
              <button
                onClick={() => navigate("/plans")}
                style={{ background: "none", border: "none", color: "#6b5f4e", cursor: "pointer", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em" }}
              >
                Continue editing in the plan studio →
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
