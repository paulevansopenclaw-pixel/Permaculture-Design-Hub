import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const zonesTable = pgTable("zones", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  propertyId: text("property_id").notNull(),
  zoneNumber: integer("zone_number").notNull(),
  zoneGeojson: text("zone_geojson").notNull(),
  tags: text("tags"),
  ecologicalNotes: text("ecological_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertZoneSchema = createInsertSchema(zonesTable).omit({
  id: true,
  createdAt: true,
});

export type InsertZone = z.infer<typeof insertZoneSchema>;
export type Zone = typeof zonesTable.$inferSelect;
