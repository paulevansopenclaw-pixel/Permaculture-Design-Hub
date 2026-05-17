import { useState } from "react";
import { useAnalyzeSite } from "@workspace/api-client-react";
import type { SiteAnalysisReport, PlantGuild, ComprehensivePlant, SpatialRecommendation } from "@workspace/api-client-react";

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
  "Fruit Tree":           "hsl(30, 50%, 24%)",
  "Windbreak":            "hsl(200, 35%, 22%)",
  "Coppice":              "hsl(140, 35%, 20%)",
  "Medicinal":            "hsl(270, 30%, 25%)",
  "Edible Foliage":       "hsl(80, 40%, 22%)",
};

const ROLE_ICONS: Record<string, string> = {
  "Overstory Tree":       "🌳",
  "Nitrogen Fixer":       "🌿",
  "Dynamic Accumulator":  "🪴",
  "Insectary":            "🌸",
  "Ground Cover":         "🍃",
  "Root Crop":            "🥕",
  "Fruit Tree":           "🍎",
  "Windbreak":            "💨",
  "Coppice":              "🪵",
  "Medicinal":            "🌿",
  "Edible Foliage":       "🥬",
};

const LAYER_ORDER = ["Canopy", "Sub-Canopy", "Shrub", "Herbaceous", "Ground Cover", "Climber", "Root Zone"];

const LAYER_ICONS: Record<string, string> = {
  "Canopy":       "🌳",
  "Sub-Canopy":   "🌲",
  "Shrub":        "🫐",
  "Herbaceous":   "🌿",
  "Ground Cover": "🍃",
  "Climber":      "🌱",
  "Root Zone":    "🥕",
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
  "Selecting guild species for your climate zone…",
  "Building comprehensive regional plant list…",
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
  const [plantView, setPlantView] = useState<"guild" | "all">("guild");

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
          {/* Plant section with toggle */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <span className="text-base">🌿</span>
                <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "hsl(103, 35%, 48%)" }}>
                  {plantView === "guild" ? "Guild Plant Palette" : "Full Plant List"}
                </span>
              </div>
              {/* Toggle */}
              <div className="flex rounded-md overflow-hidden" style={{ border: "1px solid hsl(103, 22%, 22%)" }}>
                <button
                  onClick={() => setPlantView("guild")}
                  className="px-2 py-0.5 text-[9px] font-semibold transition-colors"
                  style={{
                    background: plantView === "guild" ? "hsl(103, 35%, 22%)" : "transparent",
                    color: plantView === "guild" ? "hsl(42, 28%, 88%)" : "hsl(42, 15%, 45%)",
                  }}
                >
                  Curated
                </button>
                <button
                  onClick={() => setPlantView("all")}
                  className="px-2 py-0.5 text-[9px] font-semibold transition-colors"
                  style={{
                    background: plantView === "all" ? "hsl(103, 35%, 22%)" : "transparent",
                    color: plantView === "all" ? "hsl(42, 28%, 88%)" : "hsl(42, 15%, 45%)",
                    borderLeft: "1px solid hsl(103, 22%, 22%)",
                  }}
                >
                  All Plants {report.comprehensive_plant_list?.length ? `(${report.comprehensive_plant_list.length})` : ""}
                </button>
              </div>
            </div>

            {plantView === "guild" ? (
              <div className="space-y-2">
                {report.plant_palette.map((p, i) => (
                  <PlantCard key={i} plant={p} />
                ))}
              </div>
            ) : (
              <ComprehensiveList plants={report.comprehensive_plant_list ?? []} />
            )}
          </div>

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
  const hasSize = plant.heightM != null || plant.spreadM != null || plant.yearsToMaturity != null;
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
      {hasSize && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 pl-7">
          {plant.heightM != null && (
            <span className="text-[10px]" style={{ color: "hsl(103, 35%, 52%)" }}>↕ {plant.heightM} m tall</span>
          )}
          {plant.spreadM != null && (
            <span className="text-[10px]" style={{ color: "hsl(103, 35%, 52%)" }}>↔ {plant.spreadM} m wide</span>
          )}
          {plant.yearsToMaturity != null && (
            <span className="text-[10px]" style={{ color: "hsl(42, 20%, 45%)" }}>⏱ {plant.yearsToMaturity} yr{plant.yearsToMaturity !== 1 ? "s" : ""} to maturity</span>
          )}
        </div>
      )}
      <p className="text-[11px] leading-relaxed pl-7" style={{ color: "hsl(42, 20%, 68%)" }}>{plant.rationale}</p>
    </div>
  );
}

