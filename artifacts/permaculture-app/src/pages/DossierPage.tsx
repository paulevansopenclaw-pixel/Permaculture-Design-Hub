import { useState } from "react";
import { Fingerprint } from "lucide-react";
import { useLocation } from "wouter";
import * as turf from "@turf/turf";
import {
  useGetProperty,
  useGetClientBrief,
  getGetPropertyQueryKey,
  getGetClientBriefQueryKey,
} from "@workspace/api-client-react";
import type { SiteAnalysisReport } from "@workspace/api-client-react";
import { useAppStore } from "@/store/useAppStore";
import { StepNav } from "@/components/StepNav";

// ─── Design Recommendations types ─────────────────────────────────────────────
interface PlantRec { name: string; latinName: string; layer: string; purpose: string; zones: string; notes: string; }
interface DesignElementRec { type: string; name: string; description: string; rationale: string; placement: string; priority: string; }
interface ImplPhase { phase: number; title: string; duration: string; elements: string[]; rationale: string; }
interface DesignRecsType { plantingPrinciples: string; plants: PlantRec[]; designElements: DesignElementRec[]; implementationPhases: ImplPhase[]; }

const TERRA = "#A0522D";

// ─── Mapbox Static API helper ──────────────────────────────────────────────────
function mapboxStaticUrl(
  boundaryGeojson: string | null | undefined,
  style: string,
  w = 640,
  h = 300,
  fillColor = "#A0522D",
): string | null {
  const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
  if (!token || !boundaryGeojson) return null;
  try {
    const parsed = JSON.parse(boundaryGeojson);
    const asFeature = (
      parsed.type === "Feature" ? parsed : { type: "Feature", geometry: parsed, properties: {} }
    ) as GeoJSON.Feature;
    const simplified = turf.simplify(asFeature as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>, {
      tolerance: 0.00008, highQuality: false,
    });
    const feature = {
      ...simplified,
      properties: {
        stroke: fillColor, "stroke-width": 3, "stroke-opacity": 1,
        fill: fillColor, "fill-opacity": 0.15,
      },
    };
    const encoded = encodeURIComponent(JSON.stringify(feature));
    const bbox = turf.bbox(asFeature);
    const bboxStr = `[${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]}]`;
    return `https://api.mapbox.com/styles/v1/mapbox/${style}/static/geojson(${encoded})/${bboxStr}/${w}x${h}@2x?padding=60&access_token=${token}`;
  } catch { return null; }
}

function PropertyMap({ boundaryGeojson, style, caption, fillColor }: {
  boundaryGeojson: string | null | undefined;
  style: string;
  caption?: string;
  fillColor?: string;
}) {
  const url = mapboxStaticUrl(boundaryGeojson, style, 640, 300, fillColor);
  if (!url) return null;
  return (
    <div style={{ pageBreakInside: "avoid", marginBottom: 16 }}>
      <img
        src={url}
        alt={caption ?? "Property map"}
        className="w-full"
        style={{ display: "block", border: "2px solid #111" }}
      />
      {caption && (
        <p className="mt-1.5 text-center font-mono text-[9px] uppercase tracking-widest" style={{ color: "#555" }}>
          {caption}
        </p>
      )}
    </div>
  );
}

function MapPlaceholder({ caption, message }: { caption?: string; message?: string }) {
  return (
    <div style={{ pageBreakInside: "avoid", marginBottom: 16 }}>
      <div
        className="w-full flex flex-col items-center justify-center gap-2"
        style={{ height: 180, border: "2px solid #111", background: "#f5f5f5" }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21,15 16,10 5,21" />
        </svg>
        <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "#888" }}>
          {message ?? "No boundary drawn on map yet"}
        </p>
      </div>
      {caption && (
        <p className="mt-1.5 text-center font-mono text-[9px] uppercase tracking-widest" style={{ color: "#888" }}>{caption}</p>
      )}
    </div>
  );
}

