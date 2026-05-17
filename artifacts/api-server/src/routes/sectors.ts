import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, sectorsTable } from "@workspace/db";
import {
  ListSectorsParams,
  CreateSectorParams,
  CreateSectorBody,
  UpdateSectorParams,
  UpdateSectorBody,
  DeleteSectorParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get(
  "/properties/:propertyId/sectors",
  async (req, res): Promise<void> => {
    const params = ListSectorsParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    const rows = await db
      .select()
      .from(sectorsTable)
      .where(eq(sectorsTable.propertyId, params.data.propertyId))
      .orderBy(sectorsTable.createdAt);
    res.json(rows);
  },
);

router.post(
  "/properties/:propertyId/sectors",
  async (req, res): Promise<void> => {
    const params = CreateSectorParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    const parsed = CreateSectorBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const [sector] = await db
      .insert(sectorsTable)
      .values({ propertyId: params.data.propertyId, ...parsed.data })
      .returning();
    res.status(201).json(sector);
  },
);

router.patch(
  "/properties/:propertyId/sectors/:sectorId",
  async (req, res): Promise<void> => {
    const params = UpdateSectorParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    const parsed = UpdateSectorBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const [updated] = await db
      .update(sectorsTable)
      .set(parsed.data)
      .where(and(eq(sectorsTable.id, params.data.sectorId), eq(sectorsTable.propertyId, params.data.propertyId)))
      .returning();
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    res.json(updated);
  },
);

router.delete(
  "/properties/:propertyId/sectors/:sectorId",
  async (req, res): Promise<void> => {
    const params = DeleteSectorParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    await db
      .delete(sectorsTable)
      .where(and(eq(sectorsTable.id, params.data.sectorId), eq(sectorsTable.propertyId, params.data.propertyId)));
    res.sendStatus(204);
  },
);

export default router;
