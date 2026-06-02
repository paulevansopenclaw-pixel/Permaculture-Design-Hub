import { Router, type IRouter, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { db, enquiriesTable, propertiesTable, clientBriefsTable } from "@workspace/db";
import {
  RequestPublicUploadUrlBody,
  RequestPublicUploadUrlResponse,
  CreateEnquiryBody,
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
    //
    // Security: only objects minted by the public upload endpoint are eligible.
    // Those live under the `uploads/<uuid>` prefix with an unguessable UUID. We
    // reject anything else so an anonymous caller cannot flip the ACL of an
    // arbitrary private object (e.g. plan renders) to public.
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

    const propertyName = d.address?.trim() || `${d.name}'s property`;

    try {
      const [property] = await db
        .insert(propertiesTable)
        .values({
          ownerId: null,
          name: propertyName,
          status: "enquiry",
          tileImage: publicPhotos[0] ?? null,
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
        moodBoardImages: publicPhotos.length ? JSON.stringify(publicPhotos) : null,
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