function DocPlaceholder({ message }: { message: string }) {
  return (
    <div className="px-4 py-3 flex items-center gap-3" style={{ border: "1px solid #ddd", background: "#fafafa" }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="2" style={{ flexShrink: 0 }}>
        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <p className="font-mono text-[10px] italic" style={{ color: "#999" }}>{message}</p>
    </div>
  );
}

// ─── Sun Sector Diagram ────────────────────────────────────────────────────────
function SunSectorDiagram({ lat, prevailingWind }: { lat?: number | null; prevailingWind?: string | null }) {
  const cx = 160, cy = 160, r = 112;
  const isNorthern = (lat ?? -33) >= 0;

  function toXY(compassDeg: number, radius: number): [number, number] {
    const rad = ((compassDeg - 90) * Math.PI) / 180;
    return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)];
  }

  function annularArc(start: number, end: number, r1: number, r2: number, la: 0 | 1, sw: 0 | 1): string {
    const [s1x, s1y] = toXY(start, r2); const [e1x, e1y] = toXY(end, r2);
    const [s2x, s2y] = toXY(start, r1); const [e2x, e2y] = toXY(end, r1);
    const rsw: 0 | 1 = sw === 0 ? 1 : 0;
    return `M${f(s1x)} ${f(s1y)} A${r2} ${r2} 0 ${la} ${sw} ${f(e1x)} ${f(e1y)} L${f(e2x)} ${f(e2y)} A${r1} ${r1} 0 ${la} ${rsw} ${f(s2x)} ${f(s2y)}Z`;
  }

  function f(n: number) { return n.toFixed(1); }

  const [sumS, sumE, sumLa, sumSw, winS, winE, winLa, winSw]: [number,number,0|1,0|1,number,number,0|1,0|1] =
    isNorthern ? [40, 320, 1, 1, 120, 240, 0, 1] : [120, 240, 1, 0, 65, 295, 0, 0];

  const windMap: Record<string, number> = {
    N:0,NNE:22,NE:45,ENE:67,E:90,ESE:112,SE:135,SSE:157,
    S:180,SSW:202,SW:225,WSW:247,W:270,WNW:292,NW:315,NNW:337,
  };
  const windKey = (prevailingWind ?? "").toUpperCase().replace(/[^A-Z]/g, "");
  const windDeg = windMap[windKey] ?? 270;

  const summerPath = annularArc(sumS, sumE, r * 0.52, r * 0.95, sumLa, sumSw);
  const winterPath = annularArc(winS, winE, r * 0.35, r * 0.52, winLa, winSw);
  const windPath   = annularArc(windDeg - 28, windDeg + 28, r * 0.28, r * 0.88, 0, 1);

  const compassPts = [
    { l: "N", d: 0 },{ l: "NE", d: 45 },{ l: "E", d: 90 },{ l: "SE", d: 135 },
    { l: "S", d: 180 },{ l: "SW", d: 225 },{ l: "W", d: 270 },{ l: "NW", d: 315 },
  ];

  const [nTx, nTy] = toXY(0, r * 0.48);
  const [nL1x, nL1y] = toXY(350, r * 0.38);
  const [nL2x, nL2y] = toXY(10, r * 0.38);

  return (
    <figure style={{ pageBreakInside: "avoid", marginBottom: 0 }}>
      <div style={{ border: "2px solid #111", display: "inline-block", width: "100%", maxWidth: 260 }}>
        <svg viewBox="0 0 320 320" style={{ width: "100%", height: "auto", display: "block" }}>
          <circle cx={cx} cy={cy} r={r + 42} fill="#0f172a" />
          {[0.35, 0.52, 0.75, 0.95].map((frac) => (
            <circle key={frac} cx={cx} cy={cy} r={r * frac} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="0.5" />
          ))}
          {[0, 45, 90, 135].map((d) => {
            const [x1, y1] = toXY(d, r * 0.95); const [x2, y2] = toXY(d + 180, r * 0.95);
            return <line key={d} x1={f(x1)} y1={f(y1)} x2={f(x2)} y2={f(y2)} stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />;
          })}
          <path d={windPath} fill="rgba(160,82,45,0.3)" stroke="#A0522D" strokeWidth="1.5" />
          <path d={winterPath} fill="rgba(96,165,250,0.32)" stroke="#60a5fa" strokeWidth="1" />
          <path d={summerPath} fill="rgba(251,191,36,0.32)" stroke="#fbbf24" strokeWidth="1.5" />
          <circle cx={cx} cy={cy} r={r * 0.28} fill="rgba(17,17,17,0.4)" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
          <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="8" fontWeight="bold" fontFamily="monospace">SITE</text>
          <polygon points={`${f(nTx)},${f(nTy)} ${f(nL1x)},${f(nL1y)} ${f(nL2x)},${f(nL2y)}`} fill="#f87171" />
          <circle cx={cx} cy={cy} r={r + 7} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
          {compassPts.map(({ l, d }) => {
            const [lx, ly] = toXY(d, r + 20);
            return (
              <text key={l} x={f(lx)} y={f(ly)} fill={d % 90 === 0 ? "white" : "rgba(255,255,255,0.5)"}
                fontSize={d % 90 === 0 ? 10 : 8} fontWeight={d % 90 === 0 ? "bold" : "normal"}
                textAnchor="middle" dominantBaseline="middle" fontFamily="monospace">{l}</text>
            );
          })}
          {windKey && (() => {
            const [lx, ly] = toXY(windDeg, r + 33);
            return <text x={f(lx)} y={f(ly)} fill="#A0522D" fontSize="9" textAnchor="middle" dominantBaseline="middle">💨</text>;
          })()}
        </svg>
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
        {[
          { color: "#fbbf24", label: "Summer sun" },
          { color: "#60a5fa", label: "Winter sun" },
          { color: "#A0522D", label: `Wind${windKey ? ` (${windKey})` : ""}` },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 8, height: 8, background: color, flexShrink: 0 }} />
            <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: "#555" }}>{label}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}

