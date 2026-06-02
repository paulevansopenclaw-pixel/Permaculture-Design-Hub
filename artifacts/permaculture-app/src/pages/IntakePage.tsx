import { useState, useRef, useEffect, type ReactNode } from "react";
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

// ─── Image resize helper ───────────────────────────────────────────────────────
async function resizeToDataUrl(file: File, maxPx = 900): Promise<string> {
  // Step 1: read the file with FileReader (avoids blob-URL security issues in iframes)
  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target!.result as string);
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsDataURL(file);
  });

  // Step 2: draw into a canvas to resize, then return a JPEG data URL
  return new Promise<string>((resolve) => {
    const img = new Image();
    img.onerror = () => resolve(rawDataUrl); // fallback: return original on error
    img.onload = () => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      const scale = Math.min(1, maxPx / Math.max(w, h, 1));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx || canvas.width === 0 || canvas.height === 0) {
        resolve(rawDataUrl); // fallback: return original if canvas broken
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.src = rawDataUrl;
  });
}

export default function IntakePage() {
  const [, navigate] = useLocation();
  const { activePropertyId, setActivePropertyId } = useAppStore();
  const queryClient = useQueryClient();

  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"idle" | "ok" | "error">("idle");

  // Wizard step: 0 = Survey, 1 = Vision Board
  const [wizardStep, setWizardStep] = useState<0 | 1>(0);

  // Vision Board state
  const [photos, setPhotos] = useState<string[]>([]);
  const [isSavingPhotos, setIsSavingPhotos] = useState(false);
  const [photosSaveStatus, setPhotosSaveStatus] = useState<"idle" | "ok" | "error">("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: properties = [] } = useListProperties();
  const { data: property } = useGetProperty(activePropertyId ?? "", {
    query: { enabled: !!activePropertyId, queryKey: getGetPropertyQueryKey(activePropertyId ?? "") },
  });
  const { data: brief } = useGetClientBrief(activePropertyId ?? "", {
    query: { enabled: !!activePropertyId, queryKey: getGetClientBriefQueryKey(activePropertyId ?? "") },
  });
  const upsertClientBrief = useUpsertClientBrief();

  // Sync photos from brief when entering Vision Board step or when brief loads
  useEffect(() => {
    if (wizardStep === 1 && brief) {
      setPhotos((brief.moodBoardImages as string[] | null) ?? []);
    }
  }, [wizardStep, brief]);

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
          householdSize: brief?.householdSize ?? null,
          primaryGoal: brief?.primaryGoal ?? null,
          maintenanceCapacity: brief?.maintenanceCapacity ?? null,
          moodBoardImages: (brief?.moodBoardImages as string[] | null) ?? null,
          conceptRenders: (brief?.conceptRenders as string[] | null) ?? null,
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

  async function handleAddPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const remaining = 5 - photos.length;
    const toProcess = files.slice(0, remaining);
    try {
      const dataUrls = await Promise.all(toProcess.map((f) => resizeToDataUrl(f)));
      setPhotos((prev) => [...prev, ...dataUrls].slice(0, 5));
    } catch (err) {
      console.error("Image upload failed:", err);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleRemovePhoto(idx: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSavePhotos() {
    if (!activePropertyId || !brief) return;
    setIsSavingPhotos(true);
    setPhotosSaveStatus("idle");
    try {
      await upsertClientBrief.mutateAsync({
        propertyId: activePropertyId,
        data: {
          machineryWidthM: brief.machineryWidthM,
          utilitiesOverheadPower: brief.utilitiesOverheadPower,
          utilitiesBuriedPipes: brief.utilitiesBuriedPipes,
          utilitiesLegalEasements: brief.utilitiesLegalEasements,
          utilitiesActiveWell: brief.utilitiesActiveWell,
          challengeSevereErosion: brief.challengeSevereErosion,
          challengeWinterFlooding: brief.challengeWinterFlooding,
          challengeHighWind: brief.challengeHighWind,
          challengeWildlifePressure: brief.challengeWildlifePressure,
          annualRainfallMm: brief.annualRainfallMm,
          estimatedSoilType: brief.estimatedSoilType,
          climateZone: brief.climateZone,
          meanAnnualTempC: brief.meanAnnualTempC,
          summerMaxTempC: brief.summerMaxTempC,
          winterMinTempC: brief.winterMinTempC,
          frostDaysPerYear: brief.frostDaysPerYear,
          solarIrradianceKwhM2: brief.solarIrradianceKwhM2,
          prevailingWindDir: brief.prevailingWindDir,
          meanWindSpeedMs: brief.meanWindSpeedMs,
          annualHumidityPct: brief.annualHumidityPct,
          elevationM: brief.elevationM,
          soilClay: brief.soilClay,
          soilSand: brief.soilSand,
          soilSilt: brief.soilSilt,
          soilPH: brief.soilPH,
          soilOrganicCarbonGkg: brief.soilOrganicCarbonGkg,
          soilTextureClass: brief.soilTextureClass,
          householdSize: brief.householdSize,
          primaryGoal: brief.primaryGoal,
          maintenanceCapacity: brief.maintenanceCapacity,
          conceptRenders: (brief.conceptRenders as string[] | null) ?? null,
          moodBoardImages: photos,
        },
      });
      queryClient.invalidateQueries({ queryKey: getGetClientBriefQueryKey(activePropertyId) });
      setPhotosSaveStatus("ok");
      setTimeout(() => setPhotosSaveStatus("idle"), 3000);
    } catch {
      setPhotosSaveStatus("error");
      setTimeout(() => setPhotosSaveStatus("idle"), 5000);
    } finally {
      setIsSavingPhotos(false);
    }
  }

  const hasBoundary = !!property?.boundaryGeojson;
  const hasBrief = !!brief;
  const showWizardTabs = !!activePropertyId && hasBoundary && hasBrief;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#f8f5f0", fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* ── TOP BAR ── */}
      <header
        className="shrink-0 flex items-center justify-between px-5"
        style={{ height: 54, background: "#fff", borderBottom: "1px solid #ddd6cc", boxShadow: "0 2px 6px rgba(44,36,22,0.06)" }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/properties")}
            className="flex items-center gap-2"
            style={{ color: "#2c2416", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}
          >
            <div style={{ width: 28, height: 28, borderRadius: 7, background: "#2d6a4f", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <span style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 14, color: "#2c2416" }} className="hidden sm:inline">TerraGuard</span>
          </button>
          <div className="hidden sm:block" style={{ width: 1, height: 16, background: "#ddd6cc" }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: "#6b5f4e" }} className="hidden sm:inline">
            Site Intake
          </span>
        </div>
        <StepNav />
      </header>

      {/* ── MAIN ── */}
      <main className="flex-1 px-4 sm:px-8 py-8 max-w-5xl mx-auto w-full">
        {/* Property selector */}
        <div className="mb-6">
          <label className="block text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "#888" }}>
            Active Property
          </label>
          <div className="flex gap-2 items-center">
            <select
              className="flex-1 max-w-xs text-sm px-3 py-2 border outline-none"
              style={{ background: "#fff", borderColor: "#111", color: "#111", borderWidth: 2 }}
              value={activePropertyId ?? ""}
              onChange={(e) => { setActivePropertyId(e.target.value || null); setWizardStep(0); }}
            >
              <option value="">Select a property…</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <button
              onClick={() => navigate("/properties")}
              className="text-[11px] px-3 py-2"
              style={{ color: "#888", border: "1px solid #ddd", background: "transparent" }}
            >
              Manage →
            </button>
          </div>
        </div>

        {/* ── Wizard tabs (only shown once survey is complete) ── */}
        {showWizardTabs && (
          <div className="flex gap-1 mb-6 p-1 w-fit" style={{ background: "#f7f7f7", border: "1px solid #e5e5e5" }}>
            {(["Survey", "Vision Board"] as const).map((label, idx) => (
              <button
                key={label}
                onClick={() => setWizardStep(idx as 0 | 1)}
                className="px-4 py-1.5 text-[12px] font-semibold transition-all"
                style={wizardStep === idx ? {
                  background: "#fff",
                  color: "#1d4ed8",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                  border: "1px solid #e5e5e5",
                } : {
                  color: "#888",
                  background: "transparent",
                  border: "1px solid transparent",
                }}
              >
                {idx === 0 ? "📋" : "🖼"} {label}
              </button>
            ))}
          </div>
        )}

        {/* ── Step 0: Survey ── */}
        {(!showWizardTabs || wizardStep === 0) && (
          <>
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
                    style={{ background: "#1d4ed8", color: "#fff", border: "2px solid #1d4ed8" }}
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
                  className="p-8 text-center space-y-4"
                  style={{ background: "#f7f7f7", border: "2px solid #111" }}
                >
                  <div className="text-4xl mb-2">🌿</div>
                  <h2 className="text-lg font-bold" style={{ color: "#111" }}>
                    Start the Site Survey
                  </h2>
                  <p className="text-sm max-w-md mx-auto" style={{ color: "#666" }}>
                    The 4-step site survey gathers climate, soil, goals, and infrastructure data. This feeds the AI resilience analysis.
                  </p>
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                    <button
                      onClick={() => setShowOnboarding(true)}
                      className="px-6 py-3 text-[13px] font-semibold"
                      style={{ background: "#1d4ed8", color: "#fff", border: "2px solid #1d4ed8" }}
                    >
                      🌿 Start Site Survey
                    </button>
                    <button
                      onClick={handleSyncSiteData}
                      disabled={isSyncing}
                      className="px-5 py-3 text-[13px] font-medium"
                      style={{ background: "#fff", color: "#555", border: "1px solid #ddd" }}
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
                    <h2 className="text-xl font-bold" style={{ color: "#111" }}>
                      {property?.name}
                    </h2>
                    {(property?.areaHectares ?? 0) > 0 && (
                      <p className="text-sm mt-0.5" style={{ color: "#888" }}>
                        {property?.areaHectares?.toFixed(2)} ha · {property?.areaAcres?.toFixed(2)} acres
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={handleSyncSiteData}
                      disabled={isSyncing}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium transition-all"
                      style={{
                        background: "#fff",
                        color: syncStatus === "ok" ? "#16a34a" : syncStatus === "error" ? "#ef4444" : "#555",
                        border: `1px solid ${syncStatus === "ok" ? "#16a34a" : syncStatus === "error" ? "#ef4444" : "#ddd"}`,
                        opacity: isSyncing ? 0.7 : 1,
                      }}
                    >
                      {isSyncing ? (
                        <><div className="w-3 h-3 border border-t-transparent rounded-full animate-spin" style={{ borderColor: "#555" }} />Syncing…</>
                      ) : syncStatus === "ok" ? "✓ Synced" : syncStatus === "error" ? "✗ Failed" : "⟳ Sync Site Data"}
                    </button>
                    <button
                      onClick={() => setShowOnboarding(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium transition-all"
                      style={{ background: "#fff", color: "#1d4ed8", border: "1px solid #1d4ed8" }}
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

                  {(brief.primaryGoal || brief.maintenanceCapacity || brief.householdSize != null) && (
                    <BriefCard heading="🎯 Design Goals">
                      {brief.householdSize != null && <BriefRow label="Occupants" value={`${brief.householdSize} people`} />}
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
                <div className="flex items-center justify-between pt-4 border-t" style={{ borderColor: "#e5e5e5" }}>
                  <button
                    onClick={() => setWizardStep(1)}
                    className="flex items-center gap-2 px-4 py-2 text-[12px] font-medium"
                    style={{ background: "#fff", color: "#1d4ed8", border: "1px solid #1d4ed8" }}
                  >
                    🖼 Add Vision Board →
                  </button>
                  <button
                    onClick={() => navigate("/workspace")}
                    className="flex items-center gap-2 px-5 py-2.5 text-[13px] font-semibold"
                    style={{ background: "#1d4ed8", color: "#fff", border: "2px solid #1d4ed8" }}
                  >
                    Next: The Sandbox →
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Step 1: Vision Board ── */}
        {showWizardTabs && wizardStep === 1 && (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold" style={{ color: "#111" }}>Vision Board</h2>
                <p className="text-sm mt-1" style={{ color: "#888" }}>
                  Upload up to 5 photos that capture the feel, style, or inspiration for this property.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {photos.length < 5 && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold"
                    style={{ background: "#fff", color: "#1d4ed8", border: "1px solid #1d4ed8" }}
                  >
                    <span className="text-sm">＋</span> Add Photo
                    <span className="text-[10px] ml-1 opacity-60">({photos.length}/5)</span>
                  </button>
                )}
                <button
                  onClick={handleSavePhotos}
                  disabled={isSavingPhotos}
                  className="flex items-center gap-1.5 px-4 py-2 text-[12px] font-semibold transition-all"
                  style={photosSaveStatus === "ok" ? {
                    background: "#fff", color: "#16a34a", border: "1px solid #16a34a",
                  } : photosSaveStatus === "error" ? {
                    background: "#fff", color: "#ef4444", border: "1px solid #ef4444",
                  } : {
                    background: "#1d4ed8", color: "#fff", border: "2px solid #1d4ed8",
                    opacity: isSavingPhotos ? 0.7 : 1,
                  }}
                >
                  {isSavingPhotos ? (
                    <><div className="w-3 h-3 border border-t-transparent rounded-full animate-spin" style={{ borderColor: "#fff" }} />Saving…</>
                  ) : photosSaveStatus === "ok" ? "✓ Saved" : photosSaveStatus === "error" ? "✗ Failed" : "Save Vision Board"}
                </button>
              </div>
            </div>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleAddPhotos}
            />

            {/* Photo grid or empty state */}
            {photos.length === 0 ? (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex flex-col items-center justify-center gap-4 py-16 transition-all"
                style={{ background: "#f7f7f7", border: "2px dashed #ddd", color: "#888" }}
              >
                <div className="w-16 h-16 flex items-center justify-center text-3xl" style={{ background: "#eee" }}>
                  🖼
                </div>
                <div className="text-center space-y-1">
                  <p className="text-[13px] font-semibold" style={{ color: "#111" }}>Click to upload inspiration photos</p>
                  <p className="text-[11px]" style={{ color: "#bbb" }}>JPG, PNG, WebP · up to 5 images · resized to 900 px automatically</p>
                </div>
              </button>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {photos.map((src, i) => (
                  <div
                    key={i}
                    className="relative group overflow-hidden"
                    style={{ background: "#f7f7f7", border: "1px solid #e5e5e5", aspectRatio: "4/3" }}
                  >
                    <img src={src} alt={`Vision board photo ${i + 1}`} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center">
                      <button
                        onClick={() => handleRemovePhoto(i)}
                        className="opacity-0 group-hover:opacity-100 transition-all w-8 h-8 flex items-center justify-center text-[13px] font-bold"
                        style={{ background: "rgba(239,68,68,0.85)", color: "white" }}
                        aria-label="Remove photo"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="absolute bottom-2 left-2 text-[9px] px-1.5 py-0.5 font-semibold" style={{ background: "rgba(0,0,0,0.6)", color: "rgba(255,255,255,0.75)" }}>
                      {i + 1}
                    </div>
                  </div>
                ))}
                {photos.length < 5 && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center justify-center gap-2 transition-all"
                    style={{ background: "#f7f7f7", border: "2px dashed #ddd", aspectRatio: "4/3", color: "#bbb" }}
                  >
                    <span className="text-2xl" style={{ color: "#1d4ed8" }}>＋</span>
                    <span className="text-[10px]">{photos.length}/5</span>
                  </button>
                )}
              </div>
            )}

            {/* Footer nav */}
            <div className="flex items-center justify-between pt-4 border-t" style={{ borderColor: "#e5e5e5" }}>
              <button
                onClick={() => setWizardStep(0)}
                className="text-[11px] px-3 py-1.5"
                style={{ color: "#888", border: "1px solid #ddd", background: "transparent" }}
              >
                ← Back to Survey
              </button>
              <button
                onClick={() => navigate("/workspace")}
                className="flex items-center gap-2 px-5 py-2.5 text-[13px] font-semibold"
                style={{ background: "#1d4ed8", color: "#fff", border: "2px solid #1d4ed8" }}
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
      className="p-12 text-center space-y-3"
      style={{ background: "#f7f7f7", border: "2px solid #e5e5e5" }}
    >
      <div className="text-4xl mb-3">{icon}</div>
      <h3 className="text-base font-semibold" style={{ color: "#111" }}>{title}</h3>
      <p className="text-sm max-w-sm mx-auto" style={{ color: "#888" }}>{body}</p>
      {action}
    </div>
  );
}

function BriefCard({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden" style={{ background: "#fff", border: "2px solid #111" }}>
      <div className="px-4 py-2.5" style={{ background: "#f7f7f7", borderBottom: "1px solid #e5e5e5" }}>
        <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "#111" }}>
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
      style={{ borderBottom: "1px solid #f0f0f0" }}
    >
      <span className="shrink-0 min-w-[7rem]" style={{ color: "#888" }}>{label}</span>
      <span className="font-medium truncate" style={{ color: "#111" }}>{value}</span>
    </div>
  );
}
