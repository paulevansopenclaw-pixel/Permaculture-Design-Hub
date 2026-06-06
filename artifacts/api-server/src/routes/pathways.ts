import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, pathwaysTable } from "@workspace/db";
import {
  ListPathwaysParams,
  CreatePathwayParams,
  CreatePathwayBody,
  DeletePathwayParams,
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
    const [pathway] = await db
      .insert(pathwaysTable)
      .values({ propertyId: params.data.propertyId, ...parsed.data })
      .returning();
    res.status(201).json(pathway);
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
