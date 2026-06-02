import { useState } from "react";
import {
  Map, BarChart3, FolderOpen, FileText,
  PenLine, CheckCircle2, MessageSquare, Droplets,
  Ruler, ClipboardList, ChevronRight, Plus,
  ArrowUpRight, Settings, Users, Shield,
} from "lucide-react";

// ── Palette ───────────────────────────────────────────────────────────────────
const PAPER  = "#f8f5f0";
const CARD   = "#fffdf9";
const INK    = "#2c2416";
const MID    = "#6b5f4e";
const DIM    = "#a89880";
const RULE   = "1px solid #ddd6cc";
const BLUE   = "#1d4ed8";
const GREEN  = "#2d6a4f";
const AMBER  = "#92400e";
const shadow = (px = 6, a = 0.07) =>
  `0 ${px / 2}px ${px}px rgba(44,36,22,${a}), 0 1px 2px rgba(44,36,22,0.04)`;

// ── Data ─────────────────────────────────────────────────────────────────────
const PROPERTIES = [
  {
    id: "1", name: "Whitewater Hollow", location: "Blue Ridge, VA",
    area: "3.2 ha", phase: "Design", progress: 68, accent: GREEN,
    img: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=600&h=240&fit=crop&q=80",
  },
  {
    id: "2", name: "Ridgeline Ranch", location: "Taos, NM",
    area: "12.7 ha", phase: "Analysis", progress: 34, accent: BLUE,
    img: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=600&h=240&fit=crop&q=80",
  },
  {
    id: "3", name: "Fernwood Commons", location: "Portland, OR",
    area: "0.8 ha", phase: "Intake", progress: 12, accent: AMBER,
    img: "https://images.unsplash.com/photo-1448630360428-65456885c650?w=600&h=240&fit=crop&q=80",
  },
];

const LAYERS = [
  { id: "workspace", Icon: Map,         label: "Map Workspace",  desc: "Boundaries · contours · zones", accent: GREEN },
  { id: "analysis",  Icon: BarChart3,   label: "AI Analysis",    desc: "Water · sectors · site report", accent: BLUE  },
  { id: "dossier",   Icon: FolderOpen,  label: "Site Dossier",   desc: "Budget · plants · phases",      accent: "#6d28d9" },
  { id: "present",   Icon: FileText,    label: "Presentation",   desc: "Client-ready PDF output",       accent: AMBER },
];

const ACTIVITY = [
  { Icon: PenLine,       time: "2 min ago",  text: "Swale line added to Whitewater Hollow"     },
  { Icon: CheckCircle2,  time: "1 hr ago",   text: "AI analysis completed for Ridgeline Ranch" },
  { Icon: MessageSquare, time: "Yesterday",  text: "Client note on zone 3 boundary"            },
  { Icon: Droplets,      time: "2 days ago", text: "Water budget updated — 3,200 L/day"        },
];

const STATS = [
  { Icon: Map,           label: "Active Projects",  value: "3"       },
  { Icon: Ruler,         label: "Total Area",        value: "16.7 ha" },
  { Icon: PenLine,       label: "Edits This Week",   value: "12"      },
  { Icon: ClipboardList, label: "Pending Review",    value: "1"       },
];

// ── Sub-components ────────────────────────────────────────────────────────────
function Tag({ label, accent }: { label: string; accent: string }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 600, letterSpacing: "0.07em",
      color: accent, background: accent + "18",
      padding: "2px 8px", borderRadius: 20, border: `1px solid ${accent}38`,
    }}>
      {label.toUpperCase()}
    </span>
  );
}

