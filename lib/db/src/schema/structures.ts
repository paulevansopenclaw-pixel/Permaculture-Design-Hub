import { pgTable, text, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const structuresTable = pgTable("structures", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  propertyId: text("property_id").notNull(),
  lng: real("lng").notNull(),
  lat: real("lat").notNull(),
  label: text("label").notNull(),
  structureType: text("structure_type").notNull().default("other"),
  footprintGeojson: text("footprint_geojson"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertStructureSchema = createInsertSchema(structuresTable).omit({
  id: true,
  createdAt: true,
});

export type InsertStructure = z.infer<typeof insertStructureSchema>;
export type Structure = typeof structuresTable.$inferSelect;