// ─── Soil Profile Visualisation ────────────────────────────────────────────────
function SoilProfileViz({ clay, sand, silt, ph, organicCarbon, textureClass }: {
  clay?: number | null; sand?: number | null; silt?: number | null;
  ph?: number | null; organicCarbon?: number | null; textureClass?: string | null;
}) {
  const rawTotal = (clay ?? 0) + (sand ?? 0) + (silt ?? 0);
  const total = rawTotal > 0 ? rawTotal : 100;
  const clayPct = rawTotal > 0 ? Math.round(((clay ?? 0) / total) * 100) : (clay ?? 30);
  const sandPct = rawTotal > 0 ? Math.round(((sand ?? 0) / total) * 100) : (sand ?? 40);
  const siltPct = rawTotal > 0 ? Math.round(100 - clayPct - sandPct) : (silt ?? 30);
  const phVal   = ph ?? 6.5;
  const ocVal   = organicCarbon ?? 0;
  const ocWidth = Math.min(100, Math.round(ocVal * 4));

  const horizons = [
    { label: "O", name: "Organic layer", depth: "0–5 cm",   fill: "#3d1f0a", h: 22 },
    { label: "A", name: "Topsoil",       depth: "5–30 cm",  fill: `hsl(25,${38 + clayPct * 0.5}%,${36 - clayPct * 0.12}%)`, h: 48 },
    { label: "B", name: "Subsoil",       depth: "30–80 cm", fill: `hsl(18,${28 + clayPct * 0.6}%,${32 - clayPct * 0.1}%)`, h: 56 },
    { label: "C", name: "Parent rock",   depth: "80+ cm",   fill: "#a89988", h: 34 },
  ];
  const colY = (i: number) => 8 + horizons.slice(0, i).reduce((acc, h) => acc + h.h + 2, 0);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "18px", alignItems: "start", pageBreakInside: "avoid" }}>
      <div>
        <p className="font-mono text-[9px] uppercase tracking-widest mb-1.5" style={{ color: "#888" }}>Soil Profile Column</p>
        <svg viewBox="0 0 160 180" style={{ width: "100%", height: "auto", border: "2px solid #111" }}>
          {horizons.map((hz, i) => {
            const y = colY(i);
            return (
              <g key={hz.label}>
                <rect x={18} y={y} width={55} height={hz.h} fill={hz.fill} />
                <text x={78} y={y + hz.h * 0.38} fontSize="8" fill="#111" dominantBaseline="middle" fontWeight="bold" fontFamily="monospace">{hz.label}</text>
                <text x={78} y={y + hz.h * 0.65} fontSize="7" fill="#555" dominantBaseline="middle" fontFamily="monospace">{hz.name}</text>
                <text x={14} y={y + 2} fontSize="6.5" fill="#888" textAnchor="end" dominantBaseline="hanging" fontFamily="monospace">{hz.depth.split("–")[0]}cm</text>
              </g>
            );
          })}
        </svg>
      </div>
      <div style={{ paddingTop: 18 }}>
        {textureClass && (
          <div className="mb-3">
            <p className="font-mono text-[9px] uppercase tracking-widest mb-0.5" style={{ color: "#888" }}>Texture Class</p>
            <p className="text-[15px] font-black tracking-tighter" style={{ color: "#111" }}>{textureClass}</p>
          </div>
        )}
        {rawTotal > 0 && (
          <div className="mb-3">
            <p className="font-mono text-[9px] uppercase tracking-widest mb-2" style={{ color: "#888" }}>Particle Composition</p>
            {[
              { label: "Clay",  pct: clayPct, color: "#A0522D", imp: "Water retention · structure" },
              { label: "Silt",  pct: siltPct, color: "#78716c", imp: "Nutrient holding · erosion risk" },
              { label: "Sand",  pct: sandPct, color: "#111",    imp: "Drainage · aeration" },
            ].map(({ label, pct, color, imp }) => (
              <div key={label} className="mb-2">
                <div className="flex justify-between mb-0.5">
                  <span className="font-mono text-[9px] uppercase tracking-widest font-bold" style={{ color: "#111" }}>{label}</span>
                  <span className="font-mono text-[9px]" style={{ color: TERRA }}>{pct}%</span>
                </div>
                <div style={{ height: 3, background: "#e5e5e5", marginBottom: 2 }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: color }} />
                </div>
                <p className="font-mono text-[8px]" style={{ color: "#888" }}>{imp}</p>
              </div>
            ))}
          </div>
        )}
        {ph != null && (
          <div className="mb-3">
            <div className="flex justify-between mb-1">
              <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: "#888" }}>Soil pH</span>
              <span className="font-mono text-[11px] font-black" style={{ color: TERRA }}>{ph}</span>
            </div>
            <div style={{ height: 5, background: "linear-gradient(to right,#ef4444,#f97316,#facc15,#22c55e,#60a5fa,#8b5cf6)", position: "relative" }}>
              <div style={{
                position: "absolute", top: -3, width: 5, height: 11,
                background: "white", border: "1.5px solid #111",
                left: `${Math.max(2, Math.min(96, ((phVal - 4) / 6) * 100))}%`,
                transform: "translateX(-50%)",
              }} />
            </div>
            <div className="flex justify-between font-mono text-[7px] mt-1" style={{ color: "#888" }}>
              <span>Acid 4</span><span>Neutral 7</span><span>Alkaline 10</span>
            </div>
          </div>
        )}
        {ocVal > 0 && (
          <div>
            <div className="flex justify-between mb-1">
              <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: "#888" }}>Organic Carbon</span>
              <span className="font-mono text-[9px] font-black" style={{ color: TERRA }}>{organicCarbon} g/kg</span>
            </div>
            <div style={{ height: 3, background: "#e5e5e5", marginBottom: 4 }}>
              <div style={{ height: "100%", width: `${ocWidth}%`, background: TERRA }} />
            </div>
            <p className="font-mono text-[8px]" style={{ color: "#888" }}>
              {ocVal < 8 ? "Low — prioritise compost & mulching" : ocVal < 18 ? "Moderate — build with chop-and-drop & cover crops" : "High — excellent organic matter foundation"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DossierPage() {
  const [, navigate] = useLocation();
  const { activePropertyId, role } = useAppStore();
  const [linkCopied, setLinkCopied] = useState(false);

  function handleGenerateLink() {
    if (!activePropertyId) return;
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    const url = `${window.location.origin}${base}/presentation/${activePropertyId}`;
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    });
  }

  const { data: property } = useGetProperty(activePropertyId ?? "", {
    query: { enabled: !!activePropertyId, queryKey: getGetPropertyQueryKey(activePropertyId ?? "") },
  });
  const { data: brief } = useGetClientBrief(activePropertyId ?? "", {
    query: { enabled: !!activePropertyId, queryKey: getGetClientBriefQueryKey(activePropertyId ?? "") },
  });

  const aiReport: SiteAnalysisReport | null = (() => {
    if (!brief?.aiAnalysisReport) return null;
    try { return JSON.parse(brief.aiAnalysisReport); } catch { return null; }
  })();

  const moodImages = (brief?.moodBoardImages as string[] | null | undefined) ?? [];

  const boundaryCentroid = (() => {
    const bg = property?.boundaryGeojson as unknown as string | null | undefined;
    if (!bg) return null;
    try {
      const geo = JSON.parse(bg);
      const c = turf.centroid(geo as Parameters<typeof turf.centroid>[0]);
      return c.geometry.coordinates as [number, number];
    } catch { return null; }
  })();
  const siteLat = boundaryCentroid?.[1] ?? null;

  const today = new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });

  function handleExport() { window.print(); }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#111" }}>

      {/* ── TOP BAR (hidden on print) ── */}
      <header
        className="print:hidden shrink-0 flex items-center justify-between px-5 py-3 sticky top-0 z-20"
        style={{ background: "#111", borderBottom: "2px solid #333" }}
      >
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/properties")}
            className="flex items-center gap-2 transition-opacity hover:opacity-70"
            style={{ color: "#fff" }}
          >
            <span className="text-base">🛡</span>
            <span className="font-mono text-[11px] font-bold uppercase tracking-widest hidden sm:inline">TerraGuard</span>
          </button>
          <div className="w-px h-4 hidden sm:block" style={{ background: "#444" }} />
          <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: TERRA }}>
            Export Studio
          </span>
        </div>
        <div className="flex items-center gap-2">
          <StepNav />
          <button
            onClick={handleGenerateLink}
            disabled={!activePropertyId}
            className="flex items-center gap-1.5 px-3 py-2 font-mono text-[11px] uppercase tracking-widest transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={linkCopied
              ? { background: TERRA, color: "#fff", border: `2px solid ${TERRA}` }
              : { background: "transparent", color: "#aaa", border: "2px solid #444" }
            }
          >
            {linkCopied ? (
              <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20,6 9,17 4,12"/></svg>Copied</>
            ) : (
              <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>Client Link</>
            )}
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 font-mono text-[11px] uppercase tracking-widest font-bold transition-all"
            style={{ background: "#fff", color: "#111", border: "2px solid #fff" }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export PDF
          </button>
        </div>
      </header>

      {/* ── NO PROPERTY ── */}
      {!activePropertyId && (
        <div className="flex-1 flex items-center justify-center p-8 print:hidden">
          <div className="text-center space-y-3">
            <div className="text-4xl">📄</div>
            <h3 className="text-base font-black tracking-tighter" style={{ color: "#fff" }}>No property selected</h3>
            <p className="font-mono text-[11px] uppercase tracking-widest" style={{ color: "#666" }}>Complete the intake and analysis steps first.</p>
            <button
              onClick={() => navigate("/intake")}
              className="mt-2 px-5 py-2.5 font-mono text-[11px] uppercase tracking-widest font-bold transition-colors"
              style={{ background: "transparent", color: "#fff", border: "2px solid #fff" }}
            >
              ← Start at Intake
            </button>
          </div>
        </div>
      )}

      {/* ── DOCUMENT ── */}
      {activePropertyId && (
        <main className="flex-1 px-4 py-10">
          <div className="mx-auto max-w-3xl bg-white print:shadow-none" style={{ boxShadow: "0 0 0 2px #111, 0 8px 40px rgba(0,0,0,0.5)" }}>

            {/* Engineering title block */}
            <div style={{ borderBottom: "4px solid #111" }}>
              {/* Top rule row */}
              <div className="px-10 pt-8 pb-0 flex items-start justify-between gap-4">
                <div style={{ flex: 1 }}>
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-xl">🛡</span>
                    <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: TERRA }}>
                      TerraGuard OS · Property Resilience Dossier
                    </span>
                  </div>
                  <h1 className="text-4xl font-black tracking-tighter leading-none" style={{ color: "#111" }}>
                    {property?.name ?? "Property Resilience Dossier"}
                  </h1>
                  <div className="mt-2 font-mono text-[10px] uppercase tracking-widest" style={{ color: "#888" }}>
                    Autonomous Site Report
                  </div>
                </div>
                {/* Title block metadata — right column */}
                <div
                  className="shrink-0 ml-4"
                  style={{ borderLeft: "2px solid #111", paddingLeft: 16, minWidth: 120 }}
                >
                  {(property?.areaHectares ?? 0) > 0 && (
                    <div style={{ borderBottom: "1px solid #ddd", paddingBottom: 8, marginBottom: 8 }}>
                      <div className="font-mono text-[8px] uppercase tracking-widest mb-0.5" style={{ color: "#888" }}>Area</div>
                      <div className="text-2xl font-black tracking-tighter" style={{ color: TERRA }}>{property?.areaHectares?.toFixed(2)}</div>
                      <div className="font-mono text-[8px] uppercase" style={{ color: "#888" }}>hectares</div>
                    </div>
                  )}
                  <div>
                    <div className="font-mono text-[8px] uppercase tracking-widest mb-0.5" style={{ color: "#888" }}>Generated</div>
                    <div className="font-mono text-[9px] font-bold" style={{ color: "#111" }}>{today}</div>
                  </div>
                </div>
              </div>
              {/* Bottom rule under header text */}
              <div style={{ height: 2, background: "#111", margin: "16px 0 0 0" }} />
            </div>

            {/* Satellite map — full bleed, sharp border */}
            {property?.boundaryGeojson ? (
              <div style={{ borderBottom: "2px solid #111" }}>
                <PropertyMap
                  boundaryGeojson={property.boundaryGeojson as unknown as string}
                  style="satellite-streets-v12"
                  fillColor={TERRA}
                />
              </div>
            ) : (
              <div style={{ borderBottom: "2px solid #111" }}>
                <MapPlaceholder caption="Property satellite overview" message="No boundary drawn — open the Map workspace to outline your property" />
              </div>
            )}

            {/* Document body */}
            <div className="px-10 py-8 space-y-12">

              {/* No brief warning */}
              {!brief && (
                <div style={{ borderLeft: "4px solid #111", paddingLeft: 16 }}>
                  <p className="font-black tracking-tighter" style={{ color: "#111" }}>Site survey not completed</p>
                  <p className="font-mono text-[10px] uppercase tracking-widest mt-0.5" style={{ color: "#888" }}>Complete the intake survey to populate this dossier.</p>
                </div>
              )}

              {brief && (
                <>
                  {/* ── Site Profile ── */}
                  <DocSection title="01 · Site Profile">
                    <div className="grid grid-cols-2 gap-x-10 gap-y-4">
                      <DocField label="Climate zone" value={brief.climateZone ?? "—"} />
                      <DocField label="Elevation" value={brief.elevationM != null ? `${brief.elevationM} m ASL` : "—"} />
                      <DocField label="Annual rainfall" value={brief.annualRainfallMm != null ? `${brief.annualRainfallMm.toLocaleString()} mm` : "—"} />
                      <DocField label="Humidity" value={brief.annualHumidityPct != null ? `${brief.annualHumidityPct}%` : "—"} />
                      <DocField label="Mean temp" value={brief.meanAnnualTempC != null ? `${brief.meanAnnualTempC} °C` : "—"} />
                      <DocField label="Summer max" value={brief.summerMaxTempC != null ? `${brief.summerMaxTempC} °C` : "—"} />
                      <DocField label="Winter min" value={brief.winterMinTempC != null ? `${brief.winterMinTempC} °C` : "—"} />
                      {brief.frostDaysPerYear != null && <DocField label="Frost days" value={`${brief.frostDaysPerYear} days/yr`} />}
                      {brief.solarIrradianceKwhM2 != null && <DocField label="Solar irradiance" value={`${brief.solarIrradianceKwhM2.toLocaleString()} kWh/m²/yr`} />}
                      {brief.prevailingWindDir && <DocField label="Prevailing wind" value={brief.prevailingWindDir} />}
                      {brief.meanWindSpeedMs != null && <DocField label="Wind speed" value={`${brief.meanWindSpeedMs} m/s`} />}
                    </div>
                  </DocSection>

                  {/* ── Soil ── */}
                  <DocSection title="02 · Soil Analysis (0–5 cm)">
                    <SoilProfileViz
                      clay={brief.soilClay} sand={brief.soilSand} silt={brief.soilSilt}
                      ph={brief.soilPH} organicCarbon={brief.soilOrganicCarbonGkg}
                      textureClass={brief.soilTextureClass}
                    />
                    {!(brief.soilClay || brief.soilSand || brief.soilPH) && (
                      <div className="mt-4">
                        <DocPlaceholder message="Soil sample data not yet recorded. Complete the intake survey — SoilGrids will auto-populate clay, sand, silt, pH and organic carbon." />
                      </div>
                    )}
                  </DocSection>

                  {/* ── Design Goals ── */}
                  <DocSection title="03 · Design Goals">
                    <div className="grid grid-cols-2 gap-x-10 gap-y-4">
                      <DocField label="Primary goal" value={brief.primaryGoal ?? "—"} />
                      <DocField label="Maintenance capacity" value={brief.maintenanceCapacity ?? "—"} />
                    </div>
                  </DocSection>

                  {/* ── Mood Board ── */}
                  <DocSection title="04 · Client Vision Board">
                    {moodImages.length === 0 ? (
                      <p className="font-mono text-[10px] italic" style={{ color: "#888" }}>
                        No vision board photos uploaded yet. Ask the client to add inspiration photos via the Intake page.
                      </p>
                    ) : (
                      <div className="grid grid-cols-3 gap-2 mb-4">
                        {moodImages.map((src, i) => (
                          <div key={i} style={{ aspectRatio: "4/3", border: "2px solid #111", overflow: "hidden", background: "#f5f5f5" }}>
                            <img src={src} alt={`Mood board ${i + 1}`} className="w-full h-full object-cover" />
                          </div>
                        ))}
                      </div>
                    )}
                    {role === "designer" && (
                      <div className="print:hidden mt-4 px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3" style={{ border: "2px solid #111", background: "#f9f9f9" }}>
                        <div>
                          <p className="font-black tracking-tighter text-[13px]" style={{ color: "#111" }}>AI Concept Renders</p>
                          <p className="font-mono text-[10px] mt-0.5" style={{ color: "#888" }}>
                            Generate photorealistic concept renders from the client's mood board using Google Imagen.
                          </p>
                        </div>
                        <button
                          onClick={() => { }}
                          className="shrink-0 flex items-center gap-2 px-5 py-2.5 font-mono text-[11px] uppercase tracking-widest font-bold transition-colors"
                          style={{ background: "#111", color: "#fff", border: "2px solid #111" }}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <polygon points="13,2 3,14 12,14 11,22 21,10 12,10 13,2" />
                          </svg>
                          Generate Renders
                        </button>
                      </div>
                    )}
                  </DocSection>

                  {/* ── Pattern Strategy ── */}
                  {aiReport?.PatternStrategy ? (
                    <DocPatternStrategy pattern={aiReport.PatternStrategy as { recommendedPattern?: string; rationale?: string; application?: string }} />
                  ) : (
                    <DocSection title="05 · Pattern Strategy">
                      <DocPlaceholder message="Run the AI resilience analysis to generate the recommended nature-based design pattern for this site." />
                    </DocSection>
                  )}

                  {/* ── Infrastructure & Constraints ── */}
                  {(brief.utilitiesOverheadPower || brief.utilitiesBuriedPipes || brief.utilitiesLegalEasements || brief.utilitiesActiveWell || brief.challengeSevereErosion || brief.challengeWinterFlooding || brief.challengeHighWind || brief.challengeWildlifePressure) && (
                    <DocSection title="06 · Infrastructure &amp; Constraints">
                      <div className="grid grid-cols-2 gap-x-10 gap-y-4">
                        {brief.utilitiesOverheadPower && <DocField label="Overhead power" value="Present" />}
                        {brief.utilitiesBuriedPipes && <DocField label="Buried pipes" value="Present" />}
                        {brief.utilitiesLegalEasements && <DocField label="Legal easements" value="Present" />}
                        {brief.utilitiesActiveWell && <DocField label="Active well" value="Present" />}
                        {brief.challengeSevereErosion && <DocField label="Severe erosion" value="Confirmed" />}
                        {brief.challengeWinterFlooding && <DocField label="Winter flooding" value="Confirmed" />}
                        {brief.challengeHighWind && <DocField label="High wind exposure" value="Confirmed" />}
                        {brief.challengeWildlifePressure && <DocField label="Wildlife pressure" value="Confirmed" />}
                      </div>
                    </DocSection>
                  )}

                  {/* ── AI Resilience Analysis ── */}
                  {aiReport ? (
                    <DocSection title="07 · AI Resilience Analysis">
                      {brief.aiAnalysisGeneratedAt && (
                        <p className="font-mono text-[9px] uppercase tracking-widest mb-6" style={{ color: "#888" }}>
                          Generated {new Date(brief.aiAnalysisGeneratedAt).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}
                        </p>
                      )}
                      <div className="space-y-0" style={{ border: "2px solid #111" }}>
                        {[
                          { key: "WaterStrategy",          title: "Water Strategy",          num: "A" },
                          { key: "SunAndEnergy",           title: "Sun & Energy",            num: "B" },
                          { key: "SoilAndFertility",       title: "Soil & Fertility",        num: "C" },
                          { key: "LandAndBiodiversity",    title: "Land & Biodiversity",     num: "D" },
                          { key: "ClimateResilience",      title: "Climate Resilience",      num: "E" },
                          { key: "InfrastructureCritique", title: "Infrastructure Critique", num: "F" },
                        ].map(({ key, title, num }, idx, arr) => {
                          const val = aiReport ? (aiReport as unknown as Record<string, unknown>)[key] : undefined;
                          const isMissing = val === undefined || val === null;
                          const isLast = idx === arr.length - 1;

                          let visualPanel: React.ReactNode = null;
                          if (key === "WaterStrategy") {
                            visualPanel = (
                              <div className="px-6 pt-4" style={{ borderBottom: "1px solid #e5e5e5" }}>
                                {property?.boundaryGeojson ? (
                                  <PropertyMap boundaryGeojson={property.boundaryGeojson as unknown as string} style="outdoors-v12" fillColor="#3b6ea5" caption="Terrain & contour map — water flows perpendicular to contour lines, from high to low ground" />
                                ) : (
                                  <MapPlaceholder caption="Terrain & contour map" />
                                )}
                                <div className="mb-4 pl-3 py-1 font-mono text-[9px] leading-relaxed" style={{ borderLeft: "3px solid #111", color: "#555" }}>
                                  <strong style={{ color: "#111" }}>Reading the map: </strong>Contour lines show elevation — water flows perpendicular to them. Swales follow contour lines; dams sit at valley heads below natural catchment areas.
                                </div>
                              </div>
                            );
                          } else if (key === "SunAndEnergy") {
                            visualPanel = (
                              <div className="px-6 pt-4" style={{ borderBottom: "1px solid #e5e5e5" }}>
                                <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 20, alignItems: "start" }}>
                                  <SunSectorDiagram lat={siteLat} prevailingWind={brief?.prevailingWindDir} />
                                  <div style={{ paddingTop: 4 }}>
                                    <p className="font-mono text-[9px] uppercase tracking-widest font-bold mb-3" style={{ color: "#888" }}>How to read</p>
                                    <ul className="font-mono text-[9px] leading-relaxed space-y-1" style={{ color: "#555", margin: 0, paddingLeft: 12 }}>
                                      <li><strong style={{ color: "#111" }}>Amber band</strong> — summer sun zone</li>
                                      <li><strong style={{ color: "#111" }}>Blue band</strong> — winter sun zone</li>
                                      <li><strong style={{ color: TERRA }}>Orange wedge</strong> — prevailing wind sector</li>
                                      <li><strong style={{ color: "#111" }}>Red pointer</strong> — true north</li>
                                    </ul>
                                    {brief?.solarIrradianceKwhM2 != null && (
                                      <div className="mt-4 p-3" style={{ border: "2px solid #111" }}>
                                        <p className="font-mono text-[8px] uppercase tracking-widest" style={{ color: "#888" }}>Solar irradiance</p>
                                        <p className="text-xl font-black tracking-tighter mt-0.5" style={{ color: TERRA }}>{brief.solarIrradianceKwhM2.toLocaleString()} <span className="text-[11px]">kWh/m²/yr</span></p>
                                        <p className="font-mono text-[8px] mt-0.5" style={{ color: "#888" }}>
                                          {brief.solarIrradianceKwhM2 >= 1600 ? "Excellent PV potential" : brief.solarIrradianceKwhM2 >= 1200 ? "Good PV potential" : "Moderate PV potential"}
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="mt-4 mb-4" />
                              </div>
                            );
                          } else if (key === "SoilAndFertility") {
                            const hasSoilData = brief?.soilClay != null || brief?.soilSand != null || brief?.soilPH != null;
                            visualPanel = (
                              <div className="px-6 pt-4" style={{ borderBottom: "1px solid #e5e5e5" }}>
                                {hasSoilData ? (
                                  <SoilProfileViz clay={brief?.soilClay} sand={brief?.soilSand} silt={brief?.soilSilt} ph={brief?.soilPH} organicCarbon={brief?.soilOrganicCarbonGkg} textureClass={brief?.soilTextureClass} />
                                ) : (
                                  <DocPlaceholder message="Soil sample data not yet recorded. Complete the intake survey." />
                                )}
                                <div className="mt-4">
                                  {property?.boundaryGeojson ? (
                                    <PropertyMap boundaryGeojson={property.boundaryGeojson as unknown as string} style="satellite-v9" fillColor={TERRA} caption="Satellite view — vegetation density & colour variation indicate soil moisture & organic matter zones" />
                                  ) : (
                                    <MapPlaceholder caption="Property satellite view" />
                                  )}
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div key={key} style={{ borderBottom: isLast ? "none" : "2px solid #111" }}>
                              {/* Section header row */}
                              <div
                                className="px-6 py-3 flex items-center gap-4"
                                style={{ borderBottom: "1px solid #e5e5e5", background: "#f9f9f9" }}
                              >
                                <span className="font-mono text-[11px] font-black" style={{ color: TERRA }}>{num}</span>
                                <span className="font-black tracking-tighter text-[12px]" style={{ color: "#111" }}>{title}</span>
                              </div>
                              {visualPanel}
                              <div className="px-6 py-4 font-mono text-[11px] leading-relaxed" style={{ color: "#333" }}>
                                {isMissing ? (
                                  <DocPlaceholder message="Run the AI resilience analysis in the War Room to generate this section." />
                                ) : typeof val === "string" ? (
                                  <p className="whitespace-pre-wrap">{val}</p>
                                ) : Array.isArray(val) ? (
                                  <AiTableDoc rows={val} />
                                ) : (
                                  <AiObjectDoc obj={val as Record<string, unknown>} />
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </DocSection>
                  ) : (
                    <DocSection title="07 · AI Resilience Analysis">
                      <p className="font-mono text-[10px] italic mb-4" style={{ color: "#888" }}>
                        No analysis run yet. Go to The War Room to generate the AI resilience report.
                      </p>
                      <button
                        onClick={() => navigate("/analysis")}
                        className="print:hidden px-4 py-2 font-mono text-[11px] uppercase tracking-widest font-bold"
                        style={{ background: "#111", color: "#fff", border: "2px solid #111" }}
                      >
                        Run Analysis →
                      </button>
                    </DocSection>
                  )}
                </>
              )}

              {/* ── Design Recommendations ── */}
              <DocDesignRecommendations designRecs={
                aiReport ? (aiReport as unknown as Record<string, unknown>)["DesignRecommendations"] as DesignRecsType | undefined : undefined
              } />

              {/* Document footer — title-block style */}
              <div
                className="flex items-center justify-between pt-4"
                style={{ borderTop: "2px solid #111", marginTop: 16 }}
              >
                <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: "#888" }}>
                  TerraGuard OS · Autonomous Property Resilience Platform
                </span>
                <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: "#888" }}>{today}</span>
              </div>
            </div>
          </div>

          {/* Bottom nav */}
          <div className="print:hidden mt-6 mx-auto max-w-3xl flex items-center justify-between">
            <button
              onClick={() => navigate("/analysis")}
              className="font-mono text-[11px] uppercase tracking-widest px-3 py-1.5 transition-colors"
              style={{ background: "transparent", color: "#888", border: "2px solid #444" }}
            >
              ← Analysis
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-5 py-2.5 font-mono text-[11px] uppercase tracking-widest font-bold"
              style={{ background: "#fff", color: "#111", border: "2px solid #fff" }}
            >
              Export PDF
            </button>
          </div>
        </main>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function DocPatternStrategy({ pattern }: { pattern: { recommendedPattern?: string; rationale?: string; application?: string } }) {
  return (
    <section>
      <div className="flex items-center gap-3 mb-4" style={{ borderBottom: "2px solid #111", paddingBottom: 8 }}>
        <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: TERRA }}>05</span>
        <h2 className="text-xs font-black uppercase tracking-widest" style={{ color: "#111" }}>Pattern Strategy</h2>
      </div>
      <div style={{ border: "2px solid #111" }}>
        {pattern.recommendedPattern && (
          <div className="px-6 py-5 flex items-center gap-4" style={{ background: "#111", borderBottom: "2px solid #111" }}>
            <Fingerprint size={18} strokeWidth={1.8} style={{ color: TERRA, flexShrink: 0 }} />
            <div>
              <div className="font-mono text-[8px] uppercase tracking-widest mb-0.5" style={{ color: TERRA }}>Recommended Pattern</div>
              <div className="text-2xl font-black tracking-tighter leading-tight" style={{ color: "#fff" }}>
                {pattern.recommendedPattern}
              </div>
            </div>
          </div>
        )}
        <div className="px-6 py-6 space-y-6" style={{ background: "#fff" }}>
          {pattern.rationale && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div style={{ width: 3, height: 18, background: TERRA, flexShrink: 0 }} />
                <span className="font-mono text-[9px] uppercase tracking-widest font-bold" style={{ color: TERRA }}>
                  Why Nature Uses This Form
                </span>
              </div>
              <p className="font-mono text-[11px] leading-relaxed" style={{ color: "#333" }}>{pattern.rationale}</p>
            </div>
          )}
          {pattern.application && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div style={{ width: 3, height: 18, background: "#111", flexShrink: 0 }} />
                <span className="font-mono text-[9px] uppercase tracking-widest font-bold" style={{ color: "#888" }}>
                  Site Application
                </span>
              </div>
              <p className="font-mono text-[11px] leading-relaxed" style={{ color: "#333" }}>{pattern.application}</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function DocSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center gap-3 mb-5" style={{ borderBottom: "2px solid #111", paddingBottom: 8 }}>
        <h2 className="text-xs font-black uppercase tracking-widest" style={{ color: "#111" }}>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function DocField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5" style={{ borderBottom: "1px solid #e5e5e5", paddingBottom: 8 }}>
      <span className="font-mono text-[8px] uppercase tracking-widest" style={{ color: "#888" }}>{label}</span>
      <span className="text-[15px] font-black tracking-tighter" style={{ color: "#111" }}>{value}</span>
    </div>
  );
}

function AiTableDoc({ rows }: { rows: unknown[] }) {
  if (!rows.length) return null;
  const first = rows[0];
  if (typeof first !== "object" || first === null) {
    return (
      <ul className="space-y-1 font-mono text-[10px]" style={{ color: "#333", paddingLeft: 16 }}>
        {rows.map((r, i) => <li key={i} style={{ listStyle: "none", borderLeft: "2px solid #ddd", paddingLeft: 8 }}>{String(r)}</li>)}
      </ul>
    );
  }
  const keys = Object.keys(first as object);
  return (
    <table className="w-full font-mono text-[10px]" style={{ borderCollapse: "collapse", border: "2px solid #111" }}>
      <thead>
        <tr style={{ background: "#111" }}>
          {keys.map((k) => (
            <th key={k} className="text-left px-3 py-2 font-bold uppercase tracking-widest text-[8px]" style={{ color: "#fff", borderRight: "1px solid #333" }}>{k}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} style={{ borderBottom: "1px solid #e5e5e5", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
            {keys.map((k) => (
              <td key={k} className="px-3 py-2 align-top" style={{ color: "#333", borderRight: "1px solid #e5e5e5" }}>
                {String((row as Record<string, unknown>)[k] ?? "")}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AiObjectDoc({ obj }: { obj: Record<string, unknown> | null | undefined }) {
  if (obj == null || typeof obj !== "object" || Array.isArray(obj)) return null;
  return (
    <div className="space-y-3">
      {Object.entries(obj).map(([key, val]) => (
        <div key={key}>
          <div className="font-mono text-[8px] uppercase tracking-widest mb-1 font-bold" style={{ color: "#888" }}>{key}</div>
          {Array.isArray(val) ? (
            <AiTableDoc rows={val} />
          ) : typeof val === "object" && val !== null ? (
            <AiObjectDoc obj={val as Record<string, unknown>} />
          ) : (
            <p className="font-mono text-[10px]" style={{ color: "#333" }}>{String(val)}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Layer accent — monochrome with terracotta for key layers ──────────────────
const LAYER_ACCENTS: Record<string, { border: string; dot: string }> = {
  Canopy:         { border: "#111",    dot: "#111" },
  Understory:     { border: "#333",    dot: "#333" },
  Shrub:          { border: "#555",    dot: "#555" },
  Herbaceous:     { border: "#777",    dot: "#777" },
  "Ground Cover": { border: "#999",    dot: "#999" },
  Vine:           { border: "#bbb",    dot: "#bbb" },
  Root:           { border: TERRA,     dot: TERRA  },
};

const PRIORITY_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  High:   { bg: "#fff",    text: "#111",  border: "#111" },
  Medium: { bg: "#fafafa", text: TERRA,   border: TERRA  },
  Low:    { bg: "#fafafa", text: "#888",  border: "#bbb" },
};

function DocDesignRecommendations({ designRecs }: { designRecs: DesignRecsType | null | undefined }) {
  const hasPrinciples = !!designRecs?.plantingPrinciples;
  const plants   = Array.isArray(designRecs?.plants)               ? designRecs!.plants               : [];
  const elements = Array.isArray(designRecs?.designElements)       ? designRecs!.designElements       : [];
  const phases   = Array.isArray(designRecs?.implementationPhases) ? designRecs!.implementationPhases : [];

  const LAYER_ORDER = ["Canopy","Understory","Shrub","Herbaceous","Ground Cover","Vine","Root"];
  const grouped = LAYER_ORDER.reduce<Record<string, PlantRec[]>>((acc, l) => {
    const m = plants.filter(p => p.layer === l);
    if (m.length) acc[l] = m;
    return acc;
  }, {});
  plants.filter(p => !LAYER_ORDER.includes(p.layer)).forEach(p => {
    grouped[p.layer] = [...(grouped[p.layer] ?? []), p];
  });

  return (
    <section style={{ pageBreakBefore: "always" }}>
      <div className="flex items-center gap-3 mb-6" style={{ borderBottom: "4px solid #111", paddingBottom: 8 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={TERRA} strokeWidth="2.5" className="shrink-0">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        <h2 className="text-xl font-black tracking-tighter" style={{ color: "#111" }}>Final Design Recommendations</h2>
      </div>

      {!designRecs ? (
        <DocPlaceholder message="Run the AI resilience analysis in the War Room to generate the plant palette, design elements, and implementation plan for this property." />
      ) : (
        <div className="space-y-12">

          {/* Planting philosophy */}
          {hasPrinciples && (
            <div style={{ borderLeft: "4px solid #111", paddingLeft: 16 }}>
              <p className="font-mono text-[9px] uppercase tracking-widest font-bold mb-2" style={{ color: TERRA }}>Planting Philosophy</p>
              <p className="font-mono text-[11px] leading-relaxed" style={{ color: "#333" }}>{designRecs.plantingPrinciples}</p>
            </div>
          )}

          {/* Plant palette */}
          <div>
            <div className="flex items-baseline justify-between mb-4" style={{ borderBottom: "2px solid #111", paddingBottom: 4 }}>
              <h3 className="font-mono text-[9px] uppercase tracking-widest font-black" style={{ color: "#111" }}>Plant Palette</h3>
              <span className="font-mono text-[9px]" style={{ color: TERRA }}>{plants.length} species · {Object.keys(grouped).length} layers</span>
            </div>
            {plants.length === 0 ? (
              <DocPlaceholder message="No plant data generated yet." />
            ) : (
              <div className="space-y-3">
                {Object.entries(grouped).map(([layer, layerPlants]) => {
                  const accent = LAYER_ACCENTS[layer] ?? { border: "#888", dot: "#888" };
                  return (
                    <div key={layer} style={{ border: "2px solid #111", borderLeft: `5px solid ${accent.border}`, overflow: "hidden" }}>
                      <div className="px-4 py-2 flex items-center gap-3" style={{ background: "#111", borderBottom: "1px solid #222" }}>
                        <div style={{ width: 7, height: 7, background: accent.dot, flexShrink: 0 }} />
                        <span className="font-mono text-[9px] uppercase tracking-widest font-bold" style={{ color: "#fff" }}>
                          {layer} — {layerPlants.length} species
                        </span>
                      </div>
                      <table className="w-full bg-white font-mono" style={{ borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ background: "#f9f9f9", borderBottom: "1px solid #e5e5e5" }}>
                            {["Common name","Latin name","Purpose","Zone","Notes"].map(h => (
                              <th key={h} className="px-3 py-1.5 text-left font-bold uppercase text-[8px] tracking-widest" style={{ color: "#888" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {layerPlants.map((plant, i) => (
                            <tr key={i} style={{ borderBottom: "1px solid #f0f0f0" }}>
                              <td className="px-3 py-2 text-[10px] font-bold" style={{ color: "#111" }}>{plant.name}</td>
                              <td className="px-3 py-2 text-[9px] italic" style={{ color: "#888" }}>{plant.latinName}</td>
                              <td className="px-3 py-2 text-[9px]" style={{ color: "#555" }}>{plant.purpose}</td>
                              <td className="px-3 py-2 text-[9px] font-bold whitespace-nowrap" style={{ color: TERRA }}>{plant.zones}</td>
                              <td className="px-3 py-2 text-[9px]" style={{ color: "#888" }}>{plant.notes}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Design elements */}
          <div>
            <div className="flex items-baseline justify-between mb-4" style={{ borderBottom: "2px solid #111", paddingBottom: 4 }}>
              <h3 className="font-mono text-[9px] uppercase tracking-widest font-black" style={{ color: "#111" }}>Design Elements</h3>
              <span className="font-mono text-[9px]" style={{ color: TERRA }}>{elements.length} infrastructure components</span>
            </div>
            {elements.length === 0 ? (
              <DocPlaceholder message="No design elements generated yet." />
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {elements.map((el, i) => {
                  const ps = PRIORITY_STYLES[el.priority] ?? { bg: "#fafafa", text: "#888", border: "#bbb" };
                  return (
                    <div key={i} style={{ border: "2px solid #111", overflow: "hidden", background: "#fff" }}>
                      <div className="px-4 py-2.5 flex items-start justify-between gap-2" style={{ background: "#f9f9f9", borderBottom: "1px solid #e5e5e5" }}>
                        <div>
                          <p className="font-black tracking-tighter text-[11px]" style={{ color: "#111" }}>{el.name}</p>
                          <p className="font-mono text-[8px] uppercase tracking-widest mt-0.5" style={{ color: "#888" }}>{el.type}</p>
                        </div>
                        <span
                          className="shrink-0 mt-0.5 px-2 py-0.5 font-mono text-[8px] font-bold uppercase tracking-widest"
                          style={{ background: ps.bg, color: ps.text, border: `2px solid ${ps.border}` }}
                        >
                          {el.priority}
                        </span>
                      </div>
                      <div className="px-4 py-3 space-y-1.5">
                        <p className="font-mono text-[9px] leading-relaxed" style={{ color: "#555" }}>{el.description}</p>
                        {el.placement && (
                          <p className="font-mono text-[9px]">
                            <span className="font-bold" style={{ color: TERRA }}>Placement: </span>
                            <span style={{ color: "#888" }}>{el.placement}</span>
                          </p>
                        )}
                        {el.rationale && (
                          <p className="font-mono text-[9px] italic" style={{ color: "#aaa" }}>{el.rationale}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Implementation roadmap */}
          <div>
            <div className="mb-5" style={{ borderBottom: "2px solid #111", paddingBottom: 4 }}>
              <h3 className="font-mono text-[9px] uppercase tracking-widest font-black" style={{ color: "#111" }}>Implementation Roadmap</h3>
            </div>
            {phases.length === 0 ? (
              <DocPlaceholder message="No implementation phases generated yet." />
            ) : (
              <div className="relative">
                <div className="absolute top-0 bottom-0" style={{ left: 20, width: 2, background: "#111" }} />
                <div className="space-y-4 pl-12">
                  {phases.map((ph, i) => (
                    <div key={i} className="relative">
                      <div
                        className="absolute flex items-center justify-center font-mono text-[9px] font-black"
                        style={{
                          left: -39, top: 8, width: 24, height: 24,
                          background: TERRA, color: "#fff",
                          border: "2px solid #fff", outline: `2px solid ${TERRA}`,
                        }}
                      >
                        {ph.phase}
                      </div>
                      <div style={{ border: "2px solid #111", overflow: "hidden" }}>
                        <div className="px-4 py-2.5 flex items-center justify-between" style={{ background: "#111", borderBottom: "1px solid #222" }}>
                          <p className="font-black tracking-tighter text-[12px]" style={{ color: "#fff" }}>{ph.title}</p>
                          <span className="font-mono text-[9px] font-bold px-2 py-0.5" style={{ background: TERRA, color: "#fff" }}>{ph.duration}</span>
                        </div>
                        <div className="px-4 py-3 bg-white">
                          {ph.elements?.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-2">
                              {ph.elements.map((el, j) => (
                                <span key={j} className="px-2 py-0.5 font-mono text-[9px] font-medium" style={{ background: "#f5f5f5", border: "1px solid #ddd", color: "#555" }}>
                                  {el}
                                </span>
                              ))}
                            </div>
                          )}
                          <p className="font-mono text-[9px] italic leading-relaxed" style={{ color: "#888" }}>{ph.rationale}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

        </div>
      )}
    </section>
  );
}
