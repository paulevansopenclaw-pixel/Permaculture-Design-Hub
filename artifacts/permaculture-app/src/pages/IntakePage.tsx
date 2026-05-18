import { useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import * as turf from "@turf/turf";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListProperties,
  useGetProperty,
  useGetClientBrief,
  useUpsertClientBrief,
  getGetClientBriefQueryKey,
  getGetPropertyQueryKey,
} from "@workspace/api-client-react";
import { useAppStore } from "@/store/useAppStore";
import { OnboardingModal } from "@/components/OnboardingModal";
import { StepNav } from "@/components/StepNav";
import { fetchClimateBaseline } from "@/lib/fetchClimateBaseline";

export default function IntakePage() {
  const [, navigate] = useLocation();
  const { activePropertyId, setActivePropertyId } = useAppStore();
  const queryClient = useQueryClient();

  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"idle" | "ok" | "error">("idle");

  const { data: properties = [] } = useListProperties();
  const { data: property } = useGetProperty(activePropertyId ?? "", {
    query: { enabled: !!activePropertyId, queryKey: getGetPropertyQueryKey(activePropertyId ?? "") },
  });
  const { data: brief } = useGetClientBrief(activePropertyId ?? "", {
    query: { enabled: !!activePropertyId, queryKey: getGetClientBriefQueryKey(activePropertyId ?? "") },
  });
  const upsertClientBrief = useUpsertClientBrief();

  async function handleSyncSiteData() {
    if (!activePropertyId || !property?.boundaryGeojson) return;
    setIsSyncing(true);
    setSyncStatus("idle");
    try {
      const boundaryGeo =
        typeof property.boundaryGeojson === "string"
          ? JSON.parse(property.boundaryGeojson)
          : property.boundaryGeojson;
      const centroid = turf.centroid({ type: "Feature", geometry: boundaryGeo, properties: {} });
      const [lng, lat] = centroid.geometry.coordinates;
      const baseline = await fetchClimateBaseline(lat, lng);
      await upsertClientBrief.mutateAsync({
        propertyId: activePropertyId,
        data: {
          annualRainfallMm: baseline.annualRainfallMm,
          estimatedSoilType: baseline.estimatedSoilType,
          climateZone: baseline.climateZone,
          meanAnnualTempC: baseline.meanAnnualTempC,
          summerMaxTempC: baseline.summerMaxTempC,
          winterMinTempC: baseline.winterMinTempC,
          frostDaysPerYear: baseline.frostDaysPerYear,
          solarIrradianceKwhM2: baseline.solarIrradianceKwhM2,
          prevailingWindDir: baseline.prevailingWindDir,
          meanWindSpeedMs: baseline.meanWindSpeedMs,
          annualHumidityPct: baseline.annualHumidityPct,
          elevationM: baseline.elevationM,
          soilClay: baseline.soilClay,
          soilSand: baseline.soilSand,
          soilSilt: baseline.soilSilt,
          soilPH: baseline.soilPH,
          soilOrganicCarbonGkg: baseline.soilOrganicCarbonGkg,
          soilTextureClass: baseline.soilTextureClass,
          machineryWidthM: brief?.machineryWidthM ?? 3.0,
          utilitiesOverheadPower: brief?.utilitiesOverheadPower ?? false,
          utilitiesBuriedPipes: brief?.utilitiesBuriedPipes ?? false,
          utilitiesLegalEasements: brief?.utilitiesLegalEasements ?? false,
          utilitiesActiveWell: brief?.utilitiesActiveWell ?? false,
          challengeSevereErosion: brief?.challengeSevereErosion ?? false,
          challengeWinterFlooding: brief?.challengeWinterFlooding ?? false,
          challengeHighWind: brief?.challengeHighWind ?? false,
          challengeWildlifePressure: brief?.challengeWildlifePressure ?? false,
          primaryGoal: brief?.primaryGoal ?? null,
          maintenanceCapacity: brief?.maintenanceCapacity ?? null,
        },
      });
      queryClient.invalidateQueries({ queryKey: getGetClientBriefQueryKey(activePropertyId) });
      setSyncStatus("ok");
      setTimeout(() => setSyncStatus("idle"), 4000);
    } catch {
      setSyncStatus("error");
      setTimeout(() => setSyncStatus("idle"), 6000);
    } finally {
      setIsSyncing(false);
    }
  }

  const hasBoundary = !!property?.boundaryGeojson;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "hsl(103, 18%, 7%)" }}>
      {/* ── TOP BAR ── */}
      <header
        className="shrink-0 flex items-center justify-between px-5 py-3 border-b"
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
            Mission Control
          </span>
        </div>
        <StepNav />
      </header>

      {/* ── MAIN ── */}
      <main className="flex-1 px-4 sm:px-8 py-8 max-w-5xl mx-auto w-full">
        {/* Property selector */}
        <div className="mb-8">
          <label className="block text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "hsl(42, 15%, 45%)" }}>
            Active Property
          </label>
          <div className="flex gap-2 items-center">
            <select
              className="flex-1 max-w-xs text-sm px-3 py-2 rounded-lg border outline-none"
              style={{ background: "hsl(103, 30%, 11%)", borderColor: "hsl(103, 28%, 20%)", color: "hsl(42, 28%, 88%)" }}
              value={activePropertyId ?? ""}
              onChange={(e) => setActivePropertyId(e.target.value || null)}
            >
              <option value="">Select a property…</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <button
              onClick={() => navigate("/properties")}
              className="text-[11px] px-3 py-2 rounded-lg"
              style={{ color: "hsl(42, 20%, 55%)", border: "1px solid hsl(103, 22%, 20%)", background: "transparent" }}
            >
              Manage →
            </button>
          </div>
        </div>

        {/* No property selected */}
        {!activePropertyId && (
          <EmptyState
            icon="📋"
            title="No property selected"
            body="Select or create a property above to begin the site intake survey."
          />
        )}

        {/* Property selected but no boundary */}
        {activePropertyId && !hasBoundary && (
          <EmptyState
            icon="🗺"
            title="No boundary drawn yet"
            body="Head to The Sandbox and draw the property boundary before running the site survey."
            action={
              <button
                onClick={() => navigate("/workspace")}
                className="mt-4 px-5 py-2.5 rounded-xl text-[13px] font-semibold"
                style={{ background: "hsl(84, 38%, 30%)", color: "hsl(84, 55%, 85%)", border: "1px solid hsl(84, 38%, 40%)" }}
              >
                Go to Sandbox →
              </button>
            }
          />
        )}

        {/* Property + boundary but no brief */}
        {activePropertyId && hasBoundary && !brief && (
          <div className="space-y-6">
            <div
              className="rounded-2xl p-8 text-center space-y-4"
              style={{ background: "hsl(103, 22%, 10%)", border: "1px solid hsl(103, 22%, 18%)" }}
            >
              <div className="text-4xl mb-2">🌿</div>
              <h2 className="text-lg font-bold" style={{ color: "hsl(42, 28%, 88%)" }}>
                Start the Site Survey
              </h2>
              <p className="text-sm max-w-md mx-auto" style={{ color: "hsl(42, 15%, 55%)" }}>
                The 4-step site survey gathers climate, soil, goals, and infrastructure data. This feeds the AI resilience analysis.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                <button
                  onClick={() => setShowOnboarding(true)}
                  className="px-6 py-3 rounded-xl text-[13px] font-semibold"
                  style={{ background: "linear-gradient(135deg, #1a4a0d, #3a8220)", color: "#e8f5e2", border: "1px solid #4a9a28", boxShadow: "0 4px 18px rgba(45,106,26,0.4)" }}
                >
                  🌿 Start Site Survey
                </button>
                <button
                  onClick={handleSyncSiteData}
                  disabled={isSyncing}
                  className="px-5 py-3 rounded-xl text-[13px] font-medium"
                  style={{ background: "hsl(103, 22%, 13%)", color: "hsl(42, 20%, 65%)", border: "1px solid hsl(103, 22%, 22%)" }}
                >
                  {isSyncing ? "Syncing…" : "⟳ Auto-fill from Climate APIs"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Full brief display */}
        {activePropertyId && hasBoundary && brief && (
          <div className="space-y-6">
            {/* Header row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold" style={{ color: "hsl(42, 28%, 90%)" }}>
                  {property?.name}
                </h2>
                {(property?.areaHectares ?? 0) > 0 && (
                  <p className="text-sm mt-0.5" style={{ color: "hsl(42, 15%, 55%)" }}>
                    {property?.areaHectares?.toFixed(2)} ha · {property?.areaAcres?.toFixed(2)} acres
                  </p>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={handleSyncSiteData}
                  disabled={isSyncing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all"
                  style={{
                    background: syncStatus === "ok" ? "hsl(103, 30%, 13%)" : syncStatus === "error" ? "hsl(0, 25%, 13%)" : "hsl(103, 22%, 13%)",
                    color: syncStatus === "ok" ? "#4a9a28" : syncStatus === "error" ? "#f87171" : "hsl(42, 20%, 60%)",
                    border: `1px solid ${syncStatus === "ok" ? "hsl(103, 30%, 22%)" : syncStatus === "error" ? "hsl(0, 25%, 22%)" : "hsl(103, 22%, 20%)"}`,
                    opacity: isSyncing ? 0.7 : 1,
                  }}
                >
                  {isSyncing ? (
                    <><div className="w-3 h-3 border border-t-transparent rounded-full animate-spin" style={{ borderColor: "hsl(42,20%,60%)" }} />Syncing…</>
                  ) : syncStatus === "ok" ? "✓ Synced" : syncStatus === "error" ? "✗ Failed" : "⟳ Sync Site Data"}
                </button>
                <button
                  onClick={() => setShowOnboarding(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all"
                  style={{ background: "hsl(103, 22%, 13%)", color: "hsl(103, 40%, 65%)", border: "1px solid hsl(103, 22%, 22%)" }}
                >
                  ✎ Edit Survey
                </button>
              </div>
            </div>

            {/* Brief data grid */}
            <div className="grid sm:grid-cols-2 gap-4">
              {(brief.climateZone || brief.annualRainfallMm != null) && (
                <BriefCard heading="🌍 Climate & Rainfall">
                  {brief.climateZone && <BriefRow label="Zone" value={brief.climateZone} />}
                  {brief.annualRainfallMm != null && <BriefRow label="Rainfall" value={`${brief.annualRainfallMm.toLocaleString()} mm/yr`} />}
                  {brief.annualHumidityPct != null && <BriefRow label="Humidity" value={`${brief.annualHumidityPct}%`} />}
                </BriefCard>
              )}

              {(brief.meanAnnualTempC != null || brief.frostDaysPerYear != null) && (
                <BriefCard heading="🌡 Temperature">
                  {brief.meanAnnualTempC != null && <BriefRow label="Mean annual" value={`${brief.meanAnnualTempC} °C`} />}
                  {brief.summerMaxTempC != null && <BriefRow label="Summer max" value={`${brief.summerMaxTempC} °C`} />}
                  {brief.winterMinTempC != null && <BriefRow label="Winter min" value={`${brief.winterMinTempC} °C`} />}
                  {brief.frostDaysPerYear != null && <BriefRow label="Frost days" value={`${brief.frostDaysPerYear} days/yr`} />}
                </BriefCard>
              )}

              {(brief.solarIrradianceKwhM2 != null || brief.prevailingWindDir) && (
                <BriefCard heading="☀️ Solar & Wind">
                  {brief.solarIrradianceKwhM2 != null && <BriefRow label="Solar irradiance" value={`${brief.solarIrradianceKwhM2.toLocaleString()} kWh/m²/yr`} />}
                  {brief.prevailingWindDir && <BriefRow label="Wind direction" value={brief.prevailingWindDir} />}
                  {brief.meanWindSpeedMs != null && <BriefRow label="Wind speed" value={`${brief.meanWindSpeedMs} m/s`} />}
                </BriefCard>
              )}

              {(brief.soilTextureClass || brief.soilPH != null || brief.soilClay != null) && (
                <BriefCard heading="🪱 Soil (0–5 cm)">
                  {brief.soilTextureClass && <BriefRow label="Texture" value={brief.soilTextureClass} />}
                  {brief.soilPH != null && <BriefRow label="pH" value={String(brief.soilPH)} />}
                  {(brief.soilClay != null || brief.soilSand != null) && (
                    <BriefRow
                      label="Composition"
                      value={[
                        brief.soilClay != null ? `Clay ${brief.soilClay}%` : null,
                        brief.soilSand != null ? `Sand ${brief.soilSand}%` : null,
                        brief.soilSilt != null ? `Silt ${brief.soilSilt}%` : null,
                      ].filter(Boolean).join(" · ")}
                    />
                  )}
                  {brief.soilOrganicCarbonGkg != null && <BriefRow label="Org. carbon" value={`${brief.soilOrganicCarbonGkg} g/kg`} />}
                  {brief.elevationM != null && <BriefRow label="Elevation" value={`${brief.elevationM} m ASL`} />}
                </BriefCard>
              )}

              {(brief.primaryGoal || brief.maintenanceCapacity) && (
                <BriefCard heading="🎯 Design Goals">
                  {brief.primaryGoal && <BriefRow label="Primary goal" value={brief.primaryGoal} />}
                  {brief.maintenanceCapacity && <BriefRow label="Maintenance" value={brief.maintenanceCapacity} />}
                </BriefCard>
              )}

              {(brief.utilitiesOverheadPower || brief.utilitiesBuriedPipes || brief.utilitiesLegalEasements || brief.utilitiesActiveWell) && (
                <BriefCard heading="⚡ Infrastructure">
                  {brief.utilitiesOverheadPower && <BriefRow label="Overhead power" value="Present" />}
                  {brief.utilitiesBuriedPipes && <BriefRow label="Buried pipes" value="Present" />}
                  {brief.utilitiesLegalEasements && <BriefRow label="Legal easements" value="Present" />}
                  {brief.utilitiesActiveWell && <BriefRow label="Active well" value="Present" />}
                </BriefCard>
              )}

              {(brief.challengeSevereErosion || brief.challengeWinterFlooding || brief.challengeHighWind || brief.challengeWildlifePressure) && (
                <BriefCard heading="⚠️ Site Challenges">
                  {brief.challengeSevereErosion && <BriefRow label="Severe erosion" value="Yes" />}
                  {brief.challengeWinterFlooding && <BriefRow label="Winter flooding" value="Yes" />}
                  {brief.challengeHighWind && <BriefRow label="High wind" value="Yes" />}
                  {brief.challengeWildlifePressure && <BriefRow label="Wildlife pressure" value="Yes" />}
                </BriefCard>
              )}
            </div>

            {/* Navigation row */}
            <div className="flex items-center justify-between pt-4 border-t" style={{ borderColor: "hsl(103, 22%, 16%)" }}>
              <span className="text-[11px]" style={{ color: "hsl(42, 15%, 40%)" }}>
                Survey complete — ready for mapping
              </span>
              <button
                onClick={() => navigate("/workspace")}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold"
                style={{ background: "linear-gradient(135deg, #1a4a0d, #3a8220)", color: "#e8f5e2", border: "1px solid #4a9a28" }}
              >
                Next: The Sandbox →
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Onboarding modal */}
      {showOnboarding && activePropertyId && property?.boundaryGeojson && (
        <OnboardingModal
          propertyId={activePropertyId}
          propertyName={property.name}
          boundaryGeojson={property.boundaryGeojson as unknown as GeoJSON.Polygon}
          onClose={() => setShowOnboarding(false)}
        />
      )}
    </div>
  );
}

function EmptyState({ icon, title, body, action }: { icon: string; title: string; body: string; action?: ReactNode }) {
  return (
    <div
      className="rounded-2xl p-12 text-center space-y-3"
      style={{ background: "hsl(103, 18%, 9%)", border: "1px solid hsl(103, 18%, 16%)" }}
    >
      <div className="text-4xl mb-3">{icon}</div>
      <h3 className="text-base font-semibold" style={{ color: "hsl(42, 28%, 82%)" }}>{title}</h3>
      <p className="text-sm max-w-sm mx-auto" style={{ color: "hsl(42, 15%, 50%)" }}>{body}</p>
      {action}
    </div>
  );
}

function BriefCard({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "hsl(103, 18%, 9%)", border: "1px solid hsl(103, 20%, 17%)" }}>
      <div className="px-4 py-2.5" style={{ background: "hsl(103, 22%, 12%)", borderBottom: "1px solid hsl(103, 20%, 17%)" }}>
        <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "hsl(84, 35%, 58%)" }}>
          {heading}
        </span>
      </div>
      <div>{children}</div>
    </div>
  );
}

function BriefRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-2 text-[12px]"
      style={{ borderBottom: "1px solid hsl(103, 18%, 14%)" }}
    >
      <span className="shrink-0 min-w-[7rem]" style={{ color: "hsl(42, 15%, 48%)" }}>{label}</span>
      <span className="font-medium truncate" style={{ color: "hsl(42, 28%, 85%)" }}>{value}</span>
    </div>
  );
}
