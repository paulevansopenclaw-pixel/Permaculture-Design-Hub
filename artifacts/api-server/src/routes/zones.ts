import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, zonesTable } from "@workspace/db";
import {
  ListZonesParams,
  BulkReplaceZonesParams,
  BulkReplaceZonesBody,
  DeleteZoneParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get(
  "/properties/:propertyId/zones",
  async (req, res): Promise<void> => {
    const params = ListZonesParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    const rows = await db
      .select()
      .from(zonesTable)
      .where(eq(zonesTable.propertyId, params.data.propertyId))
      .orderBy(zonesTable.zoneNumber);
    res.json(rows);
  },
);

router.put(
  "/properties/:propertyId/zones",
  async (req, res): Promise<void> => {
    const params = BulkReplaceZonesParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    const body = BulkReplaceZonesBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
    await db.delete(zonesTable).where(eq(zonesTable.propertyId, params.data.propertyId));
    if (body.data.length === 0) { res.json([]); return; }
    const inserted = await db
      .insert(zonesTable)
      .values(body.data.map((z) => ({ propertyId: params.data.propertyId, ...z })))
      .returning();
    res.json(inserted);
  },
);

router.delete(
  "/properties/:propertyId/zones/:zoneId",
  async (req, res): Promise<void> => {
    const params = DeleteZoneParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    await db
      .delete(zonesTable)
      .where(
        and(
          eq(zonesTable.id, params.data.zoneId),
          eq(zonesTable.propertyId, params.data.propertyId),
        ),
      );
    res.sendStatus(204);
  },
);

export default router;
