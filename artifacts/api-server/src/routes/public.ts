import { Router, type IRouter, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { db, enquiriesTable, propertiesTable, clientBriefsTable } from "@workspace/db";
import {
  RequestPublicUploadUrlBody,
  RequestPublicUploadUrlResponse,
  CreateEnquiryBody,
  GenerateVisionImagesBody,
} from "@workspace/api-zod";
import { ObjectStorageService } from "../lib/objectStorage";

const VISION_MODEL = "gemini-2.5-flash-image";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

const MAX_IDEA_PHOTOS = 12;
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
];

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 80,
  standardHeaders: true,
  legacyHeaders: false,
});

const enquiryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

const visionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Vision image prompt library ───────────────────────────────────────────────
const FOOD_PROMPTS = [
  "A lush temperate food forest: apple and pear trees with berry bush understory and shade-tolerant herbs, dappled afternoon sunlight, photorealistic landscape photography",
  "An abundant kitchen garden with raised timber beds overflowing with tomatoes, climbing beans, herbs and sunflowers, golden hour light, wide angle",
  "A thriving orchard with wildflower meadow understory, fruit trees in blossom, a rustic beehive in the background, soft spring light",
  "A diverse forest garden edge with chickens foraging, espaliered fruit on a stone wall, and a vegetable patch, photorealistic",
];
const WILDLIFE_PROMPTS = [
  "A rewilded stream corridor with native riparian plants, stepping stones, and a small cascade, rich biodiversity, photorealistic nature photography",
  "A native wildflower meadow in full bloom with butterflies and bees, golden light, shallow depth of field, photorealistic",
  "A created wildlife pond edged with rushes and aquatic plants, dragonflies skimming the surface, dusk light, serene",
  "A dense native hedgerow with nesting birds, autumn berries, and dew-covered spiderwebs, morning light, photorealistic",
];
const WATER_PROMPTS = [
  "Earthwork swales on contour across a gentle hillside covered in pasture and young trees, after rain, aerial perspective, photorealistic",
  "A rain garden with native plants and a dry creek bed catching and filtering roof runoff, lush and thriving, photorealistic",
  "A restored natural creek with large rocks, deep pools, and overhanging native trees, crystal clear water, photorealistic",
  "Terraced garden beds stepping down a hillside with water channels between them, productive and beautiful, photorealistic landscape",
];
const RELAX_PROMPTS = [
  "A peaceful permaculture retreat with a hammock strung between fruit trees, wildflowers, a fire circle on a summer evening, golden hour, photorealistic",
  "A stone terrace garden with climbing roses, herbs in terracotta pots, and a natural swimming pond beyond, Mediterranean feel, photorealistic",
  "An outdoor living space surrounded by edible landscape — espaliered fruit trees, herb garden, a pergola draped in vines, evening light",
  "A forest garden sanctuary with winding bark chip paths, a natural pond, birdsong, dappled light through the canopy, photorealistic",
];

function buildVisionPrompts(primaryGoal?: string | null): string[] {
  const g = (primaryGoal ?? "").toLowerCase();
  if (g.includes("food") || g.includes("grow") || g.includes("income")) {
    return [
      ...FOOD_PROMPTS,
      RELAX_PROMPTS[0], RELAX_PROMPTS[2],
      WATER_PROMPTS[0], WILDLIFE_PROMPTS[1],
      WILDLIFE_PROMPTS[2], WATER_PROMPTS[3],
    ];
  }
  if (g.includes("wild") || g.includes("restor") || g.includes("native")) {
    return [
      ...WILDLIFE_PROMPTS,
      WATER_PROMPTS[2], WATER_PROMPTS[0],
      FOOD_PROMPTS[3], RELAX_PROMPTS[3],
      WATER_PROMPTS[1], FOOD_PROMPTS[0],
    ];
  }
  if (g.includes("water") || g.includes("capture")) {
    return [
      ...WATER_PROMPTS,
      WILDLIFE_PROMPTS[2], WILDLIFE_PROMPTS[0],
      FOOD_PROMPTS[0], RELAX_PROMPTS[0],
      WILDLIFE_PROMPTS[1], FOOD_PROMPTS[3],
    ];
  }
  if (g.includes("relax") || g.includes("beautif") || g.includes("place")) {
    return [
      ...RELAX_PROMPTS,
      FOOD_PROMPTS[0], FOOD_PROMPTS[2],
      WILDLIFE_PROMPTS[1], WATER_PROMPTS[1],
      WILDLIFE_PROMPTS[3], WATER_PROMPTS[2],
    ];
  }
  // Mixed / undecided — one from each prompt, then fill with variety
  return [
    FOOD_PROMPTS[0], WILDLIFE_PROMPTS[0], WATER_PROMPTS[0], RELAX_PROMPTS[0],
    FOOD_PROMPTS[2], WILDLIFE_PROMPTS[2], WATER_PROMPTS[2], RELAX_PROMPTS[2],
    FOOD_PROMPTS[1], WILDLIFE_PROMPTS[1],
  ];
}

/**
 * POST /public/uploads/request-url
 * Public (no auth) presigned upload URL for enquiry idea photos.
 */
