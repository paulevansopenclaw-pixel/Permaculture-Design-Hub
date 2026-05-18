import { useLocation } from "wouter";
import { useAppStore } from "@/store/useAppStore";

const STEPS = [
  { path: "/intake",    short: "Intake",   label: "Mission Control", num: "01" },
  { path: "/workspace", short: "Sandbox",  label: "The Sandbox",     num: "02" },
  { path: "/analysis",  short: "Analysis", label: "The War Room",    num: "03" },
  { path: "/dossier",   short: "Dossier",  label: "Export Studio",   num: "04" },
];

export function StepNav({ className = "" }: { className?: string }) {
  const [location, navigate] = useLocation();
  const { activePropertyId } = useAppStore();
  const activeIdx = STEPS.findIndex((s) => s.path === location);

  return (
    <nav className={`flex items-center ${className}`}>
      {STEPS.map((step, i) => {
        const isActive = i === activeIdx;
        const isPast = i < activeIdx;
        const canNav = !!activePropertyId || step.path === "/intake";
        return (
          <div key={step.path} className="flex items-center">
            {i > 0 && (
              <div
                className="w-5 h-px shrink-0"
                style={{ background: isPast ? "hsl(84, 35%, 28%)" : "hsl(103, 20%, 20%)" }}
              />
            )}
            <button
              onClick={() => canNav && navigate(step.path)}
              disabled={!canNav}
              title={step.label}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all"
              style={{
                background: isActive ? "hsl(84, 38%, 16%)" : "transparent",
                color: isActive ? "hsl(84, 55%, 75%)" : isPast ? "hsl(42, 20%, 60%)" : "hsl(42, 15%, 38%)",
                border: isActive ? "1px solid hsl(84, 35%, 28%)" : "1px solid transparent",
                cursor: canNav ? "pointer" : "default",
                opacity: canNav ? 1 : 0.4,
              }}
            >
              <span
                className="font-mono font-bold text-[9px]"
                style={{
                  color: isActive ? "hsl(84, 55%, 52%)" : isPast ? "hsl(84, 35%, 42%)" : "hsl(42, 15%, 28%)",
                }}
              >
                {step.num}
              </span>
              <span className="hidden md:inline">{step.short}</span>
            </button>
          </div>
        );
      })}
    </nav>
  );
}
