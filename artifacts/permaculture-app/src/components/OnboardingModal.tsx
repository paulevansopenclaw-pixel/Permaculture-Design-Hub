import { useState, useEffect } from "react";
import * as turf from "@turf/turf";
import { useUpsertClientBrief } from "@workspace/api-client-react";
import { fetchClimateBaseline, type ClimateBaseline } from "@/lib/fetchClimateBaseline";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  propertyId: string;
  propertyName: string;
  boundaryGeojson: GeoJSON.Polygon;
  onClose: () => void;
}

const PRIMARY_GOALS = [
  "Homesteading",
  "Commercial Market Garden",
  "Food Forest / Orchard",
  "Livestock / Regenerative Grazing",
  "Conservation",
];

const MAINTENANCE_OPTS = [
  "< 5 hours / week",
  "5 – 20 hours / week",
  "Full-time management",
];

const TOTAL_STEPS = 4;

// ─── Sub-components ───────────────────────────────────────────────────────────

function ProgressBar({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-1.5 mb-6">
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <div key={i} className="flex items-center gap-1.5 flex-1">
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 transition-all duration-300"
            style={{
              background: i < step ? "#2D6A1A" : i === step ? "#4a9a28" : "hsl(103, 20%, 16%)",
              border: i === step ? "2px solid #6cc040" : "2px solid transparent",
              color: i <= step ? "#fff" : "hsl(42, 15%, 45%)",
            }}
          >
            {i < step ? "✓" : i + 1}
          </div>
          {i < TOTAL_STEPS - 1 && (
            <div
              className="flex-1 h-0.5 rounded transition-all duration-500"
              style={{ background: i < step ? "#2D6A1A" : "hsl(103, 20%, 20%)" }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

const STEP_LABELS = [
  "Baseline Data",
  "Infrastructure",
  "Site Challenges",
  "Vision & Goals",
];

function StepLabel({ step }: { step: number }) {
  return (
    <div className="text-center mb-5">
      <div className="text-[10px] uppercase tracking-widest mb-0.5" style={{ color: "hsl(103, 30%, 50%)" }}>
        Step {step + 1} of {TOTAL_STEPS}
      </div>
      <div className="text-base font-semibold" style={{ color: "hsl(42, 28%, 88%)" }}>
        {STEP_LABELS[step]}
      </div>
    </div>
  );
}

function CheckboxField({
  label, checked, onChange,
}: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label
      className="flex items-center gap-2.5 py-2 px-3 rounded cursor-pointer transition-colors"
      style={{
        background: checked ? "hsl(103, 30%, 14%)" : "hsl(103, 20%, 10%)",
        border: `1px solid ${checked ? "#4a9a28" : "hsl(103, 20%, 18%)"}`,
      }}
    >
      <div
        className="w-4 h-4 rounded flex items-center justify-center shrink-0 transition-all"
        style={{ background: checked ? "#4a9a28" : "hsl(103, 20%, 16%)", border: checked ? "none" : "1px solid hsl(103, 20%, 30%)" }}
      >
        {checked && <span className="text-white text-[10px] font-bold">✓</span>}
      </div>
      <span className="text-[12px]" style={{ color: "hsl(42, 20%, 80%)" }}>{label}</span>
    </label>
  );
}

function SelectField({
  label, value, options, onChange,
}: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-[11px] block mb-1.5 font-medium" style={{ color: "hsl(42, 20%, 65%)" }}>{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded px-3 py-2.5 text-[13px] appearance-none"
        style={{
          background: "hsl(103, 20%, 12%)",
          border: "1px solid hsl(103, 20%, 22%)",
          color: "hsl(42, 28%, 88%)",
          outline: "none",
        }}
      >
        <option value="">— Select an option —</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function OnboardingModal({ propertyId, propertyName, boundaryGeojson, onClose }: Props) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Step 1 — baseline (auto-populated)
  const [baseline, setBaseline] = useState<ClimateBaseline | null>(null);
  const [baselineLoading, setBaselineLoading] = useState(true);
  const [baselineError, setBaselineError] = useState<string | null>(null);

  // Step 2 — Machinery & Infrastructure
  const [machineryWidthM, setMachineryWidthM] = useState(2.0);
  const [utilities, setUtilities] = useState({
    overheadPower: false,
    buriedPipes: false,
    legalEasements: false,
    activeWell: false,
  });

  // Step 3 — Site Challenges
  const [challenges, setChallenges] = useState({
    severeErosion: false,
    winterFlooding: false,
    highWind: false,
    wildlifePressure: false,
  });

  // Step 4 — Vision & Goals
  const [primaryGoal, setPrimaryGoal] = useState("");
  const [maintenanceCapacity, setMaintenanceCapacity] = useState("");

  const upsert = useUpsertClientBrief();

  // Fetch climate baseline on mount
  useEffect(() => {
    const boundary: GeoJSON.Feature<GeoJSON.Polygon> = {
      type: "Feature",
      geometry: boundaryGeojson,
      properties: {},
    };
    const centroid = turf.centroid(boundary);
    const [lng, lat] = centroid.geometry.coordinates;
    setBaselineLoading(true);
    setBaselineError(null);
    fetchClimateBaseline(lat, lng)
      .then(setBaseline)
      .catch((e) => setBaselineError(String(e)))
      .finally(() => setBaselineLoading(false));
  }, [boundaryGeojson]);

  function handleNext() {
    if (step < TOTAL_STEPS - 1) setStep((s) => s + 1);
  }

  function handleBack() {
    if (step > 0) setStep((s) => s - 1);
  }

  async function handleSubmit() {
    setSaving(true);
    try {
      await upsert.mutateAsync({
        propertyId,
        data: {
          annualRainfallMm: baseline?.annualRainfallMm ?? null,
          estimatedSoilType: baseline?.estimatedSoilType ?? null,
          climateZone: baseline?.climateZone ?? null,
          machineryWidthM,
          utilitiesOverheadPower: utilities.overheadPower,
          utilitiesBuriedPipes: utilities.buriedPipes,
          utilitiesLegalEasements: utilities.legalEasements,
          utilitiesActiveWell: utilities.activeWell,
          challengeSevereErosion: challenges.severeErosion,
          challengeWinterFlooding: challenges.winterFlooding,
          challengeHighWind: challenges.highWind,
          challengeWildlifePressure: challenges.wildlifePressure,
          primaryGoal: primaryGoal || null,
          maintenanceCapacity: maintenanceCapacity || null,
        },
      });
      onClose();
    } catch (e) {
      console.error("Failed to save client brief:", e);
    } finally {
      setSaving(false);
    }
  }

  // ─── Steps ────────────────────────────────────────────────────────────────

  function renderStep() {
    switch (step) {
      case 0:
        return (
          <div className="space-y-3">
            <p className="text-[12px] leading-relaxed" style={{ color: "hsl(42, 15%, 55%)" }}>
              These values are automatically derived from your property's location using 3-year climate normals. They will inform your design recommendations.
            </p>

            {baselineLoading && (
              <div className="flex items-center gap-2.5 py-6 justify-center">
                <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#4a9a28" }} />
                <span className="text-[12px]" style={{ color: "hsl(42, 15%, 55%)" }}>Fetching climate data for this location…</span>
              </div>
            )}

            {baselineError && (
              <div className="rounded p-3 text-[12px]" style={{ background: "hsl(0, 30%, 12%)", border: "1px solid hsl(0, 30%, 22%)", color: "#f87171" }}>
                <div className="font-semibold mb-1">Could not fetch climate data</div>
                <div style={{ color: "hsl(42, 15%, 55%)" }}>
                  This may be due to a network issue. You can proceed — baseline data will be marked as unavailable.
                </div>
              </div>
            )}

            {baseline && (
              <div className="space-y-2.5">
                <BaselineCard
                  icon="🌧"
                  label="Annual Rainfall"
                  value={`${baseline.annualRainfallMm.toLocaleString()} mm / year`}
                  sublabel="3-year average via Open-Meteo"
                />
                <BaselineCard
                  icon="🌍"
                  label="Estimated Climate Zone"
                  value={baseline.climateZone}
                  sublabel="Köppen–Geiger classification"
                />
                <BaselineCard
                  icon="🪱"
                  label="Estimated Soil Type"
                  value={baseline.estimatedSoilType}
                  sublabel="Inferred from climate and rainfall patterns"
                />
              </div>
            )}
          </div>
        );

      case 1:
        return (
          <div className="space-y-4">
            <div>
              <label className="text-[11px] block mb-1.5 font-medium" style={{ color: "hsl(42, 20%, 65%)" }}>
                Width of largest access machinery / tractor (meters)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={0.5}
                  max={12}
                  step={0.1}
                  value={machineryWidthM}
                  onChange={(e) => setMachineryWidthM(parseFloat(e.target.value))}
                  className="flex-1 rounded px-3 py-2.5 text-[13px]"
                  style={{
                    background: "hsl(103, 20%, 12%)",
                    border: "1px solid hsl(103, 20%, 22%)",
                    color: "hsl(42, 28%, 88%)",
                    outline: "none",
                  }}
                />
                <span className="text-[12px] shrink-0" style={{ color: "hsl(42, 15%, 55%)" }}>m</span>
              </div>
              <p className="text-[10px] mt-1" style={{ color: "hsl(42, 15%, 45%)" }}>
                Used to calculate minimum swale and keyline track widths.
              </p>
            </div>

            <div>
              <div className="text-[11px] font-medium mb-2" style={{ color: "hsl(42, 20%, 65%)" }}>
                Existing on-site utilities
              </div>
              <div className="space-y-1.5">
                <CheckboxField label="Overhead Power Lines" checked={utilities.overheadPower} onChange={(v) => setUtilities((u) => ({ ...u, overheadPower: v }))} />
                <CheckboxField label="Buried Pipes" checked={utilities.buriedPipes} onChange={(v) => setUtilities((u) => ({ ...u, buriedPipes: v }))} />
                <CheckboxField label="Legal Easements" checked={utilities.legalEasements} onChange={(v) => setUtilities((u) => ({ ...u, legalEasements: v }))} />
                <CheckboxField label="Active Water Well" checked={utilities.activeWell} onChange={(v) => setUtilities((u) => ({ ...u, activeWell: v }))} />
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-3">
            <p className="text-[12px] leading-relaxed" style={{ color: "hsl(42, 15%, 55%)" }}>
              Select all known challenges on this land. These will be flagged in the design workspace.
            </p>
            <div className="space-y-1.5">
              <CheckboxField label="Severe Erosion" checked={challenges.severeErosion} onChange={(v) => setChallenges((c) => ({ ...c, severeErosion: v }))} />
              <CheckboxField label="Winter Flooding / Boggy Soil" checked={challenges.winterFlooding} onChange={(v) => setChallenges((c) => ({ ...c, winterFlooding: v }))} />
              <CheckboxField label="High Wind Exposure" checked={challenges.highWind} onChange={(v) => setChallenges((c) => ({ ...c, highWind: v }))} />
              <CheckboxField label="Heavy Deer / Wildlife Pressure" checked={challenges.wildlifePressure} onChange={(v) => setChallenges((c) => ({ ...c, wildlifePressure: v }))} />
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-5">
            <SelectField
              label="Primary Site Goal"
              value={primaryGoal}
              options={PRIMARY_GOALS}
              onChange={setPrimaryGoal}
            />
            <SelectField
              label="Maintenance Capacity"
              value={maintenanceCapacity}
              options={MAINTENANCE_OPTS}
              onChange={setMaintenanceCapacity}
            />
            <div className="rounded p-3 text-[11px]" style={{ background: "hsl(103, 20%, 10%)", border: "1px solid hsl(103, 20%, 18%)", color: "hsl(42, 15%, 55%)" }}>
              After submitting, your design workspace will open with terrain contours, sector analysis tools, and the keyline water automation layer — all pre-configured for this property.
            </div>
          </div>
        );

      default:
        return null;
    }
  }

  const isLastStep = step === TOTAL_STEPS - 1;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: "rgba(5, 18, 5, 0.82)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative w-full max-w-md mx-4 rounded-2xl shadow-2xl flex flex-col"
        style={{
          background: "hsl(103, 25%, 8%)",
          border: "1px solid hsl(103, 25%, 16%)",
          boxShadow: "0 25px 80px rgba(0,0,0,0.7), 0 0 0 1px hsl(103, 30%, 12%)",
          maxHeight: "90vh",
        }}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-0">
          <div className="flex items-start justify-between mb-1">
            <div>
              <div className="text-[10px] uppercase tracking-widest mb-0.5" style={{ color: "hsl(103, 40%, 45%)" }}>
                Site Survey — {propertyName}
              </div>
              <div className="text-lg font-bold" style={{ color: "hsl(42, 28%, 90%)" }}>
                Design Workspace Setup
              </div>
            </div>
            <button
              onClick={onClose}
              className="mt-0.5 w-7 h-7 rounded-full flex items-center justify-center transition-colors"
              style={{ color: "hsl(42, 15%, 45%)", background: "hsl(103, 20%, 13%)" }}
            >
              ✕
            </button>
          </div>

          <div className="mt-5">
            <ProgressBar step={step} />
          </div>

          <StepLabel step={step} />
        </div>

        {/* Body */}
        <div className="px-6 pb-2 overflow-y-auto flex-1">
          {renderStep()}
        </div>

        {/* Footer */}
        <div className="px-6 py-5 flex items-center justify-between gap-3" style={{ borderTop: "1px solid hsl(103, 20%, 14%)" }}>
          <button
            onClick={handleBack}
            disabled={step === 0}
            className="px-5 py-2.5 rounded-lg text-[13px] font-medium transition-all"
            style={{
              background: step === 0 ? "transparent" : "hsl(103, 20%, 14%)",
              border: `1px solid ${step === 0 ? "transparent" : "hsl(103, 20%, 22%)"}`,
              color: step === 0 ? "hsl(42, 15%, 35%)" : "hsl(42, 20%, 70%)",
              cursor: step === 0 ? "default" : "pointer",
            }}
          >
            ← Back
          </button>

          <div className="flex items-center gap-1.5">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <div
                key={i}
                className="rounded-full transition-all"
                style={{
                  width: i === step ? 16 : 5,
                  height: 5,
                  background: i === step ? "#4a9a28" : i < step ? "#2D6A1A" : "hsl(103, 20%, 22%)",
                }}
              />
            ))}
          </div>

          {isLastStep ? (
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="px-5 py-2.5 rounded-lg text-[13px] font-semibold transition-all flex items-center gap-2"
              style={{
                background: saving ? "hsl(103, 30%, 15%)" : "linear-gradient(135deg, #2D6A1A, #4a9a28)",
                color: saving ? "hsl(42, 15%, 50%)" : "#fff",
                border: "1px solid #4a9a28",
                boxShadow: saving ? "none" : "0 4px 15px rgba(45, 106, 26, 0.4)",
              }}
            >
              {saving ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#4a9a28" }} />
                  Saving…
                </>
              ) : (
                "Generate Design Workspace →"
              )}
            </button>
          ) : (
            <button
              onClick={handleNext}
              disabled={step === 0 && baselineLoading}
              className="px-5 py-2.5 rounded-lg text-[13px] font-semibold transition-all"
              style={{
                background: step === 0 && baselineLoading
                  ? "hsl(103, 20%, 14%)"
                  : "linear-gradient(135deg, #2D6A1A, #4a9a28)",
                color: step === 0 && baselineLoading ? "hsl(42, 15%, 45%)" : "#fff",
                border: "1px solid hsl(103, 30%, 25%)",
                boxShadow: step === 0 && baselineLoading ? "none" : "0 4px 15px rgba(45, 106, 26, 0.3)",
              }}
            >
              Next →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Baseline card ────────────────────────────────────────────────────────────

function BaselineCard({ icon, label, value, sublabel }: { icon: string; label: string; value: string; sublabel: string }) {
  return (
    <div
      className="rounded-xl p-3.5 flex items-start gap-3"
      style={{ background: "hsl(103, 22%, 11%)", border: "1px solid hsl(103, 22%, 18%)" }}
    >
      <div className="text-2xl leading-none mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "hsl(103, 30%, 45%)" }}>{label}</div>
        <div className="text-[13px] font-semibold truncate" style={{ color: "hsl(42, 28%, 88%)" }}>{value}</div>
        <div className="text-[10px] mt-0.5" style={{ color: "hsl(42, 15%, 45%)" }}>{sublabel}</div>
      </div>
      <div className="shrink-0 mt-1">
        <div className="w-2 h-2 rounded-full" style={{ background: "#4a9a28" }} />
      </div>
    </div>
  );
}
