import { useEffect, useState } from "react";
import { Fingerprint } from "lucide-react";
import { useLocation } from "wouter";
import * as turf from "@turf/turf";
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
import type { SiteAnalysisReport } from "@workspace/api-client-react";
import { useAppStore } from "@/store/useAppStore";
import { StepNav } from "@/components/StepNav";
import { PlanPlate, type PlanLayerKey, type PlanPlateProps } from "@/components/plans/PlanPlate";
import { SoilPlate, type SoilPlateProps } from "@/components/plans/SoilPlate";
import { generateContours } from "@/lib/contourEngine";
import { analyzeWaterPaths, type WaterAnalysisResult } from "@/lib/keylineEngine";
import { parseGeo, toFeature } from "@/lib/planProjection";
import { layerSourceHash, type PlanSourceContext } from "@/lib/planSource";

interface PlantRec { name: string; latinName: string; layer: string; purpose: string; zones: string; notes: string; }
interface DesignElementRec { type: string; name: string; description: string; rationale: string; placement: string; priority: string; }
interface ImplPhase { phase: number; title: string; duration: string; elements: string[]; rationale: string; }
interface DesignRecsType { plantingPrinciples: string; plants: PlantRec[]; designElements: DesignElementRec[]; implementationPhases: ImplPhase[]; }

// ─── Design tokens ─────────────────────────────────────────────────────────────
const T    = "#6b5f4e";
const INK  = "#2c2416";
const RULE = "1px solid #ddd6cc";
const LIGHT = "#f8f5f0";

// ─── Mapbox static map ────────────────────────────────────────────────────────
function mapboxStaticUrl(geo: string | null | undefined, style: string, w = 800, h = 360, fill = T): string | null {
  const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
  if (!token || !geo) return null;
  try {
    const parsed = JSON.parse(geo);
    const feat = (parsed.type === "Feature" ? parsed : { type: "Feature", geometry: parsed, properties: {} }) as GeoJSON.Feature;
    const simp = turf.simplify(feat as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>, { tolerance: 0.00008, highQuality: false });
    const enc = encodeURIComponent(JSON.stringify({ ...simp, properties: { stroke: fill, "stroke-width": 3, "stroke-opacity": 1, fill, "fill-opacity": 0.15 } }));
    const bb = turf.bbox(feat);
    return `https://api.mapbox.com/styles/v1/mapbox/${style}/static/geojson(${enc})/[${bb[0]},${bb[1]},${bb[2]},${bb[3]}]/${w}x${h}@2x?padding=60&access_token=${token}`;
  } catch { return null; }
}

