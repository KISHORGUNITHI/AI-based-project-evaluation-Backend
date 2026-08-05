import express, { type Router } from "express";
import ProjectController from "../controllers/projectcontroller.js";
import { requireLogin, requireRole } from "../../../middlewares/auth.js";

const projectRouter: Router = express.Router();
const projectController = new ProjectController();

/**
 * @openapi
 * tags:
 *   name: Project
 *   description: Project management for teams
 */

/**
 * @openapi
 * /api/project:
 *   get:
 *     summary: Get all projects
 *     description: Returns all projects across all teams. Accessible by any authenticated user.
 *     tags: [Project]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all projects
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 projects:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Project'
 *       401:
 *         description: Not authenticated
 */
projectRouter.get("/", requireLogin, projectController.getAllProjects);

// Leaderboard — projects with scores sorted by finalScore
projectRouter.get("/leaderboard", requireLogin, projectController.getLeaderboard);

/**
 * @openapi
 * /api/project/{id}:
 *   get:
 *     summary: Get project by ID
 *     tags: [Project]
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
 *         description: Project found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 project:
 *                   $ref: '#/components/schemas/Project'
 *       404:
 *         description: Project not found
 *       401:
 *         description: Not authenticated
 */
projectRouter.get("/:id", requireLogin, projectController.getProjectById);

/**
 * @openapi
 * /api/project/team/{teamId}:
 *   get:
 *     summary: Get all projects for a team
 *     tags: [Project]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: teamId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of projects for the team
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 projects:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Project'
 *       404:
 *         description: Team not found
 *       401:
 *         description: Not authenticated
 */
projectRouter.get("/team/:teamId", requireLogin, projectController.getProjectsByTeam);

/**
 * @openapi
 * /api/project:
 *   post:
 *     summary: Create a project
 *     description: Creates a new project for a team. Only the team leader or creator can create a project.
 *     tags: [Project]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateProjectRequest'
 *     responses:
 *       201:
 *         description: Project created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Project created successfully
 *                 project:
 *                   $ref: '#/components/schemas/Project'
 *       400:
 *         description: Validation error or insufficient permissions
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Role not STUDENT
 */
projectRouter.post("/", requireRole("STUDENT"), projectController.createProject);

/**
 * @openapi
 * /api/project/{id}:
 *   put:
 *     summary: Update a project
 *     description: Updates a project. Only the team leader or creator can update.
 *     tags: [Project]
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
 *             $ref: '#/components/schemas/UpdateProjectRequest'
 *     responses:
 *       200:
 *         description: Project updated
 *       400:
 *         description: Validation error or insufficient permissions
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Role not STUDENT
 */
projectRouter.put("/:id", requireRole("STUDENT"), projectController.updateProject);

/**
 * @openapi
 * /api/project/{id}:
 *   delete:
 *     summary: Delete a project
 *     description: Deletes a project. Only the team leader or creator can delete.
 *     tags: [Project]
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
 *         description: Project deleted
 *       400:
 *         description: Project not found or insufficient permissions
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Role not STUDENT
 */
projectRouter.delete("/:id", requireRole("STUDENT"), projectController.deleteProject);

export default projectRouter;
