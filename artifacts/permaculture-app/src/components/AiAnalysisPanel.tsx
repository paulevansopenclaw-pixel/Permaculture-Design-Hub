import { useState } from "react";
import { Fingerprint } from "lucide-react";
import { useAnalyzeSite } from "@workspace/api-client-react";
import type { SiteAnalysisReport } from "@workspace/api-client-react";

interface Props {
  propertyId: string;
  hasBrief: boolean;
  savedReport: string | null | undefined;
  savedAt: string | null | undefined;
  onReportSaved: () => void;
}

const LOADING_MESSAGES = [
  "Assessing rainfall catchment capacity…",
  "Mapping solar and wind energy vectors…",
  "Evaluating soil protection and erosion risk…",
  "Modelling caloric planting strategy…",
  "Stress-testing grid-collapse resilience…",
  "Finalising resilience report…",
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

  if (!hasBrief) {
    return (
      <div className="rounded-xl p-4 text-[12px] text-center space-y-1" style={{ background: "hsl(103, 22%, 10%)", border: "1px solid hsl(103, 22%, 18%)", color: "hsl(42, 15%, 50%)" }}>
        <div className="text-2xl mb-2">🛡</div>
        <div className="font-semibold" style={{ color: "hsl(42, 28%, 75%)" }}>Site survey required</div>
        <div>The AI needs climate, soil, and infrastructure data from your survey before it can generate an autonomy report.</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Run button */}
      <div className="space-y-1.5">
        <button
          onClick={() => analyze.mutate({ propertyId })}
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
            <>{report ? "⚡ Re-run Resilience Analysis" : "⚡ Run Resilience Analysis"}</>
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
        <div className="space-y-3">
          <ReportCard
            icon="💧"
            accent="hsl(200, 50%, 22%)"
            accentBorder="hsl(200, 50%, 18%)"
            title="Water Strategy"
            value={report.WaterStrategy}
          />
          <ReportCard
            icon="☀️"
            accent="hsl(45, 55%, 22%)"
            accentBorder="hsl(45, 55%, 18%)"
            title="Sun & Energy"
            value={report.SunAndEnergy}
          />
          <ReportCard
            icon="🌾"
            accent="hsl(103, 35%, 20%)"
            accentBorder="hsl(103, 35%, 16%)"
            title="Land & Biodiversity"
            value={report.LandAndBiodiversity}
            matrix
          />
          <ReportCard
            icon="🛡"
            accent="hsl(210, 40%, 25%)"
            accentBorder="hsl(210, 40%, 18%)"
            title="Climate Resilience"
            value={report.ClimateResilience}
          />
          {report.InfrastructureCritique !== undefined && report.InfrastructureCritique !== null && (
            <ReportCard
              icon="⚠️"
              accent="hsl(22, 55%, 22%)"
              accentBorder="hsl(22, 55%, 16%)"
              title="Infrastructure Critique"
              value={report.InfrastructureCritique}
            />
          )}
          {report.PatternStrategy && (
            <PatternStrategyCard pattern={report.PatternStrategy as { recommendedPattern?: string; rationale?: string; application?: string }} />
          )}
          {report.climateSource && (
            <p className="text-[9px] text-center" style={{ color: "hsl(42, 15%, 35%)" }}>
              Climate data: {report.climateSource}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ReportCard({
  icon,
  accent,
  accentBorder,
  title,
  value,
  matrix = false,
}: {
  icon: string;
  accent: string;
  accentBorder: string;
  title: string;
  value: unknown;
  matrix?: boolean;
}) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid hsl(103, 22%, 19%)" }}>
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{ background: accent, borderBottom: `1px solid ${accentBorder}` }}
      >
        <span className="text-[15px]">{icon}</span>
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "hsl(42, 28%, 88%)" }}>
          {title}
        </span>
      </div>
      {/* Body */}
      <div className="px-3 py-2.5" style={{ background: "hsl(103, 18%, 9%)" }}>
        {matrix && Array.isArray(value) ? (
          <MatrixTable rows={value} />
        ) : typeof value === "object" && value !== null ? (
          <ObjectDisplay obj={value as Record<string, unknown>} />
        ) : (
          <p className="text-[11px] leading-relaxed whitespace-pre-wrap" style={{ color: "hsl(42, 20%, 72%)" }}>
            {String(value ?? "")}
          </p>
        )}
      </div>
    </div>
  );
}

