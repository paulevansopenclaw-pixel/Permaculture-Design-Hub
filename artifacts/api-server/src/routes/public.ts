import { Router, type IRouter, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { db, enquiriesTable, propertiesTable, clientBriefsTable } from "@workspace/db";
import {
  RequestPublicUploadUrlBody,
  RequestPublicUploadUrlResponse,
  CreateEnquiryBody,
  GenerateVisionImagesBody,
} from "@workspace/api-zod";
import { ObjectStorageService } from "../lib/objectStorage";

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

// ── Pexels search query library ───────────────────────────────────────────────
const FOOD_QUERIES = [
  "food forest garden", "kitchen garden raised beds", "fruit orchard blossom",
  "permaculture vegetable garden", "backyard food garden harvest",
  "edible landscape garden", "herb garden cottage",
];
const WILDLIFE_QUERIES = [
  "rewilded stream native plants", "wildflower meadow butterflies",
  "wildlife pond garden", "native hedgerow birds",
  "rewilding landscape nature", "native plant garden",
];
const WATER_QUERIES = [
  "rain garden swale landscape", "natural stream garden",
  "terraced garden hillside water", "water harvesting garden",
  "natural pond garden landscape", "rain garden native plants",
];
const RELAX_QUERIES = [
  "permaculture garden retreat hammock", "cottage garden terrace",
  "garden pergola outdoor living", "forest garden path sanctuary",
  "peaceful garden landscape", "natural swimming pond garden",
];

function buildVisionQueries(primaryGoal?: string | null): string[] {
  const g = (primaryGoal ?? "").toLowerCase();
  if (g.includes("food") || g.includes("grow") || g.includes("income")) {
    return [...FOOD_QUERIES, RELAX_QUERIES[0], WATER_QUERIES[0], WILDLIFE_QUERIES[1]];
  }
  if (g.includes("wild") || g.includes("restor") || g.includes("native")) {
    return [...WILDLIFE_QUERIES, WATER_QUERIES[1], FOOD_QUERIES[3], RELAX_QUERIES[3]];
  }
  if (g.includes("water") || g.includes("capture")) {
    return [...WATER_QUERIES, WILDLIFE_QUERIES[1], FOOD_QUERIES[0], RELAX_QUERIES[0]];
  }
  if (g.includes("relax") || g.includes("beautif") || g.includes("place")) {
    return [...RELAX_QUERIES, FOOD_QUERIES[0], WILDLIFE_QUERIES[1], WATER_QUERIES[1]];
  }
  return [
    FOOD_QUERIES[0], WILDLIFE_QUERIES[0], WATER_QUERIES[0], RELAX_QUERIES[0],
    FOOD_QUERIES[2], WILDLIFE_QUERIES[2], WATER_QUERIES[2], RELAX_QUERIES[2],
    FOOD_QUERIES[1], WILDLIFE_QUERIES[1],
  ];
}

interface PexelsPhoto {
  id: number;
  src: { medium: string; large: string };
  photographer: string;
  alt: string;
}

async function fetchPexelsPhotos(query: string, apiKey: string, page = 1): Promise<PexelsPhoto[]> {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=3&page=${page}&orientation=landscape`;
  const res = await fetch(url, { headers: { Authorization: apiKey } });
  if (!res.ok) return [];
  const data = await res.json() as { photos: PexelsPhoto[] };
  return data.photos ?? [];
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
 * Public (no auth). Searches Pexels with goal-tuned queries and returns up to
 * 12 photo URLs instantly — no generation wait.
 *
 * Supports an optional `page` field so the client can request fresh batches.
 *
 * Response: JSON { images: [{ url, thumb, photographer, alt, query }] }
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

    const apiKey = process.env.PEXELS_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "Image search not configured" });
      return;
    }

    const page: number = typeof (req.body as Record<string, unknown>).page === "number"
      ? Math.max(1, (req.body as Record<string, unknown>).page as number)
      : 1;

    const queries = buildVisionQueries(parsed.data.primaryGoal).slice(0, 6);

    const results = await Promise.allSettled(
      queries.map((q) => fetchPexelsPhotos(q, apiKey, page)),
    );

    // One photo per query, deduplicated by Pexels ID
    const seen = new Set<number>();
    const images: { url: string; thumb: string; photographer: string; alt: string; query: string }[] = [];

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status !== "fulfilled") continue;
      for (const photo of r.value) {
        if (seen.has(photo.id)) continue;
        seen.add(photo.id);
        images.push({
          url: photo.src.large,
          thumb: photo.src.medium,
          photographer: photo.photographer,
          alt: photo.alt ?? queries[i],
          query: queries[i],
        });
        break; // one per query keeps variety high
      }
    }

    req.log.info({ count: images.length, page }, "pexels vision images returned");
    res.json({ images });
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
    // Only promote objects whose stored Content-Type is an allowed image type — this
    // prevents an attacker from uploading HTML/JS and then making it publicly readable
    // from the application's own origin via the enquiry flow.
    const ENQUIRY_UPLOAD_RE = /^\/objects\/uploads\/[0-9a-fA-F-]{36}$/;
    const publicPhotos: string[] = [];
    for (const p of photos) {
      if (typeof p !== "string" || !ENQUIRY_UPLOAD_RE.test(p)) continue;
      try {
        const storedContentType = await objectStorageService.getObjectEntityStoredContentType(p);
        if (!storedContentType || !ALLOWED_IMAGE_TYPES.includes(storedContentType)) {
          req.log.warn(
            { objectPath: p, storedContentType },
            "Rejected enquiry photo: stored Content-Type is not an allowed image type",
          );
          continue;
        }
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
