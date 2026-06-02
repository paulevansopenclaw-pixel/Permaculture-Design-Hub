import { Router, type IRouter, type Request, type Response } from "express";
import ogImage from "../assets/opengraph.jpg";
import { renderBrandedHtml } from "../lib/brandedHtml";

const router: IRouter = Router();

const ogImageBuffer = Buffer.from(ogImage, "base64");

/** Absolute URL to the Pattern share image served by this API. */
function ogImageUrl(req: Request): string {
  const proto = req.protocol;
  const host = req.get("host") ?? "";
  return `${proto}://${host}/api/og-image.jpg`;
}

/**
 * GET /og-image.jpg
 * Serve the Pattern Open Graph share image so API-served HTML can reference a
 * branded preview without depending on the frontend bundle.
 */
router.get("/og-image.jpg", (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(ogImageBuffer);
});

/**
 * GET /
 * Branded landing page for the API base URL. Carries the Pattern Open Graph
 * preview so shared API links unfurl with the Pattern logo.
 */
router.get("/", (req: Request, res: Response) => {
  const proto = req.protocol;
  const host = req.get("host") ?? "";
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(
    renderBrandedHtml({
      ogImageUrl: ogImageUrl(req),
      pageUrl: `${proto}://${host}/api`,
    }),
  );
});

export default router;
