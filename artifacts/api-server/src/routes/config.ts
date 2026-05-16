import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.get("/config", (_req, res): void => {
  res.json({
    mapboxToken: process.env.MAPBOX_PUBLIC_KEY ?? "",
  });
});

export default router;
