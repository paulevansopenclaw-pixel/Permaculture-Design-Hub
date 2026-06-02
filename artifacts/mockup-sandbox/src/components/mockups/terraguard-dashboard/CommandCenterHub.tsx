import { useState } from "react";

const INK = "#111";
const BLUE = "#1d4ed8";
const LIGHT = "#f7f7f7";
const RULE = `2px solid ${INK}`;

const PROPERTIES = [
  { id: "1", name: "Whitewater Hollow", location: "Blue Ridge, VA", area: "3.2 ha", status: "active", phase: "Design", thumb: "🌿", progress: 68 },
  { id: "2", name: "Ridgeline Ranch", location: "Taos, NM", area: "12.7 ha", status: "review", phase: "Analysis", thumb: "🏔️", progress: 34 },
  { id: "3", name: "Fernwood Commons", location: "Portland, OR", area: "0.8 ha", status: "draft", phase: "Intake", thumb: "🌲", progress: 12 },
];

const LAYERS = [
  { id: "workspace", icon: "🗺️", label: "Map Workspace", desc: "Draw boundaries · contours · zones", color: "#166534", bg: "#f0fdf4" },
  { id: "analysis", icon: "📊", label: "AI Analysis", desc: "Water · sectors · site report", color: BLUE, bg: "#eff6ff" },
  { id: "dossier", icon: "📁", label: "Site Dossier", desc: "Water budget · plants · phases", color: "#6d28d9", bg: "#f5f3ff" },
  { id: "presentation", icon: "📑", label: "Presentation", desc: "Client-ready PDF output", color: "#b45309", bg: "#fffbeb" },
];

const ACTIVITY = [
  { time: "2 min ago", text: "Swale line added to Whitewater Hollow", icon: "✏️" },
  { time: "1 hr ago", text: "AI analysis completed for Ridgeline Ranch", icon: "✅" },
  { time: "Yesterday", text: "Client comment on zone 3 boundary", icon: "💬" },
  { time: "2 days ago", text: "Water budget updated — 3,200 L/day", icon: "💧" },
];

function StatusPip({ status }: { status: string }) {
  const map: Record<string, string> = { active: "#16a34a", review: BLUE, draft: "#9ca3af" };
  return <span style={{ width: 8, height: 8, borderRadius: "50%", background: map[status] ?? "#ccc", display: "inline-block", marginRight: 6 }} />;
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div style={{ height: 3, background: "#e5e7eb", borderRadius: 2, overflow: "hidden", marginTop: 6 }}>
      <div style={{ height: "100%", width: `${value}%`, background: BLUE, borderRadius: 2 }} />
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
        border: RULE,
        borderRadius: 0,
        background: hover ? "#fafafa" : "#fff",
        cursor: "pointer",
        padding: "20px 20px 16px",
        transition: "box-shadow 0.15s, transform 0.12s",
        boxShadow: hover ? `4px 4px 0 ${INK}` : "2px 2px 0 #ccc",
        transform: hover ? "translate(-1px,-1px)" : "none",
        position: "relative",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <span style={{ fontSize: 28 }}>{p.thumb}</span>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: BLUE, background: "#eff6ff", padding: "2px 7px", border: `1px solid ${BLUE}` }}>{p.phase}</span>
      </div>
      <div style={{ fontWeight: 800, fontSize: 14, color: INK, letterSpacing: "-0.01em", marginBottom: 3 }}>{p.name}</div>
      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>{p.location}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 8, marginBottom: 4 }}>
        <StatusPip status={p.status} />
        <span style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>{p.area}</span>
      </div>
      <ProgressBar value={p.progress} />
      <div style={{ fontSize: 9, color: "#9ca3af", textAlign: "right", marginTop: 3 }}>{p.progress}% complete</div>
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
        border: `2px solid ${hover ? layer.color : INK}`,
        borderRadius: 0,
        background: hover ? layer.bg : "#fff",
        cursor: "pointer",
        padding: "20px",
        transition: "all 0.15s",
        boxShadow: hover ? `4px 4px 0 ${layer.color}` : "2px 2px 0 #ccc",
        transform: hover ? "translate(-1px,-1px)" : "none",
      }}
    >
      <div style={{ fontSize: 26, marginBottom: 10 }}>{layer.icon}</div>
      <div style={{ fontWeight: 800, fontSize: 13, color: hover ? layer.color : INK, letterSpacing: "-0.01em", marginBottom: 4 }}>{layer.label}</div>
      <div style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.5 }}>{layer.desc}</div>
      <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: layer.color, letterSpacing: "0.05em" }}>OPEN →</span>
      </div>
    </div>
  );
}