function PropertyMap({ geo, style, caption, fill }: { geo: string | null | undefined; style: string; caption?: string; fill?: string }) {
  const url = mapboxStaticUrl(geo, style, 800, 360, fill);
  if (!url) return null;
  return (
    <figure style={{ margin: 0, pageBreakInside: "avoid" }}>
      <img src={url} alt={caption ?? "Property map"} style={{ display: "block", width: "100%", border: RULE }} />
      {caption && <figcaption style={{ fontFamily: "monospace", fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase", color: "#888", marginTop: 6 }}>{caption}</figcaption>}
    </figure>
  );
}

function MapPlaceholder({ caption }: { caption?: string }) {
  return (
    <figure style={{ margin: 0 }}>
      <div style={{ width: "100%", height: 160, border: RULE, background: LIGHT, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21,15 16,10 5,21" /></svg>
        <span style={{ fontFamily: "monospace", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "#bbb" }}>No boundary drawn yet</span>
      </div>
      {caption && <figcaption style={{ fontFamily: "monospace", fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase", color: "#bbb", marginTop: 6 }}>{caption}</figcaption>}
    </figure>
  );
}

function Notice({ msg }: { msg: string }) {
  return (
    <div style={{ border: "1px solid #ddd", padding: "9px 14px", background: LIGHT }}>
      <span style={{ fontFamily: "monospace", fontSize: 10, color: "#999", fontStyle: "italic" }}>{msg}</span>
    </div>
  );
}

// ─── Sun / Wind sector diagram ────────────────────────────────────────────────
// All light background — ink on white.
function SunSectorDiagram({ lat, prevailingWind }: { lat?: number | null; prevailingWind?: string | null }) {
  const cx = 160, cy = 160, r = 112;
  const isN = (lat ?? -33) >= 0;
  const f = (n: number) => n.toFixed(1);
  function xy(deg: number, rad: number): [number, number] {
    const a = ((deg - 90) * Math.PI) / 180;
    return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
  }
  function arc(s: number, e: number, r1: number, r2: number, la: 0|1, sw: 0|1) {
    const [s1x,s1y]=xy(s,r2);const [e1x,e1y]=xy(e,r2);
    const [s2x,s2y]=xy(s,r1);const [e2x,e2y]=xy(e,r1);
    const rsw: 0|1 = sw===0?1:0;
    return `M${f(s1x)} ${f(s1y)} A${r2} ${r2} 0 ${la} ${sw} ${f(e1x)} ${f(e1y)} L${f(e2x)} ${f(e2y)} A${r1} ${r1} 0 ${la} ${rsw} ${f(s2x)} ${f(s2y)}Z`;
  }
  const [sumS,sumE,sumLa,sumSw,winS,winE,winLa,winSw]: [number,number,0|1,0|1,number,number,0|1,0|1] =
    isN ? [40,320,1,1,120,240,0,1] : [120,240,1,0,65,295,0,0];
  const wm: Record<string,number> = {N:0,NNE:22,NE:45,ENE:67,E:90,ESE:112,SE:135,SSE:157,S:180,SSW:202,SW:225,WSW:247,W:270,WNW:292,NW:315,NNW:337};
  const wk = (prevailingWind ?? "").toUpperCase().replace(/[^A-Z]/g,"");
  const wd = wm[wk] ?? 270;
  const [nTx,nTy]=xy(0,r*0.48);const [nL1x,nL1y]=xy(350,r*0.38);const [nL2x,nL2y]=xy(10,r*0.38);
  const compass = [{l:"N",d:0},{l:"NE",d:45},{l:"E",d:90},{l:"SE",d:135},{l:"S",d:180},{l:"SW",d:225},{l:"W",d:270},{l:"NW",d:315}];
  return (
    <div style={{ border: RULE, display: "inline-block", background: "#fff" }}>
      <svg viewBox="0 0 320 320" style={{ width: 220, height: 220, display: "block" }}>
        {/* White background */}
        <circle cx={cx} cy={cy} r={r+42} fill="#fff" />
        {/* Subtle grid rings */}
        {[0.35,0.52,0.75,0.95].map(fr=><circle key={fr} cx={cx} cy={cy} r={r*fr} fill="none" stroke="#e5e5e5" strokeWidth="0.8"/>)}
        {/* Cross hairs */}
        {[0,45,90,135].map(d=>{const[x1,y1]=xy(d,r*0.95);const[x2,y2]=xy(d+180,r*0.95);return<line key={d} x1={f(x1)} y1={f(y1)} x2={f(x2)} y2={f(y2)} stroke="#e5e5e5" strokeWidth="0.8"/>;}) }
        {/* Wind wedge — terracotta */}
        <path d={arc(wd-28,wd+28,r*0.28,r*0.88,0,1)} fill="rgba(160,82,45,0.15)" stroke={T} strokeWidth="1.5"/>
        {/* Winter sun — blue */}
        <path d={arc(winS,winE,r*0.35,r*0.52,winLa,winSw)} fill="rgba(96,165,250,0.18)" stroke="#60a5fa" strokeWidth="1"/>
        {/* Summer sun — amber */}
        <path d={arc(sumS,sumE,r*0.52,r*0.95,sumLa,sumSw)} fill="rgba(251,191,36,0.18)" stroke="#f59e0b" strokeWidth="1.5"/>
        {/* Site core */}
        <circle cx={cx} cy={cy} r={r*0.28} fill="#f7f7f7" stroke="#ccc" strokeWidth="1"/>
        <text x={cx} y={cy+1} textAnchor="middle" dominantBaseline="middle" fill={INK} fontSize="7" fontFamily="monospace" fontWeight="900" letterSpacing="0.08em">SITE</text>
        {/* North arrow */}
        <polygon points={`${f(nTx)},${f(nTy)} ${f(nL1x)},${f(nL1y)} ${f(nL2x)},${f(nL2y)}`} fill="#ef4444"/>
        {/* Compass labels */}
        {compass.map(({l,d})=>{
          const[lx,ly]=xy(d,r+20);
          return<text key={l} x={f(lx)} y={f(ly)} fill={d%90===0?INK:"#999"} fontSize={d%90===0?10:8} fontWeight={d%90===0?"900":"normal"} textAnchor="middle" dominantBaseline="middle" fontFamily="monospace">{l}</text>;
        })}
      </svg>
    </div>
  );
}

// ─── Soil profile visualization ───────────────────────────────────────────────
function SoilProfileViz({ clay, sand, silt, ph, organicCarbon, textureClass }: {
  clay?: number|null; sand?: number|null; silt?: number|null; ph?: number|null; organicCarbon?: number|null; textureClass?: string|null;
}) {
  const raw=(clay??0)+(sand??0)+(silt??0);
  const tot=raw>0?raw:100;
  const cp=raw>0?Math.round(((clay??0)/tot)*100):(clay??30);
  const sp=raw>0?Math.round(((sand??0)/tot)*100):(sand??40);
  const sip=raw>0?Math.round(100-cp-sp):(silt??30);
  const phv=ph??6.5; const ocv=organicCarbon??0; const ocw=Math.min(100,Math.round(ocv*4));
  const hz=[
    {l:"O",name:"Organic",depth:"0–5cm",fill:"#3d1f0a",h:22},
    {l:"A",name:"Topsoil",depth:"5–30cm",fill:`hsl(25,${38+cp*0.5}%,${36-cp*0.12}%)`,h:48},
    {l:"B",name:"Subsoil",depth:"30–80cm",fill:`hsl(18,${28+cp*0.6}%,${32-cp*0.1}%)`,h:56},
    {l:"C",name:"Parent",depth:"80+cm",fill:"#c4b5a5",h:34},
  ];
  const colY=(i:number)=>8+hz.slice(0,i).reduce((a,h)=>a+h.h+2,0);
  return (
    <div style={{ display:"grid", gridTemplateColumns:"130px 1fr", gap:20, alignItems:"start" }}>
      <svg viewBox="0 0 160 180" style={{ width:"100%", height:"auto", border: RULE }}>
        <rect width="160" height="180" fill="#fff"/>
        {hz.map((h,i)=>{const y=colY(i);return(
          <g key={h.l}>
            <rect x={18} y={y} width={55} height={h.h} fill={h.fill}/>
            <text x={78} y={y+h.h*0.38} fontSize="8" fill={INK} dominantBaseline="middle" fontWeight="900" fontFamily="monospace">{h.l}</text>
            <text x={78} y={y+h.h*0.65} fontSize="7" fill="#666" dominantBaseline="middle" fontFamily="monospace">{h.name}</text>
            <text x={14} y={y+2} fontSize="6" fill="#aaa" textAnchor="end" dominantBaseline="hanging" fontFamily="monospace">{h.depth.split("–")[0]}cm</text>
          </g>
        );})}
      </svg>
      <div>
        {textureClass && <div style={{ marginBottom:14 }}>
          <div style={{ fontFamily:"monospace", fontSize:8, textTransform:"uppercase", letterSpacing:"0.14em", color:"#aaa", marginBottom:2 }}>Texture</div>
          <div style={{ fontFamily:"monospace", fontSize:17, fontWeight:900, letterSpacing:"-0.03em", color:INK }}>{textureClass}</div>
        </div>}
        {raw>0 && <div style={{ marginBottom:14 }}>
          <div style={{ fontFamily:"monospace", fontSize:8, textTransform:"uppercase", letterSpacing:"0.14em", color:"#aaa", marginBottom:8 }}>Composition</div>
          {[{l:"Clay",p:cp,c:T},{l:"Silt",p:sip,c:"#888"},{l:"Sand",p:sp,c:INK}].map(({l,p,c})=>(
            <div key={l} style={{ marginBottom:8 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:2 }}>
                <span style={{ fontFamily:"monospace", fontSize:8, textTransform:"uppercase", letterSpacing:"0.1em", color:"#888" }}>{l}</span>
                <span style={{ fontFamily:"monospace", fontSize:9, fontWeight:900, color:T }}>{p}%</span>
              </div>
              <div style={{ height:3, background:"#e5e5e5" }}><div style={{ height:"100%", width:`${p}%`, background:c }}/></div>
            </div>
          ))}
        </div>}
        {ph!=null && <div style={{ marginBottom:14 }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
            <span style={{ fontFamily:"monospace", fontSize:8, textTransform:"uppercase", letterSpacing:"0.14em", color:"#aaa" }}>pH</span>
            <span style={{ fontFamily:"monospace", fontSize:11, fontWeight:900, color:T }}>{ph}</span>
          </div>
          <div style={{ height:5, background:"linear-gradient(to right,#ef4444,#f97316,#facc15,#22c55e,#60a5fa,#8b5cf6)", position:"relative" }}>
            <div style={{ position:"absolute", top:-3, width:5, height:11, background:"#fff", border:`1.5px solid ${INK}`, left:`${Math.max(2,Math.min(96,((phv-4)/6)*100))}%`, transform:"translateX(-50%)" }}/>
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", fontFamily:"monospace", fontSize:7, color:"#bbb", marginTop:3 }}>
            <span>Acid 4</span><span>Neutral 7</span><span>Alkaline 10</span>
          </div>
        </div>}
        {ocv>0 && <div>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
            <span style={{ fontFamily:"monospace", fontSize:8, textTransform:"uppercase", letterSpacing:"0.14em", color:"#aaa" }}>Organic C</span>
            <span style={{ fontFamily:"monospace", fontSize:9, fontWeight:900, color:T }}>{organicCarbon} g/kg</span>
          </div>
          <div style={{ height:3, background:"#e5e5e5" }}><div style={{ height:"100%", width:`${ocw}%`, background:T }}/></div>
        </div>}
      </div>
    </div>
  );
}

// ─── Shared layout atoms ──────────────────────────────────────────────────────
function SectionLabel({ n, title }: { n: string; title: string }) {
  return (
    <div style={{ display:"flex", alignItems:"baseline", gap:12, marginBottom:20, borderBottom:"3px solid #111", paddingBottom:8 }}>
      <span style={{ fontFamily:"monospace", fontSize:10, fontWeight:900, color:T, flexShrink:0 }}>{n}</span>
      <h2 style={{ margin:0, fontSize:17, fontWeight:900, letterSpacing:"-0.03em", color:INK, textTransform:"uppercase", lineHeight:1 }}>{title}</h2>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ borderBottom:"1px solid #e5e5e5", paddingBottom:10, paddingTop:4 }}>
      <div style={{ fontFamily:"monospace", fontSize:8, textTransform:"uppercase", letterSpacing:"0.14em", color:"#aaa", marginBottom:3 }}>{label}</div>
      <div style={{ fontFamily:"monospace", fontSize:14, fontWeight:900, letterSpacing:"-0.02em", color:INK }}>{value}</div>
    </div>
  );
}

function Btn({ children, onClick, accent }: { children: React.ReactNode; onClick: () => void; accent?: boolean }) {
  return (
    <button onClick={onClick} style={{
      fontFamily:"monospace", fontSize:10, letterSpacing:"0.1em", textTransform:"uppercase", fontWeight:900,
      padding:"8px 18px", cursor:"pointer",
      background: accent ? T : "#fff",
      color: accent ? "#fff" : INK,
      border: accent ? `2px solid ${T}` : RULE,
    }}>{children}</button>
  );
}

function AiTableDoc({ rows }: { rows: unknown[] }) {
  if (!rows.length) return null;
  const first = rows[0];
  if (typeof first !== "object" || first === null) {
    return <ul style={{ margin:0, paddingLeft:0, listStyle:"none" }}>{rows.map((r,i)=><li key={i} style={{ fontFamily:"monospace", fontSize:10, color:"#444", paddingLeft:10, borderLeft:`2px solid ${T}`, marginBottom:4 }}>{String(r)}</li>)}</ul>;
  }
  const keys = Object.keys(first as object);
  return (
    <table style={{ width:"100%", borderCollapse:"collapse", border: RULE, fontFamily:"monospace", fontSize:10 }}>
      <thead>
        <tr style={{ background: LIGHT, borderBottom: RULE }}>
          {keys.map(k=><th key={k} style={{ padding:"6px 10px", textAlign:"left", color:INK, fontWeight:900, textTransform:"uppercase", fontSize:8, letterSpacing:"0.1em", borderRight:"1px solid #ddd" }}>{k}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((row,i)=>(
          <tr key={i} style={{ background:i%2===0?"#fff":LIGHT, borderBottom:"1px solid #eee" }}>
            {keys.map(k=><td key={k} style={{ padding:"6px 10px", color:"#333", borderRight:"1px solid #eee", verticalAlign:"top" }}>{String((row as Record<string,unknown>)[k]??"")}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AiObjectDoc({ obj }: { obj: Record<string,unknown>|null|undefined }) {
  if (!obj||typeof obj!=="object"||Array.isArray(obj)) return null;
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      {Object.entries(obj).map(([k,v])=>(
        <div key={k}>
          <div style={{ fontFamily:"monospace", fontSize:8, textTransform:"uppercase", letterSpacing:"0.14em", color:"#aaa", marginBottom:4, fontWeight:900 }}>{k}</div>
          {Array.isArray(v)?<AiTableDoc rows={v}/>:typeof v==="object"&&v!==null?<AiObjectDoc obj={v as Record<string,unknown>}/>:<p style={{ margin:0, fontFamily:"monospace", fontSize:10, color:"#333", lineHeight:1.7 }}>{String(v)}</p>}
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function DossierPage() {
  const [, navigate] = useLocation();
  const { activePropertyId, role } = useAppStore();
  const [linkCopied, setLinkCopied] = useState(false);

  function handleGenerateLink() {
    if (!activePropertyId) return;
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    const url = `${window.location.origin}${base}/presentation/${activePropertyId}`;
    navigator.clipboard.writeText(url).then(() => { setLinkCopied(true); setTimeout(()=>setLinkCopied(false),2500); });
  }

  const { data: property } = useGetProperty(activePropertyId ?? "", { query: { enabled:!!activePropertyId, queryKey:getGetPropertyQueryKey(activePropertyId??"") } });
  const { data: brief } = useGetClientBrief(activePropertyId ?? "", { query: { enabled:!!activePropertyId, queryKey:getGetClientBriefQueryKey(activePropertyId??"") } });
  const aiReport: SiteAnalysisReport|null = (()=>{ if (!brief?.aiAnalysisReport) return null; try { return JSON.parse(brief.aiAnalysisReport); } catch { return null; } })();
  const moodImages = (brief?.moodBoardImages as string[]|null|undefined)??[];
  const boundaryCentroid = (()=>{
    const bg = property?.boundaryGeojson as unknown as string|null|undefined;
    if (!bg) return null;
    try { const g=JSON.parse(bg); return (turf.centroid(g as Parameters<typeof turf.centroid>[0])).geometry.coordinates as [number,number]; } catch { return null; }
  })();
  const siteLat = boundaryCentroid?.[1]??null;
  const today = new Date().toLocaleDateString("en-AU",{day:"numeric",month:"long",year:"numeric"});

  return (
    <div style={{ minHeight:"100vh", background:"#f8f5f0", display:"flex", flexDirection:"column", color:INK, fontFamily:"'Inter', system-ui, sans-serif" }}>

      {/* ── TOP NAV ────────────────────────────────────────────────────────── */}
      <header className="print:hidden" style={{
        background:"#fff", borderBottom: RULE,
        boxShadow: "0 2px 6px rgba(44,36,22,0.06)",
        position:"sticky", top:0, zIndex:20,
        display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"0 28px", height:54, flexShrink:0,
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <button onClick={()=>navigate("/properties")} style={{ background:"none", border:"none", cursor:"pointer", display:"flex", alignItems:"center", gap:8, color:INK, padding:0, fontFamily:"inherit" }}>
            <img src={patternMark} alt="Pattern" style={{ height: 26, width: "auto" }} />
            <span style={{ fontFamily:"Georgia, serif", fontWeight:700, fontSize:14 }}>Pattern</span>
          </button>
          <div style={{ width:1, height:16, background:"#ddd6cc" }}/>
          <span style={{ fontSize:11, fontWeight:600, color:T }}>Dossier</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <StepNav />
          <button
            onClick={handleGenerateLink}
            disabled={!activePropertyId}
            style={{
              fontFamily:"inherit", fontSize:11, fontWeight:600,
              padding:"6px 13px", cursor:"pointer", borderRadius:7,
              background: linkCopied ? "#2d6a4f" : "#fff",
              color: linkCopied ? "#fff" : "#6b5f4e",
              border: linkCopied ? "1px solid #2d6a4f" : RULE,
            }}
          >{linkCopied ? "✓ Link copied" : "Client Link"}</button>
          <button onClick={()=>window.print()} style={{ fontFamily:"inherit", fontSize:11, fontWeight:600, padding:"6px 14px", background:"#fff", color:INK, border:RULE, borderRadius:7, cursor:"pointer" }}>
            Export PDF
          </button>
        </div>
      </header>

      {/* ── NO PROPERTY ──────────────────────────────────────────────────── */}
      {!activePropertyId && (
        <div className="print:hidden" style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontFamily:"monospace", fontSize:10, letterSpacing:"0.15em", textTransform:"uppercase", color:"#bbb", marginBottom:20 }}>No property selected</div>
            <Btn onClick={()=>navigate("/intake")}>← Start at Intake</Btn>
          </div>
        </div>
      )}

      {/* ── DOCUMENT ─────────────────────────────────────────────────────── */}
      {activePropertyId && (
        <main style={{ flex:1 }}>

          {/* MASTHEAD */}
          <div style={{ borderBottom: RULE, padding:"36px 48px 28px", maxWidth:920, margin:"0 auto", background:"#fff" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
              <span style={{ fontSize:10, letterSpacing:"0.12em", textTransform:"uppercase", color:T }}>Pattern · Property Resilience Dossier</span>
              <span style={{ fontSize:10, color:"#a89880" }}>{today}</span>
            </div>
            <h1 style={{ margin:"10px 0 0", fontSize:48, fontWeight:700, letterSpacing:"-0.03em", lineHeight:1.1, color:INK, fontFamily:"Georgia, serif" }}>
              {property?.name ?? "Property Dossier"}
            </h1>
            <div style={{ display:"flex", gap:28, marginTop:12, alignItems:"flex-end" }}>
              <span style={{ fontSize:11, color:"#a89880" }}>Site Analysis Report</span>
              {(property?.areaHectares ?? 0) > 0 && (
                <div style={{ display:"flex", alignItems:"baseline", gap:5 }}>
                  <span style={{ fontFamily:"Georgia, serif", fontSize:22, fontWeight:700, color:"#2d6a4f" }}>{property?.areaHectares?.toFixed(2)}</span>
                  <span style={{ fontSize:10, textTransform:"uppercase", color:"#a89880" }}>ha</span>
                </div>
              )}
            </div>
          </div>

          {/* HERO MAP */}
          <div style={{ maxWidth:920, margin:"0 auto", padding:"0 48px" }}>
            {property?.boundaryGeojson
              ? <PropertyMap geo={property.boundaryGeojson as unknown as string} style="satellite-streets-v12" fill={T}/>
              : <MapPlaceholder caption="Property satellite overview"/>
            }
          </div>

          {/* BODY */}
          <div style={{ maxWidth:920, margin:"0 auto", padding:"48px 48px 60px", display:"flex", flexDirection:"column", gap:48 }}>

            {!brief && (
              <div style={{ borderLeft:`5px solid ${INK}`, paddingLeft:18 }}>
                <p style={{ margin:0, fontFamily:"monospace", fontSize:12, fontWeight:900, color:INK, textTransform:"uppercase", letterSpacing:"0.04em" }}>Site survey not completed</p>
                <p style={{ margin:"4px 0 0", fontFamily:"monospace", fontSize:9, color:"#888", textTransform:"uppercase", letterSpacing:"0.1em" }}>Complete the intake survey to populate this dossier.</p>
              </div>
            )}

            {brief && <>

              {/* 01 Site Profile */}
              <section>
                <SectionLabel n="01" title="Site Profile"/>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 40px" }}>
                  <Field label="Climate zone" value={brief.climateZone??"—"}/>
                  <Field label="Elevation" value={brief.elevationM!=null?`${brief.elevationM} m ASL`:"—"}/>
                  <Field label="Annual rainfall" value={brief.annualRainfallMm!=null?`${brief.annualRainfallMm.toLocaleString()} mm`:"—"}/>
                  <Field label="Humidity" value={brief.annualHumidityPct!=null?`${brief.annualHumidityPct}%`:"—"}/>
                  <Field label="Mean temp" value={brief.meanAnnualTempC!=null?`${brief.meanAnnualTempC} °C`:"—"}/>
                  <Field label="Summer max" value={brief.summerMaxTempC!=null?`${brief.summerMaxTempC} °C`:"—"}/>
                  <Field label="Winter min" value={brief.winterMinTempC!=null?`${brief.winterMinTempC} °C`:"—"}/>
                  {brief.frostDaysPerYear!=null&&<Field label="Frost days" value={`${brief.frostDaysPerYear} days/yr`}/>}
                  {brief.solarIrradianceKwhM2!=null&&<Field label="Solar irradiance" value={`${brief.solarIrradianceKwhM2.toLocaleString()} kWh/m²/yr`}/>}
                  {brief.prevailingWindDir&&<Field label="Prevailing wind" value={brief.prevailingWindDir}/>}
                  {brief.meanWindSpeedMs!=null&&<Field label="Wind speed" value={`${brief.meanWindSpeedMs} m/s`}/>}
                </div>
              </section>

              {/* 02 Soil */}
              <section>
                <SectionLabel n="02" title="Soil Analysis"/>
                <SoilProfileViz clay={brief.soilClay} sand={brief.soilSand} silt={brief.soilSilt} ph={brief.soilPH} organicCarbon={brief.soilOrganicCarbonGkg} textureClass={brief.soilTextureClass}/>
              </section>

              {/* 03 Design Goals */}
              <section>
                <SectionLabel n="03" title="Design Goals"/>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 40px" }}>
                  <Field label="Primary goal" value={brief.primaryGoal??"—"}/>
                  <Field label="Maintenance capacity" value={brief.maintenanceCapacity??"—"}/>
                </div>
              </section>

              {/* 04 Vision Board */}
              <section>
                <SectionLabel n="04" title="Client Vision Board"/>
                {moodImages.length===0
                  ? <p style={{ fontFamily:"monospace", fontSize:10, fontStyle:"italic", color:"#bbb", margin:0 }}>No vision board photos uploaded yet.</p>
                  : <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:16 }}>
                      {moodImages.map((src,i)=>(
                        <div key={i} style={{ aspectRatio:"4/3", border:RULE, overflow:"hidden", background:LIGHT }}>
                          <img src={src} alt={`Mood ${i+1}`} style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }}/>
                        </div>
                      ))}
                    </div>
                }
                {role==="designer" && (
                  <div className="print:hidden" style={{ border:RULE, padding:"14px 18px", display:"flex", justifyContent:"space-between", alignItems:"center", gap:16, background:LIGHT }}>
                    <div>
                      <p style={{ margin:0, fontFamily:"monospace", fontSize:11, fontWeight:900, color:INK }}>AI Concept Renders</p>
                      <p style={{ margin:"2px 0 0", fontFamily:"monospace", fontSize:9, color:"#888" }}>Generate photorealistic renders from mood board via Google Imagen.</p>
                    </div>
                    <Btn onClick={()=>{}} accent>Generate Renders</Btn>
                  </div>
                )}
              </section>

              {/* 05 Pattern Strategy */}
              {aiReport?.PatternStrategy
                ? <PatternStrategySection pattern={aiReport.PatternStrategy as {recommendedPattern?:string;rationale?:string;application?:string}}/>
                : <section><SectionLabel n="05" title="Pattern Strategy"/><Notice msg="Run the AI resilience analysis to generate the recommended nature-based design pattern for this site."/></section>
              }

              {/* 06 Infrastructure */}
              {(brief.utilitiesOverheadPower||brief.utilitiesBuriedPipes||brief.utilitiesLegalEasements||brief.utilitiesActiveWell||brief.challengeSevereErosion||brief.challengeWinterFlooding||brief.challengeHighWind||brief.challengeWildlifePressure) && (
                <section>
                  <SectionLabel n="06" title="Infrastructure &amp; Constraints"/>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 40px" }}>
                    {brief.utilitiesOverheadPower&&<Field label="Overhead power" value="Present"/>}
                    {brief.utilitiesBuriedPipes&&<Field label="Buried pipes" value="Present"/>}
                    {brief.utilitiesLegalEasements&&<Field label="Legal easements" value="Present"/>}
                    {brief.utilitiesActiveWell&&<Field label="Active well" value="Present"/>}
                    {brief.challengeSevereErosion&&<Field label="Severe erosion" value="Confirmed"/>}
                    {brief.challengeWinterFlooding&&<Field label="Winter flooding" value="Confirmed"/>}
                    {brief.challengeHighWind&&<Field label="High wind" value="Confirmed"/>}
                    {brief.challengeWildlifePressure&&<Field label="Wildlife pressure" value="Confirmed"/>}
                  </div>
                </section>
              )}

              {/* 07 AI Resilience Analysis */}
              <section>
                <SectionLabel n="07" title="AI Resilience Analysis"/>
                {!aiReport ? (
                  <div>
                    <Notice msg="No analysis run yet. Go to The War Room to generate the AI resilience report."/>
                    <div style={{ marginTop:12 }} className="print:hidden">
                      <Btn onClick={()=>navigate("/analysis")}>Run Analysis →</Btn>
                    </div>
                  </div>
                ) : (
                  <div>
                    {brief.aiAnalysisGeneratedAt && (
                      <p style={{ fontFamily:"monospace", fontSize:9, textTransform:"uppercase", letterSpacing:"0.12em", color:"#bbb", marginBottom:24, marginTop:0 }}>
                        Generated {new Date(brief.aiAnalysisGeneratedAt).toLocaleDateString("en-AU",{day:"numeric",month:"long",year:"numeric"})}
                      </p>
                    )}
                    {/* Analysis cards — white bg, black border */}
                    <div style={{ border:RULE }}>
                      {[
                        {key:"WaterStrategy",         title:"Water Strategy",          n:"A"},
                        {key:"SunAndEnergy",           title:"Sun & Energy",            n:"B"},
                        {key:"SoilAndFertility",       title:"Soil & Fertility",        n:"C"},
                        {key:"LandAndBiodiversity",    title:"Land & Biodiversity",     n:"D"},
                        {key:"ClimateResilience",      title:"Climate Resilience",      n:"E"},
                        {key:"InfrastructureCritique", title:"Infrastructure Critique", n:"F"},
                      ].map(({key,title,n},idx,arr)=>{
                        const val=(aiReport as unknown as Record<string,unknown>)[key];
                        const missing=val===undefined||val===null;
                        const isLast=idx===arr.length-1;

                        let visual: React.ReactNode=null;
                        if (key==="WaterStrategy") {
                          visual=(
                            <div style={{ padding:"16px 18px", borderBottom:"1px solid #e5e5e5" }}>
                              {property?.boundaryGeojson
                                ?<PropertyMap geo={property.boundaryGeojson as unknown as string} style="outdoors-v12" fill="#3b6ea5" caption="Terrain & contour — water flows perpendicular to lines from high to low"/>
                                :<MapPlaceholder caption="Terrain & contour map"/>}
                              <div style={{ borderLeft:`3px solid ${INK}`, paddingLeft:12, fontFamily:"monospace", fontSize:9, color:"#666", lineHeight:1.7, marginTop:10 }}>
                                <strong style={{ color:INK }}>Reading the map: </strong>Swales follow contour lines. Dams sit at valley heads below natural catchment.
                              </div>
                            </div>
                          );
                        } else if (key==="SunAndEnergy") {
                          visual=(
                            <div style={{ padding:"16px 18px", borderBottom:"1px solid #e5e5e5", display:"grid", gridTemplateColumns:"240px 1fr", gap:20, alignItems:"start" }}>
                              <SunSectorDiagram lat={siteLat} prevailingWind={brief?.prevailingWindDir}/>
                              <div>
                                <div style={{ fontFamily:"monospace", fontSize:8, textTransform:"uppercase", letterSpacing:"0.14em", color:"#aaa", marginBottom:8, fontWeight:900 }}>How to read</div>
                                <ul style={{ margin:0, padding:0, listStyle:"none", display:"flex", flexDirection:"column", gap:5 }}>
                                  {[
                                    {c:"#f59e0b",l:"Amber — summer sun arc"},
                                    {c:"#60a5fa",l:"Blue — winter sun arc"},
                                    {c:T,        l:`Terracotta — prevailing wind (${(brief?.prevailingWindDir??"").toUpperCase()||"N/A"})`},
                                  ].map(({c,l})=>(
                                    <li key={l} style={{ display:"flex", alignItems:"center", gap:8 }}>
                                      <div style={{ width:8, height:8, background:c, flexShrink:0, border:"1px solid rgba(0,0,0,0.1)" }}/>
                                      <span style={{ fontFamily:"monospace", fontSize:9, color:"#555" }}>{l}</span>
                                    </li>
                                  ))}
                                </ul>
                                {brief?.solarIrradianceKwhM2!=null && (
                                  <div style={{ marginTop:14, border:RULE, padding:"10px 14px", background:LIGHT }}>
                                    <div style={{ fontFamily:"monospace", fontSize:8, textTransform:"uppercase", letterSpacing:"0.12em", color:"#aaa" }}>Solar irradiance</div>
                                    <div style={{ fontFamily:"monospace", fontSize:20, fontWeight:900, letterSpacing:"-0.04em", color:T, marginTop:2 }}>
                                      {brief.solarIrradianceKwhM2.toLocaleString()} <span style={{ fontSize:10 }}>kWh/m²/yr</span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        } else if (key==="SoilAndFertility") {
                          const has=brief?.soilClay!=null||brief?.soilSand!=null||brief?.soilPH!=null;
                          visual=(
                            <div style={{ padding:"16px 18px", borderBottom:"1px solid #e5e5e5" }}>
                              {has?<SoilProfileViz clay={brief?.soilClay} sand={brief?.soilSand} silt={brief?.soilSilt} ph={brief?.soilPH} organicCarbon={brief?.soilOrganicCarbonGkg} textureClass={brief?.soilTextureClass}/>:<Notice msg="Soil data not recorded. Complete the intake survey."/>}
                              <div style={{ marginTop:14 }}>
                                {property?.boundaryGeojson?<PropertyMap geo={property.boundaryGeojson as unknown as string} style="satellite-v9" fill={T} caption="Vegetation density & colour indicate soil moisture & organic matter zones"/>:<MapPlaceholder caption="Property satellite view"/>}
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div key={key} style={{ borderBottom:isLast?"none":"1px solid #e5e5e5" }}>
                            {/* Card header — light bg, black text */}
                            <div style={{ padding:"10px 18px", display:"flex", alignItems:"center", gap:12, background:LIGHT, borderBottom:"1px solid #e5e5e5" }}>
                              <span style={{ fontFamily:"monospace", fontSize:11, fontWeight:900, color:T }}>{n}</span>
                              <span style={{ fontFamily:"monospace", fontSize:12, fontWeight:900, letterSpacing:"-0.02em", textTransform:"uppercase", color:INK }}>{title}</span>
                            </div>
                            {visual}
                            <div style={{ padding:"14px 18px", fontFamily:"monospace", fontSize:11, lineHeight:1.75, color:"#333" }}>
                              {missing
                                ?<Notice msg="Run the AI resilience analysis in the War Room to generate this section."/>
                                :typeof val==="string"?<p style={{ margin:0, whiteSpace:"pre-wrap" }}>{val}</p>
                                :Array.isArray(val)?<AiTableDoc rows={val}/>
                                :<AiObjectDoc obj={val as Record<string,unknown>}/>
                              }
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>
            </>}

            {/* Design Layer Plans */}
            <DesignPlansSection propertyId={activePropertyId} property={property} brief={brief}/>

            {/* Design Recommendations */}
            <DesignRecsSection designRecs={aiReport?(aiReport as unknown as Record<string,unknown>)["DesignRecommendations"] as DesignRecsType|undefined:undefined}/>

            {/* Footer */}
            <div style={{ borderTop:"3px solid #111", paddingTop:14, display:"flex", justifyContent:"space-between" }}>
              <span style={{ fontFamily:"monospace", fontSize:9, textTransform:"uppercase", letterSpacing:"0.1em", color:"#bbb" }}>Pattern · Natural Systems Design</span>
              <span style={{ fontFamily:"monospace", fontSize:9, textTransform:"uppercase", letterSpacing:"0.1em", color:"#bbb" }}>{today}</span>
            </div>
          </div>

          {/* Bottom nav */}
          <div className="print:hidden" style={{ maxWidth:920, margin:"0 auto", padding:"0 48px 40px", display:"flex", justifyContent:"space-between" }}>
            <Btn onClick={()=>navigate("/analysis")}>← Analysis</Btn>
            <Btn onClick={()=>window.print()}>Export PDF</Btn>
          </div>
        </main>
      )}
    </div>
  );
}

// ─── Design Layer Plans ───────────────────────────────────────────────────────
function DesignPlansSection({
  propertyId,
  property,
  brief,
}: {
  propertyId: string;
  property: PlanPlateProps["property"] | undefined;
  brief: SoilPlateProps["brief"];
}) {
  const enabled = !!propertyId && !!property?.boundaryGeojson;
  const q = <K extends readonly unknown[]>(key: K) => ({
    query: { enabled, queryKey: key },
  });
  const { data: zones = [] } = useListZones(propertyId, q(getListZonesQueryKey(propertyId)));
  const { data: structures = [] } = useListStructures(propertyId, q(getListStructuresQueryKey(propertyId)));
  const { data: sectors = [] } = useListSectors(propertyId, q(getListSectorsQueryKey(propertyId)));
  const { data: swales = [] } = useListDesignedSwales(propertyId, q(getListDesignedSwalesQueryKey(propertyId)));
  const { data: pathways = [] } = useListPathways(propertyId, q(getListPathwaysQueryKey(propertyId)));
  const { data: sensoryVectors = [] } = useListSensoryVectors(propertyId, q(getListSensoryVectorsQueryKey(propertyId)));
  const { data: planRenders = [] } = useListPlanRenders(propertyId, q(getListPlanRendersQueryKey(propertyId)));

  const boundaryGeo = property?.boundaryGeojson as unknown as string | undefined;

  // Generate 1 m contours + water analysis client-side so the Water plate matches
  // the Plans surface (source tables carry no terrain data).
  const [contours, setContours] = useState<GeoJSON.FeatureCollection | null>(null);
  const [waterAnalysis, setWaterAnalysis] = useState<WaterAnalysisResult | null>(null);
  useEffect(() => {
    if (!enabled || !boundaryGeo) return;
    const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
    if (!token) return;
    const feat = toFeature(parseGeo(boundaryGeo));
    if (!feat) return;
    let cancelled = false;
    generateContours(feat as GeoJSON.Feature, token, 1)
      .then((fc) => {
        if (cancelled) return;
        setContours(fc);
        try {
          if (feat.geometry?.type === "Polygon") {
            setWaterAnalysis(analyzeWaterPaths(fc, feat as GeoJSON.Feature<GeoJSON.Polygon>));
          }
        } catch {
          /* analysis is best-effort */
        }
      })
      .catch(() => {
        /* contours need elevation tiles; plate renders without them */
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, boundaryGeo]);

  if (!enabled || !property) return null;

  const srcCtx: PlanSourceContext = {
    boundary: boundaryGeo,
    zones,
    sectors,
    structures,
    swales,
    pathways,
    sensoryVectors,
    brief,
  };

  // Single-layer visibility: boundary base context plus the one layer of interest.
  const soloVisible = (key: PlanLayerKey): Record<PlanLayerKey, boolean> => ({
    boundary: key === "boundary",
    water: key === "water",
    zones: key === "zones",
    sectors: key === "sectors",
    structures: key === "structures",
    [key]: true,
  });

  const GEO_LAYERS: { key: PlanLayerKey; label: string }[] = [
    { key: "boundary", label: "Boundary" },
    { key: "water", label: "Water & Contour" },
    { key: "zones", label: "Zones" },
    { key: "sectors", label: "Sectors" },
    { key: "structures", label: "Structures" },
  ];

  const CONCEPT_LABELS: Record<string, string> = {
    composite: "Composite Masterplan",
    boundary: "Boundary",
    water: "Water & Contour",
    zones: "Zones",
    sectors: "Sectors",
    structures: "Structures",
    soil: "Soil Profile",
  };
  const CONCEPT_ORDER = ["composite", "boundary", "water", "zones", "sectors", "structures", "soil"];
  const concepts = CONCEPT_ORDER.map((k) => planRenders.find((r) => r.layerKey === k)).filter(
    (r): r is NonNullable<typeof r> => !!r,
  );

  const bust = (r: { url: string; updatedAt?: string }) =>
    r.updatedAt ? `${r.url}?v=${encodeURIComponent(r.updatedAt)}` : r.url;
  const isStale = (layerKey: string) => {
    const r = planRenders.find((x) => x.layerKey === layerKey);
    return !!(r && r.sourceHash && r.sourceHash !== layerSourceHash(layerKey, srcCtx));
  };

  const subLabel = (text: string) => (
    <div style={{ fontFamily:"monospace", fontSize:9, textTransform:"uppercase", letterSpacing:"0.1em", color:"#a89880", padding:"6px 10px", borderTop:RULE }}>
      {text}
    </div>
  );

  return (
    <section>
      <SectionLabel n="08" title="Design Layer Plans"/>
      <p style={{ fontFamily:"monospace", fontSize:9, textTransform:"uppercase", letterSpacing:"0.1em", color:"#bbb", margin:"0 0 16px" }}>
        Six professional cartographic plates and their AI concept restyles · generated in Design Plans
      </p>
      <div style={{ display:"flex", flexDirection:"column", gap:24 }}>
        {GEO_LAYERS.map((l) => (
          <figure key={l.key} style={{ margin:0, border:RULE }}>
            <PlanPlate
              property={property}
              visible={soloVisible(l.key)}
              zones={zones}
              sectors={sectors}
              structures={structures}
              swales={swales}
              pathways={pathways}
              sensoryVectors={sensoryVectors}
              contours={l.key === "water" ? contours : undefined}
              waterAnalysis={l.key === "water" ? waterAnalysis : undefined}
            />
            {subLabel(`${l.label} — cartographic plate`)}
          </figure>
        ))}
        <figure style={{ margin:0, border:RULE }}>
          <SoilPlate property={property} brief={brief}/>
          {subLabel("Soil Profile — cartographic plate")}
        </figure>

        {concepts.length > 0 && (
          <>
            <p style={{ fontFamily:"monospace", fontSize:9, textTransform:"uppercase", letterSpacing:"0.1em", color:"#bbb", margin:"8px 0 0" }}>
              AI concept restyles
            </p>
            {concepts.map((r) => (
              <figure key={r.layerKey} style={{ margin:0, border:RULE }}>
                <img src={bust(r)} alt={`${CONCEPT_LABELS[r.layerKey] ?? r.layerKey} concept`} style={{ display:"block", width:"100%" }}/>
                {isStale(r.layerKey) && (
                  <div style={{ fontFamily:"monospace", fontSize:8.5, textTransform:"uppercase", letterSpacing:"0.08em", color:"#8a6d2f", background:"#fdf3e3", padding:"5px 10px", borderTop:RULE }}>
                    ⚠ Outdated — design data changed since this concept was generated
                  </div>
                )}
                {subLabel(`${CONCEPT_LABELS[r.layerKey] ?? r.layerKey} — AI concept restyle`)}
              </figure>
            ))}
          </>
        )}
      </div>
    </section>
  );
}

// ─── Pattern Strategy ─────────────────────────────────────────────────────────
function PatternStrategySection({ pattern }: { pattern: {recommendedPattern?:string;rationale?:string;application?:string} }) {
  return (
    <section>
      <SectionLabel n="05" title="Pattern Strategy"/>
      {pattern.recommendedPattern && (
        <div style={{ border:RULE, marginBottom:16 }}>
          {/* White header, black text */}
          <div style={{ padding:"14px 18px", display:"flex", alignItems:"center", gap:12, background:LIGHT, borderBottom: RULE }}>
            <Fingerprint size={18} strokeWidth={1.5} style={{ color:T, flexShrink:0 }}/>
            <div>
              <div style={{ fontFamily:"monospace", fontSize:8, textTransform:"uppercase", letterSpacing:"0.15em", color:T, marginBottom:3 }}>Recommended Pattern</div>
              <div style={{ fontFamily:"monospace", fontSize:20, fontWeight:900, letterSpacing:"-0.04em", color:INK }}>{pattern.recommendedPattern}</div>
            </div>
          </div>
        </div>
      )}
      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        {pattern.rationale && (
          <div style={{ borderLeft:`4px solid ${T}`, paddingLeft:16 }}>
            <div style={{ fontFamily:"monospace", fontSize:8, textTransform:"uppercase", letterSpacing:"0.14em", color:T, marginBottom:5, fontWeight:900 }}>Why Nature Uses This Form</div>
            <p style={{ margin:0, fontFamily:"monospace", fontSize:11, lineHeight:1.75, color:"#333" }}>{pattern.rationale}</p>
          </div>
        )}
        {pattern.application && (
          <div style={{ borderLeft:"3px solid #ddd", paddingLeft:16 }}>
            <div style={{ fontFamily:"monospace", fontSize:8, textTransform:"uppercase", letterSpacing:"0.14em", color:"#bbb", marginBottom:5, fontWeight:900 }}>Site Application</div>
            <p style={{ margin:0, fontFamily:"monospace", fontSize:11, lineHeight:1.75, color:"#333" }}>{pattern.application}</p>
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Design Recommendations ───────────────────────────────────────────────────
const LAYER_LEFT: Record<string,string> = {
  Canopy:"#111",Understory:"#333",Shrub:"#555",Herbaceous:"#777","Ground Cover":"#999",Vine:"#bbb",Root:T,
};
const PRI_COL: Record<string,string> = { High:"#111", Medium:T, Low:"#aaa" };

function DesignRecsSection({ designRecs }: { designRecs: DesignRecsType|null|undefined }) {
  const plants   = Array.isArray(designRecs?.plants)               ? designRecs!.plants               : [];
  const elements = Array.isArray(designRecs?.designElements)       ? designRecs!.designElements       : [];
  const phases   = Array.isArray(designRecs?.implementationPhases) ? designRecs!.implementationPhases : [];
  const ORDER=["Canopy","Understory","Shrub","Herbaceous","Ground Cover","Vine","Root"];
  const grouped = ORDER.reduce<Record<string,PlantRec[]>>((acc,l)=>{const m=plants.filter(p=>p.layer===l);if(m.length)acc[l]=m;return acc;},{});
  plants.filter(p=>!ORDER.includes(p.layer)).forEach(p=>{grouped[p.layer]=[...(grouped[p.layer]??[]),p];});

  return (
    <section style={{ pageBreakBefore:"always" }}>
      <div style={{ borderTop:"5px solid #111", borderBottom:"2px solid #111", padding:"14px 0", marginBottom:36, display:"flex", alignItems:"center", gap:14 }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={T} strokeWidth="2.5" style={{ flexShrink:0 }}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        <h2 style={{ margin:0, fontSize:22, fontWeight:900, letterSpacing:"-0.04em", color:INK, textTransform:"uppercase" }}>Final Design Recommendations</h2>
      </div>

      {!designRecs ? <Notice msg="Run the AI analysis in the War Room to generate the plant palette, design elements, and implementation plan."/> : (
        <div style={{ display:"flex", flexDirection:"column", gap:40 }}>

          {/* Planting principles */}
          {designRecs.plantingPrinciples && (
            <div style={{ borderLeft:`5px solid ${INK}`, paddingLeft:18 }}>
              <div style={{ fontFamily:"monospace", fontSize:8, textTransform:"uppercase", letterSpacing:"0.16em", color:T, marginBottom:6, fontWeight:900 }}>Planting Philosophy</div>
              <p style={{ margin:0, fontFamily:"monospace", fontSize:11, lineHeight:1.8, color:"#333" }}>{designRecs.plantingPrinciples}</p>
            </div>
          )}

          {/* Plant palette */}
          <div>
            <div style={{ borderBottom:"2px solid #111", paddingBottom:7, marginBottom:14, display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
              <span style={{ fontFamily:"monospace", fontSize:12, fontWeight:900, textTransform:"uppercase", color:INK }}>Plant Palette</span>
              <span style={{ fontFamily:"monospace", fontSize:9, color:T }}>{plants.length} species · {Object.keys(grouped).length} layers</span>
            </div>
            {plants.length===0?<Notice msg="No plant data generated yet."/>:(
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {Object.entries(grouped).map(([layer,lp])=>{
                  const bar=LAYER_LEFT[layer]??"#888";
                  return (
                    <div key={layer} style={{ border:RULE, borderLeft:`5px solid ${bar}`, overflow:"hidden" }}>
                      {/* Layer header — light bg */}
                      <div style={{ padding:"7px 14px", display:"flex", alignItems:"center", gap:10, background:LIGHT, borderBottom:"1px solid #e5e5e5" }}>
                        <div style={{ width:6, height:6, background:bar, flexShrink:0 }}/>
                        <span style={{ fontFamily:"monospace", fontSize:9, fontWeight:900, textTransform:"uppercase", letterSpacing:"0.1em", color:INK }}>{layer} — {lp.length} species</span>
                      </div>
                      <table style={{ width:"100%", borderCollapse:"collapse", fontFamily:"monospace", fontSize:10, background:"#fff" }}>
                        <thead>
                          <tr style={{ background:LIGHT, borderBottom:"1px solid #e5e5e5" }}>
                            {["Common name","Latin name","Purpose","Zone","Notes"].map(h=>(
                              <th key={h} style={{ padding:"5px 10px", textAlign:"left", fontWeight:900, textTransform:"uppercase", fontSize:8, letterSpacing:"0.08em", color:"#888" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {lp.map((plant,i)=>(
                            <tr key={i} style={{ borderBottom:"1px solid #f0f0f0" }}>
                              <td style={{ padding:"7px 10px", fontWeight:900, color:INK }}>{plant.name}</td>
                              <td style={{ padding:"7px 10px", fontStyle:"italic", color:"#888" }}>{plant.latinName}</td>
                              <td style={{ padding:"7px 10px", color:"#555" }}>{plant.purpose}</td>
                              <td style={{ padding:"7px 10px", fontWeight:900, color:T, whiteSpace:"nowrap" }}>{plant.zones}</td>
                              <td style={{ padding:"7px 10px", color:"#999" }}>{plant.notes}</td>
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
            <div style={{ borderBottom:"2px solid #111", paddingBottom:7, marginBottom:14, display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
              <span style={{ fontFamily:"monospace", fontSize:12, fontWeight:900, textTransform:"uppercase", color:INK }}>Design Elements</span>
              <span style={{ fontFamily:"monospace", fontSize:9, color:T }}>{elements.length} components</span>
            </div>
            {elements.length===0?<Notice msg="No design elements generated yet."/>:(
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                {elements.map((el,i)=>{
                  const col=PRI_COL[el.priority]??"#aaa";
                  return (
                    <div key={i} style={{ border:RULE, overflow:"hidden", background:"#fff" }}>
                      <div style={{ padding:"10px 14px", display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8, background:LIGHT, borderBottom:"1px solid #e5e5e5" }}>
                        <div>
                          <p style={{ margin:0, fontFamily:"monospace", fontSize:11, fontWeight:900, color:INK }}>{el.name}</p>
                          <p style={{ margin:"2px 0 0", fontFamily:"monospace", fontSize:8, textTransform:"uppercase", letterSpacing:"0.1em", color:"#aaa" }}>{el.type}</p>
                        </div>
                        <span style={{ flexShrink:0, padding:"3px 8px", fontFamily:"monospace", fontSize:8, fontWeight:900, textTransform:"uppercase", letterSpacing:"0.1em", color:col, border:`2px solid ${col}`, background:"#fff" }}>{el.priority}</span>
                      </div>
                      <div style={{ padding:"10px 14px" }}>
                        <p style={{ margin:0, fontFamily:"monospace", fontSize:9, lineHeight:1.7, color:"#555" }}>{el.description}</p>
                        {el.placement&&<p style={{ margin:"5px 0 0", fontFamily:"monospace", fontSize:9 }}><span style={{ fontWeight:900, color:T }}>Placement: </span><span style={{ color:"#888" }}>{el.placement}</span></p>}
                        {el.rationale&&<p style={{ margin:"3px 0 0", fontFamily:"monospace", fontSize:9, fontStyle:"italic", color:"#bbb" }}>{el.rationale}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Implementation roadmap */}
          <div>
            <div style={{ borderBottom:"2px solid #111", paddingBottom:7, marginBottom:16 }}>
              <span style={{ fontFamily:"monospace", fontSize:12, fontWeight:900, textTransform:"uppercase", color:INK }}>Implementation Roadmap</span>
            </div>
            {phases.length===0?<Notice msg="No implementation phases generated yet."/>:(
              <div style={{ position:"relative" }}>
                <div style={{ position:"absolute", left:18, top:0, bottom:0, width:2, background:"#e5e5e5" }}/>
                <div style={{ display:"flex", flexDirection:"column", gap:14, paddingLeft:50 }}>
                  {phases.map((ph,i)=>(
                    <div key={i} style={{ position:"relative" }}>
                      {/* Phase number — terracotta on white */}
                      <div style={{
                        position:"absolute", left:-39, top:10, width:24, height:24,
                        background:"#fff", color:T,
                        fontFamily:"monospace", fontSize:10, fontWeight:900,
                        display:"flex", alignItems:"center", justifyContent:"center",
                        border:`2px solid ${T}`,
                      }}>{ph.phase}</div>
                      <div style={{ border:RULE, overflow:"hidden" }}>
                        {/* Phase header — light bg */}
                        <div style={{ padding:"9px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", background:LIGHT, borderBottom:"1px solid #e5e5e5" }}>
                          <span style={{ fontFamily:"monospace", fontSize:12, fontWeight:900, letterSpacing:"-0.02em", color:INK }}>{ph.title}</span>
                          <span style={{ fontFamily:"monospace", fontSize:9, fontWeight:900, padding:"2px 9px", color:T, border:`2px solid ${T}`, background:"#fff" }}>{ph.duration}</span>
                        </div>
                        <div style={{ padding:"12px 16px", background:"#fff" }}>
                          {ph.elements?.length>0&&(
                            <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginBottom:8 }}>
                              {ph.elements.map((el,j)=>(
                                <span key={j} style={{ padding:"2px 8px", fontFamily:"monospace", fontSize:9, background:LIGHT, border:"1px solid #ddd", color:"#555" }}>{el}</span>
                              ))}
                            </div>
                          )}
                          <p style={{ margin:0, fontFamily:"monospace", fontSize:9, fontStyle:"italic", lineHeight:1.7, color:"#888" }}>{ph.rationale}</p>
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
