import { useState } from "react";

const INK = "#111";
const BLUE = "#1d4ed8";
const RULE = `2px solid ${INK}`;

const LAYERS = [
  { id: "map",      icon: "🗺️", label: "Map",       short: "MAP",      color: "#166534" },
  { id: "analysis", icon: "📊", label: "Analysis",  short: "ANALYSIS", color: BLUE },
  { id: "dossier",  icon: "📁", label: "Dossier",   short: "DOSSIER",  color: "#6d28d9" },
  { id: "present",  icon: "📑", label: "Present",   short: "PRESENT",  color: "#b45309" },
];

const PANEL_CONTENT: Record<string, React.ReactNode> = {
  map: (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Fake satellite map */}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, #1a2e1a 0%, #1f3d20 30%, #162c16 60%, #1a3019 100%)" }}>
        {/* Grid lines */}
        {[...Array(8)].map((_, i) => (
          <div key={i} style={{ position: "absolute", top: 0, bottom: 0, left: `${i * 12.5}%`, width: 1, background: "rgba(255,255,255,0.04)" }} />
        ))}
        {[...Array(6)].map((_, i) => (
          <div key={i} style={{ position: "absolute", left: 0, right: 0, top: `${i * 16.66}%`, height: 1, background: "rgba(255,255,255,0.04)" }} />
        ))}
        {/* Property polygon */}
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} viewBox="0 0 800 500" preserveAspectRatio="none">
          <polygon points="220,80 580,110 620,380 200,350" fill="rgba(29,78,216,0.25)" stroke="#3b82f6" strokeWidth="2.5" />
          {/* Contour lines */}
          <ellipse cx="400" cy="225" rx="140" ry="90" fill="none" stroke="rgba(255,200,0,0.35)" strokeWidth="1" />
          <ellipse cx="400" cy="225" rx="100" ry="60" fill="none" stroke="rgba(255,200,0,0.35)" strokeWidth="1" />
          <ellipse cx="400" cy="225" rx="60" ry="35" fill="none" stroke="rgba(255,200,0,0.4)" strokeWidth="1" />
          {/* Swale */}
          <path d="M250,200 Q340,240 430,220 Q520,200 600,230" fill="none" stroke="#22d3ee" strokeWidth="2" strokeDasharray="5,3" />
          {/* Zone */}
          <circle cx="320" cy="190" r="40" fill="rgba(34,197,94,0.2)" stroke="#22c55e" strokeWidth="1.5" strokeDasharray="4,3" />
          {/* Sector wedge */}
          <path d="M400 225 L480 150 A100 100 0 0 1 520 250 Z" fill="rgba(251,146,60,0.15)" stroke="#fb923c" strokeWidth="1" />
        </svg>
        {/* Map tools overlay */}
        <div style={{ position: "absolute", right: 12, top: 12, display: "flex", flexDirection: "column", gap: 4 }}>
          {["✏️", "📐", "〰️", "🔵"].map((t, i) => (
            <div key={i} style={{ width: 32, height: 32, background: "rgba(0,0,0,0.7)", border: "1px solid rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, cursor: "pointer" }}>{t}</div>
          ))}
        </div>
        {/* Legend */}
        <div style={{ position: "absolute", left: 12, bottom: 12, background: "rgba(0,0,0,0.8)", border: "1px solid rgba(255,255,255,0.12)", padding: "8px 12px" }}>
          {[
            { c: "#3b82f6", l: "Boundary" },
            { c: "#22d3ee", l: "Swale" },
            { c: "#22c55e", l: "Zone 1" },
            { c: "#fb923c", l: "N Sector" },
          ].map(({ c, l }) => (
            <div key={l} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
              <div style={{ width: 10, height: 10, background: c, borderRadius: "50%" }} />
              <span style={{ fontSize: 9, color: "#e5e7eb", fontFamily: "monospace" }}>{l}</span>
            </div>
          ))}
        </div>
        {/* Pending element banner */}
        <div style={{ position: "absolute", top: 12, left: 12, right: 50, background: "linear-gradient(90deg,#1e3a8a,#1d4ed8)", border: "1px solid #3b82f6", padding: "7px 12px", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12 }}>📌</span>
          <span style={{ fontSize: 10, color: "#fff", fontWeight: 700 }}>Add to Map: </span>
          <span style={{ fontSize: 10, color: "#bfdbfe" }}>Swale Line — water harvesting, along slope</span>
          <div style={{ marginLeft: "auto", fontSize: 9, color: "#93c5fd", padding: "2px 8px", border: "1px solid rgba(255,255,255,0.25)", cursor: "pointer" }}>✕</div>
        </div>
      </div>
    </div>
  ),
  analysis: (
    <div style={{ padding: "20px", height: "100%", overflowY: "auto", background: "#fff" }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: INK, marginBottom: 16 }}>AI ANALYSIS — WHITEWATER HOLLOW</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        {[
          { title: "Water Catchment", val: "3,200 L/day", icon: "💧", trend: "+12%" },
          { title: "Sector Wind", val: "NW dominant", icon: "🌬️", trend: "seasonal" },
          { title: "Slope Grade", val: "6–14%", icon: "📐", trend: "moderate" },
          { title: "Zone Coverage", val: "94%", icon: "🌿", trend: "optimal" },
        ].map(s => (
          <div key={s.title} style={{ border: RULE, padding: "12px 14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <span style={{ fontSize: 18 }}>{s.icon}</span>
              <span style={{ fontSize: 9, color: BLUE, letterSpacing: "0.05em" }}>{s.trend}</span>
            </div>
            <div style={{ fontWeight: 800, fontSize: 16, color: INK, marginTop: 6 }}>{s.val}</div>
            <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>{s.title}</div>
          </div>
        ))}
      </div>
      <div style={{ border: RULE, padding: "14px" }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: "#6b7280", marginBottom: 10 }}>AI RECOMMENDATIONS</div>
        {["Place primary swale at 340m contour to capture 85% of runoff.", "Zone 1 kitchen garden optimal at NE corner — solar access 7+ hrs.", "Consider windbreak on NW edge — reduces heat loss 18–22%."].map((r, i) => (
          <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8, paddingBottom: 8, borderBottom: i < 2 ? "1px solid #f3f4f6" : "none" }}>
            <span style={{ color: BLUE, fontWeight: 700, fontSize: 11, flexShrink: 0 }}>{i + 1}.</span>
            <span style={{ fontSize: 11, color: INK, lineHeight: 1.5 }}>{r}</span>
          </div>
        ))}
      </div>
    </div>
  ),
  dossier: (
    <div style={{ padding: "20px", height: "100%", overflowY: "auto", background: "#fff" }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: INK, marginBottom: 16 }}>SITE DOSSIER</div>
      {["Plant Schedule", "Water Budget", "Implementation Phases", "Soil Notes"].map((section, i) => (
        <div key={section} style={{ border: RULE, padding: "12px 14px", marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: INK }}>{section}</span>
            <span style={{ fontSize: 10, color: BLUE, cursor: "pointer" }}>EXPAND →</span>
          </div>
          {i === 0 && <div style={{ fontSize: 10, color: "#6b7280", marginTop: 6 }}>47 species · 3 guilds · 12 annuals</div>}
          {i === 1 && <div style={{ fontSize: 10, color: "#6b7280", marginTop: 6 }}>3,200 L/day supply · 2,800 L/day demand</div>}
          {i === 2 && <div style={{ fontSize: 10, color: "#6b7280", marginTop: 6 }}>4 phases · 18 months · est. $42,000</div>}
          {i === 3 && <div style={{ fontSize: 10, color: "#6b7280", marginTop: 6 }}>Clay loam · pH 6.4 · OM 3.2%</div>}
        </div>
      ))}
    </div>
  ),
  present: (
    <div style={{ padding: "20px", height: "100%", overflowY: "auto", background: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", padding: "40px 20px", border: RULE, width: "100%", maxWidth: 400 }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>📑</div>
        <div style={{ fontSize: 14, fontWeight: 800, color: INK, marginBottom: 8 }}>Client Presentation</div>
        <div style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.6, marginBottom: 20 }}>Generate a polished PDF with maps, analysis, plant schedule, and implementation plan.</div>
        <button style={{ background: INK, color: "#fff", border: "none", padding: "10px 24px", fontSize: 11, fontWeight: 700, fontFamily: "monospace", cursor: "pointer", letterSpacing: "0.05em", width: "100%" }}>
          GENERATE PDF →
        </button>
      </div>
    </div>
  ),
};

