import express, { type Router } from "express";
import AdminController from "../controllers/admincontroller.js";
import { requireRole } from "../../../middlewares/auth.js";

const adminRouter: Router = express.Router();
const adminController = new AdminController();

// All admin routes require ADMIN role
adminRouter.use(requireRole("ADMIN"));

// Dashboard stats
adminRouter.get("/dashboard", adminController.getDashboardStats);

// Users
adminRouter.get("/users", adminController.getUsers);
adminRouter.get("/users/:id", adminController.getUserById);
adminRouter.patch("/users/:id", adminController.updateUser);
adminRouter.patch("/users/:id/deactivate", adminController.deactivateUser);

// Projects pipeline
adminRouter.get("/projects", adminController.getProjectsPipeline);
adminRouter.get("/projects/:id", adminController.getProjectDetail);

// Judges management + list (for assign-judge dropdown)
adminRouter.get("/judges", adminController.getJudgesList);
adminRouter.post("/judges", adminController.createJudge);
adminRouter.delete("/judges/:userId", adminController.deleteJudge);

// Leaderboard with scores
adminRouter.get("/leaderboard", adminController.getLeaderboard);

// Activity log
adminRouter.get("/activity", adminController.getActivityLog);

export default adminRouter;
