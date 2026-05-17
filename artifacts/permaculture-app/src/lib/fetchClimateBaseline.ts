/**
 * Fetches climate baseline data for a given lat/lng using the free Open-Meteo API.
 * No API key required.
 */

export interface ClimateBaseline {
  annualRainfallMm: number;
  climateZone: string;
  estimatedSoilType: string;
}

function classifyKoppen(annualRainfallMm: number, meanTempC: number): string {
  if (meanTempC < -3) return "E — Polar / Tundra";
  if (meanTempC < 5) return "D — Continental / Boreal";
  if (annualRainfallMm < 250) return "B — Arid / Desert";
  if (annualRainfallMm < 500) return "BS — Semi-arid Steppe";
  if (meanTempC >= 18 && annualRainfallMm > 1200) return "Af — Tropical Rainforest";
  if (meanTempC >= 18 && annualRainfallMm > 750) return "Am — Tropical Monsoon";
  if (meanTempC >= 18) return "Aw — Tropical Savanna";
  if (meanTempC >= 12) return "Csa/Csb — Mediterranean / Warm Temperate";
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

export async function fetchClimateBaseline(lat: number, lng: number): Promise<ClimateBaseline> {
  const today = new Date();
  const endDate = today.toISOString().slice(0, 10);
  const startDate = new Date(today.getFullYear() - 3, today.getMonth(), today.getDate())
    .toISOString()
    .slice(0, 10);

  const url =
    `https://archive-api.open-meteo.com/v1/archive` +
    `?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}` +
    `&start_date=${startDate}&end_date=${endDate}` +
    `&daily=precipitation_sum,temperature_2m_mean` +
    `&timezone=auto`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Climate API error: ${res.status}`);
  const data = await res.json() as {
    daily: { precipitation_sum: (number | null)[]; temperature_2m_mean: (number | null)[] };
  };

  const precip = data.daily.precipitation_sum.filter((v): v is number => v !== null);
  const temps = data.daily.temperature_2m_mean.filter((v): v is number => v !== null);

  // Average annual rainfall over the 3-year period
  const totalPrecip = precip.reduce((s, v) => s + v, 0);
  const annualRainfallMm = Math.round((totalPrecip / 3));

  const meanTempC = temps.length > 0 ? temps.reduce((s, v) => s + v, 0) / temps.length : 15;

  const climateZone = classifyKoppen(annualRainfallMm, meanTempC);
  const estimatedSoilType = estimateSoilType(annualRainfallMm, meanTempC);

  return { annualRainfallMm, climateZone, estimatedSoilType };
}
