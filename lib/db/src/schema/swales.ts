import { pgTable, text, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const designedSwalesTable = pgTable("designed_swales", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  propertyId: text("property_id").notNull(),
  name: text("name").notNull(),
  geojsonLinestring: text("geojson_linestring").notNull(),
  elevationM: real("elevation_m").notNull(),
  lengthM: real("length_m").notNull(),
  swaleType: text("swale_type").notNull().default("custom"),
  notes: text("notes").notNull().default(""),
  tags: text("tags"),
  ecologicalNotes: text("ecological_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDesignedSwaleSchema = createInsertSchema(designedSwalesTable).omit({
  id: true,
  createdAt: true,
});

export type InsertDesignedSwale = z.infer<typeof insertDesignedSwaleSchema>;
export type DesignedSwale = typeof designedSwalesTable.$inferSelect;