function ProgressBar({ value, accent }: { value: number; accent: string }) {
  return (
    <div style={{ height: 3, background: "#ede8e0", borderRadius: 99, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${value}%`, background: accent, borderRadius: 99 }} />
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
        background: CARD, borderRadius: 12, border: RULE, overflow: "hidden",
        cursor: "pointer",
        boxShadow: hover ? shadow(18, 0.13) : shadow(5),
        transform: hover ? "translateY(-3px)" : "none",
        transition: "all 0.2s ease",
      }}
    >
      {/* Aerial photo */}
      <div style={{ position: "relative", height: 120, overflow: "hidden" }}>
        <img
          src={p.img}
          alt={p.name}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block",
                   filter: hover ? "brightness(1.05)" : "brightness(0.95)", transition: "filter 0.2s" }}
        />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, transparent 50%, rgba(44,36,22,0.55))" }} />
        <div style={{ position: "absolute", bottom: 10, left: 12, right: 12, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <span style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 13, color: "#fff", textShadow: "0 1px 4px rgba(0,0,0,0.5)", lineHeight: 1.2 }}>{p.name}</span>
          {hover && <ArrowUpRight size={16} color="#fff" style={{ opacity: 0.9 }} />}
        </div>
      </div>

      {/* Card body */}
      <div style={{ padding: "12px 14px 14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontSize: 11, color: MID }}>{p.location} · {p.area}</span>
          <Tag label={p.phase} accent={p.accent} />
        </div>
        <ProgressBar value={p.progress} accent={p.accent} />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 10, color: DIM }}>
          <span>{p.progress}% complete</span>
          <span>Open project →</span>
        </div>
      </div>
    </div>
  );
}

function LayerTile({ layer, onClick }: { layer: typeof LAYERS[0]; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  const { Icon, label, desc, accent } = layer;
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? accent + "0c" : CARD,
        borderRadius: 10, border: `1px solid ${hover ? accent + "55" : "#ddd6cc"}`,
        padding: "18px 20px", cursor: "pointer",
        boxShadow: hover ? `0 6px 20px ${accent}22` : shadow(4),
        transition: "all 0.18s ease",
        display: "flex", alignItems: "flex-start", gap: 14,
      }}
    >
      <div style={{ width: 36, height: 36, borderRadius: 9, background: accent + "18", border: `1px solid ${accent}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={17} color={accent} strokeWidth={1.75} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: hover ? accent : INK, marginBottom: 4, transition: "color 0.15s" }}>{label}</div>
        <div style={{ fontSize: 11, color: MID, lineHeight: 1.5 }}>{desc}</div>
      </div>
      <ChevronRight size={15} color={hover ? accent : DIM} style={{ marginTop: 2, flexShrink: 0, transition: "color 0.15s" }} />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function CommandCenterHub() {
  const [view,   setView]   = useState<"home" | "project">("home");
  const [active, setActive] = useState(PROPERTIES[0]);

  // ── PROJECT HUB ──────────────────────────────────────────────────────────
  if (view === "project") {
    const order = ["Intake", "Workspace", "Analysis", "Dossier", "Present"];
    const currentIdx = order.indexOf(active.phase);

    return (
      <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: PAPER, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        {/* Top bar */}
        <div style={{ padding: "0 28px", height: 54, display: "flex", alignItems: "center", gap: 14, background: "#fff", borderBottom: RULE, boxShadow: shadow(4, 0.05) }}>
          <button onClick={() => setView("home")} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: MID, cursor: "pointer", fontSize: 12, fontFamily: "inherit", padding: 0 }}>
            ← Dashboard
          </button>
          <div style={{ width: 1, height: 18, background: "#ddd6cc" }} />
          {/* Property photo pill */}
          <div style={{ width: 28, height: 28, borderRadius: 6, overflow: "hidden", border: RULE, flexShrink: 0 }}>
            <img src={active.img} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
          </div>
          <span style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 15, color: INK }}>{active.name}</span>
          <Tag label={active.phase} accent={active.accent} />
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: DIM }}>{active.location} · {active.area}</span>
        </div>

        <div style={{ flex: 1, padding: "28px", overflowY: "auto" }}>
          {/* Phase breadcrumb */}
          <div style={{ background: CARD, borderRadius: 10, border: RULE, padding: "14px 20px", marginBottom: 24, display: "flex", alignItems: "center", gap: 4, boxShadow: shadow(3) }}>
            <span style={{ fontSize: 11, color: DIM, marginRight: 10 }}>Phase:</span>
            {order.map((step, i) => {
              const done = currentIdx >= i;
              return (
                <span key={step} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{
                    fontSize: 10, fontWeight: done ? 600 : 400,
                    color: done ? active.accent : DIM,
                    padding: "3px 10px", borderRadius: 20,
                    background: done ? active.accent + "18" : "transparent",
                    border: `1px solid ${done ? active.accent + "40" : "transparent"}`,
                  }}>{step}</span>
                  {i < order.length - 1 && <ChevronRight size={12} color="#ddd6cc" />}
                </span>
              );
            })}
          </div>

          {/* Layer tiles */}
          <div style={{ fontSize: 11, fontWeight: 600, color: MID, letterSpacing: "0.05em", marginBottom: 12 }}>DESIGN LAYERS</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
            {LAYERS.map(layer => <LayerTile key={layer.id} layer={layer} onClick={() => {}} />)}
          </div>

          {/* Activity */}
          <div style={{ background: CARD, borderRadius: 10, border: RULE, padding: "16px 20px", boxShadow: shadow(3) }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: MID, letterSpacing: "0.05em", marginBottom: 14 }}>RECENT ACTIVITY</div>
            {ACTIVITY.slice(0, 3).map(({ Icon, time, text }, i) => (
              <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", paddingBottom: i < 2 ? 12 : 0, marginBottom: i < 2 ? 12 : 0, borderBottom: i < 2 ? RULE : "none" }}>
                <div style={{ width: 28, height: 28, borderRadius: 7, background: "#f0ece5", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon size={13} color={MID} strokeWidth={1.75} />
                </div>
                <span style={{ flex: 1, fontSize: 12, color: INK, lineHeight: 1.55 }}>{text}</span>
                <span style={{ fontSize: 10, color: DIM, whiteSpace: "nowrap" }}>{time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── HOME DASHBOARD ────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: PAPER, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Nav */}
      <div style={{ padding: "0 28px", height: 54, display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fff", borderBottom: RULE, boxShadow: shadow(4, 0.05) }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: GREEN, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Shield size={15} color="#fff" strokeWidth={2} />
          </div>
          <span style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 15, color: INK }}>TerraGuard OS</span>
        </div>
        <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
          {[{ Icon: Users, label: "Team" }, { Icon: Settings, label: "Settings" }].map(({ Icon, label }) => (
            <button key={label} style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", color: MID, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>
              <Icon size={14} strokeWidth={1.75} />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Main */}
        <div style={{ flex: 1, padding: "28px", overflowY: "auto" }}>
          {/* Stats strip */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 28 }}>
            {STATS.map(({ Icon, label, value }) => (
              <div key={label} style={{ background: CARD, borderRadius: 10, border: RULE, padding: "16px", boxShadow: shadow(3) }}>
                <Icon size={18} color={MID} strokeWidth={1.5} style={{ marginBottom: 10 }} />
                <div style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 22, color: INK }}>{value}</div>
                <div style={{ fontSize: 11, color: MID, marginTop: 3 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Header row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <div style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 18, color: INK }}>Your Properties</div>
              <div style={{ fontSize: 12, color: MID, marginTop: 2 }}>Click any property to open its design hub</div>
            </div>
            <button style={{ display: "flex", alignItems: "center", gap: 6, background: GREEN, color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>
              <Plus size={14} strokeWidth={2.5} /> New Property
            </button>
          </div>

          {/* Property grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
            {PROPERTIES.map(p => (
              <PropertyCard key={p.id} p={p} onOpen={() => { setActive(p); setView("project"); }} />
            ))}
          </div>
        </div>

        {/* Activity sidebar */}
        <div style={{ width: 248, borderLeft: RULE, background: "#fff", padding: "20px 18px", overflowY: "auto", flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: MID, letterSpacing: "0.05em", marginBottom: 16 }}>ACTIVITY</div>
          {ACTIVITY.map(({ Icon, time, text }, i) => (
            <div key={i} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: i < ACTIVITY.length - 1 ? RULE : "none" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 5 }}>
                <div style={{ width: 26, height: 26, borderRadius: 7, background: "#f0ece5", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon size={12} color={MID} strokeWidth={1.75} />
                </div>
                <span style={{ fontSize: 11, color: INK, lineHeight: 1.5, flex: 1 }}>{text}</span>
              </div>
              <div style={{ fontSize: 10, color: DIM, paddingLeft: 36 }}>{time}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
