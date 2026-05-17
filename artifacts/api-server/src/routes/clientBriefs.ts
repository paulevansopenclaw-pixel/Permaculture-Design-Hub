import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, clientBriefsTable } from "@workspace/db";
import {
  GetClientBriefParams,
  UpsertClientBriefParams,
  UpsertClientBriefBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get(
  "/properties/:propertyId/client-brief",
  async (req, res): Promise<void> => {
    const params = GetClientBriefParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    const [row] = await db
      .select()
      .from(clientBriefsTable)
      .where(eq(clientBriefsTable.propertyId, params.data.propertyId));
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json(row);
  },
);

router.put(
  "/properties/:propertyId/client-brief",
  async (req, res): Promise<void> => {
    const params = UpsertClientBriefParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    const parsed = UpsertClientBriefBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const [row] = await db
      .insert(clientBriefsTable)
      .values({ propertyId: params.data.propertyId, ...parsed.data })
      .onConflictDoUpdate({
        target: clientBriefsTable.propertyId,
        set: { ...parsed.data, updatedAt: new Date() },
      })
      .returning();
    res.json(row);
  },
);

export default router;
