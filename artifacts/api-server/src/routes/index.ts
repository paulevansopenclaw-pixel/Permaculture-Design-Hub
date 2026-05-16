import { Router, type IRouter } from "express";
import healthRouter from "./health";
import propertiesRouter from "./properties";
import commentsRouter from "./comments";

const router: IRouter = Router();

router.use(healthRouter);
router.use(propertiesRouter);
router.use(commentsRouter);

export default router;
