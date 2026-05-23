import { pgTable, text, timestamp, real, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const clientBriefsTable = pgTable("client_briefs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  propertyId: text("property_id").notNull().unique(),
  // Step 1 — Auto-populated baseline (Open-Meteo)
  annualRainfallMm: real("annual_rainfall_mm"),
  estimatedSoilType: text("estimated_soil_type"),
  climateZone: text("climate_zone"),
  // Extended site baseline — temperature (Open-Meteo)
  meanAnnualTempC: real("mean_annual_temp_c"),
  summerMaxTempC: real("summer_max_temp_c"),
  winterMinTempC: real("winter_min_temp_c"),
  frostDaysPerYear: integer("frost_days_per_year"),
  annualHumidityPct: real("annual_humidity_pct"),
  // Extended site baseline — wind (Open-Meteo / NASA POWER)
  prevailingWindDir: text("prevailing_wind_dir"),
  meanWindSpeedMs: real("mean_wind_speed_ms"),
  // Extended site baseline — solar (NASA POWER)
  solarIrradianceKwhM2: real("solar_irradiance_kwh_m2"),
  // Extended site baseline — elevation (OpenTopoData)
  elevationM: real("elevation_m"),
  // Extended site baseline — soil (ISRIC SoilGrids)
  soilClay: real("soil_clay"),
  soilSand: real("soil_sand"),
  soilSilt: real("soil_silt"),
  soilPH: real("soil_ph"),
  soilOrganicCarbonGkg: real("soil_organic_carbon_gkg"),
  soilTextureClass: text("soil_texture_class"),
  // Step 2 — Household & Machinery
  householdSize: integer("household_size"),
  machineryWidthM: real("machinery_width_m").notNull().default(2.0),
  utilitiesOverheadPower: boolean("utilities_overhead_power").notNull().default(false),
  utilitiesBuriedPipes: boolean("utilities_buried_pipes").notNull().default(false),
  utilitiesLegalEasements: boolean("utilities_legal_easements").notNull().default(false),
  utilitiesActiveWell: boolean("utilities_active_well").notNull().default(false),
  // Step 3 — Site Challenges
  challengeSevereErosion: boolean("challenge_severe_erosion").notNull().default(false),
  challengeWinterFlooding: boolean("challenge_winter_flooding").notNull().default(false),
  challengeHighWind: boolean("challenge_high_wind").notNull().default(false),
  challengeWildlifePressure: boolean("challenge_wildlife_pressure").notNull().default(false),
  // Step 4 — Vision & Goals
  primaryGoal: text("primary_goal"),
  maintenanceCapacity: text("maintenance_capacity"),
  // Mood Board & Concept Renders
  moodBoardImages: text("mood_board_images"),
  conceptRenders: text("concept_renders"),
  // AI Analysis
  aiAnalysisReport: text("ai_analysis_report"),
  aiAnalysisGeneratedAt: timestamp("ai_analysis_generated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertClientBriefSchema = createInsertSchema(clientBriefsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const upsertClientBriefSchema = insertClientBriefSchema;

export type InsertClientBrief = z.infer<typeof insertClientBriefSchema>;
export type ClientBrief = typeof clientBriefsTable.$inferSelect;
