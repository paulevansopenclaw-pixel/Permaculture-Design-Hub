import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, commentsTable } from "@workspace/db";
import {
  ListCommentsParams,
  CreateCommentParams,
  CreateCommentBody,
  DeleteCommentParams,
} from "@workspace/api-zod";
import { requirePropertyOwner } from "../lib/propertyOwnerCheck";

const router: IRouter = Router();

router.get(
  "/properties/:propertyId/comments",
  async (req, res): Promise<void> => {
    const params = ListCommentsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!await requirePropertyOwner(req, res, params.data.propertyId)) return;
    const rows = await db
      .select()
      .from(commentsTable)
      .where(eq(commentsTable.propertyId, params.data.propertyId))
      .orderBy(commentsTable.createdAt);
    res.json(rows);
  },
);

router.post(
  "/properties/:propertyId/comments",
  async (req, res): Promise<void> => {
    const params = CreateCommentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!await requirePropertyOwner(req, res, params.data.propertyId)) return;
    const parsed = CreateCommentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [comment] = await db
      .insert(commentsTable)
      .values({
        propertyId: params.data.propertyId,
        ...parsed.data,
      })
      .returning();
    res.status(201).json(comment);
  },
);

router.delete(
  "/properties/:propertyId/comments/:commentId",
  async (req, res): Promise<void> => {
    const params = DeleteCommentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!await requirePropertyOwner(req, res, params.data.propertyId)) return;
    await db
      .delete(commentsTable)
      .where(
        and(
          eq(commentsTable.id, params.data.commentId),
          eq(commentsTable.propertyId, params.data.propertyId),
        ),
      );
    res.sendStatus(204);
  },
);

export default router;
