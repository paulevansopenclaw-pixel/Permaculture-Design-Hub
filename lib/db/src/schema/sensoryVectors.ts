import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const sensoryVectorsTable = pgTable("sensory_vectors", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  propertyId: text("property_id").notNull(),
  vectorType: text("vector_type").notNull().default("road_noise"),
  label: text("label").notNull().default(""),
  geometryType: text("geometry_type").notNull().default("line"),
  geojsonGeometry: text("geojson_geometry").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSensoryVectorSchema = createInsertSchema(sensoryVectorsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertSensoryVector = z.infer<typeof insertSensoryVectorSchema>;
export type SensoryVector = typeof sensoryVectorsTable.$inferSelect;
