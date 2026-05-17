import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, designedSwalesTable } from "@workspace/db";
import {
  ListDesignedSwalesParams,
  CreateDesignedSwaleParams,
  CreateDesignedSwaleBody,
  DeleteDesignedSwaleParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get(
  "/properties/:propertyId/swales",
  async (req, res): Promise<void> => {
    const params = ListDesignedSwalesParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
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
    const parsed = CreateDesignedSwaleBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const [row] = await db
      .insert(designedSwalesTable)
      .values({ propertyId: params.data.propertyId, ...parsed.data })
      .returning();
    res.status(201).json(row);
  },
);

router.delete(
  "/properties/:propertyId/swales/:swaleId",
  async (req, res): Promise<void> => {
    const params = DeleteDesignedSwaleParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
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
