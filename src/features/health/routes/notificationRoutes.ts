import express, { type Router } from "express";
import NotificationController from "../controllers/notificationcontroller.js";
import { requireLogin } from "../../../middlewares/auth.js";

const notificationRouter: Router = express.Router();

const notificationController = new NotificationController();

// All notification routes require login
notificationRouter.use(requireLogin);

notificationRouter.get(
    "/",
    notificationController.getNotifications
);

// IMPORTANT: /read-all MUST come before /:id/read — otherwise Express
// matches "read-all" as the :id parameter and calls markRead instead.
notificationRouter.patch(
    "/read-all",
    notificationController.markAllRead
);

notificationRouter.patch(
    "/:id/read",
    notificationController.markRead
);

export default notificationRouter;