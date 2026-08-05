import express, { type Router } from "express";
import JudgeDashboardController from "../controllers/judgedashboardcontroller.js";
import { requireRole } from "../../../middlewares/auth.js";

const judgeDashboardRouter: Router = express.Router();
const judgeDashboardController = new JudgeDashboardController();

// All routes require JUDGE role
judgeDashboardRouter.use(requireRole("JUDGE"));

/**
 * @openapi
 * tags:
 *   name: Judge Dashboard
 *   description: Judge-specific views — assigned projects, submissions and evaluation history
 */

/**
 * @openapi
 * /api/judge/dashboard:
 *   get:
 *     summary: Judge dashboard stats
 *     tags: [Judge Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 assignedProjects:
 *                   type: integer
 *                 completedEvaluations:
 *                   type: integer
 *                 pendingEvaluations:
 *                   type: integer
 */
judgeDashboardRouter.get("/dashboard", judgeDashboardController.getDashboard);

/**
 * @openapi
 * /api/judge/assigned-projects:
 *   get:
 *     summary: Compact list of projects assigned to the judge
 *     description: Returns a flat summary — projectId, title, team name, evaluationId, and status.
 *     tags: [Judge Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of assigned projects
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 projects:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       projectId:
 *                         type: string
 *                       title:
 *                         type: string
 *                       team:
 *                         type: string
 *                       evaluationId:
 *                         type: string
 *                       status:
 *                         type: string
 */
judgeDashboardRouter.get("/assigned-projects", judgeDashboardController.getAssignedProjectsSummary);

/**
 * @openapi
 * /api/judge/projects:
 *   get:
 *     summary: Get all projects assigned to the judge (full detail)
 *     tags: [Judge Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of assigned projects with team and submission info
 */
judgeDashboardRouter.get("/projects", judgeDashboardController.getAssignedProjects);

/**
 * @openapi
 * /api/judge/projects/{projectId}:
 *   get:
 *     summary: Get a specific assigned project
 *     tags: [Judge Dashboard]
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
 *         description: Project details
 *       403:
 *         description: Not assigned to this project
 *       404:
 *         description: Project not found
 */
judgeDashboardRouter.get("/projects/:projectId", judgeDashboardController.getAssignedProjectById);

/**
 * @openapi
 * /api/judge/projects/{projectId}/submissions:
 *   get:
 *     summary: Get all submissions for an assigned project
 *     tags: [Judge Dashboard]
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
 *         description: List of submissions
 *       403:
 *         description: Not assigned to this project
 */
judgeDashboardRouter.get("/projects/:projectId/submissions", judgeDashboardController.getSubmissionsByProject);

/**
 * @openapi
 * /api/judge/projects/{projectId}/latest-submission:
 *   get:
 *     summary: Get the latest submission for an assigned project
 *     tags: [Judge Dashboard]
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
 *         description: Latest submission
 *       403:
 *         description: Not assigned to this project
 *       404:
 *         description: No submissions found
 */
judgeDashboardRouter.get("/projects/:projectId/latest-submission", judgeDashboardController.getLatestSubmission);

/**
 * @openapi
 * /api/judge/submissions/{submissionId}:
 *   get:
 *     summary: Get a specific submission
 *     tags: [Judge Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: submissionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Submission details
 *       403:
 *         description: Not assigned to this project
 *       404:
 *         description: Submission not found
 */
judgeDashboardRouter.get("/submissions/:submissionId", judgeDashboardController.getSubmissionById);

/**
 * @openapi
 * /api/judge/evaluations:
 *   get:
 *     summary: Get all evaluations assigned to the judge
 *     tags: [Judge Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of evaluations with scores
 */
judgeDashboardRouter.get("/evaluations", judgeDashboardController.getEvaluations);

/**
 * @openapi
 * /api/judge/evaluations/{id}:
 *   get:
 *     summary: Get a specific evaluation
 *     tags: [Judge Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Evaluation detail
 *       403:
 *         description: Not assigned to this evaluation
 *       404:
 *         description: Not found
 */
judgeDashboardRouter.get("/evaluations/:id", judgeDashboardController.getEvaluationById);

export default judgeDashboardRouter;
