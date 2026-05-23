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

// ─── Mapbox Static API helper ──────────────────────────────────────────────────
function mapboxStaticUrl(
  boundaryGeojson: string | null | undefined,
  style: string,
  w = 640,
  h = 300,
  fillColor = "#059669",
): string | null {
  const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
  if (!token || !boundaryGeojson) return null;
  try {
    const parsed = JSON.parse(boundaryGeojson);
    const asFeature = (
      parsed.type === "Feature" ? parsed : { type: "Feature", geometry: parsed, properties: {} }
    ) as GeoJSON.Feature;
    const simplified = turf.simplify(asFeature as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>, {
      tolerance: 0.00008,
      highQuality: false,
    });
    const feature = {
      ...simplified,
      properties: {
        stroke: fillColor,
        "stroke-width": 3,
        "stroke-opacity": 1,
        fill: fillColor,
        "fill-opacity": 0.15,
      },
    };
    const encoded = encodeURIComponent(JSON.stringify(feature));
    const bbox = turf.bbox(asFeature);
    const bboxStr = `[${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]}]`;
    return `https://api.mapbox.com/styles/v1/mapbox/${style}/static/geojson(${encoded})/${bboxStr}/${w}x${h}@2x?padding=60&access_token=${token}`;
  } catch {
    return null;
  }
}

function PropertyMap({
  boundaryGeojson, style, caption, fillColor,
}: {
  boundaryGeojson: string | null | undefined;
  style: string;
  caption?: string;
  fillColor?: string;
}) {
  const url = mapboxStaticUrl(boundaryGeojson, style, 640, 300, fillColor);
  if (!url) return null;
  return (
    <div className="mb-4" style={{ pageBreakInside: "avoid" }}>
      <img
        src={url}
        alt={caption ?? "Property map"}
        className="w-full border border-slate-200"
        style={{ display: "block" }}
      />
      {caption && (
        <p className="mt-1.5 text-center text-[9px] uppercase tracking-widest text-slate-400">
          {caption}
        </p>
      )}
    </div>
  );
}

function MapPlaceholder({ caption, message }: { caption?: string; message?: string }) {
  return (
    <div className="mb-4" style={{ pageBreakInside: "avoid" }}>
      <div className="w-full bg-slate-50 border border-slate-200 flex flex-col items-center justify-center gap-2" style={{ height: 180 }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/>
        </svg>
        <p className="text-[11px] font-medium text-slate-400">
          {message ?? "No boundary drawn on map yet"}
        </p>
        <p className="text-[10px] text-slate-300">
          Draw your property boundary in the Map workspace to generate this map
        </p>
      </div>
      {caption && (
        <p className="mt-1.5 text-center text-[9px] uppercase tracking-widest text-slate-300">{caption}</p>
      )}
    </div>
  );
}

function DocPlaceholder({ message }: { message: string }) {
  return (
    <div className="bg-slate-50 border border-slate-200 px-4 py-3 flex items-center gap-3">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="2" style={{ flexShrink: 0 }}>
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <p className="text-[11px] italic text-slate-400">{message}</p>
    </div>
  );
}

// ─── Sun Sector Diagram ────────────────────────────────────────────────────────
function SunSectorDiagram({
  lat,
  prevailingWind,
}: {
  lat?: number | null;
  prevailingWind?: string | null;
}) {
  const cx = 160, cy = 160, r = 112;
  const isNorthern = (lat ?? -33) >= 0;

  function toXY(compassDeg: number, radius: number): [number, number] {
    const rad = ((compassDeg - 90) * Math.PI) / 180;
    return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)];
  }

  function annularArc(
    start: number, end: number,
    r1: number, r2: number,
    la: 0 | 1, sw: 0 | 1,
  ): string {
    const [s1x, s1y] = toXY(start, r2);
    const [e1x, e1y] = toXY(end, r2);
    const [s2x, s2y] = toXY(start, r1);
    const [e2x, e2y] = toXY(end, r1);
    const rsw: 0 | 1 = sw === 0 ? 1 : 0;
    return (
      `M${f(s1x)} ${f(s1y)} A${r2} ${r2} 0 ${la} ${sw} ${f(e1x)} ${f(e1y)} ` +
      `L${f(e2x)} ${f(e2y)} A${r1} ${r1} 0 ${la} ${rsw} ${f(s2x)} ${f(s2y)}Z`
    );
  }

  function f(n: number) { return n.toFixed(1); }

  const [sumS, sumE, sumLa, sumSw, winS, winE, winLa, winSw]: [number,number,0|1,0|1,number,number,0|1,0|1] =
    isNorthern
      ? [40, 320, 1, 1, 120, 240, 0, 1]
      : [120, 240, 1, 0,  65, 295, 0, 0];

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
    { l: "N", d: 0 }, { l: "NE", d: 45 }, { l: "E", d: 90 }, { l: "SE", d: 135 },
    { l: "S", d: 180 }, { l: "SW", d: 225 }, { l: "W", d: 270 }, { l: "NW", d: 315 },
  ];

  const [nTx, nTy] = toXY(0, r * 0.48);
  const [nL1x, nL1y] = toXY(350, r * 0.38);
  const [nL2x, nL2y] = toXY(10,  r * 0.38);

  return (
    <figure style={{ pageBreakInside: "avoid", marginBottom: 0 }}>
      <svg viewBox="0 0 320 320" style={{ width: "100%", maxWidth: 260, height: "auto", display: "block", margin: "0 auto" }}>
        <circle cx={cx} cy={cy} r={r + 42} fill="#0f172a" />
        {[0.35, 0.52, 0.75, 0.95].map((frac) => (
          <circle key={frac} cx={cx} cy={cy} r={r * frac} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="0.5" />
        ))}
        {[0, 45, 90, 135].map((d) => {
          const [x1, y1] = toXY(d, r * 0.95);
          const [x2, y2] = toXY(d + 180, r * 0.95);
          return <line key={d} x1={f(x1)} y1={f(y1)} x2={f(x2)} y2={f(y2)} stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />;
        })}
        <path d={windPath} fill="rgba(147,197,253,0.22)" stroke="#93c5fd" strokeWidth="1" />
        <path d={winterPath} fill="rgba(96,165,250,0.32)" stroke="#60a5fa" strokeWidth="1" />
        <path d={summerPath} fill="rgba(251,191,36,0.32)" stroke="#fbbf24" strokeWidth="1.5" />
        <circle cx={cx} cy={cy} r={r * 0.28} fill="rgba(5,150,105,0.25)" stroke="#059669" strokeWidth="1.5" />
        <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle" fill="#34d399" fontSize="8" fontWeight="bold">SITE</text>
        <polygon points={`${f(nTx)},${f(nTy)} ${f(nL1x)},${f(nL1y)} ${f(nL2x)},${f(nL2y)}`} fill="#f87171" />
        <circle cx={cx} cy={cy} r={r + 7} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
        {compassPts.map(({ l, d }) => {
          const [lx, ly] = toXY(d, r + 20);
          return (
            <text key={l} x={f(lx)} y={f(ly)} fill={d % 90 === 0 ? "white" : "rgba(255,255,255,0.5)"}
              fontSize={d % 90 === 0 ? 10 : 8} fontWeight={d % 90 === 0 ? "bold" : "normal"}
              textAnchor="middle" dominantBaseline="middle">{l}</text>
          );
        })}
        {windKey && (() => {
          const [lx, ly] = toXY(windDeg, r + 33);
          return <text x={f(lx)} y={f(ly)} fill="#93c5fd" fontSize="9" textAnchor="middle" dominantBaseline="middle">💨</text>;
        })()}
      </svg>
      <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 8, flexWrap: "wrap" }}>
        {[
          { color: "#fbbf24", label: "Summer sun zone" },
          { color: "#60a5fa", label: "Winter sun zone" },
          { color: "#93c5fd", label: `Prevailing wind${windKey ? ` (${windKey})` : ""}` },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: color, opacity: 0.8 }} />
            <span className="text-[9px] text-slate-500">{label}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}

