import { pgTable, text, timestamp, real, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const clientBriefsTable = pgTable("client_briefs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  propertyId: text("property_id").notNull().unique(),
  // Step 1 — Auto-populated baseline
  annualRainfallMm: real("annual_rainfall_mm"),
  estimatedSoilType: text("estimated_soil_type"),
  climateZone: text("climate_zone"),
  // Step 2 — Machinery & Infrastructure
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
