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

interface PlantRec { name: string; latinName: string; layer: string; purpose: string; zones: string; notes: string; }
interface DesignElementRec { type: string; name: string; description: string; rationale: string; placement: string; priority: string; }
interface ImplPhase { phase: number; title: string; duration: string; elements: string[]; rationale: string; }
interface DesignRecsType { plantingPrinciples: string; plants: PlantRec[]; designElements: DesignElementRec[]; implementationPhases: ImplPhase[]; }

const T = "#A0522D"; // terracotta — single accent

function mapboxStaticUrl(
  boundaryGeojson: string | null | undefined,
  style: string, w = 800, h = 360,
  fillColor = T,
): string | null {
  const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
  if (!token || !boundaryGeojson) return null;
  try {
    const parsed = JSON.parse(boundaryGeojson);
    const asFeature = (parsed.type === "Feature" ? parsed : { type: "Feature", geometry: parsed, properties: {} }) as GeoJSON.Feature;
    const simplified = turf.simplify(asFeature as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>, { tolerance: 0.00008, highQuality: false });
    const feature = { ...simplified, properties: { stroke: fillColor, "stroke-width": 3, "stroke-opacity": 1, fill: fillColor, "fill-opacity": 0.15 } };
    const encoded = encodeURIComponent(JSON.stringify(feature));
    const bbox = turf.bbox(asFeature);
    return `https://api.mapbox.com/styles/v1/mapbox/${style}/static/geojson(${encoded})/[${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]}]/${w}x${h}@2x?padding=60&access_token=${token}`;
  } catch { return null; }
}

