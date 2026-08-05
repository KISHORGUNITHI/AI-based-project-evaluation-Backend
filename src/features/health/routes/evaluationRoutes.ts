import express, { type Router } from "express";
import EvaluationController from "../controllers/evaluationcontroller.js";
import { requireLogin, requireRole } from "../../../middlewares/auth.js";

const evaluationRouter: Router = express.Router();
const evaluationController = new EvaluationController();

/**
 * @openapi
 * tags:
 *   name: Evaluation
 *   description: Project evaluation management
 */

/**
 * @openapi
 * /api/evaluation:
 *   post:
 *     summary: Create an evaluation
 *     description: Creates an evaluation for a submission. Normally triggered automatically on submission creation. ADMIN only for manual creation.
 *     tags: [Evaluation]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [projectId, submissionId]
 *             properties:
 *               projectId:
 *                 type: string
 *               submissionId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Evaluation created
 *       400:
 *         description: Validation error or evaluation already exists
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Role not ADMIN
 */
evaluationRouter.post("/", requireRole("ADMIN"), evaluationController.createEvaluation);

/**
 * @openapi
 * /api/evaluation/{id}:
 *   get:
 *     summary: Get evaluation by ID
 *     tags: [Evaluation]
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
 *         description: Evaluation found
 *       404:
 *         description: Not found
 */
evaluationRouter.get("/:id", requireLogin, evaluationController.getEvaluationById);

/**
 * @openapi
 * /api/evaluation/project/{projectId}:
 *   get:
 *     summary: Get evaluations for a project
 *     tags: [Evaluation]
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
 *         description: List of evaluations
 *       404:
 *         description: Project not found
 */
evaluationRouter.get("/project/:projectId", requireLogin, evaluationController.getEvaluationsByProject);

/**
 * @openapi
 * /api/evaluation/submission/{submissionId}:
 *   get:
 *     summary: Get evaluation for a submission
 *     tags: [Evaluation]
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
 *         description: Evaluation found
 *       404:
 *         description: Not found
 */
evaluationRouter.get("/submission/:submissionId", requireLogin, evaluationController.getEvaluationBySubmission);

/**
 * @openapi
 * /api/evaluation/{id}/assign-judge:
 *   patch:
 *     summary: Assign a judge to an evaluation
 *     description: Assigns a judge to an evaluation. ADMIN only.
 *     tags: [Evaluation]
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
 *             required: [judgeId]
 *             properties:
 *               judgeId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Judge assigned
 *       400:
 *         description: Evaluation or judge not found
 *       403:
 *         description: Role not ADMIN
 */
evaluationRouter.patch("/:id/assign-judge", requireRole("ADMIN"), evaluationController.assignJudge);

/**
 * @openapi
 * /api/evaluation/{id}/ai-score:
 *   patch:
 *     summary: Record AI evaluation score
 *     description: Sets the AI score and optional feedback. Called by the AI evaluation pipeline.
 *     tags: [Evaluation]
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
 *             required: [aiScore]
 *             properties:
 *               aiScore:
 *                 type: number
 *                 example: 86
 *               feedback:
 *                 type: string
 *                 example: Good documentation and code quality
 *     responses:
 *       200:
 *         description: AI score recorded
 *       400:
 *         description: Evaluation not found
 */
evaluationRouter.patch("/:id/ai-score", requireRole("ADMIN"), evaluationController.setAiScore);

/**
 * @openapi
 * /api/evaluation/{id}/judge-score:
 *   patch:
 *     summary: Judge submits their score
 *     description: The assigned judge records their score and optional feedback.
 *     tags: [Evaluation]
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
 *             required: [judgeScore]
 *             properties:
 *               judgeScore:
 *                 type: number
 *                 example: 92
 *               feedback:
 *                 type: string
 *                 example: Very innovative project with good implementation
 *     responses:
 *       200:
 *         description: Judge score recorded
 *       400:
 *         description: Not assigned or evaluation not found
 *       403:
 *         description: Role not JUDGE
 */
evaluationRouter.patch("/:id/judge-score", requireRole("JUDGE"), evaluationController.setJudgeScore);

/**
 * @openapi
 * /api/evaluation/{id}/finalize:
 *   patch:
 *     summary: Finalize an evaluation
 *     description: Computes finalScore = (aiScore * 0.4) + (judgeScore * 0.6) and sets status to COMPLETED.
 *     tags: [Evaluation]
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
 *         description: Evaluation finalized with finalScore
 *       400:
 *         description: Missing scores or evaluation not found
 *       403:
 *         description: Role not ADMIN
 */
evaluationRouter.patch("/:id/finalize", requireRole("ADMIN"), evaluationController.finalizeEvaluation);

// Judge sets rubric weights before triggering AI
evaluationRouter.patch("/:id/set-rubric", requireRole("JUDGE"), evaluationController.setRubric);

// Judge triggers full AI evaluation (PDF + PPT + GitHub → Gemini)
evaluationRouter.post("/:id/trigger-ai", requireRole("JUDGE"), evaluationController.triggerAiEvaluation);

export default evaluationRouter;
