import { useLocation } from "wouter";
import * as turf from "@turf/turf";
import patternMark from "@assets/pattern-mark.png";
import {
  useGetProperty,
  useGetClientBrief,
  useListZones,
  useListStructures,
  useListDesignedSwales,
  useListPathways,
  useListSectors,
  getGetPropertyQueryKey,
  getGetClientBriefQueryKey,
  getListZonesQueryKey,
  getListStructuresQueryKey,
  getListDesignedSwalesQueryKey,
  getListPathwaysQueryKey,
  getListSectorsQueryKey,
} from "@workspace/api-client-react";
import type { SiteAnalysisReport } from "@workspace/api-client-react";
import { useAppStore } from "@/store/useAppStore";
import { StepNav } from "@/components/StepNav";

// ─── Tokens ───────────────────────────────────────────────────────────────────
const FOREST  = "#2c3525";
const MID     = "#4a5d3f";
const CREAM   = "#fcf9f2";
const INK     = "#1a1c18";
const TAN     = "#6b5f4e";
const RULE    = "1px solid rgba(44,53,37,0.14)";
const LIGHT   = "#f4f1eb";
// Card palette — sage highlights on deep green
const CARD_BG_A = "#233020";
const CARD_BG_B = "#1c2a1a";
const CARD_SAGE = "rgba(196,218,168,0.55)";
const CARD_DIM  = "rgba(196,218,168,0.35)";

// ─── Interfaces ───────────────────────────────────────────────────────────────
interface PlantRec { name: string; latinName?: string; layer: string; purpose: string; zones?: string; notes?: string; }
interface DesignRecsType { plantingPrinciples?: string; plants?: PlantRec[]; }

// ─── Guild data ───────────────────────────────────────────────────────────────
// Organic muted palette: warm bark → deep moss → sage olive → clay ochre
const GUILD_LAYERS = [
  {
    layer: "Canopy · Fruit",
    height: "6–10 m",
    spacing: "Central anchor",
    color: "#3d2e1e",
    lightColor: "rgba(61,46,30,0.09)",
    plants: ["Apple", "Pear", "Plum", "Cherry", "Mulberry"],
    role: "Primary food yield; shade & shelter for lower layers",
    notes: "Plant 6–8 m apart. Prune to open-vase form for light penetration.",
  },
  {
    layer: "Nitrogen Fixer",
    height: "3–5 m",
    spacing: "2–3 m from trunk",
    color: "#3a5c2e",
    lightColor: "rgba(58,92,46,0.09)",
    plants: ["Autumn Olive", "Tagasaste", "Siberian Pea Tree", "Black Locust"],
    role: "Fixes atmospheric nitrogen via root bacteria; fast biomass",
    notes: "Coppice annually at 1 m to maximise nitrogen flush and mulch.",
  },
  {
    layer: "Dynamic Accumulator",
    height: "0.5–1.5 m",
    spacing: "0.5–1.5 m from trunk",
    color: "#6b8a45",
    lightColor: "rgba(107,138,69,0.1)",
    plants: ["Comfrey", "Yarrow", "Borage", "Chicory", "Dandelion"],
    role: "Mines deep nutrients; chop-and-drop creates living mulch",
    notes: "Comfrey: plant 3–4 per tree. Chop 3×/season before flowering.",
  },
  {
    layer: "Insectary · Herb",
    height: "0–0.5 m",
    spacing: "Ground cover",
    color: "#b08650",
    lightColor: "rgba(176,134,80,0.1)",
    plants: ["Fennel", "Dill", "Lavender", "Phacelia", "Chamomile"],
    role: "Attracts predatory insects & pollinators; aromatic pest deterrent",
    notes: "Allow to flower. Fennel: keep 1.5 m from other herbs — allelopathic.",
  },
];

// ─── Mapbox static helper ─────────────────────────────────────────────────────
function staticMapUrl(
  geo: string | null | undefined,
  style: string,
  w = 800, h = 400,
  fill = FOREST,
): string | null {
  const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
  if (!token || !geo) return null;
  try {
    const parsed = JSON.parse(geo);
    const feat = (parsed.type === "Feature"
      ? parsed
      : { type: "Feature", geometry: parsed, properties: {} }) as GeoJSON.Feature;
    const simp = turf.simplify(
      feat as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
      { tolerance: 0.00008, highQuality: false },
    );
    const enc = encodeURIComponent(
      JSON.stringify({
        ...simp,
        properties: {
          stroke: fill,
          "stroke-width": 3,
          "stroke-opacity": 1,
          fill,
          "fill-opacity": 0.12,
        },
      }),
    );
    const bb = turf.bbox(feat);
    return `https://api.mapbox.com/styles/v1/mapbox/${style}/static/geojson(${enc})/[${bb[0]},${bb[1]},${bb[2]},${bb[3]}]/${w}x${h}@2x?padding=56&access_token=${token}`;
  } catch {
    return null;
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function SectionHeader({ n, title, sub }: { n: string; title: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 52 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 22 }}>
        <span style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: "0.26em",
          color: MID,
          whiteSpace: "nowrap",
        }}>{n}</span>
        <div style={{ flex: 1, height: 1, background: `linear-gradient(to right, rgba(74,93,63,0.45), rgba(74,93,63,0.06))` }} />
      </div>
      <h2 style={{
        margin: 0,
        fontFamily: "'Fraunces', Georgia, serif",
        fontSize: "clamp(30px,4vw,52px)",
        fontWeight: 400,
        fontStyle: "italic",
        letterSpacing: "-0.025em",
        color: INK,
        lineHeight: 1.0,
      }}>{title}</h2>
      {sub && <p style={{ margin: "16px 0 0", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: TAN, lineHeight: 1.75, maxWidth: 620 }}>{sub}</p>}
    </div>
  );
}

