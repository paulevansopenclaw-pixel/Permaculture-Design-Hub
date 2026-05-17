/**
 * Fetches a comprehensive site baseline from four free, key-free APIs in parallel:
 *   - Open-Meteo Historical Archive  — 3-yr climate (rainfall, temp, frost)
 *   - NASA POWER Climatology         — 30-yr solar irradiance, wind, humidity
 *   - OpenTopoData (SRTM 30m)        — elevation
 *   - ISRIC SoilGrids v2             — soil texture, pH, organic carbon (global incl. Australia)
 *
 * No API keys required. All sources are open and rate-limit friendly.
 */

// ─── Exported type ────────────────────────────────────────────────────────────

export interface SiteBaseline {
  // Open-Meteo (3-yr historical)
  annualRainfallMm: number;
  climateZone: string;
  estimatedSoilType: string;
  meanAnnualTempC: number;
  summerMaxTempC: number;
  winterMinTempC: number;
  frostDaysPerYear: number;
  // NASA POWER (30-yr climatology)
  solarIrradianceKwhM2: number | null;
  prevailingWindDir: string | null;
  meanWindSpeedMs: number | null;
  annualHumidityPct: number | null;
  // OpenTopoData
  elevationM: number | null;
  // ISRIC SoilGrids
  soilClay: number | null;
  soilSand: number | null;
  soilSilt: number | null;
  soilPH: number | null;
  soilOrganicCarbonGkg: number | null;
  soilTextureClass: string | null;
}

// Keep the old alias so any existing code that imports ClimateBaseline still compiles.
export type ClimateBaseline = SiteBaseline;

// ─── Helper classifiers ───────────────────────────────────────────────────────

/**
 * Köppen-Geiger classifier.
 * @param annualRainfallMm  3-yr mean annual precipitation (mm)
 * @param meanAnnualTempC   Mean of daily mean temperatures (°C)
 * @param coldestMonthMinC  Average daily-minimum of the coldest 3-month block (°C)
 *                          Used to properly separate A (tropical) from C (temperate).
 *                          True tropical requires the coldest month to stay ≥ 18 °C.
 */
function classifyKoppen(annualRainfallMm: number, meanAnnualTempC: number, coldestMonthMinC: number): string {
  // Polar / tundra — no month above 10 °C
  if (meanAnnualTempC < -3) return "E — Polar / Tundra";
  // Continental / boreal — coldest month < -3 °C
  if (coldestMonthMinC < -3) return "D — Continental / Boreal";
  // Arid — precipitation very low regardless of temp
  if (annualRainfallMm < 250) return "B — Arid / Desert";
  if (annualRainfallMm < 500) return "BS — Semi-arid Steppe";
  // Tropical A — coldest month MEAN ≥ 18 °C.
  // coldestMonthMinC is the avg daily-min of the coldest 3 months; coldest month MEAN
  // ≈ coldestMonthMinC + ~5 °C offset. Require coldestMonthMinC ≥ 14 as a conservative proxy.
  const isTropical = coldestMonthMinC >= 14;
  if (isTropical) {
    if (annualRainfallMm > 1500) return "Af — Tropical Rainforest";
    if (annualRainfallMm > 900)  return "Am — Tropical Monsoon";
    return "Aw — Tropical Savanna";
  }
  // Temperate C — coldest month between -3 °C and ~14 °C (proxy)
  // Cfa — Humid Subtropical: hot summers (mean annual ≥ 18 °C), no dry season
  if (meanAnnualTempC >= 18 && annualRainfallMm >= 600) return "Cfa — Humid Subtropical";
  if (meanAnnualTempC >= 18) return "Csa/Csb — Mediterranean / Warm Temperate";
  if (meanAnnualTempC >= 12) return "Csa/Csb — Mediterranean / Warm Temperate";
  return "Cfb — Oceanic / Cool Temperate";
}

function estimateSoilType(annualRainfallMm: number, meanTempC: number): string {
  if (annualRainfallMm < 200) return "Aridisol — Dry, sparse organic matter";
  if (annualRainfallMm < 450) return "Xerosol / Red-Brown Earth";
  if (annualRainfallMm < 700) return "Luvisol / Clay Loam";
  if (meanTempC >= 20 && annualRainfallMm > 1500) return "Ferralsol / Oxisol — Highly weathered laterite";
  if (meanTempC >= 16 && annualRainfallMm > 1000) return "Acrisol / Red-Yellow Podsolic";
  if (annualRainfallMm < 1100) return "Cambisol / Loam";
  if (meanTempC < 5) return "Histosol / Peat — Cool, waterlogged";
  return "Podzol / Silty Loam";
}