export function LayerStack() {
  const [activeLayer, setActiveLayer] = useState("map");
  const active = LAYERS.find(l => l.id === activeLayer)!;

  return (
    <div style={{ fontFamily: "'IBM Plex Mono', monospace", background: "#fff", height: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Top bar */}
      <div style={{ borderBottom: RULE, height: 48, display: "flex", alignItems: "stretch", background: INK, flexShrink: 0 }}>
        {/* Logo */}
        <div style={{ padding: "0 20px", display: "flex", alignItems: "center", borderRight: "2px solid #374151" }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: "#fff", letterSpacing: "0.05em" }}>TERRAGUARD OS</span>
        </div>
        {/* Property breadcrumb */}
        <div style={{ padding: "0 16px", display: "flex", alignItems: "center", gap: 8, borderRight: "2px solid #374151", flex: 1 }}>
          <span style={{ fontSize: 10, color: "#6b7280", cursor: "pointer", letterSpacing: "0.05em" }}>← ALL PROPERTIES</span>
          <span style={{ fontSize: 10, color: "#374151" }}>/</span>
          <span style={{ fontSize: 11, color: "#fff", fontWeight: 700 }}>🌿 Whitewater Hollow</span>
          <span style={{ fontSize: 9, color: "#6b7280", marginLeft: 8 }}>Blue Ridge, VA · 3.2 ha · 68% complete</span>
        </div>
        {/* Role toggle */}
        <div style={{ padding: "0 16px", display: "flex", alignItems: "center", gap: 8, borderLeft: "2px solid #374151" }}>
          {["Designer", "Client"].map(r => (
            <div key={r} style={{ padding: "4px 10px", fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", cursor: "pointer", background: r === "Designer" ? BLUE : "transparent", color: r === "Designer" ? "#fff" : "#6b7280", border: r === "Designer" ? "none" : "1px solid #374151" }}>{r.toUpperCase()}</div>
          ))}
        </div>
      </div>

      {/* Layer tabs */}
      <div style={{ display: "flex", borderBottom: RULE, background: "#fff", flexShrink: 0 }}>
        {LAYERS.map(layer => {
          const isActive = layer.id === activeLayer;
          return (
            <button
              key={layer.id}
              onClick={() => setActiveLayer(layer.id)}
              style={{
                flex: 1,
                padding: "10px 8px",
                border: "none",
                borderRight: RULE,
                borderBottom: isActive ? `3px solid ${layer.color}` : `3px solid transparent`,
                background: isActive ? "#fafafa" : "#fff",
                cursor: "pointer",
                fontFamily: "inherit",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 3,
                transition: "background 0.1s",
              }}
            >
              <span style={{ fontSize: 16 }}>{layer.icon}</span>
              <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.1em", color: isActive ? layer.color : "#9ca3af" }}>{layer.short}</span>
            </button>
          );
        })}
      </div>

      {/* Panel content — fills remaining space */}
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        {PANEL_CONTENT[activeLayer]}
      </div>
    </div>
  );
}
