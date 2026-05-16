import { Router, type IRouter } from "express";
import healthRouter from "./health";
import propertiesRouter from "./properties";
import commentsRouter from "./comments";
import configRouter from "./config";

const router: IRouter = Router();

router.use(healthRouter);
router.use(configRouter);
router.use(propertiesRouter);
router.use(commentsRouter);

export default router;
