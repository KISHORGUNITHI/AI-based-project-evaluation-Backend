import express, { type Router } from "express";
import StudentDashboardController from "../controllers/studentdashboardcontroller.js";
import { requireRole } from "../../../middlewares/auth.js";

const studentDashboardRouter: Router = express.Router();
const ctrl = new StudentDashboardController();

// All routes require STUDENT role
studentDashboardRouter.use(requireRole("STUDENT"));

/**
 * @openapi
 * tags:
 *   name: Student Dashboard
 *   description: Student-specific views — stats, teams, projects, submissions, and evaluations
 */

/**
 * @openapi
 * /api/student/dashboard:
 *   get:
 *     summary: Student dashboard overview
 *     description: Returns counts of teams, projects, submissions and evaluation statuses for the authenticated student.
 *     tags: [Student Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard stats
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalTeams:
 *                   type: integer
 *                 totalProjects:
 *                   type: integer
 *                 totalSubmissions:
 *                   type: integer
 *                 evaluations:
 *                   type: object
 *                   properties:
 *                     pending:
 *                       type: integer
 *                     aiEvaluating:
 *                       type: integer
 *                     aiCompleted:
 *                       type: integer
 *                     judgeEvaluating:
 *                       type: integer
 *                     completed:
 *                       type: integer
 */
studentDashboardRouter.get("/dashboard", ctrl.getDashboard);

/**
 * @openapi
 * /api/student/my-teams:
 *   get:
 *     summary: Get all teams the student belongs to
 *     description: Returns teams where the student is a creator, leader, or member — with members and project list.
 *     tags: [Student Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of teams
 */
studentDashboardRouter.get("/my-teams", ctrl.getMyTeams);

/**
 * @openapi
 * /api/student/my-projects:
 *   get:
 *     summary: Get all projects from the student's teams
 *     description: Returns each project with its team, latest submission, and latest evaluation result.
 *     tags: [Student Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of projects
 */
studentDashboardRouter.get("/my-projects", ctrl.getMyProjects);

/**
 * @openapi
 * /api/student/my-submissions:
 *   get:
 *     summary: Get all submissions from the student's teams
 *     description: Returns every submission version across all team projects, with evaluation scores attached.
 *     tags: [Student Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of submissions
 */
studentDashboardRouter.get("/my-submissions", ctrl.getMySubmissions);

/**
 * @openapi
 * /api/student/my-evaluations:
 *   get:
 *     summary: Get all evaluations for the student's projects
 *     description: Returns evaluations with aiScore, judgeScore, finalScore, feedback and judge info.
 *     tags: [Student Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of evaluations
 */
studentDashboardRouter.get("/my-evaluations", ctrl.getMyEvaluations);

/**
 * @openapi
 * /api/student/my-projects/{projectId}:
 *   get:
 *     summary: Get full detail for a specific project
 *     description: Returns the project with all submission versions, each submission's evaluation, and team members.
 *     tags: [Student Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Project detail
 *       400:
 *         description: Project not found or access denied
 */
studentDashboardRouter.get("/my-projects/:projectId", ctrl.getProjectDetail);

export default studentDashboardRouter;
