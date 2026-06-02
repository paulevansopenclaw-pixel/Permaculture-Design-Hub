import { useState } from "react";

// ── Organic warm palette ──────────────────────────────────────────────────────
const PAPER = "#f8f5f0";
const CARD  = "#fffdf9";
const INK   = "#2c2416";
const MID   = "#6b5f4e";
const DIM   = "#a89880";
const RULE  = "1px solid #ddd6cc";
const BLUE  = "#1d4ed8";
const GREEN = "#2d6a4f";
const AMBER = "#92400e";

const shadow = (px = 6, alpha = 0.08) =>
  `0 ${px / 2}px ${px}px rgba(44,36,22,${alpha})`;

const LAYERS = [
  { id: "map",      icon: "🗺️", label: "Map",      accent: GREEN },
  { id: "analysis", icon: "📊", label: "Analysis", accent: BLUE  },
  { id: "dossier",  icon: "📁", label: "Dossier",  accent: "#6d28d9" },
  { id: "present",  icon: "📑", label: "Present",  accent: AMBER },
];

function MapPanel() {
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Satellite base */}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(150deg, #1b3320 0%, #1f3d24 40%, #162c18 70%, #1a3019 100%)" }}>
        {/* Subtle grid */}
        {[...Array(10)].map((_, i) => (
          <div key={`v${i}`} style={{ position: "absolute", top: 0, bottom: 0, left: `${i * 10}%`, width: 1, background: "rgba(255,255,255,0.03)" }} />
        ))}
        {[...Array(8)].map((_, i) => (
          <div key={`h${i}`} style={{ position: "absolute", left: 0, right: 0, top: `${i * 12.5}%`, height: 1, background: "rgba(255,255,255,0.03)" }} />
        ))}

        {/* Drawn layers — SVG */}
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} viewBox="0 0 900 560" preserveAspectRatio="xMidYMid slice">
          {/* Property boundary */}
          <polygon points="210,75 605,108 640,415 190,385"
            fill="rgba(29,78,216,0.18)" stroke="#60a5fa" strokeWidth="2" strokeLinejoin="round" />
          {/* Contour lines */}
          {[130, 100, 70].map((r, i) => (
            <ellipse key={i} cx="410" cy="240" rx={r * 1.6} ry={r}
              fill="none" stroke={`rgba(250,204,21,${0.25 + i * 0.05})`} strokeWidth="1" />
          ))}
          {/* Swale */}
          <path d="M255,218 C310,248 380,228 450,216 C520,204 590,235 660,252"
            fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="6,4" />
          {/* Zone circle */}
          <circle cx="310" cy="200" r="55"
            fill="rgba(34,197,94,0.18)" stroke="#4ade80" strokeWidth="1.5" strokeDasharray="5,4" />
          {/* Sector wedge */}
          <path d="M410 240 L520 148 A130 130 0 0 1 558 278 Z"
            fill="rgba(251,146,60,0.14)" stroke="#fb923c" strokeWidth="1.2" />
          {/* Windbreak line */}
          <line x1="210" y1="240" x2="210" y2="380" stroke="#a3e635" strokeWidth="3" strokeLinecap="round" />
        </svg>

        {/* Pending element banner */}
        <div style={{
          position: "absolute", top: 14, left: 14, right: 14,
          background: "rgba(30,58,138,0.92)", backdropFilter: "blur(6px)",
          borderRadius: 8, border: "1px solid rgba(96,165,250,0.5)",
          padding: "9px 14px", display: "flex", alignItems: "center", gap: 10,
          boxShadow: "0 4px 20px rgba(29,78,216,0.35)",
        }}>
          <span style={{ fontSize: 14 }}>📌</span>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#fff" }}>Add to map: </span>
            <span style={{ fontSize: 11, color: "#bfdbfe" }}>Swale Line</span>
            <span style={{ fontSize: 10, color: "#93c5fd" }}> — water harvesting along contour</span>
          </div>
          <button style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, padding: "3px 10px", color: "#fff", fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}>Dismiss</button>
        </div>

        {/* Tool palette */}
        <div style={{ position: "absolute", right: 14, top: 60, display: "flex", flexDirection: "column", gap: 6 }}>
          {[
            { icon: "✏️", label: "Draw" },
            { icon: "📐", label: "Measure" },
            { icon: "〰️", label: "Swale" },
            { icon: "🔵", label: "Zone" },
          ].map((t, i) => (
            <div key={i} title={t.label} style={{
              width: 36, height: 36, background: "rgba(255,255,255,0.10)",
              backdropFilter: "blur(4px)", borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 15, cursor: "pointer",
              boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
            }}>{t.icon}</div>
          ))}
        </div>

        {/* Legend */}
        <div style={{
          position: "absolute", left: 14, bottom: 14,
          background: "rgba(0,0,0,0.72)", backdropFilter: "blur(6px)",
          borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)",
          padding: "10px 14px",
        }}>
          {[
            { c: "#60a5fa", l: "Property boundary" },
            { c: "#38bdf8", l: "Swale line" },
            { c: "#4ade80", l: "Zone 1" },
            { c: "#fb923c", l: "N wind sector" },
          ].map(({ c, l }) => (
            <div key={l} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: c, flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: "#e5e7eb", fontFamily: "system-ui" }}>{l}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AnalysisPanel() {
  return (
    <div style={{ padding: "22px 24px", height: "100%", overflowY: "auto", background: PAPER }}>
      <div style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 17, color: INK, marginBottom: 6 }}>AI Site Analysis</div>
      <div style={{ fontSize: 12, color: MID, marginBottom: 20 }}>Whitewater Hollow · last updated 2 min ago</div>

      {/* Metric grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
        {[
          { title: "Water catchment", val: "3,200 L/day", icon: "💧", trend: "+12%",  accent: BLUE  },
          { title: "Wind sector",     val: "NW dominant", icon: "🌬️", trend: "seasonal", accent: MID },
          { title: "Slope grade",     val: "6–14%",       icon: "📐", trend: "moderate", accent: GREEN },
          { title: "Zone coverage",   val: "94%",          icon: "🌿", trend: "optimal",  accent: GREEN },
        ].map(s => (
          <div key={s.title} style={{ background: CARD, borderRadius: 10, border: RULE, padding: "14px", boxShadow: shadow(4) }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 18 }}>{s.icon}</span>
              <span style={{ fontSize: 9, color: s.accent, fontWeight: 600, background: s.accent + "18", padding: "2px 7px", borderRadius: 12 }}>{s.trend}</span>
            </div>
            <div style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 18, color: INK, marginTop: 8 }}>{s.val}</div>
            <div style={{ fontSize: 11, color: MID, marginTop: 3 }}>{s.title}</div>
          </div>
        ))}
      </div>

      {/* Recommendations */}
      <div style={{ background: CARD, borderRadius: 10, border: RULE, padding: "16px 18px", boxShadow: shadow(4) }}>
        <div style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 13, color: INK, marginBottom: 14 }}>Design recommendations</div>
        {[
          "Place primary swale at 340 m contour to capture 85% of surface runoff.",
          "Zone 1 kitchen garden performs best at NE corner — 7+ hours solar daily.",
          "A 12 m windbreak on the NW edge reduces winter heat loss by 18–22%.",
        ].map((r, i) => (
          <div key={i} style={{ display: "flex", gap: 12, paddingBottom: i < 2 ? 12 : 0, marginBottom: i < 2 ? 12 : 0, borderBottom: i < 2 ? RULE : "none" }}>
            <span style={{ width: 20, height: 20, borderRadius: "50%", background: BLUE, color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
            <span style={{ fontSize: 12, color: INK, lineHeight: 1.6 }}>{r}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DossierPanel() {
  return (
    <div style={{ padding: "22px 24px", height: "100%", overflowY: "auto", background: PAPER }}>
      <div style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 17, color: INK, marginBottom: 6 }}>Site Dossier</div>
      <div style={{ fontSize: 12, color: MID, marginBottom: 20 }}>Complete project documentation</div>
      {[
        { icon: "🌱", title: "Plant Schedule", sub: "47 species · 3 guilds · 12 annuals" },
        { icon: "💧", title: "Water Budget",   sub: "3,200 L/day supply · 2,800 L/day demand" },
        { icon: "📅", title: "Implementation", sub: "4 phases · 18 months · est. $42,000" },
        { icon: "🪱", title: "Soil Notes",     sub: "Clay loam · pH 6.4 · OM 3.2%" },
      ].map((s, i) => (
        <div key={s.title} style={{ background: CARD, borderRadius: 10, border: RULE, padding: "14px 18px", marginBottom: 12, boxShadow: shadow(4), cursor: "pointer" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 22 }}>{s.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: INK }}>{s.title}</div>
              <div style={{ fontSize: 11, color: MID, marginTop: 3 }}>{s.sub}</div>
            </div>
            <span style={{ fontSize: 12, color: DIM }}>›</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function PresentPanel() {
  return (
    <div style={{ padding: "22px 24px", height: "100%", background: PAPER, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: CARD, borderRadius: 14, border: RULE, padding: "40px 32px", maxWidth: 380, width: "100%", textAlign: "center", boxShadow: shadow(12, 0.1) }}>
        <span style={{ fontSize: 44, display: "block", marginBottom: 18 }}>📑</span>
        <div style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 18, color: INK, marginBottom: 10 }}>Client Presentation</div>
        <div style={{ fontSize: 12, color: MID, lineHeight: 1.7, marginBottom: 24 }}>
          Generate a polished PDF with site maps, AI analysis, plant schedule, water budget, and implementation plan.
        </div>
        <button style={{ width: "100%", background: GREEN, color: "#fff", border: "none", borderRadius: 8, padding: "12px 24px", fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>
          Generate PDF →
        </button>
        <div style={{ marginTop: 14, fontSize: 11, color: DIM }}>Last generated 3 days ago</div>
      </div>
    </div>
  );
}

const PANEL: Record<string, React.ReactNode> = {
  map:      <MapPanel />,
  analysis: <AnalysisPanel />,
  dossier:  <DossierPanel />,
  present:  <PresentPanel />,
};

export function LayerStack() {
  const [active, setActive] = useState("map");
  const layer = LAYERS.find(l => l.id === active)!;

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: PAPER, height: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Top bar */}
      <div style={{ height: 52, display: "flex", alignItems: "stretch", background: "#fff", borderBottom: RULE, boxShadow: shadow(4, 0.05), flexShrink: 0 }}>
        {/* Logo */}
        <div style={{ padding: "0 20px", display: "flex", alignItems: "center", gap: 8, borderRight: RULE }}>
          <span style={{ fontSize: 16 }}>🛡️</span>
          <span style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 14, color: INK }}>TerraGuard</span>
        </div>
        {/* Breadcrumb */}
        <div style={{ padding: "0 18px", display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
          <span style={{ fontSize: 11, color: MID, cursor: "pointer" }}>← Properties</span>
          <span style={{ color: "#ddd6cc" }}>/</span>
          <span style={{ fontSize: 13, fontFamily: "Georgia, serif", fontWeight: 700, color: INK }}>🌿 Whitewater Hollow</span>
          <span style={{ fontSize: 11, color: DIM }}>· 3.2 ha · Blue Ridge, VA</span>
        </div>
        {/* Role toggle */}
        <div style={{ padding: "0 16px", display: "flex", alignItems: "center", gap: 6, borderLeft: RULE }}>
          {["Designer", "Client"].map(r => (
            <button key={r} style={{
              padding: "4px 12px", fontSize: 10, fontWeight: 600, letterSpacing: "0.03em",
              cursor: "pointer", fontFamily: "inherit", borderRadius: 20,
              background: r === "Designer" ? INK : "transparent",
              color: r === "Designer" ? "#fff" : MID,
              border: r === "Designer" ? "none" : `1px solid ${RULE.split(" ").pop()}`,
            }}>{r}</button>
          ))}
        </div>
      </div>

      {/* Layer tab bar */}
      <div style={{ display: "flex", borderBottom: RULE, background: "#fff", flexShrink: 0 }}>
        {LAYERS.map(l => {
          const isActive = l.id === active;
          return (
            <button
              key={l.id}
              onClick={() => setActive(l.id)}
              style={{
                flex: 1, padding: "10px 8px", border: "none", cursor: "pointer",
                fontFamily: "inherit", background: isActive ? PAPER : "#fff",
                borderBottom: `3px solid ${isActive ? l.accent : "transparent"}`,
                borderRight: RULE, transition: "all 0.15s",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
              }}
            >
              <span style={{ fontSize: 17 }}>{l.icon}</span>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: isActive ? l.accent : DIM, transition: "color 0.15s" }}>
                {l.label.toUpperCase()}
              </span>
            </button>
          );
        })}
      </div>

      {/* Active panel */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {PANEL[active]}
      </div>
    </div>
  );
}
