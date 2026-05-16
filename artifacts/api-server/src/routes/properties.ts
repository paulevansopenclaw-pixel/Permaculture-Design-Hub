import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, propertiesTable, commentsTable } from "@workspace/db";
import {
  CreatePropertyBody,
  GetPropertyParams,
  UpdatePropertyParams,
  UpdatePropertyBody,
  DeletePropertyParams,
  GetPropertyStatsParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/properties", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(propertiesTable)
    .orderBy(propertiesTable.createdAt);
  res.json(
    rows.map((p) => ({
      ...p,
      boundaryGeojson: p.boundaryGeojson ? JSON.parse(p.boundaryGeojson) : null,
    })),
  );
});

router.post("/properties", async (req, res): Promise<void> => {
  const parsed = CreatePropertyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { boundaryGeojson, ...rest } = parsed.data;
  const [property] = await db
    .insert(propertiesTable)
    .values({
      ...rest,
      boundaryGeojson: boundaryGeojson ? JSON.stringify(boundaryGeojson) : null,
    })
    .returning();
  res.status(201).json({
    ...property,
    boundaryGeojson: property.boundaryGeojson
      ? JSON.parse(property.boundaryGeojson)
      : null,
  });
});

router.get("/properties/:id", async (req, res): Promise<void> => {
  const params = GetPropertyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [property] = await db
    .select()
    .from(propertiesTable)
    .where(eq(propertiesTable.id, params.data.id));
  if (!property) {
    res.status(404).json({ error: "Property not found" });
    return;
  }
  res.json({
    ...property,
    boundaryGeojson: property.boundaryGeojson
      ? JSON.parse(property.boundaryGeojson)
      : null,
  });
});

router.put("/properties/:id", async (req, res): Promise<void> => {
  const params = UpdatePropertyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdatePropertyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { boundaryGeojson, ...rest } = parsed.data;
  const updateData: Record<string, unknown> = { ...rest };
  if (boundaryGeojson !== undefined) {
    updateData.boundaryGeojson = boundaryGeojson
      ? JSON.stringify(boundaryGeojson)
      : null;
  }
  const [property] = await db
    .update(propertiesTable)
    .set(updateData)
    .where(eq(propertiesTable.id, params.data.id))
    .returning();
  if (!property) {
    res.status(404).json({ error: "Property not found" });
    return;
  }
  res.json({
    ...property,
    boundaryGeojson: property.boundaryGeojson
      ? JSON.parse(property.boundaryGeojson)
      : null,
  });
});

router.delete("/properties/:id", async (req, res): Promise<void> => {
  const params = DeletePropertyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db
    .delete(propertiesTable)
    .where(eq(propertiesTable.id, params.data.id));
  res.sendStatus(204);
});

router.get("/properties/:id/stats", async (req, res): Promise<void> => {
  const params = GetPropertyStatsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [property] = await db
    .select()
    .from(propertiesTable)
    .where(eq(propertiesTable.id, params.data.id));
  if (!property) {
    res.status(404).json({ error: "Property not found" });
    return;
  }
  const commentRows = await db
    .select()
    .from(commentsTable)
    .where(eq(commentsTable.propertyId, params.data.id));
  res.json({
    propertyId: params.data.id,
    areaHectares: property.areaHectares ?? null,
    areaAcres: property.areaAcres ?? null,
    commentCount: commentRows.length,
  });
});

export default router;
