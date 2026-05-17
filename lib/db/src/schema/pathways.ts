import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const pathwaysTable = pgTable("pathways", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  propertyId: text("property_id").notNull(),
  label: text("label").notNull(),
  pathwayType: text("pathway_type").notNull().default("footpath"),
  lineGeojson: text("line_geojson").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPathwaySchema = createInsertSchema(pathwaysTable).omit({
  id: true,
  createdAt: true,
});

export type InsertPathway = z.infer<typeof insertPathwaySchema>;
export type Pathway = typeof pathwaysTable.$inferSelect;