function ComprehensiveList({ plants }: { plants: ComprehensivePlant[] }) {
  if (!plants.length) {
    return (
      <div className="text-[11px] text-center py-4" style={{ color: "hsl(42, 15%, 40%)" }}>
        No comprehensive list — re-run the analysis to generate one.
      </div>
    );
  }

  const byLayer = LAYER_ORDER.reduce<Record<string, ComprehensivePlant[]>>((acc, layer) => {
    const group = plants.filter((p) => p.layer === layer);
    if (group.length) acc[layer] = group;
    return acc;
  }, {});

  // Any plants with an unrecognised layer go to the end
  const otherPlants = plants.filter((p) => !LAYER_ORDER.includes(p.layer));
  if (otherPlants.length) byLayer["Other"] = otherPlants;

  return (
    <div className="space-y-3">
      {Object.entries(byLayer).map(([layer, group]) => (
        <LayerGroup key={layer} layer={layer} plants={group} />
      ))}
    </div>
  );
}

function LayerGroup({ layer, plants }: { layer: string; plants: ComprehensivePlant[] }) {
  const icon = LAYER_ICONS[layer] ?? "🌱";
  return (
    <div>
      {/* Layer header */}
      <div
        className="flex items-center gap-1.5 px-2 py-1 rounded-md mb-1.5"
        style={{ background: "hsl(103, 22%, 13%)", border: "1px solid hsl(103, 22%, 20%)" }}
      >
        <span className="text-[13px]">{icon}</span>
        <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "hsl(103, 40%, 55%)" }}>{layer}</span>
        <span className="text-[9px] ml-auto" style={{ color: "hsl(42, 15%, 38%)" }}>{plants.length} species</span>
      </div>
      {/* Compact plant rows */}
      <div className="space-y-1">
        {plants.map((p, i) => (
          <ComprehensivePlantRow key={i} plant={p} />
        ))}
      </div>
    </div>
  );
}

function ComprehensivePlantRow({ plant }: { plant: ComprehensivePlant }) {
  const [expanded, setExpanded] = useState(false);
  const roleBg = ROLE_COLORS[plant.role] ?? "hsl(103, 22%, 16%)";

  return (
    <button
      onClick={() => setExpanded((v) => !v)}
      className="w-full text-left rounded-lg px-2.5 py-2 transition-colors"
      style={{
        background: expanded ? "hsl(103, 22%, 13%)" : "hsl(103, 18%, 9%)",
        border: `1px solid ${expanded ? "hsl(103, 25%, 22%)" : "hsl(103, 18%, 16%)"}`,
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span
          className="text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full shrink-0"
          style={{ background: roleBg, color: "hsl(42, 28%, 88%)" }}
        >
          {plant.role}
        </span>
        <span className="font-semibold text-[11px] truncate" style={{ color: "hsl(42, 28%, 88%)" }}>{plant.commonName}</span>
        <span className="text-[9px] italic shrink-0 ml-auto" style={{ color: "hsl(42, 15%, 42%)" }}>
          {plant.heightM}m · {plant.spreadM}m wide
        </span>
        <span className="text-[9px] shrink-0" style={{ color: "hsl(42, 15%, 35%)" }}>{expanded ? "▲" : "▼"}</span>
      </div>
      {expanded && (
        <div className="mt-1.5 space-y-0.5">
          <div className="text-[9px] italic" style={{ color: "hsl(42, 15%, 45%)" }}>{plant.scientificName}</div>
          <div className="flex gap-3 flex-wrap">
            <span className="text-[9px]" style={{ color: "hsl(103, 35%, 48%)" }}>↕ {plant.heightM} m</span>
            <span className="text-[9px]" style={{ color: "hsl(103, 35%, 48%)" }}>↔ {plant.spreadM} m</span>
            <span className="text-[9px]" style={{ color: "hsl(42, 20%, 40%)" }}>⏱ {plant.yearsToMaturity} yrs</span>
          </div>
          <p className="text-[10px] leading-relaxed pt-0.5" style={{ color: "hsl(42, 20%, 62%)" }}>{plant.notes}</p>
        </div>
      )}
    </button>
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
