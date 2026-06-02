import { pgTable, text, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const enquiriesTable = pgTable("enquiries", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  // Contact details from the public enquiry form
  name: text("name").notNull(),
  email: text("email").notNull(),
  address: text("address").notNull(),
  latitude: real("latitude"),
  longitude: real("longitude"),
  roughSize: text("rough_size"),
  message: text("message"),
  // Lead lifecycle: 'new' -> 'reviewed' -> 'converted'
  status: text("status").notNull().default("new"),
  // The site tile (property) auto-created from this enquiry
  propertyId: text("property_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertEnquirySchema = createInsertSchema(enquiriesTable).omit({
  id: true,
  status: true,
  propertyId: true,
  createdAt: true,
});

export type InsertEnquiry = z.infer<typeof insertEnquirySchema>;
export type Enquiry = typeof enquiriesTable.$inferSelect;
