import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { eq, and } from "drizzle-orm";
import { db, propertiesTable, planRendersTable } from "@workspace/db";
import { GenerateConceptRenderBody } from "@workspace/api-zod";
import { ObjectStorageService } from "../lib/objectStorage";
import { restylePlate } from "../lib/conceptImage";

const router: IRouter = Router();
const storage = new ObjectStorageService();

const conceptLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  // Auth-gated route: rate-limit per user, not per IP. This also avoids the
  // X-Forwarded-For / trust-proxy validation since we never key off req.ip.
  keyGenerator: (req) => req.user?.id ?? "anonymous",
  validate: { xForwardedForHeader: false },
});

const BASE_PROMPT =
  "You are a master landscape illustrator. Repaint this technical permaculture " +
  "site plan as a warm, hand-drawn watercolour-and-ink concept illustration on " +
  "textured paper. Keep the EXACT same geometry, spatial layout, proportions, and " +
  "positions of every shape, line, and label region — do not move, add, or remove " +
  "any element. Preserve the north-up orientation and overall composition. Render " +
  "it as a presentation-quality bird's-eye design rendering with soft natural " +
  "colour, subtle shading, and gentle texture, while remaining clearly readable " +
  "as a site plan.";

const LAYER_DIRECTION: Record<string, string> = {
  boundary: "Emphasise the property outline as a confident inked survey line on parchment.",
  water: "Render contour lines as flowing topographic shading; paint swales and dams as glistening blue water features following the land's curves.",
  zones: "Fill the permaculture zones with distinct, harmonious garden colours — lush greens, orchard tones, and pasture hues — suggesting planting density from intensive (Zone 1) to wild (Zone 5).",
  sectors: "Paint the sun, wind, noise, and view sectors as soft translucent wedges of coloured light radiating from their origin points.",
  structures: "Illustrate buildings, tanks, and access paths as charming top-down architectural sketches with light shadows.",
  composite: "Blend all design layers into one cohesive, beautifully illustrated masterplan.",
  soil: "Render the soil profile plate as an earthy, textured geological illustration with warm sediment tones and a clear horizon column.",
};

router.post(
  "/properties/:propertyId/concept-render",
  conceptLimiter,
  async (req, res) => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const propertyId = req.params.propertyId as string;
    const parsed = GenerateConceptRenderBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Missing or invalid required fields" });
      return;
    }

    const [property] = await db
      .select()
      .from(propertiesTable)
      .where(and(eq(propertiesTable.id, propertyId), eq(propertiesTable.ownerId, req.user.id)))
      .limit(1);
    if (!property) {
      res.status(404).json({ error: "Property not found" });
      return;
    }

    const { layerKey, plateImage } = parsed.data;
    const sourceHash = parsed.data.sourceHash?.trim() || null;
    const style = parsed.data.style?.trim() || "concept";
    const direction = LAYER_DIRECTION[layerKey] ?? LAYER_DIRECTION.composite;
    const extra = parsed.data.prompt?.trim();
    const prompt = [BASE_PROMPT, direction, extra].filter(Boolean).join("\n\n");

    let buffer: Buffer;
    try {
      const out = await restylePlate(plateImage, prompt);
      buffer = out.buffer;
    } catch (error) {
      req.log.error({ err: error, propertyId, layerKey }, "concept render failed");
      res.status(500).json({ error: "Concept render failed" });
      return;
    }

    let objectPath: string;
    try {
      objectPath = await storage.uploadObjectEntity(
        `plan-renders/${propertyId}/${layerKey}-${style}.png`,
        buffer,
        "image/png",
      );
    } catch (error) {
      req.log.error({ err: error, propertyId, layerKey }, "concept render upload failed");
      res.status(500).json({ error: "Failed to store render" });
      return;
    }

    const now = new Date();
    const [row] = await db
      .insert(planRendersTable)
      .values({ propertyId, layerKey, style, objectPath, prompt, sourceHash })
      .onConflictDoUpdate({
        target: [planRendersTable.propertyId, planRendersTable.layerKey, planRendersTable.style],
        set: { objectPath, prompt, sourceHash, updatedAt: now },
      })
      .returning();

    res.json({
      id: row.id,
      propertyId: row.propertyId,
      layerKey: row.layerKey,
      style: row.style,
      objectPath: row.objectPath,
      url: `/api/storage${row.objectPath}`,
      prompt: row.prompt,
      sourceHash: row.sourceHash,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    });
  },
);

router.get("/properties/:propertyId/plan-renders", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const propertyId = req.params.propertyId as string;
  const [property] = await db
    .select({ id: propertiesTable.id })
    .from(propertiesTable)
    .where(and(eq(propertiesTable.id, propertyId), eq(propertiesTable.ownerId, req.user.id)))
    .limit(1);
  if (!property) {
    res.status(404).json({ error: "Property not found" });
    return;
  }
  const rows = await db
    .select()
    .from(planRendersTable)
    .where(eq(planRendersTable.propertyId, propertyId));
  res.json(
    rows.map((row) => ({
      id: row.id,
      propertyId: row.propertyId,
      layerKey: row.layerKey,
      style: row.style,
      objectPath: row.objectPath,
      url: `/api/storage${row.objectPath}`,
      prompt: row.prompt,
      sourceHash: row.sourceHash,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
  );
});

export default router;
