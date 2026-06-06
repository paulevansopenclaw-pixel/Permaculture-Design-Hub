import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, sensoryVectorsTable } from "@workspace/db";
import {
  ListSensoryVectorsParams,
  CreateSensoryVectorParams,
  CreateSensoryVectorBody,
  DeleteSensoryVectorParams,
} from "@workspace/api-zod";
import { requirePropertyOwner } from "../lib/propertyOwnerCheck";

const router: IRouter = Router();

router.get(
  "/properties/:propertyId/sensory-vectors",
  async (req, res): Promise<void> => {
    const params = ListSensoryVectorsParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (!await requirePropertyOwner(req, res, params.data.propertyId)) return;
    const rows = await db
      .select()
      .from(sensoryVectorsTable)
      .where(eq(sensoryVectorsTable.propertyId, params.data.propertyId))
      .orderBy(sensoryVectorsTable.createdAt);
    res.json(rows);
  },
);

router.post(
  "/properties/:propertyId/sensory-vectors",
  async (req, res): Promise<void> => {
    const params = CreateSensoryVectorParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (!await requirePropertyOwner(req, res, params.data.propertyId)) return;
    const body = CreateSensoryVectorBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
    const [row] = await db
      .insert(sensoryVectorsTable)
      .values({
        propertyId: params.data.propertyId,
        vectorType: body.data.vectorType,
        label: body.data.label ?? "",
        geometryType: body.data.geometryType,
        geojsonGeometry: body.data.geojsonGeometry,
      })
      .returning();
    res.status(201).json(row);
  },
);

router.delete(
  "/properties/:propertyId/sensory-vectors/:vectorId",
  async (req, res): Promise<void> => {
    const params = DeleteSensoryVectorParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (!await requirePropertyOwner(req, res, params.data.propertyId)) return;
    await db
      .delete(sensoryVectorsTable)
      .where(and(
        eq(sensoryVectorsTable.id, params.data.vectorId),
        eq(sensoryVectorsTable.propertyId, params.data.propertyId),
      ));
    res.sendStatus(204);
  },
);

export default router;
