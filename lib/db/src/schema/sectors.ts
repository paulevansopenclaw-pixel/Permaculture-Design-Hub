import { pgTable, text, timestamp, real, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const sectorsTable = pgTable("sectors", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  propertyId: text("property_id").notNull(),
  sectorType: text("sector_type").notNull().default("custom_view"),
  centerLng: real("center_lng").notNull(),
  centerLat: real("center_lat").notNull(),
  radiusKm: real("radius_km").notNull().default(0.5),
  startAngle: integer("start_angle").notNull().default(0),
  endAngle: integer("end_angle").notNull().default(90),
  label: text("label").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSectorSchema = createInsertSchema(sectorsTable).omit({
  id: true,
  createdAt: true,
});

export const updateSectorSchema = insertSectorSchema.partial().omit({ propertyId: true });

export type InsertSector = z.infer<typeof insertSectorSchema>;
export type Sector = typeof sectorsTable.$inferSelect;
