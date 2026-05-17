import { useState } from "react";
import { useAnalyzeSite } from "@workspace/api-client-react";
import type { SiteAnalysisReport, PlantGuild, SpatialRecommendation } from "@workspace/api-client-react";

interface Props {
  propertyId: string;
  hasBrief: boolean;
  savedReport: string | null | undefined;
  savedAt: string | null | undefined;
  onReportSaved: () => void;
}

const ROLE_COLORS: Record<string, string> = {
  "Overstory Tree":       "hsl(120, 35%, 28%)",
  "Nitrogen Fixer":       "hsl(84, 45%, 25%)",
  "Dynamic Accumulator":  "hsl(160, 35%, 22%)",
  "Insectary":            "hsl(45, 45%, 25%)",
  "Ground Cover":         "hsl(103, 30%, 20%)",
  "Root Crop":            "hsl(28, 35%, 22%)",
};

const ROLE_ICONS: Record<string, string> = {
  "Overstory Tree":       "🌳",
  "Nitrogen Fixer":       "🌿",
  "Dynamic Accumulator":  "🪴",
  "Insectary":            "🌸",
  "Ground Cover":         "🍃",
  "Root Crop":            "🥕",
};

const ELEMENT_ICONS: Record<string, string> = {
  "Windbreak":      "💨",
  "Vegetable Beds": "🥬",
  "Chicken Coop":   "🐔",
  "Fencing":        "🪵",
  "Swale":          "💧",
  "Water Storage":  "🏞",
  "Orchard":        "🍎",
  "Nursery Area":   "🌱",
};

const LOADING_MESSAGES = [
  "Reading climate and soil data…",
  "Analysing sector overlaps…",
  "Selecting guild species for your hardiness zone…",
  "Generating spatial layout recommendations…",
  "Composing your permaculture report…",
];

