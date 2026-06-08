import { Router, type IRouter } from "express";
import { eq, and, or, isNull } from "drizzle-orm";
import { db, propertiesTable, commentsTable } from "@workspace/db";
import {
  CreatePropertyBody,
  GetPropertyParams,
  UpdatePropertyParams,
  UpdatePropertyBody,
  DeletePropertyParams,
  GetPropertyStatsParams,
  ClaimPropertyParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function serializeProperty(p: typeof propertiesTable.$inferSelect) {
  return {
    ...p,
    boundaryGeojson: p.boundaryGeojson ? JSON.parse(p.boundaryGeojson) : null,
    spatialRecommendations: p.spatialRecommendations ? JSON.parse(p.spatialRecommendations) : null,
  };
}

router.get("/properties", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  // All authenticated users are designers in this studio — they see their own
  // properties plus any unclaimed enquiry leads in the shared inbox.
  const whereClause = or(
    eq(propertiesTable.ownerId, req.user.id),
    and(isNull(propertiesTable.ownerId), eq(propertiesTable.status, "enquiry")),
  );
  const rows = await db
    .select()
    .from(propertiesTable)
    .where(whereClause)
    .orderBy(propertiesTable.createdAt);
  res.json(rows.map(serializeProperty));
});

router.post("/properties", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = CreatePropertyBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { boundaryGeojson, ...rest } = parsed.data;
  const [property] = await db
    .insert(propertiesTable)
    .values({ ...rest, ownerId: req.user.id, boundaryGeojson: boundaryGeojson ? JSON.stringify(boundaryGeojson) : null })
    .returning();
  res.status(201).json(serializeProperty(property));
});

router.get("/properties/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const params = GetPropertyParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [property] = await db
    .select()
    .from(propertiesTable)
    .where(and(eq(propertiesTable.id, params.data.id), eq(propertiesTable.ownerId, req.user.id)));
  if (!property) { res.status(404).json({ error: "Property not found" }); return; }
  res.json(serializeProperty(property));
});

router.put("/properties/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const params = UpdatePropertyParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdatePropertyBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { boundaryGeojson, ...rest } = parsed.data;
  const updateData: Record<string, unknown> = { ...rest };
  if (boundaryGeojson !== undefined) {
    updateData.boundaryGeojson = boundaryGeojson ? JSON.stringify(boundaryGeojson) : null;
  }
  const [property] = await db
    .update(propertiesTable)
    .set(updateData)
    .where(and(eq(propertiesTable.id, params.data.id), eq(propertiesTable.ownerId, req.user.id)))
    .returning();
  if (!property) { res.status(404).json({ error: "Property not found" }); return; }
  res.json(serializeProperty(property));
});

router.delete("/properties/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const params = DeletePropertyParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.delete(propertiesTable)
    .where(and(eq(propertiesTable.id, params.data.id), eq(propertiesTable.ownerId, req.user.id)));
  res.sendStatus(204);
});

router.post("/properties/:id/claim", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const params = ClaimPropertyParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [claimed] = await db
    .update(propertiesTable)
    .set({ ownerId: req.user.id, status: "active" })
    .where(and(eq(propertiesTable.id, params.data.id), isNull(propertiesTable.ownerId)))
    .returning();
  if (claimed) { res.json(serializeProperty(claimed)); return; }
  // Already claimed — return it if it belongs to this designer, else 404.
  const [existing] = await db
    .select()
    .from(propertiesTable)
    .where(and(eq(propertiesTable.id, params.data.id), eq(propertiesTable.ownerId, req.user.id)));
  if (!existing) { res.status(404).json({ error: "Property not found" }); return; }
  res.json(serializeProperty(existing));
});

router.get("/properties/:id/stats", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const params = GetPropertyStatsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [property] = await db
    .select()
    .from(propertiesTable)
    .where(and(eq(propertiesTable.id, params.data.id), eq(propertiesTable.ownerId, req.user.id)));
  if (!property) { res.status(404).json({ error: "Property not found" }); return; }
  const commentRows = await db.select().from(commentsTable).where(eq(commentsTable.propertyId, params.data.id));
  res.json({ propertyId: params.data.id, areaHectares: property.areaHectares ?? null, areaAcres: property.areaAcres ?? null, commentCount: commentRows.length });
});

export default router;
