import { useState } from "react";
import { Fingerprint } from "lucide-react";
import { useLocation } from "wouter";
import {
  useGetProperty,
  useGetClientBrief,
  getGetPropertyQueryKey,
  getGetClientBriefQueryKey,
} from "@workspace/api-client-react";
import type { SiteAnalysisReport } from "@workspace/api-client-react";
import { useAppStore } from "@/store/useAppStore";
import { StepNav } from "@/components/StepNav";

export default function DossierPage() {
  const [, navigate] = useLocation();
  const { activePropertyId, role } = useAppStore();
  const [linkCopied, setLinkCopied] = useState(false);

  function handleGenerateLink() {
    if (!activePropertyId) return;
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    const url = `${window.location.origin}${base}/presentation/${activePropertyId}`;
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    });
  }

  const { data: property } = useGetProperty(activePropertyId ?? "", {
    query: { enabled: !!activePropertyId, queryKey: getGetPropertyQueryKey(activePropertyId ?? "") },
  });
  const { data: brief } = useGetClientBrief(activePropertyId ?? "", {
    query: { enabled: !!activePropertyId, queryKey: getGetClientBriefQueryKey(activePropertyId ?? "") },
  });

  const aiReport: SiteAnalysisReport | null = (() => {
    if (!brief?.aiAnalysisReport) return null;
    try { return JSON.parse(brief.aiAnalysisReport); } catch { return null; }
  })();

  const moodImages = (brief?.moodBoardImages as string[] | null | undefined) ?? [];

  const today = new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });

  function handleExport() {
    window.print();
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "hsl(103, 18%, 7%)" }}>
      {/* ── TOP BAR (hidden on print) ── */}
      <header
        className="print:hidden shrink-0 flex items-center justify-between px-5 py-3 border-b sticky top-0 z-20"
        style={{ background: "hsl(103, 22%, 9%)", borderColor: "hsl(103, 30%, 15%)" }}
      >
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/properties")}
            className="flex items-center gap-2 transition-opacity hover:opacity-70"
            style={{ color: "hsl(42, 28%, 85%)" }}
          >
            <span className="text-base">🛡</span>
            <span className="text-[13px] font-bold tracking-tight hidden sm:inline">TerraGuard</span>
          </button>
          <div className="w-px h-4 hidden sm:block" style={{ background: "hsl(103, 22%, 22%)" }} />
          <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "hsl(84, 40%, 55%)" }}>
            Export Studio
          </span>
        </div>
        <div className="flex items-center gap-2">
          <StepNav />
          {/* Generate Client Link */}
          <button
            onClick={handleGenerateLink}
            disabled={!activePropertyId}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={linkCopied
              ? { background: "rgba(16,185,129,0.15)", color: "#10b981", border: "1px solid rgba(16,185,129,0.4)" }
              : { background: "rgba(99,102,241,0.1)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.3)" }
            }
            title="Copy client presentation link to clipboard"
          >
            {linkCopied ? (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20,6 9,17 4,12"/>
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
                  <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
                </svg>
                Client Link
              </>
            )}
          </button>
          {/* Export PDF */}
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-semibold transition-all"
            style={{ background: "linear-gradient(135deg, #1a4a0d, #3a8220)", color: "#e8f5e2", border: "1px solid #4a9a28", boxShadow: "0 2px 12px rgba(45,106,26,0.4)" }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export PDF
          </button>
        </div>
      </header>

      {/* ── NO PROPERTY ── */}
      {!activePropertyId && (
        <div className="flex-1 flex items-center justify-center p-8 print:hidden">
          <div className="text-center space-y-3">
            <div className="text-4xl">📄</div>
            <h3 className="text-base font-semibold" style={{ color: "hsl(42, 28%, 82%)" }}>No property selected</h3>
            <p className="text-sm" style={{ color: "hsl(42, 15%, 50%)" }}>Complete the intake and analysis steps first.</p>
            <button onClick={() => navigate("/intake")} className="mt-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold"
              style={{ background: "hsl(84, 38%, 22%)", color: "hsl(84, 55%, 80%)", border: "1px solid hsl(84, 35%, 30%)" }}>
              ← Start at Intake
            </button>
          </div>
        </div>
      )}

      {/* ── DOCUMENT ── */}
      {activePropertyId && (
        <main className="flex-1 px-4 py-10">
          <div
            className="mx-auto max-w-3xl rounded-2xl overflow-hidden print:shadow-none print:rounded-none"
            style={{ background: "#ffffff", boxShadow: "0 8px 40px rgba(0,0,0,0.45)" }}
          >
            {/* Document header */}
            <div
              className="px-10 py-8"
              style={{ background: "linear-gradient(135deg, #0a1a0a, #12280f)", borderBottom: "3px solid #2D6A1A" }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2.5 mb-3">
                    <span className="text-2xl">🛡</span>
                    <span className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: "#4a9a28" }}>
                      TerraGuard OS
                    </span>
                  </div>
                  <h1 className="text-2xl font-bold leading-tight text-white">
                    {property?.name ?? "Property Resilience Dossier"}
                  </h1>
                  <p className="text-[12px] mt-1.5" style={{ color: "#6cc040" }}>
                    Property Resilience & Autonomy Report
                  </p>
                </div>
                <div className="text-right shrink-0 ml-4">
                  {(property?.areaHectares ?? 0) > 0 && (
                    <div className="text-xl font-bold text-white">{property?.areaHectares?.toFixed(2)} ha</div>
                  )}
                  <div className="text-[10px] mt-0.5" style={{ color: "#4a9a28" }}>Generated {today}</div>
                </div>
              </div>
            </div>

            {/* Document body */}
            <div className="px-10 py-8 space-y-8">
              {/* No brief */}
              {!brief && (
                <div className="rounded-xl p-6 text-center" style={{ background: "#fef3c7", border: "1px solid #d97706" }}>
                  <p className="text-sm font-semibold text-amber-800">Site survey not completed</p>
                  <p className="text-xs text-amber-700 mt-1">Complete the intake survey to populate this dossier.</p>
                </div>
              )}

              {brief && (
                <>
                  {/* Site Profile */}
                  <DocSection title="Site Profile">
                    <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
                      {brief.climateZone && <DocField label="Climate zone" value={brief.climateZone} />}
                      {brief.elevationM != null && <DocField label="Elevation" value={`${brief.elevationM} m ASL`} />}
                      {brief.annualRainfallMm != null && <DocField label="Annual rainfall" value={`${brief.annualRainfallMm.toLocaleString()} mm`} />}
                      {brief.annualHumidityPct != null && <DocField label="Humidity" value={`${brief.annualHumidityPct}%`} />}
                      {brief.meanAnnualTempC != null && <DocField label="Mean temp" value={`${brief.meanAnnualTempC} °C`} />}
                      {brief.summerMaxTempC != null && <DocField label="Summer max" value={`${brief.summerMaxTempC} °C`} />}
                      {brief.winterMinTempC != null && <DocField label="Winter min" value={`${brief.winterMinTempC} °C`} />}
                      {brief.frostDaysPerYear != null && <DocField label="Frost days" value={`${brief.frostDaysPerYear} days/yr`} />}
                      {brief.solarIrradianceKwhM2 != null && <DocField label="Solar irradiance" value={`${brief.solarIrradianceKwhM2.toLocaleString()} kWh/m²/yr`} />}
                      {brief.prevailingWindDir && <DocField label="Prevailing wind" value={brief.prevailingWindDir} />}
                      {brief.meanWindSpeedMs != null && <DocField label="Wind speed" value={`${brief.meanWindSpeedMs} m/s`} />}
                    </div>
                  </DocSection>

                  {/* Soil */}
                  {(brief.soilTextureClass || brief.soilPH != null || brief.soilClay != null) && (
                    <DocSection title="Soil Analysis (0–5 cm)">
                      <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
                        {brief.soilTextureClass && <DocField label="Texture class" value={brief.soilTextureClass} />}
                        {brief.soilPH != null && <DocField label="pH" value={String(brief.soilPH)} />}
                        {brief.soilClay != null && <DocField label="Clay" value={`${brief.soilClay}%`} />}
                        {brief.soilSand != null && <DocField label="Sand" value={`${brief.soilSand}%`} />}
                        {brief.soilSilt != null && <DocField label="Silt" value={`${brief.soilSilt}%`} />}
                        {brief.soilOrganicCarbonGkg != null && <DocField label="Organic carbon" value={`${brief.soilOrganicCarbonGkg} g/kg`} />}
                      </div>
                    </DocSection>
                  )}

                  {/* Design Goals */}
                  {(brief.primaryGoal || brief.maintenanceCapacity) && (
                    <DocSection title="Design Goals">
                      <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
                        {brief.primaryGoal && <DocField label="Primary goal" value={brief.primaryGoal} />}
                        {brief.maintenanceCapacity && <DocField label="Maintenance" value={brief.maintenanceCapacity} />}
                      </div>
                    </DocSection>
                  )}

                  {/* ── Mood Board & Concept Renders ── */}
                  <DocSection title="Client Mood Board">
                    {moodImages.length === 0 ? (
                      <p className="text-sm italic" style={{ color: "#9ca3af" }}>
                        No vision board photos uploaded yet. Ask the client to add inspiration photos via the Intake page.
                      </p>
                    ) : (
                      <div className="grid grid-cols-3 gap-2 mb-4">
                        {moodImages.map((src, i) => (
                          <div
                            key={i}
                            className="rounded-lg overflow-hidden"
                            style={{ aspectRatio: "4/3", background: "#f3f4f6", border: "1px solid #e5e7eb" }}
                          >
                            <img
                              src={src}
                              alt={`Mood board ${i + 1}`}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Designer-only: Generate AI Concept Renders */}
                    {role === "designer" && (
                      <div
                        className="print:hidden mt-4 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                        style={{ background: "linear-gradient(135deg, #1e1048, #2d1564)", border: "1px solid #4c1d95" }}
                      >
                        <div>
                          <p className="text-[12px] font-bold" style={{ color: "#c4b5fd" }}>AI Concept Renders</p>
                          <p className="text-[11px] mt-0.5" style={{ color: "#7c6aa6" }}>
                            Generate photorealistic concept renders from the client's mood board using Google Imagen.
                          </p>
                        </div>
                        <button
                          onClick={() => { /* placeholder — Google Imagen integration */ }}
                          className="shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl text-[12px] font-bold transition-all"
                          style={{
                            background: "linear-gradient(135deg, #4c1d95, #6d28d9)",
                            color: "#ede9fe",
                            border: "1px solid #7c3aed",
                            boxShadow: "0 4px 18px rgba(109,40,217,0.45)",
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <polygon points="13,2 3,14 12,14 11,22 21,10 12,10 13,2"/>
                          </svg>
                          Generate AI Concept Renders
                        </button>
                      </div>
                    )}
                  </DocSection>

                  {/* Pattern Strategy */}
                  {aiReport?.PatternStrategy && (
                    <DocPatternStrategy
                      pattern={aiReport.PatternStrategy as { recommendedPattern?: string; rationale?: string; application?: string }}
                    />
                  )}

                  {/* Infrastructure */}
                  {(brief.utilitiesOverheadPower || brief.utilitiesBuriedPipes || brief.utilitiesLegalEasements || brief.utilitiesActiveWell || brief.challengeSevereErosion || brief.challengeWinterFlooding || brief.challengeHighWind || brief.challengeWildlifePressure) && (
                    <DocSection title="Infrastructure & Site Constraints">
                      <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
                        {brief.utilitiesOverheadPower && <DocField label="Overhead power" value="Present" />}
                        {brief.utilitiesBuriedPipes && <DocField label="Buried pipes" value="Present" />}
                        {brief.utilitiesLegalEasements && <DocField label="Legal easements" value="Present" />}
                        {brief.utilitiesActiveWell && <DocField label="Active well" value="Present" />}
                        {brief.challengeSevereErosion && <DocField label="Severe erosion" value="Yes" />}
                        {brief.challengeWinterFlooding && <DocField label="Winter flooding" value="Yes" />}
                        {brief.challengeHighWind && <DocField label="High wind" value="Yes" />}
                        {brief.challengeWildlifePressure && <DocField label="Wildlife pressure" value="Yes" />}
                      </div>
                    </DocSection>
                  )}

                  {/* AI Report */}
                  {aiReport ? (
                    <DocSection title="AI Resilience Analysis">
                      {brief.aiAnalysisGeneratedAt && (
                        <p className="text-xs mb-4" style={{ color: "#6b7280" }}>
                          Generated {new Date(brief.aiAnalysisGeneratedAt).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}
                        </p>
                      )}
                      <div className="space-y-5">
                        {[
                          { key: "WaterStrategy",         title: "💧 Water Strategy",        accent: "#dbeafe", border: "#3b82f6" },
                          { key: "SunAndEnergy",          title: "☀️ Sun & Energy",           accent: "#fef9c3", border: "#ca8a04" },
                          { key: "LandAndBiodiversity",   title: "🌾 Land & Biodiversity",    accent: "#dcfce7", border: "#16a34a" },
                          { key: "ClimateResilience",     title: "🛡 Climate Resilience",     accent: "#e0e7ff", border: "#6366f1" },
                          { key: "InfrastructureCritique",title: "⚠️ Infrastructure Critique", accent: "#fff7ed", border: "#ea580c" },
                        ].map(({ key, title, accent, border }) => {
                          const val = (aiReport as unknown as Record<string, unknown>)[key];
                          if (val === undefined || val === null) return null;
                          return (
                            <div key={key} className="rounded-xl overflow-hidden" style={{ border: `1px solid ${border}40` }}>
                              <div className="px-4 py-2.5 text-[11px] font-bold" style={{ background: accent, borderBottom: `1px solid ${border}40`, color: "#374151" }}>
                                {title}
                              </div>
                              <div className="px-4 py-3 text-[12px] leading-relaxed" style={{ background: "#f9fafb", color: "#374151" }}>
                                {typeof val === "string" ? (
                                  <p className="whitespace-pre-wrap">{val}</p>
                                ) : Array.isArray(val) ? (
                                  <AiTableDoc rows={val} />
                                ) : (
                                  <AiObjectDoc obj={val as Record<string, unknown>} />
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </DocSection>
                  ) : (
                    <DocSection title="AI Resilience Analysis">
                      <p className="text-sm italic" style={{ color: "#9ca3af" }}>
                        No analysis run yet. Go to The War Room to generate the AI resilience report.
                      </p>
                      <button
                        onClick={() => navigate("/analysis")}
                        className="print:hidden mt-3 px-4 py-2 rounded-xl text-[12px] font-semibold"
                        style={{ background: "#1a4a0d", color: "#e8f5e2", border: "1px solid #4a9a28" }}
                      >
                        Run Analysis →
                      </button>
                    </DocSection>
                  )}
                </>
              )}

              {/* Document footer */}
              <div className="border-t pt-6 flex items-center justify-between" style={{ borderColor: "#e5e7eb" }}>
                <span className="text-[10px]" style={{ color: "#9ca3af" }}>
                  TerraGuard OS · Autonomous Property Resilience Platform
                </span>
                <span className="text-[10px]" style={{ color: "#9ca3af" }}>{today}</span>
              </div>
            </div>
          </div>

          {/* Bottom nav (hidden on print) */}
          <div className="print:hidden mt-6 mx-auto max-w-3xl flex items-center justify-between">
            <button
              onClick={() => navigate("/analysis")}
              className="text-[11px] px-3 py-1.5 rounded-lg"
              style={{ color: "hsl(42, 20%, 55%)", border: "1px solid hsl(103, 22%, 20%)", background: "transparent" }}
            >
              ← Analysis
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold"
              style={{ background: "linear-gradient(135deg, #1a4a0d, #3a8220)", color: "#e8f5e2", border: "1px solid #4a9a28" }}
            >
              Export PDF
            </button>
          </div>
        </main>
      )}
    </div>
  );
}

function DocPatternStrategy({ pattern }: { pattern: { recommendedPattern?: string; rationale?: string; application?: string } }) {
  return (
    <section>
      <h2
        className="text-[10px] font-bold uppercase tracking-[0.15em] mb-3 pb-2 flex items-center gap-2"
        style={{ color: "#4c1d95", borderBottom: "1.5px solid #ede9fe" }}
      >
        <Fingerprint size={12} strokeWidth={2} style={{ color: "#7c3aed", flexShrink: 0 }} />
        Pattern Strategy
      </h2>
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: "1px solid #ddd6fe", background: "linear-gradient(135deg, #faf5ff, #f5f3ff)" }}
      >
        {pattern.recommendedPattern && (
          <div
            className="px-5 py-3 flex items-center gap-3"
            style={{ background: "linear-gradient(135deg, #4c1d95, #6d28d9)", borderBottom: "1px solid #ddd6fe" }}
          >
            <Fingerprint size={16} strokeWidth={1.8} style={{ color: "#e9d5ff", flexShrink: 0 }} />
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "#c4b5fd" }}>
                Recommended Pattern
              </div>
              <div className="text-[15px] font-bold text-white leading-tight">
                {pattern.recommendedPattern}
              </div>
            </div>
          </div>
        )}
        <div className="px-5 py-4 space-y-4">
          {pattern.rationale && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#7c3aed" }} />
                <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "#7c3aed" }}>
                  Why Nature Uses This Form
                </span>
              </div>
              <p className="text-[12px] leading-relaxed" style={{ color: "#374151" }}>
                {pattern.rationale}
              </p>
            </div>
          )}
          {pattern.application && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#5b21b6" }} />
                <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "#5b21b6" }}>
                  Site Application
                </span>
              </div>
              <p className="text-[12px] leading-relaxed" style={{ color: "#374151" }}>
                {pattern.application}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function DocSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2
        className="text-[10px] font-bold uppercase tracking-[0.15em] mb-3 pb-2"
        style={{ color: "#2D6A1A", borderBottom: "1.5px solid #dcfce7" }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function DocField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: "#9ca3af" }}>{label}</span>
      <span className="text-[13px] font-medium" style={{ color: "#111827" }}>{value}</span>
    </div>
  );
}

function AiTableDoc({ rows }: { rows: unknown[] }) {
  if (!rows.length) return null;
  const first = rows[0];
  if (typeof first !== "object" || first === null) {
    return (
      <ul className="list-disc pl-4 space-y-1">
        {rows.map((r, i) => <li key={i}>{String(r)}</li>)}
      </ul>
    );
  }
  const keys = Object.keys(first as object);
  return (
    <table className="w-full text-[11px] border-collapse">
      <thead>
        <tr>
          {keys.map((k) => (
            <th key={k} className="text-left py-1 pr-3 font-semibold uppercase text-[9px] tracking-wider border-b" style={{ color: "#6b7280", borderColor: "#e5e7eb" }}>{k}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="border-b" style={{ borderColor: "#f3f4f6" }}>
            {keys.map((k) => (
              <td key={k} className="py-1.5 pr-3 align-top" style={{ color: "#374151" }}>
                {String((row as Record<string, unknown>)[k] ?? "")}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AiObjectDoc({ obj }: { obj: Record<string, unknown> }) {
  return (
    <div className="space-y-2">
      {Object.entries(obj).map(([key, val]) => (
        <div key={key}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: "#6b7280" }}>{key}</div>
          {Array.isArray(val) ? (
            <AiTableDoc rows={val} />
          ) : typeof val === "object" && val !== null ? (
            <AiObjectDoc obj={val as Record<string, unknown>} />
          ) : (
            <p>{String(val)}</p>
          )}
        </div>
      ))}
    </div>
  );
}
