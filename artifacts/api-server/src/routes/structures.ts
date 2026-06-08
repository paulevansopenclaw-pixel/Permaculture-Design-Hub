import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, structuresTable } from "@workspace/db";
import {
  ListStructuresParams,
  CreateStructureParams,
  CreateStructureBody,
  DeleteStructureParams,
  UpdateStructureParams,
  UpdateStructureBody,
} from "@workspace/api-zod";
import { requirePropertyOwner } from "../lib/propertyOwnerCheck";

const router: IRouter = Router();

router.get(
  "/properties/:propertyId/structures",
  async (req, res): Promise<void> => {
    const params = ListStructuresParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!await requirePropertyOwner(req, res, params.data.propertyId)) return;
    const rows = await db
      .select()
      .from(structuresTable)
      .where(eq(structuresTable.propertyId, params.data.propertyId))
      .orderBy(structuresTable.createdAt);
    res.json(rows);
  },
);

router.post(
  "/properties/:propertyId/structures",
  async (req, res): Promise<void> => {
    const params = CreateStructureParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!await requirePropertyOwner(req, res, params.data.propertyId)) return;
    const parsed = CreateStructureBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { tags: stTags1, ...stRest1 } = parsed.data;
    const [structure] = await db
      .insert(structuresTable)
      .values({ propertyId: params.data.propertyId, ...stRest1, tags: Array.isArray(stTags1) ? stTags1.join(",") : stTags1 })
      .returning();
    res.status(201).json(structure);
  },
);

router.patch(
  "/properties/:propertyId/structures/:structureId",
  async (req, res): Promise<void> => {
    const params = UpdateStructureParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!await requirePropertyOwner(req, res, params.data.propertyId)) return;
    const parsed = UpdateStructureBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { tags: stTags, ...stRest } = parsed.data;
    const [updated] = await db
      .update(structuresTable)
      .set({ ...stRest, tags: Array.isArray(stTags) ? stTags.join(",") : stTags })
      .where(
        and(
          eq(structuresTable.id, params.data.structureId),
          eq(structuresTable.propertyId, params.data.propertyId),
        ),
      )
      .returning();
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    res.json(updated);
  },
);

router.delete(
  "/properties/:propertyId/structures/:structureId",
  async (req, res): Promise<void> => {
    const params = DeleteStructureParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!await requirePropertyOwner(req, res, params.data.propertyId)) return;
    await db
      .delete(structuresTable)
      .where(
        and(
          eq(structuresTable.id, params.data.structureId),
          eq(structuresTable.propertyId, params.data.propertyId),
        ),
      );
    res.sendStatus(204);
  },
);

export default router;