function MetricCard({ label, value, unit, sub }: { label: string; value: string | number | null | undefined; unit?: string; sub?: string }) {
  const display = value != null ? String(value) : "—";
  const hasValue = value != null;
  return (
    <div style={{
      borderRadius: 8,
      padding: "22px 20px 20px",
      background: `linear-gradient(150deg, ${CARD_BG_A} 0%, ${CARD_BG_B} 100%)`,
      border: "1px solid rgba(138,171,106,0.16)",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05), 0 4px 18px rgba(0,0,0,0.22)",
    }}>
      <div style={{
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 8,
        textTransform: "uppercase",
        letterSpacing: "0.22em",
        color: CARD_SAGE,
        marginBottom: 16,
        lineHeight: 1,
      }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
        <span style={{
          fontFamily: "'Fraunces', Georgia, serif",
          fontSize: 38,
          fontWeight: 400,
          letterSpacing: "-0.03em",
          color: hasValue ? CREAM : "rgba(196,218,168,0.18)",
          lineHeight: 1,
        }}>{display}</span>
        {unit && hasValue && (
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: CARD_DIM, letterSpacing: "0.04em" }}>{unit}</span>
        )}
      </div>
      {sub && (
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 8, color: "rgba(196,218,168,0.38)", marginTop: 10, letterSpacing: "0.06em" }}>{sub}</div>
      )}
    </div>
  );
}

function SunDiagram({ lat, wind }: { lat?: number | null; wind?: string | null }) {
  const cx = 120, cy = 120, r = 82;
  const isN = (lat ?? -33) >= 0;
  const f = (n: number) => n.toFixed(1);
  function xy(deg: number, rad: number): [number, number] {
    const a = ((deg - 90) * Math.PI) / 180;
    return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
  }
  function arc(s: number, e: number, r1: number, r2: number, la: 0 | 1, sw: 0 | 1) {
    const [s1x, s1y] = xy(s, r2); const [e1x, e1y] = xy(e, r2);
    const [s2x, s2y] = xy(s, r1); const [e2x, e2y] = xy(e, r1);
    const rsw: 0 | 1 = sw === 0 ? 1 : 0;
    return `M${f(s1x)} ${f(s1y)} A${r2} ${r2} 0 ${la} ${sw} ${f(e1x)} ${f(e1y)} L${f(e2x)} ${f(e2y)} A${r1} ${r1} 0 ${la} ${rsw} ${f(s2x)} ${f(s2y)}Z`;
  }
  const [sumS, sumE, sumLa, sumSw, winS, winE, winLa, winSw]: [number, number, 0 | 1, 0 | 1, number, number, 0 | 1, 0 | 1] =
    isN ? [40, 320, 1, 1, 120, 240, 0, 1] : [120, 240, 1, 0, 65, 295, 0, 0];
  const wm: Record<string, number> = { N: 0, NNE: 22, NE: 45, ENE: 67, E: 90, ESE: 112, SE: 135, SSE: 157, S: 180, SSW: 202, SW: 225, WSW: 247, W: 270, WNW: 292, NW: 315, NNW: 337 };
  const wk = (wind ?? "").toUpperCase().replace(/[^A-Z]/g, "");
  const wd = wm[wk] ?? 270;
  const [nTx, nTy] = xy(0, r * 0.42);
  const [nL1x, nL1y] = xy(348, r * 0.32);
  const [nL2x, nL2y] = xy(12, r * 0.32);
  const compass = [{ l: "N", d: 0 }, { l: "E", d: 90 }, { l: "S", d: 180 }, { l: "W", d: 270 }];
  return (
    <svg viewBox="0 0 240 240" style={{ width: "100%", maxWidth: 220, height: "auto", display: "block" }}>
      <circle cx={cx} cy={cy} r={r + 36} fill={CREAM} />
      {[0.38, 0.58, 0.78, 0.96].map(fr => <circle key={fr} cx={cx} cy={cy} r={r * fr} fill="none" stroke="#eee" strokeWidth="0.7" />)}
      {[0, 45, 90, 135].map(d => { const [x1, y1] = xy(d, r * 0.96); const [x2, y2] = xy(d + 180, r * 0.96); return <line key={d} x1={f(x1)} y1={f(y1)} x2={f(x2)} y2={f(y2)} stroke="#eee" strokeWidth="0.7" />; })}
      <path d={arc(wd - 26, wd + 26, r * 0.28, r * 0.86, 0, 1)} fill="rgba(160,82,45,0.14)" stroke={TAN} strokeWidth="1.5" />
      <path d={arc(winS, winE, r * 0.34, r * 0.52, winLa, winSw)} fill="rgba(96,165,250,0.18)" stroke="#60a5fa" strokeWidth="1" />
      <path d={arc(sumS, sumE, r * 0.52, r * 0.92, sumLa, sumSw)} fill="rgba(251,191,36,0.16)" stroke="#f59e0b" strokeWidth="1.5" />
      <circle cx={cx} cy={cy} r={r * 0.28} fill={LIGHT} stroke="#ddd" strokeWidth="1" />
      <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle" fill={INK} fontSize="6" fontFamily="monospace" fontWeight="900" letterSpacing="0.08em">SITE</text>
      <polygon points={`${f(nTx)},${f(nTy)} ${f(nL1x)},${f(nL1y)} ${f(nL2x)},${f(nL2y)}`} fill="#ef4444" />
      {compass.map(({ l, d }) => { const [lx, ly] = xy(d, r + 18); return <text key={l} x={f(lx)} y={f(ly)} fill={d % 90 === 0 ? INK : "#aaa"} fontSize={9} fontWeight="900" textAnchor="middle" dominantBaseline="middle" fontFamily="monospace">{l}</text>; })}
    </svg>
  );
}