function MatrixTable({ rows }: { rows: unknown[] }) {
  if (!rows.length) return null;

  // Try to detect if rows are objects with consistent keys
  const first = rows[0];
  if (typeof first !== "object" || first === null) {
    return (
      <div className="space-y-1.5">
        {rows.map((r, i) => (
          <p key={i} className="text-[11px] leading-relaxed" style={{ color: "hsl(42, 20%, 72%)" }}>
            {String(r)}
          </p>
        ))}
      </div>
    );
  }

  const keys = Object.keys(first as object);

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-[10px]" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {keys.map((k) => (
              <th
                key={k}
                className="px-2 py-1 text-left font-bold uppercase tracking-wide"
                style={{ color: "hsl(103, 40%, 55%)", borderBottom: "1px solid hsl(103, 22%, 20%)" }}
              >
                {k}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: "1px solid hsl(103, 18%, 14%)" }}>
              {keys.map((k) => (
                <td
                  key={k}
                  className="px-2 py-1.5 align-top"
                  style={{ color: "hsl(42, 20%, 68%)" }}
                >
                  {String((row as Record<string, unknown>)[k] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PatternStrategyCard({ pattern }: { pattern: { recommendedPattern?: string; rationale?: string; application?: string } }) {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: "1px solid hsl(270, 35%, 28%)", boxShadow: "0 4px 24px rgba(109,40,217,0.18)" }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2.5 px-3 py-2.5"
        style={{
          background: "linear-gradient(135deg, hsl(270, 50%, 14%), hsl(270, 45%, 18%))",
          borderBottom: "1px solid hsl(270, 40%, 22%)",
        }}
      >
        <Fingerprint size={15} style={{ color: "#c4b5fd", flexShrink: 0 }} strokeWidth={1.8} />
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#c4b5fd" }}>
          Pattern Strategy
        </span>
        {pattern.recommendedPattern && (
          <span
            className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: "hsl(270, 40%, 22%)", color: "#e9d5ff" }}
          >
            {pattern.recommendedPattern}
          </span>
        )}
      </div>

      {/* Body */}
      <div
        className="px-3 py-3 space-y-3"
        style={{ background: "linear-gradient(180deg, hsl(270, 30%, 10%), hsl(103, 18%, 9%))" }}
      >
        {pattern.rationale && (
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#a78bfa" }} />
              <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "hsl(270, 40%, 55%)" }}>
                Why Nature Uses This Form
              </span>
            </div>
            <p className="text-[11px] leading-relaxed" style={{ color: "hsl(42, 20%, 72%)" }}>
              {pattern.rationale}
            </p>
          </div>
        )}
        {pattern.application && (
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#6d28d9" }} />
              <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "hsl(270, 40%, 55%)" }}>
                Site Application
              </span>
            </div>
            <p className="text-[11px] leading-relaxed" style={{ color: "hsl(42, 20%, 72%)" }}>
              {pattern.application}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ObjectDisplay({ obj }: { obj: Record<string, unknown> }) {
  return (
    <div className="space-y-2">
      {Object.entries(obj).map(([key, val]) => (
        <div key={key}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: "hsl(103, 40%, 50%)" }}>
            {key}
          </div>
          {Array.isArray(val) ? (
            <MatrixTable rows={val} />
          ) : typeof val === "object" && val !== null ? (
            <ObjectDisplay obj={val as Record<string, unknown>} />
          ) : (
            <p className="text-[11px] leading-relaxed" style={{ color: "hsl(42, 20%, 72%)" }}>
              {String(val)}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
