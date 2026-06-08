import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, designedSwalesTable } from "@workspace/db";
import {
  ListDesignedSwalesParams,
  CreateDesignedSwaleParams,
  CreateDesignedSwaleBody,
  DeleteDesignedSwaleParams,
  UpdateDesignedSwaleParams,
  UpdateDesignedSwaleBody,
} from "@workspace/api-zod";
import { requirePropertyOwner } from "../lib/propertyOwnerCheck";

const router: IRouter = Router();

router.get(
  "/properties/:propertyId/swales",
  async (req, res): Promise<void> => {
    const params = ListDesignedSwalesParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (!await requirePropertyOwner(req, res, params.data.propertyId)) return;
    const rows = await db
      .select()
      .from(designedSwalesTable)
      .where(eq(designedSwalesTable.propertyId, params.data.propertyId))
      .orderBy(designedSwalesTable.createdAt);
    res.json(rows);
  },
);

router.post(
  "/properties/:propertyId/swales",
  async (req, res): Promise<void> => {
    const params = CreateDesignedSwaleParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (!await requirePropertyOwner(req, res, params.data.propertyId)) return;
    const parsed = CreateDesignedSwaleBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const { tags, ...rest } = parsed.data;
    const [row] = await db
      .insert(designedSwalesTable)
      .values({ propertyId: params.data.propertyId, ...rest, tags: Array.isArray(tags) ? tags.join(",") : tags })
      .returning();
    res.status(201).json(row);
  },
);

router.patch(
  "/properties/:propertyId/swales/:swaleId",
  async (req, res): Promise<void> => {
    const params = UpdateDesignedSwaleParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (!await requirePropertyOwner(req, res, params.data.propertyId)) return;
    const parsed = UpdateDesignedSwaleBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const { tags: swTags, ...swRest } = parsed.data;
    const [updated] = await db
      .update(designedSwalesTable)
      .set({ ...swRest, tags: Array.isArray(swTags) ? swTags.join(",") : swTags })
      .where(and(
        eq(designedSwalesTable.id, params.data.swaleId),
        eq(designedSwalesTable.propertyId, params.data.propertyId),
      ))
      .returning();
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    res.json(updated);
  },
);

router.delete(
  "/properties/:propertyId/swales/:swaleId",
  async (req, res): Promise<void> => {
    const params = DeleteDesignedSwaleParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (!await requirePropertyOwner(req, res, params.data.propertyId)) return;
    await db
      .delete(designedSwalesTable)
      .where(and(
        eq(designedSwalesTable.id, params.data.swaleId),
        eq(designedSwalesTable.propertyId, params.data.propertyId),
      ));
    res.sendStatus(204);
  },
);

export default router;