function SpacingDiagram() {
  const cx = 140, cy = 140;
  // Radii and organic muted palette matching GUILD_LAYERS
  const rings = [
    { r: 18,  color: "#3d2e1e", label: "Canopy",      spacing: "centre",     dash: false },
    { r: 46,  color: "#3a5c2e", label: "N-Fixer",     spacing: "2–3 m",      dash: true  },
    { r: 76,  color: "#6b8a45", label: "Accumulator", spacing: "0.5–1.5 m",  dash: true  },
    { r: 114, color: "#b08650", label: "Insectary",   spacing: "ground",     dash: true  },
  ];
  const labelAngles = [-72, -48, -24, 0];
  return (
    <svg viewBox="0 0 280 280" style={{ width: "100%", maxWidth: 260, height: "auto", display: "block" }}>
      {/* Cream background */}
      <rect width="280" height="280" fill={CREAM} rx="4" />
      {/* Subtle grid rings */}
      {[0.3, 0.55, 0.78].map(fr => (
        <circle key={fr} cx={cx} cy={cy} r={114 * fr} fill="none" stroke="rgba(44,53,37,0.07)" strokeWidth="0.5" />
      ))}
      {/* Guild rings — outermost first so inner rings draw on top */}
      {[...rings].reverse().map((ring, ri) => {
        const i = rings.length - 1 - ri;
        return (
          <circle
            key={i}
            cx={cx} cy={cy} r={ring.r}
            fill={ring.color + "1a"}
            stroke={ring.color}
            strokeWidth={i === 0 ? 2 : 1.5}
            strokeDasharray={ring.dash ? "5 3" : undefined}
            strokeLinecap="round"
          />
        );
      })}
      {/* Leader lines + labels */}
      {rings.map((ring, i) => {
        const angleDeg = labelAngles[i];
        const rad = (angleDeg * Math.PI) / 180;
        const x0 = cx + ring.r * Math.cos(rad);
        const y0 = cy + ring.r * Math.sin(rad);
        const x1 = cx + (ring.r + 18) * Math.cos(rad);
        const y1 = cy + (ring.r + 18) * Math.sin(rad);
        const anchor = x1 > cx ? "start" : "end";
        const dx = x1 > cx ? 3 : -3;
        return (
          <g key={i}>
            <line x1={x0} y1={y0} x2={x1} y2={y1} stroke={ring.color} strokeWidth="1" strokeOpacity="0.7" />
            <text x={x1 + dx} y={y1 - 2} fill={ring.color} fontSize="7.5" fontFamily="'IBM Plex Mono', monospace" fontWeight="600" textAnchor={anchor} dominantBaseline="auto" letterSpacing="0.04em">{ring.label}</text>
            <text x={x1 + dx} y={y1 + 9} fill={ring.color + "99"} fontSize="6" fontFamily="'IBM Plex Mono', monospace" textAnchor={anchor} dominantBaseline="auto">{ring.spacing}</text>
          </g>
        );
      })}
      {/* Centre trunk dot */}
      <circle cx={cx} cy={cy} r={6} fill="#3d2e1e" />
      <circle cx={cx} cy={cy} r={3} fill={CREAM} />
      <text x={cx} y={cy + 22} textAnchor="middle" fill={INK} fontSize="6.5" fontFamily="'IBM Plex Mono', monospace" fontWeight="700" letterSpacing="0.1em">TRUNK</text>
    </svg>
  );
}

