import { Router, type IRouter } from "express";
import healthRouter from "./health";
import propertiesRouter from "./properties";
import commentsRouter from "./comments";
import structuresRouter from "./structures";
import configRouter from "./config";

const router: IRouter = Router();

router.use(healthRouter);
router.use(configRouter);
router.use(propertiesRouter);
router.use(commentsRouter);
router.use(structuresRouter);

export default router;
