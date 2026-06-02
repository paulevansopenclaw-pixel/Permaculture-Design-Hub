import { useState } from "react";

// ── Organic warm palette ──────────────────────────────────────────────────────
const PAPER  = "#f8f5f0";
const CARD   = "#fffdf9";
const INK    = "#2c2416";
const MID    = "#6b5f4e";
const DIM    = "#a89880";
const RULE   = "1px solid #ddd6cc";
const BLUE   = "#1d4ed8";
const GREEN  = "#2d6a4f";
const AMBER  = "#92400e";

const shadow = (px = 6, alpha = 0.07) =>
  `0 ${px / 2}px ${px}px rgba(44,36,22,${alpha}), 0 1px 2px rgba(44,36,22,0.05)`;

const PROPERTIES = [
  { id: "1", name: "Whitewater Hollow", location: "Blue Ridge, VA", area: "3.2 ha", phase: "Design",   thumb: "🌿", progress: 68, accent: GREEN },
  { id: "2", name: "Ridgeline Ranch",   location: "Taos, NM",       area: "12.7 ha", phase: "Analysis", thumb: "🏔️", progress: 34, accent: BLUE  },
  { id: "3", name: "Fernwood Commons",  location: "Portland, OR",   area: "0.8 ha",  phase: "Intake",   thumb: "🌲", progress: 12, accent: AMBER },
];

const LAYERS = [
  { id: "workspace", icon: "🗺️", label: "Map Workspace",  desc: "Boundaries · contours · zones",  accent: GREEN, bg: "#f0fdf4" },
  { id: "analysis",  icon: "📊", label: "AI Analysis",    desc: "Water · sectors · site report", accent: BLUE,  bg: "#eff6ff" },
  { id: "dossier",   icon: "📁", label: "Site Dossier",   desc: "Budget · plants · phases",      accent: "#6d28d9", bg: "#f5f3ff" },
  { id: "present",   icon: "📑", label: "Presentation",   desc: "Client-ready PDF output",       accent: AMBER, bg: "#fffbeb" },
];

const ACTIVITY = [
  { time: "2 min ago",  text: "Swale line added to Whitewater Hollow",      icon: "✏️" },
  { time: "1 hr ago",   text: "AI analysis completed for Ridgeline Ranch",  icon: "✅" },
  { time: "Yesterday",  text: "Client note on zone 3 boundary",             icon: "💬" },
  { time: "2 days ago", text: "Water budget updated — 3,200 L/day",         icon: "💧" },
];

function Tag({ label, accent }: { label: string; accent: string }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 600, letterSpacing: "0.08em",
      color: accent, background: accent + "18",
      padding: "2px 7px", borderRadius: 20,
      border: `1px solid ${accent}40`,
    }}>
      {label.toUpperCase()}
    </span>
  );
}