export function CommandCenterHub() {
  const [view, setView] = useState<"home" | "project">("home");
  const [activeProject, setActiveProject] = useState(PROPERTIES[0]);

  if (view === "project") {
    return (
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", background: "#fff", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        {/* Top bar */}
        <div style={{ borderBottom: RULE, padding: "0 28px", height: 52, display: "flex", alignItems: "center", gap: 20, background: INK }}>
          <button onClick={() => setView("home")} style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer", fontSize: 11, fontFamily: "inherit", letterSpacing: "0.05em" }}>
            ← DASHBOARD
          </button>
          <div style={{ width: 1, height: 20, background: "#374151" }} />
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>{activeProject.thumb} {activeProject.name}</span>
          <span style={{ fontSize: 10, color: "#6b7280", marginLeft: 4, letterSpacing: "0.05em" }}>{activeProject.location} · {activeProject.area}</span>
        </div>

        {/* Project Hub */}
        <div style={{ flex: 1, padding: "28px 28px 0", display: "flex", flexDirection: "column", gap: 0 }}>
          {/* Phase indicator */}
          <div style={{ display: "flex", gap: 0, marginBottom: 28 }}>
            {["Intake", "Workspace", "Analysis", "Dossier", "Present"].map((step, i) => {
              const phases = ["Intake", "Workspace", "Analysis", "Dossier", "Present"];
              const active = phases.indexOf(activeProject.phase) >= i;
              return (
                <div key={step} style={{ flex: 1, display: "flex", alignItems: "center" }}>
                  <div style={{ flex: 1, padding: "8px 10px", border: RULE, borderRight: i < 4 ? "none" : RULE, background: active ? INK : "#fff", textAlign: "center" }}>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: active ? "#fff" : "#9ca3af" }}>{step.toUpperCase()}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Layer grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 28 }}>
            {LAYERS.map(layer => (
              <LayerTile key={layer.id} layer={layer} onClick={() => {}} />
            ))}
          </div>

          {/* Recent activity */}
          <div style={{ border: RULE, padding: "16px 20px" }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: "#6b7280", marginBottom: 12 }}>RECENT ACTIVITY</div>
            {ACTIVITY.slice(0, 3).map((a, i) => (
              <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", paddingBottom: 10, borderBottom: i < 2 ? "1px solid #f3f4f6" : "none", marginBottom: i < 2 ? 10 : 0 }}>
                <span style={{ fontSize: 14 }}>{a.icon}</span>
                <div style={{ flex: 1, fontSize: 11, color: INK, lineHeight: 1.5 }}>{a.text}</div>
                <span style={{ fontSize: 10, color: "#9ca3af", whiteSpace: "nowrap" }}>{a.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'IBM Plex Mono', monospace", background: "#fff", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Top nav */}
      <div style={{ borderBottom: RULE, padding: "0 28px", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between", background: INK }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: "#fff", letterSpacing: "0.05em" }}>TERRAGUARD OS</span>
          <span style={{ fontSize: 9, color: "#6b7280", letterSpacing: "0.1em", borderLeft: "1px solid #374151", paddingLeft: 12 }}>COMMAND CENTER</span>
        </div>
        <div style={{ display: "flex", gap: 20 }}>
          {["Properties", "Team", "Settings"].map(item => (
            <span key={item} style={{ fontSize: 10, color: "#9ca3af", cursor: "pointer", letterSpacing: "0.05em" }}>{item.toUpperCase()}</span>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Main content */}
        <div style={{ flex: 1, padding: "28px", overflowY: "auto" }}>
          {/* Summary strip */}
          <div style={{ display: "flex", gap: 0, marginBottom: 28, border: RULE }}>
            {[
              { label: "ACTIVE PROJECTS", value: "3" },
              { label: "TOTAL AREA", value: "16.7 ha" },
              { label: "THIS WEEK", value: "12 edits" },
              { label: "PENDING REVIEW", value: "1" },
            ].map((stat, i) => (
              <div key={stat.label} style={{ flex: 1, padding: "14px 16px", borderRight: i < 3 ? RULE : "none" }}>
                <div style={{ fontSize: 9, color: "#9ca3af", letterSpacing: "0.1em", marginBottom: 4 }}>{stat.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: INK }}>{stat.value}</div>
              </div>
            ))}
          </div>

          {/* Section header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: INK }}>YOUR PROPERTIES</span>
            <button style={{ fontSize: 10, fontWeight: 700, color: "#fff", background: BLUE, border: "none", padding: "6px 14px", cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.05em" }}>
              + NEW PROPERTY
            </button>
          </div>

          {/* Property grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            {PROPERTIES.map(p => (
              <PropertyCard key={p.id} p={p} onOpen={() => { setActiveProject(p); setView("project"); }} />
            ))}
          </div>
        </div>

        {/* Right activity sidebar */}
        <div style={{ width: 240, borderLeft: RULE, padding: "20px 16px", display: "flex", flexDirection: "column", gap: 0 }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: "#6b7280", marginBottom: 14 }}>RECENT ACTIVITY</div>
          {ACTIVITY.map((a, i) => (
            <div key={i} style={{ paddingBottom: 14, marginBottom: 14, borderBottom: "1px solid #f3f4f6" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 4 }}>
                <span style={{ fontSize: 12 }}>{a.icon}</span>
                <span style={{ fontSize: 10, color: INK, lineHeight: 1.5, flex: 1 }}>{a.text}</span>
              </div>
              <div style={{ fontSize: 9, color: "#9ca3af", paddingLeft: 20 }}>{a.time}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
