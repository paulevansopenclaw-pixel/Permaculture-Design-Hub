import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const planRendersTable = pgTable(
  "plan_renders",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    propertyId: text("property_id").notNull(),
    layerKey: text("layer_key").notNull(),
    style: text("style").notNull().default("concept"),
    objectPath: text("object_path").notNull(),
    prompt: text("prompt"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("plan_renders_property_layer_style").on(t.propertyId, t.layerKey, t.style)],
);

export const insertPlanRenderSchema = createInsertSchema(planRendersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPlanRender = z.infer<typeof insertPlanRenderSchema>;
export type PlanRender = typeof planRendersTable.$inferSelect;