function ProgressBar({ value, accent }: { value: number; accent: string }) {
  return (
    <div style={{ height: 4, background: "#ede8e0", borderRadius: 99, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${value}%`, background: accent, borderRadius: 99, transition: "width 0.4s ease" }} />
    </div>
  );
}

function PropertyCard({ p, onOpen }: { p: typeof PROPERTIES[0]; onOpen: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onOpen}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: CARD,
        borderRadius: 10,
        border: RULE,
        padding: "18px 18px 14px",
        cursor: "pointer",
        boxShadow: hover ? shadow(14, 0.12) : shadow(6),
        transform: hover ? "translateY(-2px)" : "none",
        transition: "all 0.18s ease",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <span style={{ fontSize: 26 }}>{p.thumb}</span>
        <Tag label={p.phase} accent={p.accent} />
      </div>
      <div style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 14, color: INK, lineHeight: 1.35, marginBottom: 4 }}>{p.name}</div>
      <div style={{ fontSize: 11, color: MID, marginBottom: 12 }}>{p.location} · {p.area}</div>
      <ProgressBar value={p.progress} accent={p.accent} />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 10, color: DIM }}>
        <span>{p.progress}% complete</span>
        <span>Open →</span>
      </div>
    </div>
  );
}

function LayerTile({ layer, onClick }: { layer: typeof LAYERS[0]; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? layer.bg : CARD,
        borderRadius: 10,
        border: `1px solid ${hover ? layer.accent + "60" : "#ddd6cc"}`,
        padding: "20px",
        cursor: "pointer",
        boxShadow: hover ? `0 6px 18px ${layer.accent}25` : shadow(4),
        transition: "all 0.18s ease",
      }}
    >
      <div style={{ fontSize: 24, marginBottom: 10 }}>{layer.icon}</div>
      <div style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 13, color: hover ? layer.accent : INK, marginBottom: 5, transition: "color 0.15s" }}>{layer.label}</div>
      <div style={{ fontSize: 11, color: MID, lineHeight: 1.55 }}>{layer.desc}</div>
      <div style={{ marginTop: 12, fontSize: 10, fontWeight: 600, color: layer.accent, letterSpacing: "0.04em" }}>Open layer →</div>
    </div>
  );
}

export function CommandCenterHub() {
  const [view, setView]           = useState<"home" | "project">("home");
  const [active, setActive]       = useState(PROPERTIES[0]);

  // ── PROJECT HUB ──────────────────────────────────────────────────────────
  if (view === "project") {
    return (
      <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: PAPER, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        {/* Top bar */}
        <div style={{ padding: "0 28px", height: 52, display: "flex", alignItems: "center", gap: 16, background: "#fff", borderBottom: RULE, boxShadow: shadow(4, 0.05) }}>
          <button onClick={() => setView("home")} style={{ background: "none", border: "none", color: MID, cursor: "pointer", fontSize: 12, fontFamily: "inherit", padding: 0 }}>
            ← Dashboard
          </button>
          <div style={{ width: 1, height: 16, background: "#ddd6cc" }} />
          <span style={{ fontSize: 14, fontFamily: "Georgia, serif", fontWeight: 700, color: INK }}>{active.thumb} {active.name}</span>
          <Tag label={active.phase} accent={active.accent} />
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: MID }}>{active.location} · {active.area}</span>
        </div>

        <div style={{ flex: 1, padding: "28px", overflowY: "auto" }}>
          {/* Phase strip */}
          <div style={{ background: CARD, borderRadius: 10, border: RULE, padding: "14px 20px", marginBottom: 24, display: "flex", alignItems: "center", gap: 6, boxShadow: shadow(4) }}>
            <span style={{ fontSize: 11, color: MID, marginRight: 8 }}>Design phase:</span>
            {["Intake", "Workspace", "Analysis", "Dossier", "Present"].map((step, i) => {
              const order = ["Intake","Workspace","Analysis","Dossier","Present"];
              const done  = order.indexOf(active.phase) >= i;
              return (
                <span key={step} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: done ? 700 : 400, color: done ? active.accent : DIM, padding: "3px 10px", background: done ? active.accent + "18" : "transparent", borderRadius: 20, border: `1px solid ${done ? active.accent + "40" : "transparent"}` }}>
                    {step}
                  </span>
                  {i < 4 && <span style={{ color: "#ddd6cc", fontSize: 10 }}>›</span>}
                </span>
              );
            })}
          </div>

          {/* Layer grid */}
          <div style={{ marginBottom: 8, fontSize: 11, fontWeight: 600, color: MID, letterSpacing: "0.04em" }}>DESIGN LAYERS</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 24 }}>
            {LAYERS.map(layer => <LayerTile key={layer.id} layer={layer} onClick={() => {}} />)}
          </div>

          {/* Activity */}
          <div style={{ background: CARD, borderRadius: 10, border: RULE, padding: "16px 20px", boxShadow: shadow(4) }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: MID, letterSpacing: "0.04em", marginBottom: 14 }}>RECENT ACTIVITY</div>
            {ACTIVITY.slice(0, 3).map((a, i) => (
              <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", paddingBottom: i < 2 ? 12 : 0, marginBottom: i < 2 ? 12 : 0, borderBottom: i < 2 ? RULE : "none" }}>
                <span style={{ fontSize: 14 }}>{a.icon}</span>
                <span style={{ flex: 1, fontSize: 12, color: INK, lineHeight: 1.5 }}>{a.text}</span>
                <span style={{ fontSize: 10, color: DIM, whiteSpace: "nowrap" }}>{a.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── HOME DASHBOARD ───────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: PAPER, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Nav */}
      <div style={{ padding: "0 28px", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fff", borderBottom: RULE, boxShadow: shadow(4, 0.05) }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>🛡️</span>
          <span style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 15, color: INK }}>TerraGuard OS</span>
        </div>
        <div style={{ display: "flex", gap: 24 }}>
          {["Properties", "Team", "Settings"].map(item => (
            <span key={item} style={{ fontSize: 12, color: MID, cursor: "pointer" }}>{item}</span>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Main */}
        <div style={{ flex: 1, padding: "28px", overflowY: "auto" }}>
          {/* Stats strip */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 28 }}>
            {[
              { label: "Active Projects", value: "3",        icon: "🌿" },
              { label: "Total Area",      value: "16.7 ha",  icon: "📐" },
              { label: "Edits This Week", value: "12",       icon: "✏️" },
              { label: "Pending Review",  value: "1",        icon: "📋" },
            ].map(s => (
              <div key={s.label} style={{ background: CARD, borderRadius: 10, border: RULE, padding: "16px", boxShadow: shadow(4) }}>
                <div style={{ fontSize: 20, marginBottom: 8 }}>{s.icon}</div>
                <div style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 22, color: INK }}>{s.value}</div>
                <div style={{ fontSize: 11, color: MID, marginTop: 3 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <div style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 18, color: INK }}>Your Properties</div>
              <div style={{ fontSize: 12, color: MID, marginTop: 2 }}>Click any property to open its design hub</div>
            </div>
            <button style={{ background: GREEN, color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>
              + New Property
            </button>
          </div>

          {/* Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
            {PROPERTIES.map(p => (
              <PropertyCard key={p.id} p={p} onOpen={() => { setActive(p); setView("project"); }} />
            ))}
          </div>
        </div>

        {/* Activity panel */}
        <div style={{ width: 240, borderLeft: RULE, background: "#fff", padding: "20px 16px", overflowY: "auto" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: MID, letterSpacing: "0.04em", marginBottom: 16 }}>ACTIVITY</div>
          {ACTIVITY.map((a, i) => (
            <div key={i} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: i < ACTIVITY.length - 1 ? RULE : "none" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 4 }}>
                <span style={{ fontSize: 12 }}>{a.icon}</span>
                <span style={{ fontSize: 11, color: INK, lineHeight: 1.5, flex: 1 }}>{a.text}</span>
              </div>
              <div style={{ fontSize: 10, color: DIM, paddingLeft: 20 }}>{a.time}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
