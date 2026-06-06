import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, clientBriefsTable } from "@workspace/db";
import {
  GetClientBriefParams,
  UpsertClientBriefParams,
  UpsertClientBriefBody,
} from "@workspace/api-zod";
import { requirePropertyOwner } from "../lib/propertyOwnerCheck";

const router: IRouter = Router();

function parseJsonCol(val: string | null | undefined): string[] | null {
  if (!val) return null;
  try { return JSON.parse(val) as string[]; } catch { return null; }
}

router.get(
  "/properties/:propertyId/client-brief",
  async (req, res): Promise<void> => {
    const params = GetClientBriefParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (!await requirePropertyOwner(req, res, params.data.propertyId)) return;
    const [row] = await db
      .select()
      .from(clientBriefsTable)
      .where(eq(clientBriefsTable.propertyId, params.data.propertyId));
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json({
      ...row,
      moodBoardImages: parseJsonCol(row.moodBoardImages),
      conceptRenders: parseJsonCol(row.conceptRenders),
    });
  },
);

router.put(
  "/properties/:propertyId/client-brief",
  async (req, res): Promise<void> => {
    const params = UpsertClientBriefParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (!await requirePropertyOwner(req, res, params.data.propertyId)) return;
    const parsed = UpsertClientBriefBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const { moodBoardImages, conceptRenders, ...rest } = parsed.data;
    const dbData: Record<string, unknown> = { ...rest };
    if (moodBoardImages !== undefined) {
      dbData.moodBoardImages = moodBoardImages != null ? JSON.stringify(moodBoardImages) : null;
    }
    if (conceptRenders !== undefined) {
      dbData.conceptRenders = conceptRenders != null ? JSON.stringify(conceptRenders) : null;
    }

    const [row] = await db
      .insert(clientBriefsTable)
      .values({ propertyId: params.data.propertyId, ...dbData })
      .onConflictDoUpdate({
        target: clientBriefsTable.propertyId,
        set: { ...dbData, updatedAt: new Date() },
      })
      .returning();
    res.json({
      ...row,
      moodBoardImages: parseJsonCol(row.moodBoardImages),
      conceptRenders: parseJsonCol(row.conceptRenders),
    });
  },
);

export default router;
