import { useLocation } from "wouter";
import { useAppStore } from "@/store/useAppStore";
import { ClipboardList, Map, BarChart3, Layers, FolderOpen } from "lucide-react";

const GREEN = "#2d6a4f";
const MID   = "#6b5f4e";
const DIM   = "#a89880";

const LAYERS = [
  { path: "/intake",    label: "Intake",   Icon: ClipboardList },
  { path: "/workspace", label: "Map",      Icon: Map           },
  { path: "/analysis",  label: "Analysis", Icon: BarChart3     },
  { path: "/plans",     label: "Plans",    Icon: Layers        },
  { path: "/dossier",   label: "Dossier",  Icon: FolderOpen    },
];

export function StepNav({ className = "" }: { className?: string }) {
  const [location, navigate] = useLocation();
  const { activePropertyId, role } = useAppStore();
  if (role === "client") return null;

  return (
    <nav className={`flex items-stretch ${className}`}>
      {LAYERS.map(({ path, label, Icon }) => {
        const isActive = location === path;
        const canNav   = !!activePropertyId || path === "/intake";
        return (
          <button
            key={path}
            onClick={() => canNav && navigate(path)}
            disabled={!canNav}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "0 14px", height: "100%",
              background: "transparent",
              color: isActive ? GREEN : canNav ? MID : DIM,
              border: "none",
              borderBottom: `2px solid ${isActive ? GREEN : "transparent"}`,
              cursor: canNav ? "pointer" : "default",
              opacity: canNav ? 1 : 0.38,
              fontFamily: "inherit",
              fontSize: 12, fontWeight: isActive ? 600 : 400,
              transition: "all 0.15s",
              whiteSpace: "nowrap",
            }}
          >
            <Icon size={14} strokeWidth={isActive ? 2 : 1.5} />
            <span className="hidden sm:inline">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