/** USDA texture triangle approximation */
function classifySoilTexture(clay: number, sand: number, _silt: number): string {
  if (clay >= 40) {
    if (sand >= 45) return "Sandy Clay";
    if (_silt >= 40) return "Silty Clay";
    return "Clay";
  }
  if (clay >= 27) {
    if (sand >= 45) return "Sandy Clay Loam";
    if (_silt >= 40) return "Silty Clay Loam";
    return "Clay Loam";
  }
  if (clay >= 7) {
    if (sand >= 52) return "Sandy Loam";
    if (_silt >= 50) return "Silt Loam";
    return "Loam";
  }
  if (sand >= 85) return "Sand";
  if (sand >= 70) return "Loamy Sand";
  return "Sandy Loam";
}

/** Convert degrees → compass abbreviation */
function bearingToCompass(deg: number): string {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
}

// ─── Individual fetchers ──────────────────────────────────────────────────────

async function fetchOpenMeteo(lat: number, lng: number) {
  const today = new Date();
  const endDate = today.toISOString().slice(0, 10);
  const startDate = new Date(today.getFullYear() - 3, today.getMonth(), today.getDate())
    .toISOString().slice(0, 10);

  const url =
    `https://archive-api.open-meteo.com/v1/archive` +
    `?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}` +
    `&start_date=${startDate}&end_date=${endDate}` +
    `&daily=precipitation_sum,temperature_2m_mean,temperature_2m_max,temperature_2m_min` +
    `&timezone=auto`;

  const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`Open-Meteo: ${res.status}`);
  const data = await res.json() as {
    daily: {
      time: string[];
      precipitation_sum: (number | null)[];
      temperature_2m_mean: (number | null)[];
      temperature_2m_max: (number | null)[];
      temperature_2m_min: (number | null)[];
    };
  };

  const { time, precipitation_sum, temperature_2m_mean, temperature_2m_max, temperature_2m_min } = data.daily;
  const n = time.length;

  // Annual rainfall averaged over the 3-year window
  const totalPrecip = precipitation_sum.reduce<number>((s, v) => s + (v ?? 0), 0);
  const annualRainfallMm = Math.round(totalPrecip / 3);

  // Mean annual temp
  const means = temperature_2m_mean.filter((v): v is number => v !== null);
  const meanAnnualTempC = means.length > 0
    ? Math.round((means.reduce((s, v) => s + v, 0) / means.length) * 10) / 10
    : 15;

  // Frost days
  const frostDaysPerYear = Math.round(
    temperature_2m_min.filter((v): v is number => v !== null && v < 0).length / 3
  );

  // Group daily maxes and mins by month to find summer/winter extremes
  const monthlyMaxSums: number[] = Array(12).fill(0);
  const monthlyMaxCounts: number[] = Array(12).fill(0);
  const monthlyMinSums: number[] = Array(12).fill(0);
  const monthlyMinCounts: number[] = Array(12).fill(0);

  for (let i = 0; i < n; i++) {
    const m = new Date(time[i]).getMonth(); // 0-indexed
    const mx = temperature_2m_max[i];
    const mn = temperature_2m_min[i];
    if (mx !== null) { monthlyMaxSums[m] += mx; monthlyMaxCounts[m]++; }
    if (mn !== null) { monthlyMinSums[m] += mn; monthlyMinCounts[m]++; }
  }

  const monthlyMaxAvg = monthlyMaxSums.map((s, i) => monthlyMaxCounts[i] > 0 ? s / monthlyMaxCounts[i] : null);
  const monthlyMinAvg = monthlyMinSums.map((s, i) => monthlyMinCounts[i] > 0 ? s / monthlyMinCounts[i] : null);

  // Hottest 3-month block (summer), coldest 3-month block (winter) — works both hemispheres
  const sortedByMax = monthlyMaxAvg
    .map((v, i) => ({ m: i, v: v ?? -99 }))
    .sort((a, b) => b.v - a.v);
  const sortedByMin = monthlyMinAvg
    .map((v, i) => ({ m: i, v: v ?? 99 }))
    .sort((a, b) => a.v - b.v);

  const summerMaxTempC = Math.round(
    sortedByMax.slice(0, 3).reduce((s, x) => s + x.v, 0) / 3 * 10
  ) / 10;
  const winterMinTempC = Math.round(
    sortedByMin.slice(0, 3).reduce((s, x) => s + x.v, 0) / 3 * 10
  ) / 10;

  return {
    annualRainfallMm,
    meanAnnualTempC,
    summerMaxTempC,
    winterMinTempC,
    frostDaysPerYear,
    climateZone: classifyKoppen(annualRainfallMm, meanAnnualTempC, winterMinTempC),
    estimatedSoilType: estimateSoilType(annualRainfallMm, meanAnnualTempC),
  };
}