function PropertyMap({ boundaryGeojson, style, caption, fillColor }: {
  boundaryGeojson: string | null | undefined; style: string; caption?: string; fillColor?: string;
}) {
  const url = mapboxStaticUrl(boundaryGeojson, style, 800, 360, fillColor);
  if (!url) return null;
  return (
    <figure style={{ margin: 0, pageBreakInside: "avoid" }}>
      <img src={url} alt={caption ?? "Property map"} style={{ display: "block", width: "100%", border: "2px solid #111" }} />
      {caption && <figcaption style={{ fontFamily: "monospace", fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase", color: "#888", marginTop: 6 }}>{caption}</figcaption>}
    </figure>
  );
}

function MapPlaceholder({ caption }: { caption?: string }) {
  return (
    <figure style={{ margin: 0 }}>
      <div style={{ width: "100%", height: 180, border: "2px solid #111", background: "#f5f5f5", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21,15 16,10 5,21" /></svg>
        <span style={{ fontFamily: "monospace", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#999" }}>No boundary drawn yet</span>
      </div>
      {caption && <figcaption style={{ fontFamily: "monospace", fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase", color: "#888", marginTop: 6 }}>{caption}</figcaption>}
    </figure>
  );
}

function Placeholder({ msg }: { msg: string }) {
  return (
    <div style={{ border: "1px solid #ddd", padding: "10px 14px", background: "#fafafa" }}>
      <span style={{ fontFamily: "monospace", fontSize: 10, color: "#aaa", fontStyle: "italic" }}>{msg}</span>
    </div>
  );
}

// ── Sun Sector Diagram ──────────────────────────────────────────────────────
function SunSectorDiagram({ lat, prevailingWind }: { lat?: number | null; prevailingWind?: string | null }) {
  const cx = 160, cy = 160, r = 112;
  const isNorthern = (lat ?? -33) >= 0;
  function toXY(deg: number, rad: number): [number, number] {
    const a = ((deg - 90) * Math.PI) / 180;
    return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
  }
  function arc(s: number, e: number, r1: number, r2: number, la: 0|1, sw: 0|1) {
    const f = (n: number) => n.toFixed(1);
    const [s1x,s1y]=toXY(s,r2);const [e1x,e1y]=toXY(e,r2);
    const [s2x,s2y]=toXY(s,r1);const [e2x,e2y]=toXY(e,r1);
    const rsw: 0|1=sw===0?1:0;
    return `M${f(s1x)} ${f(s1y)} A${r2} ${r2} 0 ${la} ${sw} ${f(e1x)} ${f(e1y)} L${f(e2x)} ${f(e2y)} A${r1} ${r1} 0 ${la} ${rsw} ${f(s2x)} ${f(s2y)}Z`;
  }
  const f = (n: number) => n.toFixed(1);
  const [sumS,sumE,sumLa,sumSw,winS,winE,winLa,winSw]: [number,number,0|1,0|1,number,number,0|1,0|1] =
    isNorthern ? [40,320,1,1,120,240,0,1] : [120,240,1,0,65,295,0,0];
  const wm: Record<string,number>={N:0,NNE:22,NE:45,ENE:67,E:90,ESE:112,SE:135,SSE:157,S:180,SSW:202,SW:225,WSW:247,W:270,WNW:292,NW:315,NNW:337};
  const wk=(prevailingWind??"").toUpperCase().replace(/[^A-Z]/g,"");
  const wd=wm[wk]??270;
  const [nTx,nTy]=toXY(0,r*0.48);const [nL1x,nL1y]=toXY(350,r*0.38);const [nL2x,nL2y]=toXY(10,r*0.38);
  return (
    <div style={{ border: "2px solid #111", display: "inline-block" }}>
      <svg viewBox="0 0 320 320" style={{ width: 220, height: 220, display: "block" }}>
        <circle cx={cx} cy={cy} r={r+42} fill="#0a0a0a"/>
        {[0.35,0.52,0.75,0.95].map(fr=><circle key={fr} cx={cx} cy={cy} r={r*fr} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5"/>)}
        {[0,45,90,135].map(d=>{const[x1,y1]=toXY(d,r*0.95);const[x2,y2]=toXY(d+180,r*0.95);return<line key={d} x1={f(x1)} y1={f(y1)} x2={f(x2)} y2={f(y2)} stroke="rgba(255,255,255,0.04)" strokeWidth="0.5"/>;}) }
        <path d={arc(wd-28,wd+28,r*0.28,r*0.88,0,1)} fill="rgba(160,82,45,0.35)" stroke={T} strokeWidth="1.5"/>
        <path d={arc(winS,winE,r*0.35,r*0.52,winLa,winSw)} fill="rgba(96,165,250,0.3)" stroke="#60a5fa" strokeWidth="1"/>
        <path d={arc(sumS,sumE,r*0.52,r*0.95,sumLa,sumSw)} fill="rgba(251,191,36,0.3)" stroke="#fbbf24" strokeWidth="1.5"/>
        <circle cx={cx} cy={cy} r={r*0.28} fill="rgba(0,0,0,0.5)" stroke="rgba(255,255,255,0.2)" strokeWidth="1"/>
        <text x={cx} y={cy+1} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="8" fontFamily="monospace" fontWeight="bold">SITE</text>
        <polygon points={`${f(nTx)},${f(nTy)} ${f(nL1x)},${f(nL1y)} ${f(nL2x)},${f(nL2y)}`} fill="#ef4444"/>
        {[{l:"N",d:0},{l:"NE",d:45},{l:"E",d:90},{l:"SE",d:135},{l:"S",d:180},{l:"SW",d:225},{l:"W",d:270},{l:"NW",d:315}].map(({l,d})=>{
          const[lx,ly]=toXY(d,r+20);
          return<text key={l} x={f(lx)} y={f(ly)} fill={d%90===0?"white":"rgba(255,255,255,0.45)"} fontSize={d%90===0?10:8} fontWeight={d%90===0?"bold":"normal"} textAnchor="middle" dominantBaseline="middle" fontFamily="monospace">{l}</text>;
        })}
      </svg>
    </div>
  );
}

// ── Soil Profile ─────────────────────────────────────────────────────────────
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
    {l:"C",name:"Parent",depth:"80+cm",fill:"#a89988",h:34},
  ];
  const colY=(i:number)=>8+hz.slice(0,i).reduce((a,h)=>a+h.h+2,0);
  return (
    <div style={{ display:"grid", gridTemplateColumns:"130px 1fr", gap:20, alignItems:"start" }}>
      <svg viewBox="0 0 160 180" style={{ width:"100%", height:"auto", border:"2px solid #111" }}>
        {hz.map((h,i)=>{const y=colY(i);return(
          <g key={h.l}>
            <rect x={18} y={y} width={55} height={h.h} fill={h.fill}/>
            <text x={78} y={y+h.h*0.38} fontSize="8" fill="#111" dominantBaseline="middle" fontWeight="bold" fontFamily="monospace">{h.l}</text>
            <text x={78} y={y+h.h*0.65} fontSize="7" fill="#666" dominantBaseline="middle" fontFamily="monospace">{h.name}</text>
            <text x={14} y={y+2} fontSize="6" fill="#999" textAnchor="end" dominantBaseline="hanging" fontFamily="monospace">{h.depth.split("–")[0]}cm</text>
          </g>
        );})}
      </svg>
      <div>
        {textureClass && <div style={{ marginBottom:12 }}>
          <div style={{ fontFamily:"monospace", fontSize:8, letterSpacing:"0.15em", textTransform:"uppercase", color:"#888", marginBottom:2 }}>Texture</div>
          <div style={{ fontFamily:"monospace", fontSize:16, fontWeight:900, letterSpacing:"-0.04em", color:"#111" }}>{textureClass}</div>
        </div>}
        {raw>0 && [
          {l:"Clay",p:cp,c:"#A0522D"},{l:"Silt",p:sip,c:"#888"},{l:"Sand",p:sp,c:"#111"},
        ].map(({l,p,c})=>(
          <div key={l} style={{ marginBottom:10 }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:2 }}>
              <span style={{ fontFamily:"monospace", fontSize:8, textTransform:"uppercase", letterSpacing:"0.12em", color:"#888" }}>{l}</span>
              <span style={{ fontFamily:"monospace", fontSize:9, fontWeight:900, color:T }}>{p}%</span>
            </div>
            <div style={{ height:3, background:"#e5e5e5" }}><div style={{ height:"100%", width:`${p}%`, background:c }}/></div>
          </div>
        ))}
        {ph!=null && <div style={{ marginBottom:10 }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
            <span style={{ fontFamily:"monospace", fontSize:8, textTransform:"uppercase", letterSpacing:"0.12em", color:"#888" }}>pH</span>
            <span style={{ fontFamily:"monospace", fontSize:11, fontWeight:900, color:T }}>{ph}</span>
          </div>
          <div style={{ height:5, background:"linear-gradient(to right,#ef4444,#f97316,#facc15,#22c55e,#60a5fa,#8b5cf6)", position:"relative" }}>
            <div style={{ position:"absolute", top:-3, width:5, height:11, background:"white", border:"2px solid #111", left:`${Math.max(2,Math.min(96,((phv-4)/6)*100))}%`, transform:"translateX(-50%)" }}/>
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", fontFamily:"monospace", fontSize:7, color:"#aaa", marginTop:3 }}>
            <span>Acid 4</span><span>Neutral 7</span><span>Alkaline 10</span>
          </div>
        </div>}
        {ocv>0 && <div>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
            <span style={{ fontFamily:"monospace", fontSize:8, textTransform:"uppercase", letterSpacing:"0.12em", color:"#888" }}>Organic C</span>
            <span style={{ fontFamily:"monospace", fontSize:9, fontWeight:900, color:T }}>{organicCarbon} g/kg</span>
          </div>
          <div style={{ height:3, background:"#e5e5e5" }}><div style={{ height:"100%", width:`${ocw}%`, background:T }}/></div>
        </div>}
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function Rule() {
  return <div style={{ borderBottom: "2px solid #111", margin: "0 0 28px 0" }} />;
}

function SectionLabel({ n, title }: { n: string; title: string }) {
  return (
    <div style={{ display:"flex", alignItems:"baseline", gap:14, marginBottom:20, borderBottom:"4px solid #111", paddingBottom:8 }}>
      <span style={{ fontFamily:"monospace", fontSize:10, fontWeight:900, color:T, letterSpacing:"0.05em", flexShrink:0 }}>{n}</span>
      <h2 style={{ margin:0, fontSize:18, fontWeight:900, letterSpacing:"-0.04em", color:"#111", textTransform:"uppercase", lineHeight:1 }}>{title}</h2>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ borderBottom:"1px solid #e5e5e5", paddingBottom:10 }}>
      <div style={{ fontFamily:"monospace", fontSize:8, textTransform:"uppercase", letterSpacing:"0.14em", color:"#aaa", marginBottom:3 }}>{label}</div>
      <div style={{ fontFamily:"monospace", fontSize:15, fontWeight:900, letterSpacing:"-0.03em", color:"#111" }}>{value}</div>
    </div>
  );
}

function AiTableDoc({ rows }: { rows: unknown[] }) {
  if (!rows.length) return null;
  const first = rows[0];
  if (typeof first !== "object" || first === null) {
    return <ul style={{ margin:0, paddingLeft:0, listStyle:"none" }}>{rows.map((r,i)=><li key={i} style={{ fontFamily:"monospace", fontSize:10, color:"#333", paddingLeft:10, borderLeft:"2px solid #ddd", marginBottom:4 }}>{String(r)}</li>)}</ul>;
  }
  const keys = Object.keys(first as object);
  return (
    <table style={{ width:"100%", borderCollapse:"collapse", border:"2px solid #111", fontFamily:"monospace", fontSize:10 }}>
      <thead>
        <tr style={{ background:"#111" }}>
          {keys.map(k=><th key={k} style={{ padding:"6px 10px", textAlign:"left", color:"#fff", fontWeight:900, textTransform:"uppercase", fontSize:8, letterSpacing:"0.12em", borderRight:"1px solid #333" }}>{k}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((row,i)=>(
          <tr key={i} style={{ background:i%2===0?"#fff":"#fafafa", borderBottom:"1px solid #e5e5e5" }}>
            {keys.map(k=><td key={k} style={{ padding:"6px 10px", color:"#333", borderRight:"1px solid #ececec", verticalAlign:"top" }}>{String((row as Record<string,unknown>)[k]??"")}</td>)}
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
          {Array.isArray(v)?<AiTableDoc rows={v}/>:typeof v==="object"&&v!==null?<AiObjectDoc obj={v as Record<string,unknown>}/>:<p style={{ margin:0, fontFamily:"monospace", fontSize:10, color:"#333" }}>{String(v)}</p>}
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
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
    try { const geo=JSON.parse(bg); const c=turf.centroid(geo as Parameters<typeof turf.centroid>[0]); return c.geometry.coordinates as [number,number]; } catch { return null; }
  })();
  const siteLat = boundaryCentroid?.[1]??null;
  const today = new Date().toLocaleDateString("en-AU",{day:"numeric",month:"long",year:"numeric"});

  return (
    // ── Full white page — no dark shell ──────────────────────────────────────
    <div style={{ minHeight:"100vh", background:"#fff", display:"flex", flexDirection:"column" }}>

      {/* ── BLACK NAV BAR ─────────────────────────────────────────────────── */}
      <header
        className="print:hidden"
        style={{ background:"#111", borderBottom:"4px solid #111", position:"sticky", top:0, zIndex:20, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 28px", height:52, flexShrink:0 }}
      >
        <div style={{ display:"flex", alignItems:"center", gap:20 }}>
          <button onClick={()=>navigate("/properties")} style={{ background:"none", border:"none", cursor:"pointer", display:"flex", alignItems:"center", gap:8, color:"#fff", padding:0 }}>
            <span style={{ fontSize:16 }}>🛡</span>
            <span style={{ fontFamily:"monospace", fontSize:11, fontWeight:900, letterSpacing:"0.1em", textTransform:"uppercase" }}>TerraGuard</span>
          </button>
          <div style={{ width:1, height:20, background:"#444" }}/>
          <span style={{ fontFamily:"monospace", fontSize:9, letterSpacing:"0.18em", textTransform:"uppercase", color:T }}>Export Studio</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <StepNav />
          <button
            onClick={handleGenerateLink}
            disabled={!activePropertyId}
            style={{
              fontFamily:"monospace", fontSize:10, letterSpacing:"0.12em", textTransform:"uppercase", fontWeight:900,
              padding:"7px 14px", cursor:"pointer", transition:"all 0.15s",
              ...(linkCopied
                ? { background:T, color:"#fff", border:`2px solid ${T}` }
                : { background:"transparent", color:"#888", border:"2px solid #444" }
              ),
            }}
          >
            {linkCopied ? "✓ Copied" : "Client Link"}
          </button>
          <button
            onClick={()=>window.print()}
            style={{ fontFamily:"monospace", fontSize:10, letterSpacing:"0.12em", textTransform:"uppercase", fontWeight:900, padding:"7px 18px", background:"#fff", color:"#111", border:"2px solid #fff", cursor:"pointer" }}
          >
            Export PDF
          </button>
        </div>
      </header>

      {/* ── NO PROPERTY ──────────────────────────────────────────────────── */}
      {!activePropertyId && (
        <div className="print:hidden" style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:11, fontFamily:"monospace", letterSpacing:"0.15em", textTransform:"uppercase", color:"#bbb", marginBottom:16 }}>No property selected</div>
            <button onClick={()=>navigate("/intake")} style={{ fontFamily:"monospace", fontSize:10, letterSpacing:"0.12em", textTransform:"uppercase", fontWeight:900, padding:"10px 24px", background:"#111", color:"#fff", border:"2px solid #111", cursor:"pointer" }}>
              ← Start at Intake
            </button>
          </div>
        </div>
      )}

      {/* ══ DOCUMENT ════════════════════════════════════════════════════════ */}
      {activePropertyId && (
        <main style={{ flex:1, padding:"0 0 60px 0" }}>

          {/* ── MASTHEAD ────────────────────────────────────────────────── */}
          <div style={{ borderBottom:"6px solid #111", padding:"40px 48px 32px 48px", maxWidth:960, margin:"0 auto" }}>
            {/* Top meta row */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:4 }}>
              <span style={{ fontFamily:"monospace", fontSize:9, letterSpacing:"0.2em", textTransform:"uppercase", color:T }}>TerraGuard OS · Property Resilience Dossier</span>
              <span style={{ fontFamily:"monospace", fontSize:9, letterSpacing:"0.15em", textTransform:"uppercase", color:"#aaa" }}>{today}</span>
            </div>
            {/* Property name — massive */}
            <h1 style={{ margin:"12px 0 0 0", fontSize:64, fontWeight:900, letterSpacing:"-0.05em", lineHeight:0.9, color:"#111", textTransform:"uppercase" }}>
              {property?.name ?? "Property Dossier"}
            </h1>
            {/* Sub-meta row */}
            <div style={{ display:"flex", gap:32, marginTop:16, alignItems:"flex-end" }}>
              <span style={{ fontFamily:"monospace", fontSize:9, letterSpacing:"0.15em", textTransform:"uppercase", color:"#aaa" }}>Autonomous Site Report</span>
              {(property?.areaHectares ?? 0) > 0 && (
                <div style={{ display:"flex", alignItems:"baseline", gap:6 }}>
                  <span style={{ fontFamily:"monospace", fontSize:28, fontWeight:900, letterSpacing:"-0.04em", color:T }}>{property?.areaHectares?.toFixed(2)}</span>
                  <span style={{ fontFamily:"monospace", fontSize:9, letterSpacing:"0.12em", textTransform:"uppercase", color:"#aaa" }}>hectares</span>
                </div>
              )}
            </div>
          </div>

          {/* ── HERO MAP — full-bleed ──────────────────────────────────── */}
          <div style={{ maxWidth:960, margin:"0 auto", padding:"0 48px" }}>
            <div style={{ marginTop:0 }}>
              {property?.boundaryGeojson ? (
                <PropertyMap boundaryGeojson={property.boundaryGeojson as unknown as string} style="satellite-streets-v12" fillColor={T} />
              ) : (
                <MapPlaceholder caption="Property satellite overview" />
              )}
            </div>
          </div>

          {/* ── BODY ────────────────────────────────────────────────────── */}
          <div style={{ maxWidth:960, margin:"0 auto", padding:"48px 48px 0 48px" }}>

            {!brief && (
              <div style={{ borderLeft:"6px solid #111", paddingLeft:20, marginBottom:40 }}>
                <p style={{ margin:0, fontFamily:"monospace", fontSize:11, fontWeight:900, color:"#111", textTransform:"uppercase", letterSpacing:"0.05em" }}>Site survey not completed</p>
                <p style={{ margin:"4px 0 0 0", fontFamily:"monospace", fontSize:9, color:"#888", textTransform:"uppercase", letterSpacing:"0.12em" }}>Complete the intake survey to populate this dossier.</p>
              </div>
            )}

            {brief && (
              <div style={{ display:"flex", flexDirection:"column", gap:48 }}>

                {/* 01 Site Profile */}
                <section>
                  <SectionLabel n="01" title="Site Profile" />
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 40px" }}>
                    <Field label="Climate zone" value={brief.climateZone ?? "—"} />
                    <Field label="Elevation" value={brief.elevationM!=null?`${brief.elevationM} m ASL`:"—"} />
                    <Field label="Annual rainfall" value={brief.annualRainfallMm!=null?`${brief.annualRainfallMm.toLocaleString()} mm`:"—"} />
                    <Field label="Humidity" value={brief.annualHumidityPct!=null?`${brief.annualHumidityPct}%`:"—"} />
                    <Field label="Mean temp" value={brief.meanAnnualTempC!=null?`${brief.meanAnnualTempC} °C`:"—"} />
                    <Field label="Summer max" value={brief.summerMaxTempC!=null?`${brief.summerMaxTempC} °C`:"—"} />
                    <Field label="Winter min" value={brief.winterMinTempC!=null?`${brief.winterMinTempC} °C`:"—"} />
                    {brief.frostDaysPerYear!=null&&<Field label="Frost days" value={`${brief.frostDaysPerYear} days/yr`}/>}
                    {brief.solarIrradianceKwhM2!=null&&<Field label="Solar irradiance" value={`${brief.solarIrradianceKwhM2.toLocaleString()} kWh/m²/yr`}/>}
                    {brief.prevailingWindDir&&<Field label="Prevailing wind" value={brief.prevailingWindDir}/>}
                    {brief.meanWindSpeedMs!=null&&<Field label="Wind speed" value={`${brief.meanWindSpeedMs} m/s`}/>}
                  </div>
                </section>

                {/* 02 Soil */}
                <section>
                  <SectionLabel n="02" title="Soil Analysis" />
                  <SoilProfileViz clay={brief.soilClay} sand={brief.soilSand} silt={brief.soilSilt} ph={brief.soilPH} organicCarbon={brief.soilOrganicCarbonGkg} textureClass={brief.soilTextureClass}/>
                </section>

                {/* 03 Design Goals */}
                <section>
                  <SectionLabel n="03" title="Design Goals" />
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 40px" }}>
                    <Field label="Primary goal" value={brief.primaryGoal??"—"}/>
                    <Field label="Maintenance capacity" value={brief.maintenanceCapacity??"—"}/>
                  </div>
                </section>

                {/* 04 Vision Board */}
                <section>
                  <SectionLabel n="04" title="Client Vision Board" />
                  {moodImages.length===0 ? (
                    <p style={{ fontFamily:"monospace", fontSize:10, fontStyle:"italic", color:"#aaa", margin:0 }}>No vision board photos uploaded yet.</p>
                  ) : (
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:16 }}>
                      {moodImages.map((src,i)=>(
                        <div key={i} style={{ aspectRatio:"4/3", border:"2px solid #111", overflow:"hidden", background:"#f5f5f5" }}>
                          <img src={src} alt={`Mood ${i+1}`} style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }}/>
                        </div>
                      ))}
                    </div>
                  )}
                  {role==="designer" && (
                    <div className="print:hidden" style={{ border:"2px solid #111", padding:"16px 20px", display:"flex", justifyContent:"space-between", alignItems:"center", gap:16, background:"#f9f9f9" }}>
                      <div>
                        <p style={{ margin:0, fontFamily:"monospace", fontSize:11, fontWeight:900, color:"#111", letterSpacing:"-0.02em" }}>AI Concept Renders</p>
                        <p style={{ margin:"3px 0 0 0", fontFamily:"monospace", fontSize:9, color:"#888", letterSpacing:"0.05em" }}>Generate photorealistic renders from mood board via Google Imagen.</p>
                      </div>
                      <button onClick={()=>{}} style={{ fontFamily:"monospace", fontSize:10, letterSpacing:"0.1em", textTransform:"uppercase", fontWeight:900, padding:"8px 18px", background:"#111", color:"#fff", border:"2px solid #111", cursor:"pointer", flexShrink:0 }}>
                        Generate Renders
                      </button>
                    </div>
                  )}
                </section>

                {/* 05 Pattern Strategy */}
                {aiReport?.PatternStrategy ? (
                  <PatternStrategySection pattern={aiReport.PatternStrategy as {recommendedPattern?:string;rationale?:string;application?:string}}/>
                ) : (
                  <section>
                    <SectionLabel n="05" title="Pattern Strategy"/>
                    <Placeholder msg="Run the AI resilience analysis to generate the recommended nature-based design pattern for this site."/>
                  </section>
                )}

                {/* 06 Infrastructure */}
                {(brief.utilitiesOverheadPower||brief.utilitiesBuriedPipes||brief.utilitiesLegalEasements||brief.utilitiesActiveWell||brief.challengeSevereErosion||brief.challengeWinterFlooding||brief.challengeHighWind||brief.challengeWildlifePressure) && (
                  <section>
                    <SectionLabel n="06" title="Infrastructure & Constraints"/>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 40px" }}>
                      {brief.utilitiesOverheadPower&&<Field label="Overhead power" value="Present"/>}
                      {brief.utilitiesBuriedPipes&&<Field label="Buried pipes" value="Present"/>}
                      {brief.utilitiesLegalEasements&&<Field label="Legal easements" value="Present"/>}
                      {brief.utilitiesActiveWell&&<Field label="Active well" value="Present"/>}
                      {brief.challengeSevereErosion&&<Field label="Severe erosion" value="Confirmed"/>}
                      {brief.challengeWinterFlooding&&<Field label="Winter flooding" value="Confirmed"/>}
                      {brief.challengeHighWind&&<Field label="High wind exposure" value="Confirmed"/>}
                      {brief.challengeWildlifePressure&&<Field label="Wildlife pressure" value="Confirmed"/>}
                    </div>
                  </section>
                )}

                {/* 07 AI Resilience */}
                <section>
                  <SectionLabel n="07" title="AI Resilience Analysis"/>
                  {!aiReport ? (
                    <div>
                      <Placeholder msg="No analysis run yet. Go to The War Room to generate the AI resilience report."/>
                      <button onClick={()=>navigate("/analysis")} className="print:hidden" style={{ marginTop:12, fontFamily:"monospace", fontSize:10, letterSpacing:"0.12em", textTransform:"uppercase", fontWeight:900, padding:"9px 20px", background:"#111", color:"#fff", border:"2px solid #111", cursor:"pointer" }}>
                        Run Analysis →
                      </button>
                    </div>
                  ) : (
                    <div>
                      {brief.aiAnalysisGeneratedAt && (
                        <p style={{ fontFamily:"monospace", fontSize:9, letterSpacing:"0.12em", textTransform:"uppercase", color:"#aaa", marginBottom:28, marginTop:0 }}>
                          Generated {new Date(brief.aiAnalysisGeneratedAt).toLocaleDateString("en-AU",{day:"numeric",month:"long",year:"numeric"})}
                        </p>
                      )}
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
                            <div style={{ marginBottom:20 }}>
                              {property?.boundaryGeojson
                                ?<PropertyMap boundaryGeojson={property.boundaryGeojson as unknown as string} style="outdoors-v12" fillColor="#3b6ea5" caption="Terrain & contour — water flows perpendicular to lines from high to low"/>
                                :<MapPlaceholder caption="Terrain & contour map"/>
                              }
                              <div style={{ borderLeft:"3px solid #111", paddingLeft:12, fontFamily:"monospace", fontSize:9, color:"#666", lineHeight:1.6, marginTop:10 }}>
                                <strong style={{ color:"#111" }}>Reading the map: </strong>Swales follow contour lines. Dams sit at valley heads below natural catchment areas.
                              </div>
                            </div>
                          );
                        } else if (key==="SunAndEnergy") {
                          visual=(
                            <div style={{ display:"grid", gridTemplateColumns:"240px 1fr", gap:24, alignItems:"start", marginBottom:20 }}>
                              <SunSectorDiagram lat={siteLat} prevailingWind={brief?.prevailingWindDir}/>
                              <div>
                                <div style={{ fontFamily:"monospace", fontSize:8, textTransform:"uppercase", letterSpacing:"0.15em", color:"#aaa", marginBottom:10, fontWeight:900 }}>How to read</div>
                                <ul style={{ margin:0, padding:0, listStyle:"none", display:"flex", flexDirection:"column", gap:5 }}>
                                  {[
                                    {c:"#fbbf24",l:"Amber band — summer sun zone"},
                                    {c:"#60a5fa",l:"Blue band — winter sun zone"},
                                    {c:T,        l:`Orange wedge — prevailing wind (${(brief?.prevailingWindDir??"").toUpperCase()||"N/A"})`},
                                  ].map(({c,l})=>(
                                    <li key={l} style={{ display:"flex", alignItems:"center", gap:8 }}>
                                      <div style={{ width:8, height:8, background:c, flexShrink:0 }}/>
                                      <span style={{ fontFamily:"monospace", fontSize:9, color:"#555" }}>{l}</span>
                                    </li>
                                  ))}
                                </ul>
                                {brief?.solarIrradianceKwhM2!=null && (
                                  <div style={{ marginTop:16, border:"2px solid #111", padding:"10px 14px" }}>
                                    <div style={{ fontFamily:"monospace", fontSize:8, textTransform:"uppercase", letterSpacing:"0.12em", color:"#aaa" }}>Solar irradiance</div>
                                    <div style={{ fontFamily:"monospace", fontSize:22, fontWeight:900, letterSpacing:"-0.04em", color:T, marginTop:2 }}>{brief.solarIrradianceKwhM2.toLocaleString()} <span style={{ fontSize:10 }}>kWh/m²/yr</span></div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        } else if (key==="SoilAndFertility") {
                          const has=brief?.soilClay!=null||brief?.soilSand!=null||brief?.soilPH!=null;
                          visual=(
                            <div style={{ marginBottom:20 }}>
                              {has?<SoilProfileViz clay={brief?.soilClay} sand={brief?.soilSand} silt={brief?.soilSilt} ph={brief?.soilPH} organicCarbon={brief?.soilOrganicCarbonGkg} textureClass={brief?.soilTextureClass}/>:<Placeholder msg="Soil data not recorded. Complete the intake survey."/>}
                              <div style={{ marginTop:16 }}>
                                {property?.boundaryGeojson?<PropertyMap boundaryGeojson={property.boundaryGeojson as unknown as string} style="satellite-v9" fillColor={T} caption="Vegetation density & colour indicate soil moisture & organic matter zones"/>:<MapPlaceholder caption="Property satellite view"/>}
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div key={key} style={{ borderTop:"2px solid #111", paddingTop:20, paddingBottom:isLast?0:20, marginBottom:isLast?0:0 }}>
                            <div style={{ display:"flex", alignItems:"baseline", gap:12, marginBottom:14 }}>
                              <span style={{ fontFamily:"monospace", fontSize:11, fontWeight:900, color:T }}>{n}</span>
                              <span style={{ fontFamily:"monospace", fontSize:13, fontWeight:900, letterSpacing:"-0.03em", textTransform:"uppercase", color:"#111" }}>{title}</span>
                            </div>
                            {visual}
                            <div style={{ fontFamily:"monospace", fontSize:11, lineHeight:1.7, color:"#333" }}>
                              {missing
                                ?<Placeholder msg="Run the AI resilience analysis in the War Room to generate this section."/>
                                :typeof val==="string"?<p style={{ margin:0, whiteSpace:"pre-wrap" }}>{val}</p>
                                :Array.isArray(val)?<AiTableDoc rows={val}/>
                                :<AiObjectDoc obj={val as Record<string,unknown>}/>
                              }
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

              </div>
            )}

            {/* ── Design Recommendations ──────────────────────────────── */}
            <DesignRecsSection designRecs={
              aiReport?(aiReport as unknown as Record<string,unknown>)["DesignRecommendations"] as DesignRecsType|undefined:undefined
            }/>

            {/* ── Footer ─────────────────────────────────────────────── */}
            <div style={{ borderTop:"4px solid #111", marginTop:48, paddingTop:16, display:"flex", justifyContent:"space-between" }}>
              <span style={{ fontFamily:"monospace", fontSize:9, letterSpacing:"0.12em", textTransform:"uppercase", color:"#aaa" }}>TerraGuard OS · Autonomous Property Resilience Platform</span>
              <span style={{ fontFamily:"monospace", fontSize:9, letterSpacing:"0.12em", textTransform:"uppercase", color:"#aaa" }}>{today}</span>
            </div>
          </div>

          {/* Bottom nav */}
          <div className="print:hidden" style={{ maxWidth:960, margin:"24px auto 0 auto", padding:"0 48px", display:"flex", justifyContent:"space-between" }}>
            <button onClick={()=>navigate("/analysis")} style={{ fontFamily:"monospace", fontSize:10, letterSpacing:"0.1em", textTransform:"uppercase", padding:"7px 14px", background:"transparent", color:"#888", border:"2px solid #ddd", cursor:"pointer" }}>
              ← Analysis
            </button>
            <button onClick={()=>window.print()} style={{ fontFamily:"monospace", fontSize:10, letterSpacing:"0.1em", textTransform:"uppercase", fontWeight:900, padding:"9px 20px", background:"#111", color:"#fff", border:"2px solid #111", cursor:"pointer" }}>
              Export PDF
            </button>
          </div>
        </main>
      )}
    </div>
  );
}

// ── Pattern Strategy ──────────────────────────────────────────────────────────
function PatternStrategySection({ pattern }: { pattern: {recommendedPattern?:string;rationale?:string;application?:string} }) {
  return (
    <section>
      <SectionLabel n="05" title="Pattern Strategy"/>
      {pattern.recommendedPattern && (
        <div style={{ border:"2px solid #111", marginBottom:20 }}>
          <div style={{ background:"#111", padding:"14px 20px", display:"flex", alignItems:"center", gap:14 }}>
            <Fingerprint size={20} strokeWidth={1.5} style={{ color:T, flexShrink:0 }}/>
            <div>
              <div style={{ fontFamily:"monospace", fontSize:8, textTransform:"uppercase", letterSpacing:"0.15em", color:T, marginBottom:3 }}>Recommended Pattern</div>
              <div style={{ fontFamily:"monospace", fontSize:22, fontWeight:900, letterSpacing:"-0.04em", color:"#fff" }}>{pattern.recommendedPattern}</div>
            </div>
          </div>
        </div>
      )}
      <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
        {pattern.rationale && (
          <div style={{ borderLeft:"4px solid #111", paddingLeft:16 }}>
            <div style={{ fontFamily:"monospace", fontSize:8, textTransform:"uppercase", letterSpacing:"0.15em", color:T, marginBottom:6, fontWeight:900 }}>Why Nature Uses This Form</div>
            <p style={{ margin:0, fontFamily:"monospace", fontSize:11, lineHeight:1.7, color:"#333" }}>{pattern.rationale}</p>
          </div>
        )}
        {pattern.application && (
          <div style={{ borderLeft:"4px solid #ddd", paddingLeft:16 }}>
            <div style={{ fontFamily:"monospace", fontSize:8, textTransform:"uppercase", letterSpacing:"0.15em", color:"#aaa", marginBottom:6, fontWeight:900 }}>Site Application</div>
            <p style={{ margin:0, fontFamily:"monospace", fontSize:11, lineHeight:1.7, color:"#333" }}>{pattern.application}</p>
          </div>
        )}
      </div>
    </section>
  );
}

// ── Design Recommendations ────────────────────────────────────────────────────
const LAYER_ACC: Record<string,{bar:string}> = {
  Canopy:{"bar":"#111"},Understory:{"bar":"#333"},Shrub:{"bar":"#555"},
  Herbaceous:{"bar":"#777"},"Ground Cover":{"bar":"#999"},Vine:{"bar":"#bbb"},Root:{"bar":T},
};
const PRI_STY: Record<string,{color:string;border:string}> = {
  High:{color:"#111",border:"#111"},Medium:{color:T,border:T},Low:{color:"#aaa",border:"#ddd"},
};

function DesignRecsSection({ designRecs }: { designRecs: DesignRecsType|null|undefined }) {
  const plants   = Array.isArray(designRecs?.plants)               ? designRecs!.plants               : [];
  const elements = Array.isArray(designRecs?.designElements)       ? designRecs!.designElements       : [];
  const phases   = Array.isArray(designRecs?.implementationPhases) ? designRecs!.implementationPhases : [];
  const LAYER_ORDER=["Canopy","Understory","Shrub","Herbaceous","Ground Cover","Vine","Root"];
  const grouped = LAYER_ORDER.reduce<Record<string,PlantRec[]>>((acc,l)=>{const m=plants.filter(p=>p.layer===l);if(m.length)acc[l]=m;return acc;},{});
  plants.filter(p=>!LAYER_ORDER.includes(p.layer)).forEach(p=>{grouped[p.layer]=[...(grouped[p.layer]??[]),p];});

  return (
    <section style={{ pageBreakBefore:"always", marginTop:60 }}>
      <div style={{ borderTop:"6px solid #111", borderBottom:"2px solid #111", padding:"16px 0 14px 0", marginBottom:40, display:"flex", alignItems:"baseline", gap:16 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T} strokeWidth="2.5" style={{ flexShrink:0, marginBottom:-2 }}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        <h2 style={{ margin:0, fontSize:24, fontWeight:900, letterSpacing:"-0.04em", color:"#111", textTransform:"uppercase" }}>Final Design Recommendations</h2>
      </div>

      {!designRecs ? (
        <Placeholder msg="Run the AI resilience analysis in the War Room to generate the plant palette, design elements, and implementation plan."/>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:44 }}>

          {/* Planting Philosophy */}
          {designRecs.plantingPrinciples && (
            <div style={{ borderLeft:"6px solid #111", paddingLeft:20 }}>
              <div style={{ fontFamily:"monospace", fontSize:8, textTransform:"uppercase", letterSpacing:"0.18em", color:T, marginBottom:8, fontWeight:900 }}>Planting Philosophy</div>
              <p style={{ margin:0, fontFamily:"monospace", fontSize:11, lineHeight:1.8, color:"#333" }}>{designRecs.plantingPrinciples}</p>
            </div>
          )}

          {/* Plant Palette */}
          <div>
            <div style={{ borderBottom:"2px solid #111", paddingBottom:8, marginBottom:16, display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
              <span style={{ fontFamily:"monospace", fontSize:11, fontWeight:900, textTransform:"uppercase", letterSpacing:"-0.01em", color:"#111" }}>Plant Palette</span>
              <span style={{ fontFamily:"monospace", fontSize:9, color:T }}>{plants.length} species · {Object.keys(grouped).length} layers</span>
            </div>
            {plants.length===0?<Placeholder msg="No plant data generated yet."/>:(
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                {Object.entries(grouped).map(([layer,lp])=>{
                  const acc=LAYER_ACC[layer]??{bar:"#888"};
                  return (
                    <div key={layer} style={{ border:"2px solid #111", borderLeft:`6px solid ${acc.bar}`, overflow:"hidden" }}>
                      <div style={{ background:"#111", padding:"7px 14px", display:"flex", alignItems:"center", gap:10 }}>
                        <div style={{ width:6, height:6, background:acc.bar, flexShrink:0 }}/>
                        <span style={{ fontFamily:"monospace", fontSize:9, fontWeight:900, textTransform:"uppercase", letterSpacing:"0.12em", color:"#fff" }}>{layer} — {lp.length} species</span>
                      </div>
                      <table style={{ width:"100%", borderCollapse:"collapse", fontFamily:"monospace", fontSize:10, background:"#fff" }}>
                        <thead>
                          <tr style={{ background:"#f5f5f5", borderBottom:"1px solid #e5e5e5" }}>
                            {["Common name","Latin name","Purpose","Zone","Notes"].map(h=>(
                              <th key={h} style={{ padding:"6px 10px", textAlign:"left", fontWeight:900, textTransform:"uppercase", fontSize:8, letterSpacing:"0.1em", color:"#888" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {lp.map((plant,i)=>(
                            <tr key={i} style={{ borderBottom:"1px solid #f0f0f0" }}>
                              <td style={{ padding:"7px 10px", fontWeight:900, color:"#111" }}>{plant.name}</td>
                              <td style={{ padding:"7px 10px", fontStyle:"italic", color:"#888" }}>{plant.latinName}</td>
                              <td style={{ padding:"7px 10px", color:"#555" }}>{plant.purpose}</td>
                              <td style={{ padding:"7px 10px", fontWeight:900, color:T, whiteSpace:"nowrap" }}>{plant.zones}</td>
                              <td style={{ padding:"7px 10px", color:"#888" }}>{plant.notes}</td>
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

          {/* Design Elements */}
          <div>
            <div style={{ borderBottom:"2px solid #111", paddingBottom:8, marginBottom:16, display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
              <span style={{ fontFamily:"monospace", fontSize:11, fontWeight:900, textTransform:"uppercase", letterSpacing:"-0.01em", color:"#111" }}>Design Elements</span>
              <span style={{ fontFamily:"monospace", fontSize:9, color:T }}>{elements.length} components</span>
            </div>
            {elements.length===0?<Placeholder msg="No design elements generated yet."/>:(
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                {elements.map((el,i)=>{
                  const ps=PRI_STY[el.priority]??{color:"#aaa",border:"#ddd"};
                  return (
                    <div key={i} style={{ border:"2px solid #111", overflow:"hidden" }}>
                      <div style={{ background:"#f9f9f9", borderBottom:"1px solid #e5e5e5", padding:"10px 14px", display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8 }}>
                        <div>
                          <p style={{ margin:0, fontFamily:"monospace", fontSize:11, fontWeight:900, letterSpacing:"-0.02em", color:"#111" }}>{el.name}</p>
                          <p style={{ margin:"2px 0 0 0", fontFamily:"monospace", fontSize:8, textTransform:"uppercase", letterSpacing:"0.1em", color:"#aaa" }}>{el.type}</p>
                        </div>
                        <span style={{ flexShrink:0, padding:"3px 8px", fontFamily:"monospace", fontSize:8, fontWeight:900, textTransform:"uppercase", letterSpacing:"0.1em", color:ps.color, border:`2px solid ${ps.border}`, background:"#fff" }}>{el.priority}</span>
                      </div>
                      <div style={{ padding:"10px 14px", background:"#fff" }}>
                        <p style={{ margin:0, fontFamily:"monospace", fontSize:9, lineHeight:1.7, color:"#555" }}>{el.description}</p>
                        {el.placement&&<p style={{ margin:"6px 0 0 0", fontFamily:"monospace", fontSize:9 }}><span style={{ fontWeight:900, color:T }}>Placement: </span><span style={{ color:"#888" }}>{el.placement}</span></p>}
                        {el.rationale&&<p style={{ margin:"4px 0 0 0", fontFamily:"monospace", fontSize:9, fontStyle:"italic", color:"#bbb" }}>{el.rationale}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Implementation Roadmap */}
          <div>
            <div style={{ borderBottom:"2px solid #111", paddingBottom:8, marginBottom:20 }}>
              <span style={{ fontFamily:"monospace", fontSize:11, fontWeight:900, textTransform:"uppercase", letterSpacing:"-0.01em", color:"#111" }}>Implementation Roadmap</span>
            </div>
            {phases.length===0?<Placeholder msg="No implementation phases generated yet."/>:(
              <div style={{ position:"relative" }}>
                <div style={{ position:"absolute", left:18, top:0, bottom:0, width:2, background:"#111" }}/>
                <div style={{ display:"flex", flexDirection:"column", gap:16, paddingLeft:52 }}>
                  {phases.map((ph,i)=>(
                    <div key={i} style={{ position:"relative" }}>
                      <div style={{
                        position:"absolute", left:-41, top:10,
                        width:24, height:24,
                        background:T, color:"#fff",
                        fontFamily:"monospace", fontSize:10, fontWeight:900,
                        display:"flex", alignItems:"center", justifyContent:"center",
                        border:"2px solid #fff", outline:`2px solid ${T}`,
                      }}>{ph.phase}</div>
                      <div style={{ border:"2px solid #111", overflow:"hidden" }}>
                        <div style={{ background:"#111", padding:"9px 16px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                          <span style={{ fontFamily:"monospace", fontSize:12, fontWeight:900, letterSpacing:"-0.03em", color:"#fff" }}>{ph.title}</span>
                          <span style={{ fontFamily:"monospace", fontSize:9, fontWeight:900, padding:"3px 10px", background:T, color:"#fff" }}>{ph.duration}</span>
                        </div>
                        <div style={{ padding:"12px 16px", background:"#fff" }}>
                          {ph.elements?.length>0&&(
                            <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:8 }}>
                              {ph.elements.map((el,j)=>(
                                <span key={j} style={{ padding:"2px 8px", fontFamily:"monospace", fontSize:9, background:"#f5f5f5", border:"1px solid #ddd", color:"#555" }}>{el}</span>
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