router.post(
  "/public/uploads/request-url",
  uploadLimiter,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = RequestPublicUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Missing or invalid required fields" });
      return;
    }
    const { name, size, contentType } = parsed.data;
    if (!ALLOWED_IMAGE_TYPES.includes(contentType)) {
      res.status(400).json({ error: "Only image uploads are allowed" });
      return;
    }
    if (size > MAX_UPLOAD_BYTES) {
      res.status(400).json({ error: "File is too large (max 15MB)" });
      return;
    }
    try {
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      res.json(
        RequestPublicUploadUrlResponse.parse({
          uploadURL,
          objectPath,
          metadata: { name, size, contentType },
        }),
      );
    } catch (error) {
      req.log.error({ err: error }, "Error generating public upload URL");
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  },
);

/**
 * POST /public/vision-images
 * Public (no auth) streaming SSE endpoint — generates 6 permaculture images
 * in parallel and sends each via SSE as soon as Gemini returns it. The client
 * receives images progressively (first appears in ~3–5 s) rather than waiting
 * for the full batch.
 *
 * SSE event format:
 *   data: {"image":{"b64_json":"…","mimeType":"image/png","prompt":"…"}}
 *   data: {"done":true}
 */
router.post(
  "/public/vision-images",
  visionLimiter,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = GenerateVisionImagesBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "Image generation not configured" });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    const prompts = buildVisionPrompts(parsed.data.primaryGoal).slice(0, 6);
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: VISION_MODEL });

    // All 6 kick off simultaneously; each fires an SSE event the moment it resolves.
    await Promise.allSettled(
      prompts.map(async (prompt) => {
        try {
          const result = await model.generateContent([{ text: prompt }]);
          const parts = result.response.candidates?.[0]?.content?.parts ?? [];
          for (const part of parts) {
            const inline = part.inlineData;
            if (inline?.data) {
              send({ image: { b64_json: inline.data, mimeType: inline.mimeType ?? "image/png", prompt } });
              return;
            }
          }
        } catch {
          // Skip failed image silently — remaining images still stream through.
        }
      }),
    );

    req.log.info({ count: prompts.length }, "vision images streamed");
    send({ done: true });
    res.end();
  },
);

/**
 * POST /public/enquiries
 * Public (no auth) client enquiry submission. Auto-creates a site tile
 * (unassigned property + client brief) plus an enquiry lead record.
 */
router.post(
  "/public/enquiries",
  enquiryLimiter,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = CreateEnquiryBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const d = parsed.data;

    const photos = (d.ideaPhotos ?? []).slice(0, MAX_IDEA_PHOTOS);
    // Mark uploaded idea photos public-read so the authenticated designer can view them.
    const ENQUIRY_UPLOAD_RE = /^\/objects\/uploads\/[0-9a-fA-F-]{36}$/;
    const publicPhotos: string[] = [];
    for (const p of photos) {
      if (typeof p !== "string" || !ENQUIRY_UPLOAD_RE.test(p)) continue;
      try {
        const normalized = await objectStorageService.trySetObjectEntityAclPolicy(p, {
          owner: "",
          visibility: "public",
        });
        publicPhotos.push(normalized);
      } catch (error) {
        req.log.warn({ err: error, objectPath: p }, "Could not set ACL on enquiry photo");
      }
    }

    // AI-selected vision images arrive as base64 strings; store as data URLs.
    const aiImages = (d.ideaImagesBase64 ?? [])
      .slice(0, MAX_IDEA_PHOTOS)
      .map((b64) => (b64.startsWith("data:") ? b64 : `data:image/png;base64,${b64}`));

    const allMoodImages = [...publicPhotos, ...aiImages];

    const propertyName = d.address?.trim() || `${d.name}'s property`;

    try {
      const [property] = await db
        .insert(propertiesTable)
        .values({
          ownerId: null,
          name: propertyName,
          status: "enquiry",
          tileImage: aiImages[0] ?? publicPhotos[0] ?? null,
        })
        .returning();

      await db.insert(clientBriefsTable).values({
        propertyId: property.id,
        primaryGoal: d.primaryGoal ?? null,
        maintenanceCapacity: d.maintenanceCapacity ?? null,
        householdSize: d.householdSize ?? null,
        annualRainfallMm: d.annualRainfallMm ?? null,
        estimatedSoilType: d.estimatedSoilType ?? null,
        climateZone: d.climateZone ?? null,
        moodBoardImages: allMoodImages.length ? JSON.stringify(allMoodImages) : null,
      });

      const [enquiry] = await db
        .insert(enquiriesTable)
        .values({
          name: d.name,
          email: d.email,
          address: d.address,
          latitude: d.latitude ?? null,
          longitude: d.longitude ?? null,
          roughSize: d.roughSize ?? null,
          message: d.message ?? null,
          propertyId: property.id,
        })
        .returning();

      res.status(201).json({ enquiryId: enquiry.id, propertyId: property.id });
    } catch (error) {
      req.log.error({ err: error }, "Error creating enquiry");
      res.status(500).json({ error: "Failed to submit enquiry" });
    }
  },
);

export default router;
