import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, pathwaysTable } from "@workspace/db";
import {
  ListPathwaysParams,
  CreatePathwayParams,
  CreatePathwayBody,
  DeletePathwayParams,
  UpdatePathwayParams,
  UpdatePathwayBody,
} from "@workspace/api-zod";
import { requirePropertyOwner } from "../lib/propertyOwnerCheck";

const router: IRouter = Router();

router.get(
  "/properties/:propertyId/pathways",
  async (req, res): Promise<void> => {
    const params = ListPathwaysParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (!await requirePropertyOwner(req, res, params.data.propertyId)) return;
    const rows = await db
      .select()
      .from(pathwaysTable)
      .where(eq(pathwaysTable.propertyId, params.data.propertyId))
      .orderBy(pathwaysTable.createdAt);
    res.json(rows);
  },
);

router.post(
  "/properties/:propertyId/pathways",
  async (req, res): Promise<void> => {
    const params = CreatePathwayParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (!await requirePropertyOwner(req, res, params.data.propertyId)) return;
    const parsed = CreatePathwayBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const { tags: pTags1, ...pRest1 } = parsed.data;
    const [pathway] = await db
      .insert(pathwaysTable)
      .values({ propertyId: params.data.propertyId, ...pRest1, tags: Array.isArray(pTags1) ? pTags1.join(",") : pTags1 })
      .returning();
    res.status(201).json(pathway);
  },
);

router.patch(
  "/properties/:propertyId/pathways/:pathwayId",
  async (req, res): Promise<void> => {
    const params = UpdatePathwayParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (!await requirePropertyOwner(req, res, params.data.propertyId)) return;
    const parsed = UpdatePathwayBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const { tags: pTags2, ...pRest2 } = parsed.data;
    const [updated] = await db
      .update(pathwaysTable)
      .set({ ...pRest2, tags: Array.isArray(pTags2) ? pTags2.join(",") : pTags2 })
      .where(and(
        eq(pathwaysTable.id, params.data.pathwayId),
        eq(pathwaysTable.propertyId, params.data.propertyId),
      ))
      .returning();
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    res.json(updated);
  },
);

router.delete(
  "/properties/:propertyId/pathways/:pathwayId",
  async (req, res): Promise<void> => {
    const params = DeletePathwayParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (!await requirePropertyOwner(req, res, params.data.propertyId)) return;
    await db
      .delete(pathwaysTable)
      .where(
        and(
          eq(pathwaysTable.id, params.data.pathwayId),
          eq(pathwaysTable.propertyId, params.data.propertyId),
        ),
      );
    res.sendStatus(204);
  },
);

export default router;