function MapFrame({ url, caption, fallback }: { url: string | null; caption: string; fallback?: string }) {
  if (!url) {
    return (
      <figure style={{ margin: 0 }}>
        <div style={{ width: "100%", height: 200, border: RULE, background: LIGHT, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21,15 16,10 5,21" /></svg>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.12em", color: "#bbb" }}>{fallback ?? "Map unavailable"}</span>
        </div>
        <figcaption style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.14em", color: "#bbb", marginTop: 8 }}>{caption}</figcaption>
      </figure>
    );
  }
  return (
    <figure style={{ margin: 0 }}>
      <img src={url} alt={caption} style={{ display: "block", width: "100%", border: RULE }} />
      <figcaption style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.14em", color: "#aaa", marginTop: 8 }}>{caption}</figcaption>
    </figure>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function MasterDesignPage() {
  const [, navigate] = useLocation();
  const { activePropertyId } = useAppStore();
  const pid = activePropertyId ?? "";

  const { data: property } = useGetProperty(pid, { query: { enabled: !!pid, queryKey: getGetPropertyQueryKey(pid) } });
  const { data: brief }    = useGetClientBrief(pid, { query: { enabled: !!pid, queryKey: getGetClientBriefQueryKey(pid) } });
  const { data: zones }    = useListZones(pid, { query: { enabled: !!pid, queryKey: getListZonesQueryKey(pid) } });
  const { data: structs }  = useListStructures(pid, { query: { enabled: !!pid, queryKey: getListStructuresQueryKey(pid) } });
  const { data: swales }   = useListDesignedSwales(pid, { query: { enabled: !!pid, queryKey: getListDesignedSwalesQueryKey(pid) } });
  const { data: paths }    = useListPathways(pid, { query: { enabled: !!pid, queryKey: getListPathwaysQueryKey(pid) } });
  const { data: sectors }  = useListSectors(pid, { query: { enabled: !!pid, queryKey: getListSectorsQueryKey(pid) } });

  const geo = property?.boundaryGeojson as unknown as string | null | undefined;

  const boundaryCentroid = (() => {
    if (!geo) return null;
    try { return turf.centroid(JSON.parse(geo) as Parameters<typeof turf.centroid>[0]).geometry.coordinates as [number, number]; } catch { return null; }
  })();
  const siteLat = boundaryCentroid?.[1] ?? null;

  const aiReport: SiteAnalysisReport | null = (() => {
    if (!brief?.aiAnalysisReport) return null;
    try { return JSON.parse(brief.aiAnalysisReport); } catch { return null; }
  })();
  const designRecs: DesignRecsType | null = (() => {
    if (!aiReport?.DesignRecommendations) return null;
    try { return aiReport.DesignRecommendations as unknown as DesignRecsType; } catch { return null; }
  })();

  const today = new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });

  const satelliteUrl    = staticMapUrl(geo, "satellite-streets-v12", 1600, 600, FOREST);
  const terrainUrl      = staticMapUrl(geo, "outdoors-v12", 800, 380, "#3b6ea5");
  const satelliteThumbUrl = staticMapUrl(geo, "satellite-v9", 800, 380, FOREST);

  const layerCounts = {
    zones: zones?.length ?? 0,
    structures: structs?.length ?? 0,
    swales: swales?.length ?? 0,
    pathways: paths?.length ?? 0,
    sectors: sectors?.length ?? 0,
  };
  const hasLayers = Object.values(layerCounts).some(v => v > 0);

  return (
    <div style={{ minHeight: "100vh", background: LIGHT, color: INK, fontFamily: "'Fraunces', Georgia, serif" }}>
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=IBM+Plex+Mono:ital,wght@0,400;0,500;1,400&display=swap');
        .mono { font-family: 'IBM Plex Mono', monospace !important; }
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
        }
      `}} />

      {/* ── NAV ──────────────────────────────────────────────────────────────── */}
      <header className="no-print" style={{
        background: "#fff", borderBottom: RULE,
        position: "sticky", top: 0, zIndex: 20,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 28px", height: 54, boxShadow: "0 2px 6px rgba(44,36,22,0.06)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => navigate("/properties")} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, color: INK, padding: 0 }}>
            <img src={patternMark} alt="Pattern" style={{ height: 26, width: "auto" }} />
            <span style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 14 }}>Pattern</span>
          </button>
          <div style={{ width: 1, height: 16, background: "#ddd6cc" }} />
          <span className="mono" style={{ fontSize: 11, fontWeight: 600, color: MID }}>Master Design</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <StepNav />
          <button onClick={() => window.print()} className="mono" style={{ fontSize: 11, fontWeight: 500, padding: "6px 14px", background: "#fff", color: INK, border: RULE, cursor: "pointer" }}>
            Export PDF
          </button>
        </div>
      </header>

      {/* ── NO PROPERTY ──────────────────────────────────────────────────────── */}
      {!activePropertyId && (
        <div className="no-print" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
          <div style={{ textAlign: "center" }}>
            <div className="mono" style={{ fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "#bbb", marginBottom: 20 }}>No property selected</div>
            <button onClick={() => navigate("/intake")} className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", padding: "10px 20px", border: RULE, background: "#fff", cursor: "pointer", color: INK }}>← Start at Intake</button>
          </div>
        </div>
      )}

      {activePropertyId && (
        <main>

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* ── SECTION 1: COVER ──────────────────────────────────────────── */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          <section style={{ position: "relative", minHeight: 480, background: FOREST, color: CREAM, overflow: "hidden" }}>

            {/* Background satellite image */}
            {satelliteUrl && (
              <div style={{ position: "absolute", inset: 0 }}>
                <img src={satelliteUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.28, display: "block" }} />
                <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${FOREST}f0 0%, ${FOREST}cc 60%, rgba(26,30,20,0.75) 100%)` }} />
              </div>
            )}
            {!satelliteUrl && (
              <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${FOREST} 0%, #1a2c14 50%, #0e1a0a 100%)` }} />
            )}

            {/* Cover content */}
            <div style={{ position: "relative", zIndex: 1, maxWidth: 920, margin: "0 auto", padding: "56px 48px 64px" }}>

              {/* Studio badge */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 48 }}>
                <img src={patternMark} alt="Pattern Studio" style={{ height: 32, width: "auto", filter: "brightness(0) invert(1)", opacity: 0.85 }} />
                <div style={{ width: 1, height: 24, background: "rgba(252,249,242,0.25)" }} />
                <span className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", color: "rgba(252,249,242,0.6)" }}>Pattern Studio · Client Deliverable</span>
              </div>

              {/* Title */}
              <div style={{ marginBottom: 40 }}>
                <span className="mono" style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.22em", color: "rgba(252,249,242,0.4)", display: "block", marginBottom: 12 }}>The</span>
                <h1 style={{ fontSize: "clamp(44px,7vw,88px)", fontWeight: 300, lineHeight: 0.95, letterSpacing: "-0.025em", margin: 0, color: CREAM }}>
                  Pattern<br />
                  <em style={{ fontStyle: "italic", color: "#8aab6a" }}>Master</em><br />
                  Design
                </h1>
              </div>

              {/* Meta row */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "20px 48px", paddingTop: 32, borderTop: "1px solid rgba(252,249,242,0.15)" }}>
                <div>
                  <div className="mono" style={{ fontSize: 8, textTransform: "uppercase", letterSpacing: "0.18em", color: "rgba(252,249,242,0.4)", marginBottom: 4 }}>Property</div>
                  <div style={{ fontSize: 20, fontWeight: 300, color: CREAM }}>{property?.name ?? "Unnamed Property"}</div>
                </div>
                {(property?.areaHectares ?? 0) > 0 && (
                  <div>
                    <div className="mono" style={{ fontSize: 8, textTransform: "uppercase", letterSpacing: "0.18em", color: "rgba(252,249,242,0.4)", marginBottom: 4 }}>Site Area</div>
                    <div style={{ fontSize: 20, fontWeight: 300, color: CREAM }}>
                      {property?.areaHectares?.toFixed(2)} <span className="mono" style={{ fontSize: 12, color: "rgba(252,249,242,0.5)" }}>ha</span>
                      {(property?.areaAcres ?? 0) > 0 && <span style={{ fontSize: 14, color: "rgba(252,249,242,0.45)" }}> · {property?.areaAcres?.toFixed(1)} ac</span>}
                    </div>
                  </div>
                )}
                {brief?.climateZone && (
                  <div>
                    <div className="mono" style={{ fontSize: 8, textTransform: "uppercase", letterSpacing: "0.18em", color: "rgba(252,249,242,0.4)", marginBottom: 4 }}>Climate Zone</div>
                    <div style={{ fontSize: 20, fontWeight: 300, color: CREAM }}>{brief.climateZone}</div>
                  </div>
                )}
                <div style={{ marginLeft: "auto" }}>
                  <div className="mono" style={{ fontSize: 8, textTransform: "uppercase", letterSpacing: "0.18em", color: "rgba(252,249,242,0.4)", marginBottom: 4 }}>Prepared</div>
                  <div className="mono" style={{ fontSize: 12, color: "rgba(252,249,242,0.65)" }}>{today}</div>
                </div>
              </div>
            </div>
          </section>

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* ── SECTION 2: MACRO SITE ANALYSIS ──────────────────────────────── */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          <section style={{ background: CREAM, padding: "72px 0" }}>
            <div style={{ maxWidth: 920, margin: "0 auto", padding: "0 48px" }}>
              <SectionHeader
                n="01 — Macro Site Analysis"
                title="Climate & Solar Profile"
                sub="Derived automatically from site coordinates via Open-Meteo 3-year archive + NASA POWER 30-year climatology."
              />

              {/* Climate metrics grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: 40 }}>
                <MetricCard label="Annual Rainfall" value={brief?.annualRainfallMm != null ? Math.round(brief.annualRainfallMm) : null} unit="mm/yr" />
                <MetricCard label="Frost Days" value={brief?.frostDaysPerYear != null ? Math.round(brief.frostDaysPerYear) : null} unit="days/yr" sub={brief?.frostDaysPerYear != null ? (brief.frostDaysPerYear < 10 ? "Low frost risk" : brief.frostDaysPerYear < 30 ? "Moderate frost" : "High frost zone") : undefined} />
                <MetricCard label="Solar Irradiance" value={brief?.solarIrradianceKwhM2 != null ? Math.round(brief.solarIrradianceKwhM2) : null} unit="kWh/m²/yr" />
                <MetricCard label="Mean Annual Temp" value={brief?.meanAnnualTempC != null ? brief.meanAnnualTempC.toFixed(1) : null} unit="°C" />
                <MetricCard label="Summer Max" value={brief?.summerMaxTempC != null ? brief.summerMaxTempC.toFixed(1) : null} unit="°C" />
                <MetricCard label="Winter Min" value={brief?.winterMinTempC != null ? brief.winterMinTempC.toFixed(1) : null} unit="°C" />
                <MetricCard label="Elevation" value={brief?.elevationM != null ? Math.round(brief.elevationM) : null} unit="m ASL" />
                <MetricCard label="Prevailing Wind" value={brief?.prevailingWindDir ?? null} unit={brief?.meanWindSpeedMs != null ? `${brief.meanWindSpeedMs.toFixed(1)} m/s` : undefined} />
              </div>

              {/* Sun/Wind sector diagram + AI strategy */}
              <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 40, alignItems: "start" }}>
                <div>
                  <div className="mono" style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.15em", color: TAN, marginBottom: 12 }}>Solar & Wind Sectors</div>
                  <SunDiagram lat={siteLat} wind={brief?.prevailingWindDir} />
                  <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                    {[
                      { c: "#f59e0b", l: "Summer sun arc" },
                      { c: "#60a5fa", l: "Winter sun arc" },
                      { c: TAN, l: `Prevailing wind${brief?.prevailingWindDir ? ` — ${brief.prevailingWindDir}` : ""}` },
                    ].map(({ c, l }) => (
                      <div key={l} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 8, height: 8, background: c, flexShrink: 0, border: "1px solid rgba(0,0,0,0.1)" }} />
                        <span className="mono" style={{ fontSize: 9, color: "#777" }}>{l}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {aiReport?.SunAndEnergy ? (
                    <div style={{ border: RULE, padding: "20px 24px", background: "#fff" }}>
                      <div className="mono" style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.16em", color: MID, marginBottom: 10 }}>Sun & Energy Strategy</div>
                      <p style={{ margin: 0, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, lineHeight: 1.8, color: "#444" }}>{String(aiReport.SunAndEnergy)}</p>
                    </div>
                  ) : (
                    <div style={{ border: RULE, padding: "20px 24px", background: "#fff" }}>
                      <div className="mono" style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.16em", color: "#bbb", marginBottom: 10 }}>Sun & Energy Strategy</div>
                      <p className="mono" style={{ margin: 0, fontSize: 10, color: "#bbb", fontStyle: "italic" }}>Run AI analysis to generate solar and energy strategy.</p>
                    </div>
                  )}
                  {!!aiReport?.WaterStrategy && (
                    <div style={{ border: RULE, padding: "20px 24px", background: "#fff" }}>
                      <div className="mono" style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.16em", color: MID, marginBottom: 10 }}>Water Strategy</div>
                      <p style={{ margin: 0, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, lineHeight: 1.8, color: "#444" }}>{String(aiReport.WaterStrategy)}</p>
                    </div>
                  )}
                  {brief?.frostDaysPerYear != null && (
                    <div style={{ border: `2px solid ${FOREST}`, padding: "16px 20px", background: FOREST + "08" }}>
                      <div className="mono" style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.16em", color: FOREST, marginBottom: 6 }}>Frost Calendar</div>
                      <p className="mono" style={{ margin: 0, fontSize: 11, color: INK, lineHeight: 1.7 }}>
                        {brief.frostDaysPerYear.toFixed(0)} frost days per year.{" "}
                        {brief.frostDaysPerYear < 5
                          ? "Frost-free — tropical and subtropical species viable."
                          : brief.frostDaysPerYear < 20
                          ? "Mild frost zone — mulch tender perennials, avoid late planting."
                          : brief.frostDaysPerYear < 60
                          ? "Moderate frost — select frost-hardy cultivars for canopy layer."
                          : "Heavy frost zone — all guild plants must be fully cold-hardy."}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Pattern strategy — if AI ran */}
              {(aiReport?.PatternStrategy as { recommendedPattern?: string; rationale?: string; application?: string } | null | undefined)?.recommendedPattern && (() => {
                const ps = aiReport!.PatternStrategy as { recommendedPattern?: string; rationale?: string; application?: string };
                return (
                  <div style={{ marginTop: 40, border: RULE, background: "#fff" }}>
                    <div style={{ padding: "18px 24px", borderBottom: RULE, background: FOREST, display: "flex", alignItems: "center", gap: 16 }}>
                      <span className="mono" style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.18em", color: "rgba(252,249,242,0.55)" }}>Recommended Nature-Based Pattern</span>
                      <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 22, fontWeight: 300, color: CREAM }}>{ps.recommendedPattern}</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
                      {ps.rationale && (
                        <div style={{ padding: "20px 24px", borderRight: RULE }}>
                          <div className="mono" style={{ fontSize: 8, textTransform: "uppercase", letterSpacing: "0.16em", color: TAN, marginBottom: 8 }}>Rationale</div>
                          <p className="mono" style={{ margin: 0, fontSize: 10, lineHeight: 1.8, color: "#555" }}>{ps.rationale}</p>
                        </div>
                      )}
                      {ps.application && (
                        <div style={{ padding: "20px 24px" }}>
                          <div className="mono" style={{ fontSize: 8, textTransform: "uppercase", letterSpacing: "0.16em", color: TAN, marginBottom: 8 }}>Application</div>
                          <p className="mono" style={{ margin: 0, fontSize: 10, lineHeight: 1.8, color: "#555" }}>{ps.application}</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </section>

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* ── SECTION 3: ORCHARD GUILD GUIDE ──────────────────────────────── */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          <section style={{ background: "#fff", padding: "72px 0" }}>
            <div style={{ maxWidth: 920, margin: "0 auto", padding: "0 48px" }}>
              <SectionHeader
                n="02 — Planting Design"
                title="Orchard Guild Guide"
                sub="A classic permaculture guild: layered mutually-beneficial planting relationships that reduce inputs and increase yield."
              />

              <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 48, alignItems: "start", marginBottom: 48 }}>
                {/* Spacing diagram */}
                <div>
                  <div className="mono" style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.15em", color: TAN, marginBottom: 12 }}>Spacing Reference</div>
                  <SpacingDiagram />
                  <p className="mono" style={{ fontSize: 9, color: "#aaa", lineHeight: 1.7, marginTop: 12 }}>
                    Each concentric ring represents a guild layer's planting zone relative to the central canopy tree.
                  </p>
                </div>

                {/* Guild intro text */}
                <div>
                  <h3 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 22, fontWeight: 300, color: INK, marginBottom: 16, letterSpacing: "-0.01em" }}>
                    How a guild works
                  </h3>
                  <p className="mono" style={{ fontSize: 11, color: "#555", lineHeight: 1.85, marginBottom: 20 }}>
                    A permaculture guild is a community of plants, animals, and insects that cooperate to benefit each other — and the central food tree. Each layer performs a specific function: the canopy provides food and shade, nitrogen fixers feed the soil, dynamic accumulators mine deep nutrients, and the insectary layer attracts the predatory insects that keep pests in check.
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {GUILD_LAYERS.map((g) => (
                      <div key={g.layer} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 10, height: 10, background: g.color, flexShrink: 0 }} />
                        <span className="mono" style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.12em", color: g.color, minWidth: 130 }}>{g.layer}</span>
                        <span className="mono" style={{ fontSize: 9, color: "#888" }}>{g.height} · {g.spacing}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Guild table */}
              <div style={{ border: RULE, overflow: "hidden", borderRadius: 10, boxShadow: "0 2px 12px rgba(44,53,37,0.08)" }}>
                {/* Table header */}
                <div style={{ display: "grid", gridTemplateColumns: "200px 1fr 1fr 200px", background: FOREST, padding: "14px 22px", gap: 16 }}>
                  {["Guild Layer · Height", "Plants", "Function", "Practical Notes"].map((h) => (
                    <div key={h} className="mono" style={{ fontSize: 8, textTransform: "uppercase", letterSpacing: "0.18em", color: "rgba(252,249,242,0.6)", fontWeight: 500 }}>{h}</div>
                  ))}
                </div>

                {GUILD_LAYERS.map((g, i) => (
                  <div
                    key={g.layer}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "200px 1fr 1fr 200px",
                      gap: 16,
                      padding: "22px 22px",
                      borderTop: i === 0 ? "none" : RULE,
                      background: i % 2 === 0 ? "#fff" : CREAM,
                      alignItems: "start",
                    }}
                  >
                    {/* Layer */}
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <div style={{ width: 8, height: 8, background: g.color, flexShrink: 0 }} />
                        <span className="mono" style={{ fontSize: 10, fontWeight: 700, color: g.color, textTransform: "uppercase", letterSpacing: "0.1em" }}>{g.layer}</span>
                      </div>
                      <div className="mono" style={{ fontSize: 9, color: "#aaa" }}>{g.height}</div>
                      <div className="mono" style={{ fontSize: 9, color: "#bbb", marginTop: 2 }}>Plant at: {g.spacing}</div>
                    </div>

                    {/* Plants */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {g.plants.map((p) => (
                        <span
                          key={p}
                          className="mono"
                          style={{ fontSize: 9, padding: "4px 10px", borderRadius: 4, border: `1px solid ${g.color}38`, background: g.lightColor, color: g.color, letterSpacing: "0.04em" }}
                        >{p}</span>
                      ))}
                    </div>

                    {/* Function */}
                    <div className="mono" style={{ fontSize: 10, color: "#555", lineHeight: 1.75 }}>
                      {g.role}
                    </div>

                    {/* Notes */}
                    <div className="mono" style={{ fontSize: 9, color: "#777", lineHeight: 1.75 }}>
                      {g.notes}
                    </div>
                  </div>
                ))}
              </div>

              {/* Spacing table */}
              <div style={{ marginTop: 36 }}>
                <div className="mono" style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.2em", color: TAN, marginBottom: 16 }}>Planting Distances from Central Trunk</div>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4,1fr)",
                  borderRadius: 8,
                  overflow: "hidden",
                  border: RULE,
                  boxShadow: "0 2px 8px rgba(44,53,37,0.07)",
                }}>
                  {[
                    { h: "Canopy Tree",         color: "#3d2e1e" },
                    { h: "Nitrogen Fixer",       color: "#3a5c2e" },
                    { h: "Dynamic Accumulator",  color: "#6b8a45" },
                    { h: "Insectary / Herb",     color: "#b08650" },
                  ].map(({ h, color }) => (
                    <div key={h} style={{ background: color + "12", padding: "12px 16px", borderRight: `1px solid ${color}20` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
                        <div className="mono" style={{ fontSize: 8, textTransform: "uppercase", letterSpacing: "0.12em", color, lineHeight: 1.3 }}>{h}</div>
                      </div>
                    </div>
                  ))}
                  {[
                    { distance: "Central anchor",      note: "Every 6–8 m row spacing. Open-vase prune.", color: "#3d2e1e" },
                    { distance: "2–3 m from trunk",    note: "1–2 plants per side. Coppice annually.",    color: "#3a5c2e" },
                    { distance: "0.5–1.5 m from trunk",note: "3–4 Comfrey per tree. Chop 3×/season.",    color: "#6b8a45" },
                    { distance: "Ground cover",        note: "Dense understory. Allow flowering in spring.", color: "#b08650" },
                  ].map((row, i) => (
                    <div key={i} style={{ background: "#fff", padding: "14px 16px", borderTop: RULE, borderRight: i < 3 ? `1px solid rgba(44,53,37,0.08)` : "none" }}>
                      <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 15, fontWeight: 400, fontStyle: "italic", color: row.color, marginBottom: 6, letterSpacing: "-0.01em" }}>{row.distance}</div>
                      <div className="mono" style={{ fontSize: 9, color: "#888", lineHeight: 1.65 }}>{row.note}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* ── SECTION 4: AI PLANT RECOMMENDATIONS (if analysis ran) ────────── */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {designRecs?.plants && designRecs.plants.length > 0 && (
            <section style={{ background: LIGHT, padding: "72px 0" }}>
              <div style={{ maxWidth: 920, margin: "0 auto", padding: "0 48px" }}>
                <SectionHeader
                  n="03 — AI Species Selection"
                  title="Recommended Plant Species"
                  sub={`${designRecs.plants.length} species selected by the Pattern AI for your climate zone, soil type, and primary goal.`}
                />
                {designRecs.plantingPrinciples && (
                  <div style={{ border: `2px solid ${FOREST}`, padding: "20px 24px", marginBottom: 32, background: FOREST + "06" }}>
                    <div className="mono" style={{ fontSize: 8, textTransform: "uppercase", letterSpacing: "0.18em", color: MID, marginBottom: 8 }}>Planting Philosophy</div>
                    <p className="mono" style={{ margin: 0, fontSize: 11, lineHeight: 1.85, color: INK }}>{designRecs.plantingPrinciples}</p>
                  </div>
                )}
                <div style={{ border: RULE, overflow: "hidden" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "150px 140px 1fr 80px 1fr", background: FOREST, padding: "10px 16px", gap: 12 }}>
                    {["Plant", "Latin Name", "Purpose", "Zone", "Notes"].map((h) => (
                      <div key={h} className="mono" style={{ fontSize: 8, textTransform: "uppercase", letterSpacing: "0.14em", color: "rgba(252,249,242,0.6)" }}>{h}</div>
                    ))}
                  </div>
                  {designRecs.plants.map((p, i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "150px 140px 1fr 80px 1fr", gap: 12, padding: "12px 16px", borderTop: RULE, background: i % 2 === 0 ? "#fff" : CREAM, alignItems: "start" }}>
                      <div>
                        <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 14, fontWeight: 500, color: INK }}>{p.name}</div>
                        <div className="mono" style={{ fontSize: 8, color: MID, marginTop: 2, textTransform: "uppercase", letterSpacing: "0.1em" }}>{p.layer}</div>
                      </div>
                      <div className="mono" style={{ fontSize: 9, color: "#888", fontStyle: "italic" }}>{p.latinName ?? "—"}</div>
                      <div className="mono" style={{ fontSize: 9, color: "#555", lineHeight: 1.7 }}>{p.purpose}</div>
                      <div className="mono" style={{ fontSize: 9, color: MID }}>{p.zones ?? "—"}</div>
                      <div className="mono" style={{ fontSize: 9, color: "#777", lineHeight: 1.7 }}>{p.notes ?? "—"}</div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* ── SECTION 5: SPATIAL MAP EXPORT ────────────────────────────────── */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          <section style={{ background: "#fff", padding: "72px 0" }}>
            <div style={{ maxWidth: 920, margin: "0 auto", padding: "0 48px" }}>
              <SectionHeader
                n={designRecs?.plants && designRecs.plants.length > 0 ? "04 — Spatial Layout" : "03 — Spatial Layout"}
                title="Finalised Map Layers"
                sub="Satellite overlay and terrain contour views showing all drawn design layers as configured in the workspace."
              />

              {/* Layer inventory */}
              {hasLayers && (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 32 }}>
                  {[
                    { label: "Zones", count: layerCounts.zones, color: MID },
                    { label: "Structures", count: layerCounts.structures, color: FOREST },
                    { label: "Swales", count: layerCounts.swales, color: "#3b6ea5" },
                    { label: "Pathways", count: layerCounts.pathways, color: TAN },
                    { label: "Sectors", count: layerCounts.sectors, color: "#7a9b60" },
                  ].filter(l => l.count > 0).map(({ label, count, color }) => (
                    <div
                      key={label}
                      style={{ display: "flex", alignItems: "center", gap: 8, border: RULE, padding: "8px 14px", background: LIGHT }}
                    >
                      <div style={{ width: 8, height: 8, background: color, flexShrink: 0 }} />
                      <span className="mono" style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.12em", color: INK }}>{count} {label}</span>
                    </div>
                  ))}
                </div>
              )}

              {!hasLayers && (
                <div style={{ border: RULE, padding: "20px 24px", background: LIGHT, marginBottom: 32 }}>
                  <p className="mono" style={{ margin: 0, fontSize: 10, color: "#bbb", fontStyle: "italic" }}>No design layers drawn yet. Open the Workspace to draw zones, swales, pathways, and structures.</p>
                </div>
              )}

              {/* Maps */}
              <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
                <MapFrame
                  url={satelliteThumbUrl}
                  caption="Satellite overview — property boundary with zone overlay"
                  fallback="Satellite view unavailable — add VITE_MAPBOX_TOKEN to enable"
                />
                <MapFrame
                  url={terrainUrl}
                  caption="Terrain & contour — water flows perpendicular to contours from high to low"
                  fallback="Terrain map unavailable — add VITE_MAPBOX_TOKEN to enable"
                />
              </div>

              {/* AI Infrastructure critique — if available */}
              {!!(aiReport as unknown as Record<string, unknown> | null)?.InfrastructureCritique && (
                <div style={{ marginTop: 40, border: RULE, padding: "24px 28px", background: LIGHT }}>
                  <div className="mono" style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.18em", color: MID, marginBottom: 12 }}>AI Layer Review</div>
                  <p className="mono" style={{ margin: 0, fontSize: 11, lineHeight: 1.85, color: "#555" }}>
                    {String((aiReport as unknown as Record<string, unknown>).InfrastructureCritique)}
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* ── FOOTER ───────────────────────────────────────────────────────── */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          <footer style={{ background: FOREST, padding: "40px 48px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <img src={patternMark} alt="Pattern Studio" style={{ height: 24, width: "auto", filter: "brightness(0) invert(1)", opacity: 0.6 }} />
              <span className="mono" style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.18em", color: "rgba(252,249,242,0.4)" }}>Pattern Studio · Natural Systems Design</span>
            </div>
            <div style={{ display: "flex", gap: 24 }}>
              {[`Prepared ${today}`, "Confidential · Client Deliverable"].map((t) => (
                <span key={t} className="mono" style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(252,249,242,0.3)" }}>{t}</span>
              ))}
            </div>
          </footer>

        </main>
      )}
    </div>
  );
}