export function AiAnalysisPanel({ propertyId, hasBrief, savedReport, savedAt, onReportSaved }: Props) {
  const [report, setReport] = useState<SiteAnalysisReport | null>(() => {
    if (savedReport) {
      try { return JSON.parse(savedReport); } catch { return null; }
    }
    return null;
  });
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const analyze = useAnalyzeSite({
    mutation: {
      onMutate: () => {
        setError(null);
        setLoadingMsgIdx(0);
        const interval = setInterval(() =>
          setLoadingMsgIdx((i) => Math.min(i + 1, LOADING_MESSAGES.length - 1)), 3500);
        return interval;
      },
      onSuccess: (data, _vars, ctx) => {
        clearInterval(ctx as ReturnType<typeof setInterval>);
        setReport(data);
        onReportSaved();
      },
      onError: (err, _vars, ctx) => {
        clearInterval(ctx as ReturnType<typeof setInterval>);
        setError((err as Error)?.message ?? "Analysis failed — please try again.");
      },
    },
  });

  const isLoading = analyze.isPending;

  function runAnalysis() {
    analyze.mutate({ propertyId });
  }

  if (!hasBrief) {
    return (
      <div className="rounded-xl p-4 text-[12px] text-center space-y-1" style={{ background: "hsl(103, 22%, 10%)", border: "1px solid hsl(103, 22%, 18%)", color: "hsl(42, 15%, 50%)" }}>
        <div className="text-2xl mb-2">🌱</div>
        <div className="font-semibold" style={{ color: "hsl(42, 28%, 75%)" }}>Complete the site survey first</div>
        <div>The AI needs climate, soil, and goal data from your survey to generate a meaningful report.</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Run button */}
      <div className="space-y-1.5">
        <button
          onClick={runAnalysis}
          disabled={isLoading}
          className="w-full py-2.5 rounded-lg text-[13px] font-semibold transition-all flex items-center justify-center gap-2"
          style={{
            background: isLoading ? "hsl(103, 25%, 13%)" : "linear-gradient(135deg, #1a4a0d, #3a8220)",
            color: isLoading ? "hsl(103, 25%, 45%)" : "#e8f5e2",
            border: `1px solid ${isLoading ? "hsl(103, 22%, 22%)" : "#4a9a28"}`,
            boxShadow: isLoading ? "none" : "0 4px 18px rgba(45,106,26,0.45)",
          }}
        >
          {isLoading ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-t-transparent rounded-full animate-spin shrink-0" style={{ borderColor: "#4a9a28" }} />
              Analysing…
            </>
          ) : (
            <>✨ {report ? "Re-run Site Analysis" : "Run Site Analysis"}</>
          )}
        </button>

        {isLoading && (
          <p className="text-center text-[10px] animate-pulse" style={{ color: "hsl(103, 30%, 45%)" }}>
            {LOADING_MESSAGES[loadingMsgIdx]}
          </p>
        )}

        {savedAt && !isLoading && (
          <p className="text-center text-[10px]" style={{ color: "hsl(42, 15%, 38%)" }}>
            Last run {new Date(savedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-lg p-3 text-[11px]" style={{ background: "hsl(0, 25%, 12%)", border: "1px solid hsl(0, 25%, 22%)", color: "#f87171" }}>
          {error}
        </div>
      )}

      {report && !isLoading && (
        <div className="space-y-5">
          {/* Plant palette */}
          <ReportSection icon="🌿" title="Guild Plant Palette">
            <div className="space-y-2">
              {report.plant_palette.map((p, i) => (
                <PlantCard key={i} plant={p} />
              ))}
            </div>
          </ReportSection>

          {/* Spatial recommendations */}
          <ReportSection icon="🗺" title="Zonal Layout Recommendations">
            <div className="space-y-2">
              {report.spatial_recommendations.map((r, i) => (
                <RecommendationCard key={i} rec={r} />
              ))}
            </div>
          </ReportSection>
        </div>
      )}
    </div>
  );
}

function ReportSection({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-base">{icon}</span>
        <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "hsl(103, 35%, 48%)" }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

function PlantCard({ plant }: { plant: PlantGuild }) {
  const bg = ROLE_COLORS[plant.role] ?? "hsl(103, 22%, 16%)";
  const icon = ROLE_ICONS[plant.role] ?? "🌱";
  return (
    <div className="rounded-xl p-3 space-y-1.5" style={{ background: "hsl(103, 22%, 10%)", border: "1px solid hsl(103, 22%, 19%)" }}>
      <div className="flex items-start gap-2">
        <span className="text-lg shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-[12px]" style={{ color: "hsl(42, 28%, 90%)" }}>{plant.commonName}</span>
            <span
              className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
              style={{ background: bg, color: "hsl(42, 28%, 88%)" }}
            >
              {plant.role}
            </span>
          </div>
          <div className="text-[10px] italic mt-0.5" style={{ color: "hsl(42, 15%, 50%)" }}>{plant.scientificName}</div>
        </div>
      </div>
      <p className="text-[11px] leading-relaxed pl-7" style={{ color: "hsl(42, 20%, 68%)" }}>{plant.rationale}</p>
    </div>
  );
}

function RecommendationCard({ rec }: { rec: SpatialRecommendation }) {
  const icon = ELEMENT_ICONS[rec.element] ?? "📍";
  return (
    <div className="rounded-xl p-3 space-y-1.5" style={{ background: "hsl(103, 22%, 10%)", border: "1px solid hsl(103, 22%, 19%)" }}>
      <div className="flex items-start gap-2">
        <span className="text-lg shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-semibold" style={{ color: "hsl(42, 28%, 90%)" }}>{rec.element}</div>
          <div className="text-[11px] mt-0.5 font-medium" style={{ color: "hsl(103, 40%, 58%)" }}>{rec.placement}</div>
        </div>
      </div>
      <p className="text-[11px] leading-relaxed pl-7" style={{ color: "hsl(42, 20%, 68%)" }}>{rec.rationale}</p>
    </div>
  );
}
