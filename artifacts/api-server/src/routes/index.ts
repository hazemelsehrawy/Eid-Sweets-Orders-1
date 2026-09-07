import { Router, type IRouter } from "express";
import healthRouter from "./health";
import eidSweetsRouter from "./eid-sweets";

const router: IRouter = Router();

router.use(healthRouter);
router.use(eidSweetsRouter);

export default router;