async function fetchNasaPower(lat: number, lng: number) {
  const url =
    `https://power.larc.nasa.gov/api/temporal/climatology/point` +
    `?parameters=ALLSKY_SFC_SW_DWN,WS10M,WD10M,RH2M` +
    `&community=AG` +
    `&longitude=${lng.toFixed(4)}&latitude=${lat.toFixed(4)}` +
    `&format=JSON`;

  const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`NASA POWER: ${res.status}`);
  const data = await res.json() as {
    properties: {
      parameter: Record<string, Record<string, number>>;
    };
  };
  const p = data.properties.parameter;

  // Annual solar irradiance: ANN kWh/m²/day → multiply by 365 for annual kWh/m²
  const dailySolar = p["ALLSKY_SFC_SW_DWN"]?.["ANN"] ?? null;
  const solarIrradianceKwhM2 = dailySolar !== null ? Math.round(dailySolar * 365) : null;

  // Mean annual wind speed (m/s)
  const meanWindSpeedMs = p["WS10M"]?.["ANN"] != null
    ? Math.round(p["WS10M"]["ANN"] * 10) / 10
    : null;

  // Prevailing wind direction
  const windDirDeg = p["WD10M"]?.["ANN"] ?? null;
  const prevailingWindDir = windDirDeg !== null ? bearingToCompass(windDirDeg) : null;

  // Annual relative humidity
  const annualHumidityPct = p["RH2M"]?.["ANN"] != null
    ? Math.round(p["RH2M"]["ANN"])
    : null;

  return { solarIrradianceKwhM2, meanWindSpeedMs, prevailingWindDir, annualHumidityPct };
}

async function fetchElevation(lat: number, lng: number): Promise<number | null> {
  const url = `https://api.opentopodata.org/v1/srtm30m?locations=${lat.toFixed(5)},${lng.toFixed(5)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return null;
  const data = await res.json() as { results: { elevation: number | null }[] };
  return data.results?.[0]?.elevation ?? null;
}

async function fetchSoilGrids(lat: number, lng: number) {
  const props = ["phh2o", "soc", "clay", "sand", "silt"].map(p => `property=${p}`).join("&");
  const url =
    `https://rest.isric.org/soilgrids/v2.0/properties/query` +
    `?lon=${lng.toFixed(5)}&lat=${lat.toFixed(5)}` +
    `&${props}&depth=0-5cm&value=mean`;

  const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`SoilGrids: ${res.status}`);

  const data = await res.json() as {
    properties: {
      layers: {
        name: string;
        depths: { label: string; values: { mean: number | null } }[];
      }[];
    };
  };

  function layerMean(name: string): number | null {
    const layer = data.properties.layers.find(l => l.name === name);
    return layer?.depths?.[0]?.values?.mean ?? null;
  }

  // Units from ISRIC:
  //  clay/sand/silt: g/kg  → divide by 10 for %
  //  phh2o:          pH×10 → divide by 10
  //  soc:            dg/kg → divide by 10 for g/kg

  const clayRaw = layerMean("clay");
  const sandRaw = layerMean("sand");
  const siltRaw = layerMean("silt");
  const phRaw = layerMean("phh2o");
  const socRaw = layerMean("soc");

  const soilClay = clayRaw !== null ? Math.round(clayRaw / 10 * 10) / 10 : null;
  const soilSand = sandRaw !== null ? Math.round(sandRaw / 10 * 10) / 10 : null;
  const soilSilt = siltRaw !== null ? Math.round(siltRaw / 10 * 10) / 10 : null;
  const soilPH = phRaw !== null ? Math.round(phRaw / 10 * 10) / 10 : null;
  const soilOrganicCarbonGkg = socRaw !== null ? Math.round(socRaw / 10 * 10) / 10 : null;
  const soilTextureClass = (soilClay !== null && soilSand !== null && soilSilt !== null)
    ? classifySoilTexture(soilClay, soilSand, soilSilt)
    : null;

  return { soilClay, soilSand, soilSilt, soilPH, soilOrganicCarbonGkg, soilTextureClass };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function fetchClimateBaseline(lat: number, lng: number): Promise<SiteBaseline> {
  const [meteoResult, nasaResult, elevResult, soilResult] = await Promise.allSettled([
    fetchOpenMeteo(lat, lng),
    fetchNasaPower(lat, lng),
    fetchElevation(lat, lng),
    fetchSoilGrids(lat, lng),
  ]);

  // Open-Meteo is the core — re-throw if it fails so the caller can show an error.
  if (meteoResult.status === "rejected") throw meteoResult.reason;
  const meteo = meteoResult.value;

  const nasa = nasaResult.status === "fulfilled" ? nasaResult.value : {
    solarIrradianceKwhM2: null, meanWindSpeedMs: null, prevailingWindDir: null, annualHumidityPct: null,
  };
  const elevationM = elevResult.status === "fulfilled" ? elevResult.value : null;
  const soil = soilResult.status === "fulfilled" ? soilResult.value : {
    soilClay: null, soilSand: null, soilSilt: null, soilPH: null, soilOrganicCarbonGkg: null, soilTextureClass: null,
  };

  return {
    ...meteo,
    ...nasa,
    elevationM: elevationM !== null ? Math.round(elevationM) : null,
    ...soil,
  };
}