// ─── Soil Profile Visualisation ────────────────────────────────────────────────
function SoilProfileViz({
  clay, sand, silt, ph, organicCarbon, textureClass,
}: {
  clay?: number | null; sand?: number | null; silt?: number | null;
  ph?: number | null; organicCarbon?: number | null; textureClass?: string | null;
}) {
  const rawTotal = (clay ?? 0) + (sand ?? 0) + (silt ?? 0);
  const total = rawTotal > 0 ? rawTotal : 100;
  const clayPct  = rawTotal > 0 ? Math.round(((clay  ?? 0) / total) * 100) : (clay  ?? 30);
  const sandPct  = rawTotal > 0 ? Math.round(((sand  ?? 0) / total) * 100) : (sand  ?? 40);
  const siltPct  = rawTotal > 0 ? Math.round(100 - clayPct - sandPct)       : (silt  ?? 30);
  const phVal    = ph ?? 6.5;
  const ocVal    = organicCarbon ?? 0;
  const ocWidth  = Math.min(100, Math.round(ocVal * 4));

  const horizons = [
    { label: "O", name: "Organic layer", depth: "0–5 cm",   fill: "#3d1f0a", h: 22 },
    { label: "A", name: "Topsoil",       depth: "5–30 cm",  fill: `hsl(25,${38 + clayPct * 0.5}%,${36 - clayPct * 0.12}%)`, h: 48 },
    { label: "B", name: "Subsoil",       depth: "30–80 cm", fill: `hsl(18,${28 + clayPct * 0.6}%,${32 - clayPct * 0.1}%)`,  h: 56 },
    { label: "C", name: "Parent rock",   depth: "80+ cm",   fill: "#a89988", h: 34 },
  ];

  const colY = (i: number) => 8 + horizons.slice(0, i).reduce((acc, h) => acc + h.h + 2, 0);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "18px", alignItems: "start", pageBreakInside: "avoid" }}>
      <div>
        <p className="text-[9px] text-slate-400 uppercase tracking-widest mb-1.5">Soil Profile Column</p>
        <svg viewBox="0 0 160 180" style={{ width: "100%", height: "auto" }}>
          {horizons.map((hz, i) => {
            const y = colY(i);
            return (
              <g key={hz.label}>
                <rect x={18} y={y} width={55} height={hz.h} fill={hz.fill} rx={2} />
                <text x={78} y={y + hz.h * 0.38} fontSize="8" fill="#1e293b" dominantBaseline="middle" fontWeight="bold">{hz.label}</text>
                <text x={78} y={y + hz.h * 0.65} fontSize="7" fill="#64748b" dominantBaseline="middle">{hz.name}</text>
                <text x={14} y={y + 2} fontSize="6.5" fill="#94a3b8" textAnchor="end" dominantBaseline="hanging">{hz.depth.split("–")[0]}cm</text>
              </g>
            );
          })}
          {[{x:28,y:44},{x:40,y:50},{x:54,y:42},{x:32,y:56},{x:48,y:62},{x:62,y:54}].map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={1.3} fill="rgba(0,0,0,0.25)" />
          ))}
          {[{x:30,y:100},{x:44,y:110},{x:56,y:102},{x:38,y:118},{x:62,y:114}].map((p, i) => (
            <rect key={i} x={p.x} y={p.y} width={3} height={2} fill="rgba(255,255,255,0.15)" rx={0.5} />
          ))}
        </svg>
      </div>

      <div style={{ paddingTop: 18 }}>
        {textureClass && (
          <div className="mb-3">
            <p className="text-[9px] text-slate-400 uppercase tracking-widest mb-0.5">Texture Class</p>
            <p className="text-[14px] font-bold text-slate-900">{textureClass}</p>
          </div>
        )}

        {rawTotal > 0 && (
          <div className="mb-3">
            <p className="text-[9px] text-slate-400 uppercase tracking-widest mb-2">Particle Composition</p>
            {[
              { label: "Clay",  pct: clayPct, color: "#92400e", imp: "Water retention · structure" },
              { label: "Silt",  pct: siltPct, color: "#78716c", imp: "Nutrient holding · erosion risk" },
              { label: "Sand",  pct: sandPct, color: "#d97706", imp: "Drainage · aeration" },
            ].map(({ label, pct, color, imp }) => (
              <div key={label} className="mb-2">
                <div className="flex justify-between text-[9px] mb-0.5">
                  <span className="font-semibold text-slate-700">{label}</span>
                  <span className="text-slate-500">{pct}%</span>
                </div>
                <div className="h-1.5 bg-slate-100 overflow-hidden mb-0.5">
                  <div style={{ height: "100%", width: `${pct}%`, background: color }} />
                </div>
                <p className="text-[8px] text-slate-400">{imp}</p>
              </div>
            ))}
          </div>
        )}

        {ph != null && (
          <div className="mb-3">
            <div className="flex justify-between text-[9px] mb-1">
              <span className="text-slate-400 uppercase tracking-widest">Soil pH</span>
              <span className="font-bold text-slate-900">{ph}</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: "linear-gradient(to right,#ef4444,#f97316,#facc15,#22c55e,#60a5fa,#8b5cf6)", position: "relative" }}>
              <div style={{
                position: "absolute", top: -3, width: 6, height: 12,
                background: "white", border: "1.5px solid #1e293b", borderRadius: 2,
                left: `${Math.max(2, Math.min(96, ((phVal - 4) / 6) * 100))}%`,
                transform: "translateX(-50%)",
              }} />
            </div>
            <div className="flex justify-between text-[7px] text-slate-400 mt-1">
              <span>Acid 4</span><span>Neutral 7</span><span>Alkaline 10</span>
            </div>
          </div>
        )}

        {ocVal > 0 && (
          <div>
            <div className="flex justify-between text-[9px] mb-1">
              <span className="text-slate-400 uppercase tracking-widest">Organic Carbon</span>
              <span className="font-bold text-slate-900">{organicCarbon} g/kg</span>
            </div>
            <div className="h-1.5 bg-slate-100 overflow-hidden mb-1">
              <div style={{ height: "100%", width: `${ocWidth}%`, background: "linear-gradient(to right,#d97706,#7c2d12)" }} />
            </div>
            <p className="text-[8px] text-slate-400">
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

  function handleExport() {
    window.print();
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-950">
      {/* ── TOP BAR (hidden on print) ── */}
      <header className="print:hidden shrink-0 flex items-center justify-between px-5 py-3 border-b border-slate-800 sticky top-0 z-20 bg-slate-900">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/properties")}
            className="flex items-center gap-2 transition-opacity hover:opacity-70 text-slate-200"
          >
            <span className="text-base">🛡</span>
            <span className="text-[13px] font-bold tracking-tight hidden sm:inline">TerraGuard</span>
          </button>
          <div className="w-px h-4 bg-slate-700 hidden sm:block" />
          <span className="text-[11px] font-semibold uppercase tracking-widest text-emerald-500">
            Export Studio
          </span>
        </div>
        <div className="flex items-center gap-2">
          <StepNav />
          <button
            onClick={handleGenerateLink}
            disabled={!activePropertyId}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed border"
            style={linkCopied
              ? { background: "rgba(5,150,105,0.12)", color: "#34d399", borderColor: "rgba(5,150,105,0.35)" }
              : { background: "transparent", color: "#94a3b8", borderColor: "#334155" }
            }
            title="Copy client presentation link to clipboard"
          >
            {linkCopied ? (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20,6 9,17 4,12"/></svg>
                Copied!
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
                  <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
                </svg>
                Client Link
              </>
            )}
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold transition-all bg-emerald-700 hover:bg-emerald-600 text-white border border-emerald-600"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
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
            <h3 className="text-base font-semibold text-slate-200">No property selected</h3>
            <p className="text-sm text-slate-500">Complete the intake and analysis steps first.</p>
            <button onClick={() => navigate("/intake")} className="mt-2 px-5 py-2.5 rounded-lg text-[13px] font-semibold bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 transition-colors">
              ← Start at Intake
            </button>
          </div>
        </div>
      )}

      {/* ── DOCUMENT ── */}
      {activePropertyId && (
        <main className="flex-1 px-4 py-10">
          <div className="mx-auto max-w-3xl bg-white print:shadow-none shadow-2xl">

            {/* Document header */}
            <div className="px-10 py-8 border-b border-slate-200">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">🛡</span>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">
                      TerraGuard OS
                    </span>
                  </div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900 leading-tight">
                    {property?.name ?? "Property Resilience Dossier"}
                  </h1>
                  <p className="text-[12px] mt-1 text-slate-500">
                    Property Resilience &amp; Autonomy Report
                  </p>
                </div>
                <div className="text-right shrink-0 ml-4">
                  {(property?.areaHectares ?? 0) > 0 && (
                    <div className="text-xl font-bold tracking-tight text-slate-900">{property?.areaHectares?.toFixed(2)} ha</div>
                  )}
                  <div className="text-[10px] mt-0.5 text-emerald-700">Generated {today}</div>
                </div>
              </div>
            </div>

            {/* Property satellite overview map */}
            {property?.boundaryGeojson ? (
              <div style={{ position: "relative" }}>
                <PropertyMap
                  boundaryGeojson={property.boundaryGeojson as unknown as string}
                  style="satellite-streets-v12"
                  fillColor="#059669"
                />
                <div
                  style={{
                    position: "absolute", bottom: 0, left: 0, right: 0, height: 60,
                    background: "linear-gradient(to top, white, transparent)",
                    pointerEvents: "none",
                  }}
                />
              </div>
            ) : (
              <MapPlaceholder caption="Property satellite overview" message="No boundary drawn — open the Map workspace to outline your property" />
            )}

            {/* Document body */}
            <div className="px-10 py-8 space-y-10">
              {/* No brief */}
              {!brief && (
                <div className="border-l-4 border-amber-400 bg-amber-50 px-5 py-4">
                  <p className="text-sm font-semibold text-amber-900">Site survey not completed</p>
                  <p className="text-xs text-amber-700 mt-0.5">Complete the intake survey to populate this dossier.</p>
                </div>
              )}

              {brief && (
                <>
                  {/* Site Profile */}
                  <DocSection title="Site Profile">
                    <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
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

                  {/* Soil */}
                  <DocSection title="Soil Analysis (0–5 cm)">
                    <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
                      <DocField label="Texture class" value={brief.soilTextureClass ?? "—"} />
                      <DocField label="pH" value={brief.soilPH != null ? String(brief.soilPH) : "—"} />
                      <DocField label="Clay" value={brief.soilClay != null ? `${brief.soilClay}%` : "—"} />
                      <DocField label="Sand" value={brief.soilSand != null ? `${brief.soilSand}%` : "—"} />
                      <DocField label="Silt" value={brief.soilSilt != null ? `${brief.soilSilt}%` : "—"} />
                      <DocField label="Organic carbon" value={brief.soilOrganicCarbonGkg != null ? `${brief.soilOrganicCarbonGkg} g/kg` : "—"} />
                    </div>
                  </DocSection>

                  {/* Design Goals */}
                  <DocSection title="Design Goals">
                    <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
                      <DocField label="Primary goal" value={brief.primaryGoal ?? "—"} />
                      <DocField label="Maintenance capacity" value={brief.maintenanceCapacity ?? "—"} />
                    </div>
                  </DocSection>

                  {/* Mood Board */}
                  <DocSection title="Client Mood Board">
                    {moodImages.length === 0 ? (
                      <p className="text-sm italic text-slate-400">
                        No vision board photos uploaded yet. Ask the client to add inspiration photos via the Intake page.
                      </p>
                    ) : (
                      <div className="grid grid-cols-3 gap-2 mb-4">
                        {moodImages.map((src, i) => (
                          <div
                            key={i}
                            className="overflow-hidden border border-slate-200"
                            style={{ aspectRatio: "4/3", background: "#f8fafc" }}
                          >
                            <img src={src} alt={`Mood board ${i + 1}`} className="w-full h-full object-cover" />
                          </div>
                        ))}
                      </div>
                    )}

                    {role === "designer" && (
                      <div className="print:hidden mt-4 bg-slate-900 border border-slate-700 px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div>
                          <p className="text-[12px] font-bold text-slate-100">AI Concept Renders</p>
                          <p className="text-[11px] mt-0.5 text-slate-400">
                            Generate photorealistic concept renders from the client's mood board using Google Imagen.
                          </p>
                        </div>
                        <button
                          onClick={() => { /* placeholder — Google Imagen integration */ }}
                          className="shrink-0 flex items-center gap-2 px-5 py-2.5 text-[12px] font-bold bg-emerald-700 hover:bg-emerald-600 text-white border border-emerald-600 transition-colors"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <polygon points="13,2 3,14 12,14 11,22 21,10 12,10 13,2"/>
                          </svg>
                          Generate AI Concept Renders
                        </button>
                      </div>
                    )}
                  </DocSection>

                  {/* Pattern Strategy */}
                  {aiReport?.PatternStrategy ? (
                    <DocPatternStrategy
                      pattern={aiReport.PatternStrategy as { recommendedPattern?: string; rationale?: string; application?: string }}
                    />
                  ) : (
                    <DocSection title="Pattern Strategy">
                      <DocPlaceholder message="Run the AI resilience analysis to generate the recommended nature-based design pattern for this site." />
                    </DocSection>
                  )}

                  {/* Infrastructure */}
                  {(brief.utilitiesOverheadPower || brief.utilitiesBuriedPipes || brief.utilitiesLegalEasements || brief.utilitiesActiveWell || brief.challengeSevereErosion || brief.challengeWinterFlooding || brief.challengeHighWind || brief.challengeWildlifePressure) && (
                    <DocSection title="Infrastructure & Site Constraints">
                      <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
                        {brief.utilitiesOverheadPower && <DocField label="Overhead power" value="Present" />}
                        {brief.utilitiesBuriedPipes && <DocField label="Buried pipes" value="Present" />}
                        {brief.utilitiesLegalEasements && <DocField label="Legal easements" value="Present" />}
                        {brief.utilitiesActiveWell && <DocField label="Active well" value="Present" />}
                        {brief.challengeSevereErosion && <DocField label="Severe erosion" value="Yes" />}
                        {brief.challengeWinterFlooding && <DocField label="Winter flooding" value="Yes" />}
                        {brief.challengeHighWind && <DocField label="High wind" value="Yes" />}
                        {brief.challengeWildlifePressure && <DocField label="Wildlife pressure" value="Yes" />}
                      </div>
                    </DocSection>
                  )}

                  {/* AI Report */}
                  {aiReport ? (
                    <DocSection title="AI Resilience Analysis">
                      {brief.aiAnalysisGeneratedAt && (
                        <p className="text-[11px] mb-5 text-slate-400">
                          Generated {new Date(brief.aiAnalysisGeneratedAt).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}
                        </p>
                      )}
                      <div className="space-y-4">
                        {[
                          { key: "WaterStrategy",         title: "💧 Water Strategy" },
                          { key: "SunAndEnergy",          title: "☀️ Sun & Energy" },
                          { key: "SoilAndFertility",      title: "🌱 Soil & Fertility" },
                          { key: "LandAndBiodiversity",   title: "🌾 Land & Biodiversity" },
                          { key: "ClimateResilience",     title: "🛡 Climate Resilience" },
                          { key: "InfrastructureCritique",title: "⚠️ Infrastructure Critique" },
                        ].map(({ key, title }) => {
                          const val = aiReport
                            ? (aiReport as unknown as Record<string, unknown>)[key]
                            : undefined;
                          const isMissing = val === undefined || val === null;

                          let visualPanel: React.ReactNode = null;
                          if (key === "WaterStrategy") {
                            visualPanel = (
                              <div className="px-4 pt-3 bg-slate-50 border-b border-slate-100">
                                {property?.boundaryGeojson ? (
                                  <PropertyMap
                                    boundaryGeojson={property.boundaryGeojson as unknown as string}
                                    style="outdoors-v12"
                                    fillColor="#2563eb"
                                    caption="Terrain & contour map — darker shading = higher elevation, contour lines show water flow paths"
                                  />
                                ) : (
                                  <MapPlaceholder caption="Terrain & contour map" />
                                )}
                                <div className="mb-3 border-l-4 border-slate-200 pl-3 py-1 text-[10px] text-slate-500 leading-relaxed">
                                  <strong className="text-slate-700">Reading the map:</strong> Contour lines show elevation — water flows perpendicular to them, from high ground to low. Shade relief reveals ridges (water divides) and valleys (natural collection points). Swales should follow contour lines; dams sit at valley heads below natural catchment areas.
                                </div>
                              </div>
                            );
                          } else if (key === "SunAndEnergy") {
                            visualPanel = (
                              <div className="px-4 pt-3 pb-1 bg-slate-50 border-b border-slate-100">
                                <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 16, alignItems: "start" }}>
                                  <SunSectorDiagram lat={siteLat} prevailingWind={brief?.prevailingWindDir} />
                                  <div style={{ paddingTop: 8 }}>
                                    <p className="text-[9px] text-slate-400 uppercase tracking-widest font-bold mb-2">
                                      How to read this diagram
                                    </p>
                                    <ul className="text-[10px] text-slate-600 leading-relaxed pl-3 space-y-1" style={{ margin: 0 }}>
                                      <li><strong className="text-slate-800">Amber band</strong> — summer sun zone: maximum solar exposure, highest UV</li>
                                      <li><strong className="text-slate-800">Blue band</strong> — winter sun zone: reduced arc, shade from buildings/trees has greater impact</li>
                                      <li><strong className="text-slate-800">Blue wedge</strong> — prevailing wind sector: windbreaks should intercept this zone</li>
                                      <li><strong className="text-slate-800">Red arrow</strong> — north (compass true north)</li>
                                      <li>Food gardens &amp; solar panels: position in the summer sun zone, away from winter shade sources</li>
                                      <li>Fire-breaks &amp; wind-sensitive crops: protect from the wind wedge sector</li>
                                    </ul>
                                    {brief?.solarIrradianceKwhM2 != null && (
                                      <div className="mt-3 border-l-4 border-emerald-600 pl-3 py-1.5 bg-white">
                                        <span className="text-[9px] text-slate-400 uppercase tracking-widest font-semibold">Solar irradiance: </span>
                                        <span className="text-[11px] text-slate-900 font-bold">{brief.solarIrradianceKwhM2.toLocaleString()} kWh/m²/yr</span>
                                        <span className="text-[8px] text-slate-500 ml-2">
                                          {brief.solarIrradianceKwhM2 >= 1600 ? "Excellent PV potential" : brief.solarIrradianceKwhM2 >= 1200 ? "Good PV potential" : "Moderate PV potential"}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          } else if (key === "SoilAndFertility") {
                            const hasSoilData = brief?.soilClay != null || brief?.soilSand != null || brief?.soilPH != null;
                            visualPanel = (
                              <div className="px-4 pt-3 pb-1 bg-slate-50 border-b border-slate-100">
                                {hasSoilData ? (
                                  <SoilProfileViz
                                    clay={brief?.soilClay}
                                    sand={brief?.soilSand}
                                    silt={brief?.soilSilt}
                                    ph={brief?.soilPH}
                                    organicCarbon={brief?.soilOrganicCarbonGkg}
                                    textureClass={brief?.soilTextureClass}
                                  />
                                ) : (
                                  <DocPlaceholder message="Soil sample data not yet recorded. Complete the intake survey — the SoilGrids fetch will populate clay, sand, silt, pH and organic carbon automatically." />
                                )}
                                <div className="mt-3">
                                  {property?.boundaryGeojson ? (
                                    <PropertyMap
                                      boundaryGeojson={property.boundaryGeojson as unknown as string}
                                      style="satellite-v9"
                                      fillColor="#92400e"
                                      caption="Property satellite view — bare soil patches, vegetation density & colour variation indicate soil moisture & organic matter zones"
                                    />
                                  ) : (
                                    <MapPlaceholder caption="Property satellite view" />
                                  )}
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div key={key} className="border border-slate-200 overflow-hidden">
                              <div className="px-4 py-2.5 text-[11px] font-semibold text-slate-900 bg-slate-50 border-b border-slate-100">
                                {title}
                              </div>
                              {visualPanel}
                              <div className="px-4 py-3 text-[12px] leading-relaxed text-slate-700 bg-white">
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
                    <DocSection title="AI Resilience Analysis">
                      <p className="text-sm italic text-slate-400 mb-3">
                        No analysis run yet. Go to The War Room to generate the AI resilience report.
                      </p>
                      <button
                        onClick={() => navigate("/analysis")}
                        className="print:hidden px-4 py-2 text-[12px] font-semibold bg-emerald-700 hover:bg-emerald-600 text-white border border-emerald-600 transition-colors"
                      >
                        Run Analysis →
                      </button>
                    </DocSection>
                  )}
                </>
              )}

              {/* Design Recommendations — final page */}
              <DocDesignRecommendations designRecs={
                aiReport
                  ? (aiReport as unknown as Record<string, unknown>)["DesignRecommendations"] as DesignRecsType | undefined
                  : undefined
              } />

              {/* Document footer */}
              <div className="border-t border-slate-200 pt-6 flex items-center justify-between">
                <span className="text-[10px] text-slate-400">
                  TerraGuard OS · Autonomous Property Resilience Platform
                </span>
                <span className="text-[10px] text-slate-400">{today}</span>
              </div>
            </div>
          </div>

          {/* Bottom nav (hidden on print) */}
          <div className="print:hidden mt-6 mx-auto max-w-3xl flex items-center justify-between">
            <button
              onClick={() => navigate("/analysis")}
              className="text-[11px] px-3 py-1.5 text-slate-400 border border-slate-700 hover:border-slate-600 transition-colors bg-transparent"
            >
              ← Analysis
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-5 py-2.5 text-[13px] font-semibold bg-emerald-700 hover:bg-emerald-600 text-white border border-emerald-600 transition-colors"
            >
              Export PDF
            </button>
          </div>
        </main>
      )}
    </div>
  );
}

function DocPatternStrategy({ pattern }: { pattern: { recommendedPattern?: string; rationale?: string; application?: string } }) {
  return (
    <section>
      <h2 className="text-[9px] font-bold uppercase tracking-widest mb-3 pb-2 flex items-center gap-2 text-emerald-700 border-b border-emerald-200">
        <Fingerprint size={12} strokeWidth={2} className="text-emerald-700 shrink-0" />
        Pattern Strategy
      </h2>
      <div className="border border-slate-200 overflow-hidden">
        {pattern.recommendedPattern && (
          <div className="px-5 py-4 flex items-center gap-3 bg-slate-900 border-b border-slate-800">
            <Fingerprint size={16} strokeWidth={1.8} className="text-emerald-400 shrink-0" />
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-emerald-400">
                Recommended Pattern
              </div>
              <div className="text-[15px] font-bold text-white tracking-tight leading-tight">
                {pattern.recommendedPattern}
              </div>
            </div>
          </div>
        )}
        <div className="px-5 py-5 space-y-5 bg-white">
          {pattern.rationale && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1 h-4 bg-emerald-600 shrink-0" />
                <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-700">
                  Why Nature Uses This Form
                </span>
              </div>
              <p className="text-[12px] leading-relaxed text-slate-700">
                {pattern.rationale}
              </p>
            </div>
          )}
          {pattern.application && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1 h-4 bg-slate-400 shrink-0" />
                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">
                  Site Application
                </span>
              </div>
              <p className="text-[12px] leading-relaxed text-slate-700">
                {pattern.application}
              </p>
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
      <h2 className="text-[9px] font-bold uppercase tracking-widest mb-3 pb-2 text-emerald-700 border-b border-emerald-200">
        {title}
      </h2>
      {children}
    </section>
  );
}

function DocField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] uppercase tracking-wide font-semibold text-slate-400">{label}</span>
      <span className="text-[13px] font-medium text-slate-900">{value}</span>
    </div>
  );
}

function AiTableDoc({ rows }: { rows: unknown[] }) {
  if (!rows.length) return null;
  const first = rows[0];
  if (typeof first !== "object" || first === null) {
    return (
      <ul className="list-disc pl-4 space-y-1 text-slate-700">
        {rows.map((r, i) => <li key={i}>{String(r)}</li>)}
      </ul>
    );
  }
  const keys = Object.keys(first as object);
  return (
    <table className="w-full text-[11px] border-collapse">
      <thead>
        <tr className="border-b border-slate-200">
          {keys.map((k) => (
            <th key={k} className="text-left py-1.5 pr-3 font-semibold uppercase text-[9px] tracking-wider text-slate-400">{k}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="border-b border-slate-100">
            {keys.map((k) => (
              <td key={k} className="py-1.5 pr-3 align-top text-slate-700">
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
    <div className="space-y-2">
      {Object.entries(obj).map(([key, val]) => (
        <div key={key}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5 text-slate-400">{key}</div>
          {Array.isArray(val) ? (
            <AiTableDoc rows={val} />
          ) : typeof val === "object" && val !== null ? (
            <AiObjectDoc obj={val as Record<string, unknown>} />
          ) : (
            <p className="text-slate-700">{String(val)}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Layer accent colours (left-border only, white bg) ─────────────────────────
const LAYER_ACCENTS: Record<string, { border: string; dot: string }> = {
  Canopy:         { border: "#047857", dot: "#059669" },
  Understory:     { border: "#065f46", dot: "#10b981" },
  Shrub:          { border: "#166534", dot: "#34d399" },
  Herbaceous:     { border: "#0f766e", dot: "#2dd4bf" },
  "Ground Cover": { border: "#0369a1", dot: "#38bdf8" },
  Vine:           { border: "#1d4ed8", dot: "#60a5fa" },
  Root:           { border: "#92400e", dot: "#f59e0b" },
};

const PRIORITY_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  High:   { bg: "#fef2f2", text: "#991b1b", border: "#fca5a5" },
  Medium: { bg: "#fffbeb", text: "#92400e", border: "#fcd34d" },
  Low:    { bg: "#f0fdf4", text: "#166534", border: "#bbf7d0" },
};

function DocDesignRecommendations({ designRecs }: { designRecs: DesignRecsType | null | undefined }) {
  const hasPrinciples = !!designRecs?.plantingPrinciples;
  const plants    = Array.isArray(designRecs?.plants)                ? designRecs!.plants                : [];
  const elements  = Array.isArray(designRecs?.designElements)        ? designRecs!.designElements        : [];
  const phases    = Array.isArray(designRecs?.implementationPhases)  ? designRecs!.implementationPhases  : [];

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
      <h2 className="text-[9px] font-bold uppercase tracking-widest mb-4 pb-2 flex items-center gap-2 text-emerald-700 border-b border-emerald-200">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        Final Design Recommendations
      </h2>

      {!designRecs ? (
        <DocPlaceholder message="Run the AI resilience analysis in the War Room to generate the plant palette, design elements, and implementation plan for this property." />
      ) : (
        <div className="space-y-8">

          {/* Planting principles */}
          {hasPrinciples && (
            <div className="border-l-4 border-emerald-600 pl-5 py-1">
              <p className="text-[9px] font-bold uppercase tracking-widest text-emerald-700 mb-1.5">
                Planting Philosophy
              </p>
              <p className="text-[12px] leading-relaxed text-slate-700">
                {designRecs.plantingPrinciples}
              </p>
            </div>
          )}

          {/* Plant palette */}
          <div>
            <h3 className="text-[9px] font-bold uppercase tracking-widest mb-3 text-slate-500">
              Plant Palette — {plants.length} species across {Object.keys(grouped).length} canopy layers
            </h3>
            {plants.length === 0 ? (
              <DocPlaceholder message="No plant data generated yet." />
            ) : (
              <div className="space-y-2">
                {Object.entries(grouped).map(([layer, layerPlants]) => {
                  const accent = LAYER_ACCENTS[layer] ?? { border: "#64748b", dot: "#94a3b8" };
                  return (
                    <div key={layer} className="border border-slate-200 overflow-hidden" style={{ borderLeft: `3px solid ${accent.border}` }}>
                      <div className="px-4 py-2 flex items-center gap-2 bg-slate-50 border-b border-slate-100">
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: accent.dot, flexShrink: 0 }} />
                        <span className="text-[9px] font-bold uppercase tracking-widest text-slate-600">
                          {layer} layer — {layerPlants.length} species
                        </span>
                      </div>
                      <table className="w-full bg-white" style={{ borderCollapse: "collapse" }}>
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50">
                            {["Common name","Latin name","Purpose","Zone","Planting notes"].map(h => (
                              <th key={h} className="px-3 py-1.5 text-left text-[8px] font-bold uppercase tracking-wider text-slate-400">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {layerPlants.map((plant, i) => (
                            <tr key={i} className="border-b border-slate-50">
                              <td className="px-3 py-2 text-[11px] font-semibold text-slate-900">{plant.name}</td>
                              <td className="px-3 py-2 text-[10px] italic text-slate-500">{plant.latinName}</td>
                              <td className="px-3 py-2 text-[10px] text-slate-600">{plant.purpose}</td>
                              <td className="px-3 py-2 text-[10px] whitespace-nowrap font-semibold text-emerald-700">{plant.zones}</td>
                              <td className="px-3 py-2 text-[10px] text-slate-500">{plant.notes}</td>
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
            <h3 className="text-[9px] font-bold uppercase tracking-widest mb-3 text-slate-500">
              Design Elements — {elements.length} infrastructure components
            </h3>
            {elements.length === 0 ? (
              <DocPlaceholder message="No design elements generated yet." />
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {elements.map((el, i) => {
                  const ps = PRIORITY_STYLES[el.priority] ?? { bg: "#f8fafc", text: "#475569", border: "#e2e8f0" };
                  return (
                    <div key={i} className="border border-slate-200 overflow-hidden bg-white">
                      <div className="px-4 py-2.5 flex items-start justify-between gap-2 bg-slate-50 border-b border-slate-100">
                        <div>
                          <p className="text-[10px] font-bold text-slate-900">{el.name}</p>
                          <p className="text-[9px] uppercase tracking-wide text-slate-400">{el.type}</p>
                        </div>
                        <span
                          className="shrink-0 mt-0.5 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider"
                          style={{ background: ps.bg, color: ps.text, border: `1px solid ${ps.border}` }}
                        >
                          {el.priority}
                        </span>
                      </div>
                      <div className="px-4 py-3 space-y-1.5">
                        <p className="text-[10px] leading-relaxed text-slate-700">{el.description}</p>
                        {el.placement && (
                          <p className="text-[9px] text-slate-500">
                            <span className="font-semibold text-emerald-700">Placement: </span>{el.placement}
                          </p>
                        )}
                        {el.rationale && (
                          <p className="text-[9px] italic text-slate-400">{el.rationale}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Implementation phases */}
          <div>
            <h3 className="text-[9px] font-bold uppercase tracking-widest mb-4 text-slate-500">
              Implementation Roadmap
            </h3>
            {phases.length === 0 ? (
              <DocPlaceholder message="No implementation phases generated yet." />
            ) : (
              <div className="relative">
                <div className="absolute left-4 top-4 bottom-4 w-px bg-slate-200" />
                <div className="space-y-4 pl-12">
                  {phases.map((ph, i) => (
                    <div key={i} className="relative">
                      <div
                        className="absolute flex items-center justify-center text-[9px] font-bold text-white bg-emerald-700"
                        style={{ left: -35, top: 6, width: 22, height: 22, borderRadius: "50%", border: "2px solid white", outline: "1px solid #d1fae5" }}
                      >
                        {ph.phase}
                      </div>
                      <div className="border border-slate-200 overflow-hidden">
                        <div className="px-4 py-2 flex items-center justify-between bg-slate-50 border-b border-slate-100">
                          <p className="text-[11px] font-bold text-slate-900 tracking-tight">{ph.title}</p>
                          <span className="text-[9px] font-semibold px-2 py-0.5 text-emerald-700 bg-emerald-50 border border-emerald-200">{ph.duration}</span>
                        </div>
                        <div className="px-4 py-3 bg-white">
                          {ph.elements?.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-2">
                              {ph.elements.map((el, j) => (
                                <span
                                  key={j}
                                  className="px-2 py-0.5 text-[9px] font-medium text-slate-600 bg-slate-100 border border-slate-200"
                                >
                                  {el}
                                </span>
                              ))}
                            </div>
                          )}
                          <p className="text-[10px] italic leading-relaxed text-slate-500">{ph.rationale}</p>
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
