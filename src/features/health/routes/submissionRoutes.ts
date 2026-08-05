import express, { type Router } from "express";
import SubmissionController from "../controllers/submissioncontroller.js";
import { requireLogin, requireRole } from "../../../middlewares/auth.js";

const submissionRouter: Router = express.Router();
const submissionController = new SubmissionController();

/**
 * @openapi
 * tags:
 *   name: Submission
 *   description: Project submission management
 */

import { upload } from "../../../middlewares/upload.js";

/**
 * @openapi
 * /api/submission:
 *   post:
 *     summary: Submit a project
 *     description: Creates a new versioned submission for a project. Only the team leader or creator can submit. Version auto-increments.
 *     tags: [Submission]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               projectId:
 *                 type: string
 *               githubUrl:
 *                 type: string
 *               notes:
 *                 type: string
 *               reportFile:
 *                 type: string
 *                 format: binary
 *               pptFile:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Submission created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Submission created successfully
 *                 submission:
 *                   $ref: '#/components/schemas/Submission'
 *       400:
 *         description: Validation error or insufficient permissions
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Role not STUDENT
 */
submissionRouter.post(
	"/",
	requireRole("STUDENT"),
	upload.fields([
		{ name: "reportFile", maxCount: 1 },
		{ name: "pptFile", maxCount: 1 },
	]),
	submissionController.createSubmission
);

/**
 * @openapi
 * /api/submission/project/{projectId}:
 *   get:
 *     summary: Get all submissions for a project
 *     description: Returns all submission versions for a given project, newest first.
 *     tags: [Submission]
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 submissions:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Submission'
 *       404:
 *         description: Project not found
 *       401:
 *         description: Not authenticated
 */
submissionRouter.get("/project/:projectId", requireLogin, submissionController.getSubmissionsByProject);

/**
 * @openapi
 * /api/submission/project/{projectId}/latest:
 *   get:
 *     summary: Get the latest submission for a project
 *     tags: [Submission]
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 submission:
 *                   $ref: '#/components/schemas/Submission'
 *       404:
 *         description: Project or submission not found
 *       401:
 *         description: Not authenticated
 */
submissionRouter.get("/project/:projectId/latest", requireLogin, submissionController.getLatestSubmission);

/**
 * @openapi
 * /api/submission/{id}:
 *   get:
 *     summary: Get a submission by ID
 *     tags: [Submission]
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
 *         description: Submission found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 submission:
 *                   $ref: '#/components/schemas/Submission'
 *       404:
 *         description: Submission not found
 *       401:
 *         description: Not authenticated
 */
submissionRouter.get("/:id", requireLogin, submissionController.getSubmissionById);

/**
 * @openapi
 * /api/submission/{id}/status:
 *   patch:
 *     summary: Update submission status
 *     description: Updates the status of a submission. Only JUDGE can use this endpoint.
 *     tags: [Submission]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [SUBMITTED, EVALUATING, EVALUATED, REJECTED]
 *     responses:
 *       200:
 *         description: Status updated
 *       400:
 *         description: Invalid status or submission not found
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Role not JUDGE
 */
submissionRouter.patch("/:id/status", requireRole("JUDGE"), submissionController.updateSubmissionStatus);

// Admin: unlock resubmission for a project
submissionRouter.patch("/project/:projectId/unlock", requireRole("ADMIN"), (req, res) => submissionController.unlockResubmission(req, res));

export default submissionRouter;
