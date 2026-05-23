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

// ─── Mapbox Static API helper ──────────────────────────────────────────────────
function mapboxStaticUrl(
  boundaryGeojson: string | null | undefined,
  style: string,
  w = 640,
  h = 300,
  fillColor = "#4a9a28",
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
    const url = `https://api.mapbox.com/styles/v1/mapbox/${style}/static/geojson(${encoded})/${bboxStr}/${w}x${h}@2x?padding=60&access_token=${token}`;
    return url;
  } catch {
    return null;
  }
}

function PropertyMap({
  boundaryGeojson,
  style,
  caption,
  fillColor,
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
        className="w-full rounded-lg"
        style={{ display: "block", border: "1px solid #e5e7eb" }}
      />
      {caption && (
        <p className="mt-1.5 text-center text-[9px] uppercase tracking-widest" style={{ color: "#9ca3af" }}>
          {caption}
        </p>
      )}
    </div>
  );
}

function MapPlaceholder({ caption, message }: { caption?: string; message?: string }) {
  return (
    <div className="mb-4" style={{ pageBreakInside: "avoid" }}>
      <div
        className="w-full rounded-lg flex flex-col items-center justify-center gap-2"
        style={{ height: 180, background: "#f9fafb", border: "2px dashed #d1d5db" }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/>
        </svg>
        <p className="text-[11px] font-medium" style={{ color: "#9ca3af" }}>
          {message ?? "No boundary drawn on map yet"}
        </p>
        <p className="text-[10px]" style={{ color: "#d1d5db" }}>
          Draw your property boundary in the Map workspace to generate this map
        </p>
      </div>
      {caption && (
        <p className="mt-1.5 text-center text-[9px] uppercase tracking-widest" style={{ color: "#d1d5db" }}>{caption}</p>
      )}
    </div>
  );
}

function DocPlaceholder({ message }: { message: string }) {
  return (
    <div
      className="rounded-lg px-4 py-3 flex items-center gap-3"
      style={{ background: "#f9fafb", border: "1.5px dashed #e5e7eb" }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="2" style={{ flexShrink: 0 }}>
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <p className="text-[11px] italic" style={{ color: "#9ca3af" }}>{message}</p>
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

  // Southern hemisphere: sun transits through north (top of diagram)
  //   Summer (long day): SE(120°) → SW(240°), large CCW arc through N  → la=1, sw=0
  //   Winter (short day): ENE(65°) → WNW(295°), small CCW arc through N → la=0, sw=0
  // Northern hemisphere: sun transits through south (bottom)
  //   Summer: NNE(40°) → NNW(320°), large CW arc through S            → la=1, sw=1
  //   Winter: SE(120°) → SW(240°), small CW arc through S              → la=0, sw=1
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
        <circle cx={cx} cy={cy} r={r + 42} fill="#0c1a0c" />
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
        <circle cx={cx} cy={cy} r={r * 0.28} fill="rgba(74,154,40,0.28)" stroke="#4a9a28" strokeWidth="1.5" />
        <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle" fill="#6cc040" fontSize="8" fontWeight="bold">SITE</text>
        <polygon
          points={`${f(nTx)},${f(nTy)} ${f(nL1x)},${f(nL1y)} ${f(nL2x)},${f(nL2y)}`}
          fill="#f87171"
        />
        <circle cx={cx} cy={cy} r={r + 7} fill="none" stroke="rgba(255,255,255,0.13)" strokeWidth="0.5" />
        {compassPts.map(({ l, d }) => {
          const [lx, ly] = toXY(d, r + 20);
          return (
            <text key={l} x={f(lx)} y={f(ly)} fill={d % 90 === 0 ? "white" : "rgba(255,255,255,0.55)"}
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
            <div style={{ width: 10, height: 10, borderRadius: 2, background: color, opacity: 0.7 }} />
            <span style={{ fontSize: 9, color: "#6b7280" }}>{label}</span>
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
      {/* Soil column SVG */}
      <div>
        <p style={{ fontSize: 9, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
          Soil Profile Column
        </p>
        <svg viewBox="0 0 160 180" style={{ width: "100%", height: "auto" }}>
          {horizons.map((hz, i) => {
            const y = colY(i);
            return (
              <g key={hz.label}>
                <rect x={18} y={y} width={55} height={hz.h} fill={hz.fill} rx={2} />
                <text x={78} y={y + hz.h * 0.38} fontSize="8" fill="#374151" dominantBaseline="middle" fontWeight="bold">{hz.label}</text>
                <text x={78} y={y + hz.h * 0.65} fontSize="7" fill="#6b7280" dominantBaseline="middle">{hz.name}</text>
                <text x={14} y={y + 2} fontSize="6.5" fill="#9ca3af" textAnchor="end" dominantBaseline="hanging">{hz.depth.split("–")[0]}cm</text>
              </g>
            );
          })}
          {/* Organic dots in A horizon */}
          {[{x:28,y:44},{x:40,y:50},{x:54,y:42},{x:32,y:56},{x:48,y:62},{x:62,y:54}].map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={1.3} fill="rgba(0,0,0,0.25)" />
          ))}
          {/* Sand grains in B horizon */}
          {[{x:30,y:100},{x:44,y:110},{x:56,y:102},{x:38,y:118},{x:62,y:114}].map((p, i) => (
            <rect key={i} x={p.x} y={p.y} width={3} height={2} fill="rgba(255,255,255,0.15)" rx={0.5} />
          ))}
        </svg>
      </div>

      {/* Right panel */}
      <div style={{ paddingTop: 18 }}>
        {textureClass && (
          <div style={{ marginBottom: 10 }}>
            <span style={{ fontSize: 9, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.1em" }}>Texture Class</span>
            <div style={{ fontSize: 14, fontWeight: "bold", color: "#111827", marginTop: 2 }}>{textureClass}</div>
          </div>
        )}

        {rawTotal > 0 && (
          <div style={{ marginBottom: 12 }}>
            <p style={{ fontSize: 9, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
              Particle Composition
            </p>
            {[
              { label: "Clay",  pct: clayPct, color: "#b45309", imp: "Water retention · structure" },
              { label: "Silt",  pct: siltPct, color: "#78716c", imp: "Nutrient holding · erosion risk" },
              { label: "Sand",  pct: sandPct, color: "#d97706", imp: "Drainage · aeration" },
            ].map(({ label, pct, color, imp }) => (
              <div key={label} style={{ marginBottom: 7 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#374151", marginBottom: 2 }}>
                  <span style={{ fontWeight: 600 }}>{label}</span><span>{pct}%</span>
                </div>
                <div style={{ height: 7, background: "#f3f4f6", borderRadius: 4, overflow: "hidden", marginBottom: 2 }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 4 }} />
                </div>
                <div style={{ fontSize: 8, color: "#9ca3af" }}>{imp}</div>
              </div>
            ))}
          </div>
        )}

        {ph != null && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, marginBottom: 3 }}>
              <span style={{ textTransform: "uppercase", letterSpacing: "0.1em", color: "#6b7280" }}>Soil pH</span>
              <span style={{ fontWeight: "bold", color: phVal < 6 ? "#dc2626" : phVal < 7.5 ? "#16a34a" : "#2563eb" }}>{ph}</span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: "linear-gradient(to right,#ef4444,#f97316,#facc15,#22c55e,#60a5fa,#8b5cf6)", position: "relative" }}>
              <div style={{
                position: "absolute", top: -3, width: 7, height: 14,
                background: "white", border: "1.5px solid #374151", borderRadius: 3,
                left: `${Math.max(2, Math.min(96, ((phVal - 4) / 6) * 100))}%`,
                transform: "translateX(-50%)",
              }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 7, color: "#9ca3af", marginTop: 2 }}>
              <span>Acid 4</span><span>Neutral 7</span><span>Alkaline 10</span>
            </div>
          </div>
        )}

        {ocVal > 0 && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, marginBottom: 3 }}>
              <span style={{ textTransform: "uppercase", letterSpacing: "0.1em", color: "#6b7280" }}>Organic Carbon</span>
              <span style={{ fontWeight: "bold", color: "#374151" }}>{organicCarbon} g/kg</span>
            </div>
            <div style={{ height: 7, background: "#f3f4f6", borderRadius: 4, overflow: "hidden", marginBottom: 3 }}>
              <div style={{ height: "100%", width: `${ocWidth}%`, background: "linear-gradient(to right,#d97706,#7c2d12)", borderRadius: 4 }} />
            </div>
            <div style={{ fontSize: 8, color: "#6b7280" }}>
              {ocVal < 8 ? "⚠ Low — prioritise compost & mulching" : ocVal < 18 ? "Moderate — build with chop-and-drop & cover crops" : "High — excellent organic matter foundation"}
            </div>
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
      return c.geometry.coordinates as [number, number]; // [lng, lat]
    } catch { return null; }
  })();
  const siteLat = boundaryCentroid?.[1] ?? null;

  const today = new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });

  function handleExport() {
    window.print();
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "hsl(103, 18%, 7%)" }}>
      {/* ── TOP BAR (hidden on print) ── */}
      <header
        className="print:hidden shrink-0 flex items-center justify-between px-5 py-3 border-b sticky top-0 z-20"
        style={{ background: "hsl(103, 22%, 9%)", borderColor: "hsl(103, 30%, 15%)" }}
      >
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/properties")}
            className="flex items-center gap-2 transition-opacity hover:opacity-70"
            style={{ color: "hsl(42, 28%, 85%)" }}
          >
            <span className="text-base">🛡</span>
            <span className="text-[13px] font-bold tracking-tight hidden sm:inline">TerraGuard</span>
          </button>
          <div className="w-px h-4 hidden sm:block" style={{ background: "hsl(103, 22%, 22%)" }} />
          <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "hsl(84, 40%, 55%)" }}>
            Export Studio
          </span>
        </div>
        <div className="flex items-center gap-2">
          <StepNav />
          {/* Generate Client Link */}
          <button
            onClick={handleGenerateLink}
            disabled={!activePropertyId}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={linkCopied
              ? { background: "rgba(16,185,129,0.15)", color: "#10b981", border: "1px solid rgba(16,185,129,0.4)" }
              : { background: "rgba(99,102,241,0.1)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.3)" }
            }
            title="Copy client presentation link to clipboard"
          >
            {linkCopied ? (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20,6 9,17 4,12"/>
                </svg>
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
          {/* Export PDF */}
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-semibold transition-all"
            style={{ background: "linear-gradient(135deg, #1a4a0d, #3a8220)", color: "#e8f5e2", border: "1px solid #4a9a28", boxShadow: "0 2px 12px rgba(45,106,26,0.4)" }}
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
            <h3 className="text-base font-semibold" style={{ color: "hsl(42, 28%, 82%)" }}>No property selected</h3>
            <p className="text-sm" style={{ color: "hsl(42, 15%, 50%)" }}>Complete the intake and analysis steps first.</p>
            <button onClick={() => navigate("/intake")} className="mt-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold"
              style={{ background: "hsl(84, 38%, 22%)", color: "hsl(84, 55%, 80%)", border: "1px solid hsl(84, 35%, 30%)" }}>
              ← Start at Intake
            </button>
          </div>
        </div>
      )}

      {/* ── DOCUMENT ── */}
      {activePropertyId && (
        <main className="flex-1 px-4 py-10">
          <div
            className="mx-auto max-w-3xl rounded-2xl overflow-hidden print:shadow-none print:rounded-none"
            style={{ background: "#ffffff", boxShadow: "0 8px 40px rgba(0,0,0,0.45)" }}
          >
            {/* Document header */}
            <div
              className="px-10 py-8"
              style={{ background: "linear-gradient(135deg, #0a1a0a, #12280f)", borderBottom: "3px solid #2D6A1A" }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2.5 mb-3">
                    <span className="text-2xl">🛡</span>
                    <span className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: "#4a9a28" }}>
                      TerraGuard OS
                    </span>
                  </div>
                  <h1 className="text-2xl font-bold leading-tight text-white">
                    {property?.name ?? "Property Resilience Dossier"}
                  </h1>
                  <p className="text-[12px] mt-1.5" style={{ color: "#6cc040" }}>
                    Property Resilience & Autonomy Report
                  </p>
                </div>
                <div className="text-right shrink-0 ml-4">
                  {(property?.areaHectares ?? 0) > 0 && (
                    <div className="text-xl font-bold text-white">{property?.areaHectares?.toFixed(2)} ha</div>
                  )}
                  <div className="text-[10px] mt-0.5" style={{ color: "#4a9a28" }}>Generated {today}</div>
                </div>
              </div>
            </div>

            {/* Property satellite overview map */}
            {property?.boundaryGeojson ? (
              <div style={{ position: "relative" }}>
                <PropertyMap
                  boundaryGeojson={property.boundaryGeojson as unknown as string}
                  style="satellite-streets-v12"
                  fillColor="#4a9a28"
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
            <div className="px-10 py-8 space-y-8">
              {/* No brief */}
              {!brief && (
                <div className="rounded-xl p-6 text-center" style={{ background: "#fef3c7", border: "1px solid #d97706" }}>
                  <p className="text-sm font-semibold text-amber-800">Site survey not completed</p>
                  <p className="text-xs text-amber-700 mt-1">Complete the intake survey to populate this dossier.</p>
                </div>
              )}

              {brief && (
                <>
                  {/* Site Profile */}
                  <DocSection title="Site Profile">
                    <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
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
                    <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
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
                    <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
                      <DocField label="Primary goal" value={brief.primaryGoal ?? "—"} />
                      <DocField label="Maintenance capacity" value={brief.maintenanceCapacity ?? "—"} />
                    </div>
                  </DocSection>

                  {/* ── Mood Board & Concept Renders ── */}
                  <DocSection title="Client Mood Board">
                    {moodImages.length === 0 ? (
                      <p className="text-sm italic" style={{ color: "#9ca3af" }}>
                        No vision board photos uploaded yet. Ask the client to add inspiration photos via the Intake page.
                      </p>
                    ) : (
                      <div className="grid grid-cols-3 gap-2 mb-4">
                        {moodImages.map((src, i) => (
                          <div
                            key={i}
                            className="rounded-lg overflow-hidden"
                            style={{ aspectRatio: "4/3", background: "#f3f4f6", border: "1px solid #e5e7eb" }}
                          >
                            <img
                              src={src}
                              alt={`Mood board ${i + 1}`}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Designer-only: Generate AI Concept Renders */}
                    {role === "designer" && (
                      <div
                        className="print:hidden mt-4 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                        style={{ background: "linear-gradient(135deg, #1e1048, #2d1564)", border: "1px solid #4c1d95" }}
                      >
                        <div>
                          <p className="text-[12px] font-bold" style={{ color: "#c4b5fd" }}>AI Concept Renders</p>
                          <p className="text-[11px] mt-0.5" style={{ color: "#7c6aa6" }}>
                            Generate photorealistic concept renders from the client's mood board using Google Imagen.
                          </p>
                        </div>
                        <button
                          onClick={() => { /* placeholder — Google Imagen integration */ }}
                          className="shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl text-[12px] font-bold transition-all"
                          style={{
                            background: "linear-gradient(135deg, #4c1d95, #6d28d9)",
                            color: "#ede9fe",
                            border: "1px solid #7c3aed",
                            boxShadow: "0 4px 18px rgba(109,40,217,0.45)",
                          }}
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
                      <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
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
                        <p className="text-xs mb-4" style={{ color: "#6b7280" }}>
                          Generated {new Date(brief.aiAnalysisGeneratedAt).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}
                        </p>
                      )}
                      <div className="space-y-5">
                        {[
                          { key: "WaterStrategy",         title: "💧 Water Strategy",        accent: "#dbeafe", border: "#3b82f6" },
                          { key: "SunAndEnergy",          title: "☀️ Sun & Energy",           accent: "#fef9c3", border: "#ca8a04" },
                          { key: "SoilAndFertility",      title: "🌱 Soil & Fertility",       accent: "#fef3c7", border: "#92400e" },
                          { key: "LandAndBiodiversity",   title: "🌾 Land & Biodiversity",    accent: "#dcfce7", border: "#16a34a" },
                          { key: "ClimateResilience",     title: "🛡 Climate Resilience",     accent: "#e0e7ff", border: "#6366f1" },
                          { key: "InfrastructureCritique",title: "⚠️ Infrastructure Critique", accent: "#fff7ed", border: "#ea580c" },
                        ].map(({ key, title, accent, border }) => {
                          const val = aiReport
                            ? (aiReport as unknown as Record<string, unknown>)[key]
                            : undefined;
                          const isMissing = val === undefined || val === null;

                          // Visual panels for mapped sections
                          let visualPanel: React.ReactNode = null;
                          if (key === "WaterStrategy") {
                            visualPanel = (
                              <div className="px-4 pt-3" style={{ background: "#f9fafb" }}>
                                {property?.boundaryGeojson ? (
                                  <PropertyMap
                                    boundaryGeojson={property.boundaryGeojson as unknown as string}
                                    style="outdoors-v12"
                                    fillColor="#3b82f6"
                                    caption="Terrain & contour map — darker shading = higher elevation, contour lines show water flow paths"
                                  />
                                ) : (
                                  <MapPlaceholder caption="Terrain & contour map" />
                                )}
                                <div
                                  className="mb-3 rounded-lg px-3 py-2 text-[10px] leading-relaxed"
                                  style={{ background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1e40af" }}
                                >
                                  <strong>Reading the map:</strong> Contour lines show elevation — water flows perpendicular to them, from high ground to low. Shade relief reveals ridges (water divides) and valleys (natural collection points). Swales should follow contour lines; dams sit at valley heads below natural catchment areas.
                                </div>
                              </div>
                            );
                          } else if (key === "SunAndEnergy") {
                            visualPanel = (
                              <div className="px-4 pt-3 pb-1" style={{ background: "#f9fafb" }}>
                                <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 16, alignItems: "start" }}>
                                  <SunSectorDiagram lat={siteLat} prevailingWind={brief?.prevailingWindDir} />
                                  <div style={{ paddingTop: 8 }}>
                                    <p style={{ fontSize: 9, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700, marginBottom: 6 }}>
                                      How to read this diagram
                                    </p>
                                    <ul style={{ fontSize: 10, color: "#374151", lineHeight: 1.7, paddingLeft: 14, margin: 0 }}>
                                      <li><strong>Amber band</strong> — summer sun zone: maximum solar exposure, highest UV</li>
                                      <li><strong>Blue band</strong> — winter sun zone: reduced arc, shade from buildings/trees has greater impact</li>
                                      <li><strong>Blue wedge</strong> — prevailing wind sector: windbreaks should intercept this zone</li>
                                      <li><strong>Red arrow</strong> — north (compass true north)</li>
                                      <li>Food gardens &amp; solar panels: position in the summer sun zone, away from winter shade sources</li>
                                      <li>Fire-breaks &amp; wind-sensitive crops: protect from the wind wedge sector</li>
                                    </ul>
                                    {brief?.solarIrradianceKwhM2 != null && (
                                      <div style={{ marginTop: 10, padding: "6px 10px", borderRadius: 6, background: "#fef9c3", border: "1px solid #fde68a" }}>
                                        <span style={{ fontSize: 9, color: "#92400e", fontWeight: 700 }}>Solar irradiance: </span>
                                        <span style={{ fontSize: 11, color: "#78350f", fontWeight: 800 }}>{brief.solarIrradianceKwhM2.toLocaleString()} kWh/m²/yr</span>
                                        <span style={{ fontSize: 8, color: "#a16207", marginLeft: 4 }}>
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
                              <div className="px-4 pt-3 pb-1" style={{ background: "#f9fafb" }}>
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
                            <div key={key} className="rounded-xl overflow-hidden" style={{ border: `1px solid ${border}40` }}>
                              <div className="px-4 py-2.5 text-[11px] font-bold" style={{ background: accent, borderBottom: `1px solid ${border}40`, color: "#374151" }}>
                                {title}
                              </div>
                              {visualPanel}
                              <div className="px-4 py-3 text-[12px] leading-relaxed" style={{ background: "#f9fafb", color: "#374151" }}>
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
                      <p className="text-sm italic" style={{ color: "#9ca3af" }}>
                        No analysis run yet. Go to The War Room to generate the AI resilience report.
                      </p>
                      <button
                        onClick={() => navigate("/analysis")}
                        className="print:hidden mt-3 px-4 py-2 rounded-xl text-[12px] font-semibold"
                        style={{ background: "#1a4a0d", color: "#e8f5e2", border: "1px solid #4a9a28" }}
                      >
                        Run Analysis →
                      </button>
                    </DocSection>
                  )}
                </>
              )}

              {/* Document footer */}
              <div className="border-t pt-6 flex items-center justify-between" style={{ borderColor: "#e5e7eb" }}>
                <span className="text-[10px]" style={{ color: "#9ca3af" }}>
                  TerraGuard OS · Autonomous Property Resilience Platform
                </span>
                <span className="text-[10px]" style={{ color: "#9ca3af" }}>{today}</span>
              </div>
            </div>
          </div>

          {/* Bottom nav (hidden on print) */}
          <div className="print:hidden mt-6 mx-auto max-w-3xl flex items-center justify-between">
            <button
              onClick={() => navigate("/analysis")}
              className="text-[11px] px-3 py-1.5 rounded-lg"
              style={{ color: "hsl(42, 20%, 55%)", border: "1px solid hsl(103, 22%, 20%)", background: "transparent" }}
            >
              ← Analysis
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold"
              style={{ background: "linear-gradient(135deg, #1a4a0d, #3a8220)", color: "#e8f5e2", border: "1px solid #4a9a28" }}
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
      <h2
        className="text-[10px] font-bold uppercase tracking-[0.15em] mb-3 pb-2 flex items-center gap-2"
        style={{ color: "#4c1d95", borderBottom: "1.5px solid #ede9fe" }}
      >
        <Fingerprint size={12} strokeWidth={2} style={{ color: "#7c3aed", flexShrink: 0 }} />
        Pattern Strategy
      </h2>
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: "1px solid #ddd6fe", background: "linear-gradient(135deg, #faf5ff, #f5f3ff)" }}
      >
        {pattern.recommendedPattern && (
          <div
            className="px-5 py-3 flex items-center gap-3"
            style={{ background: "linear-gradient(135deg, #4c1d95, #6d28d9)", borderBottom: "1px solid #ddd6fe" }}
          >
            <Fingerprint size={16} strokeWidth={1.8} style={{ color: "#e9d5ff", flexShrink: 0 }} />
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "#c4b5fd" }}>
                Recommended Pattern
              </div>
              <div className="text-[15px] font-bold text-white leading-tight">
                {pattern.recommendedPattern}
              </div>
            </div>
          </div>
        )}
        <div className="px-5 py-4 space-y-4">
          {pattern.rationale && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#7c3aed" }} />
                <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "#7c3aed" }}>
                  Why Nature Uses This Form
                </span>
              </div>
              <p className="text-[12px] leading-relaxed" style={{ color: "#374151" }}>
                {pattern.rationale}
              </p>
            </div>
          )}
          {pattern.application && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#5b21b6" }} />
                <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "#5b21b6" }}>
                  Site Application
                </span>
              </div>
              <p className="text-[12px] leading-relaxed" style={{ color: "#374151" }}>
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
      <h2
        className="text-[10px] font-bold uppercase tracking-[0.15em] mb-3 pb-2"
        style={{ color: "#2D6A1A", borderBottom: "1.5px solid #dcfce7" }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function DocField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: "#9ca3af" }}>{label}</span>
      <span className="text-[13px] font-medium" style={{ color: "#111827" }}>{value}</span>
    </div>
  );
}

function AiTableDoc({ rows }: { rows: unknown[] }) {
  if (!rows.length) return null;
  const first = rows[0];
  if (typeof first !== "object" || first === null) {
    return (
      <ul className="list-disc pl-4 space-y-1">
        {rows.map((r, i) => <li key={i}>{String(r)}</li>)}
      </ul>
    );
  }
  const keys = Object.keys(first as object);
  return (
    <table className="w-full text-[11px] border-collapse">
      <thead>
        <tr>
          {keys.map((k) => (
            <th key={k} className="text-left py-1 pr-3 font-semibold uppercase text-[9px] tracking-wider border-b" style={{ color: "#6b7280", borderColor: "#e5e7eb" }}>{k}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="border-b" style={{ borderColor: "#f3f4f6" }}>
            {keys.map((k) => (
              <td key={k} className="py-1.5 pr-3 align-top" style={{ color: "#374151" }}>
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
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: "#6b7280" }}>{key}</div>
          {Array.isArray(val) ? (
            <AiTableDoc rows={val} />
          ) : typeof val === "object" && val !== null ? (
            <AiObjectDoc obj={val as Record<string, unknown>} />
          ) : (
            <p>{String(val)}</p>
          )}
        </div>
      ))}
    </div>
  );
}
