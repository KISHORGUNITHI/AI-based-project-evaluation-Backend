import express, { type Router } from "express";
import AnalyticsController from "../controllers/analyticscontroller.js";
import { requireRole } from "../../../middlewares/auth.js";

const analyticsRouter: Router = express.Router();

const analyticsController = new AnalyticsController();

// Only ADMIN users can access analytics
analyticsRouter.use(requireRole("ADMIN"));

analyticsRouter.get(
    "/summary",
    analyticsController.getSummary
);

export default analyticsRouter;