import type { Request, Response } from "express";
import EvaluationService from "../../../services/evaluationservices.js";
import prisma from "../../../db/prisma.js";

export default class JudgeDashboardController {
	private evaluationService: EvaluationService;

	constructor() {
		this.evaluationService = new EvaluationService();
		this.getDashboard = this.getDashboard.bind(this);
		this.getAssignedProjects = this.getAssignedProjects.bind(this);
		this.getAssignedProjectsSummary = this.getAssignedProjectsSummary.bind(this);
		this.getAssignedProjectById = this.getAssignedProjectById.bind(this);
		this.getSubmissionsByProject = this.getSubmissionsByProject.bind(this);
		this.getLatestSubmission = this.getLatestSubmission.bind(this);
		this.getSubmissionById = this.getSubmissionById.bind(this);
		this.getEvaluations = this.getEvaluations.bind(this);
		this.getEvaluationById = this.getEvaluationById.bind(this);
	}

	// Resolve the judge row for the current user
	private async resolveJudgeId(req: Request, res: Response): Promise<string | null> {
		const judge = await prisma.judge.findUnique({
			where: { userId: String((req as any).user.id) },
		});
		if (!judge) {
			res.status(400).json({ message: "Judge profile not found" });
			return null;
		}
		return judge.id;
	}

	// GET /api/judge/dashboard
	async getDashboard(req: Request, res: Response) {
		try {
			const judgeId = await this.resolveJudgeId(req, res);
			if (!judgeId) return;

			const dashboard = await this.evaluationService.getJudgeDashboard(judgeId);
			return res.status(200).json(dashboard);
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(500).json({ message: msg });
		}
	}

	// GET /api/judge/projects
	async getAssignedProjects(req: Request, res: Response) {
		try {
			const judgeId = await this.resolveJudgeId(req, res);
			if (!judgeId) return;

			const projects = await this.evaluationService.getAssignedProjectsByJudge(judgeId);
			return res.status(200).json({ projects });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(500).json({ message: msg });
		}
	}

	// GET /api/judge/assigned-projects — compact summary list
	async getAssignedProjectsSummary(req: Request, res: Response) {
		try {
			const judgeId = await this.resolveJudgeId(req, res);
			if (!judgeId) return;

			const evaluations = await prisma.evaluation.findMany({
				where: { judgeId },
				include: {
					project: { include: { team: true } },
				},
				orderBy: { createdAt: "desc" },
			});

			const projects = evaluations.map((e) => ({
				projectId: e.project.id,
				title: e.project.title,
				team: e.project.team.name,
				evaluationId: e.id,
				status: e.status,
			}));

			return res.status(200).json({ projects });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(500).json({ message: msg });
		}
	}

	// GET /api/judge/projects/:projectId
	async getAssignedProjectById(req: Request, res: Response) {
		try {
			const judgeId = await this.resolveJudgeId(req, res);
			if (!judgeId) return;

			const project = await prisma.project.findUnique({
				where: { id: String(req.params["projectId"]) },
				include: {
					team: true,
					submissions: { orderBy: { version: "desc" } },
					evaluations: { where: { judgeId } },
				},
			});
			if (!project) return res.status(404).json({ message: "Project not found" });

			// Ensure this judge is assigned to this project
			if (project.evaluations.length === 0) {
				return res.status(403).json({ message: "You are not assigned to this project" });
			}

			return res.status(200).json({ project });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(500).json({ message: msg });
		}
	}

	// GET /api/judge/projects/:projectId/submissions
	async getSubmissionsByProject(req: Request, res: Response) {
		try {
			const judgeId = await this.resolveJudgeId(req, res);
			if (!judgeId) return;

			const projectId = String(req.params["projectId"]);

			// Verify judge is assigned
			const evaluation = await prisma.evaluation.findFirst({
				where: { projectId, judgeId },
			});
			if (!evaluation) return res.status(403).json({ message: "You are not assigned to this project" });

			const submissions = await prisma.submission.findMany({
				where: { projectId },
				orderBy: { version: "desc" },
			});
			return res.status(200).json({ submissions });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(500).json({ message: msg });
		}
	}

	// GET /api/judge/projects/:projectId/latest-submission
	async getLatestSubmission(req: Request, res: Response) {
		try {
			const judgeId = await this.resolveJudgeId(req, res);
			if (!judgeId) return;

			const projectId = String(req.params["projectId"]);

			const evaluation = await prisma.evaluation.findFirst({
				where: { projectId, judgeId },
			});
			if (!evaluation) return res.status(403).json({ message: "You are not assigned to this project" });

			const submission = await prisma.submission.findFirst({
				where: { projectId },
				orderBy: { version: "desc" },
			});
			if (!submission) return res.status(404).json({ message: "No submissions found" });

			return res.status(200).json({ submission });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(500).json({ message: msg });
		}
	}

	// GET /api/judge/submissions/:submissionId
	async getSubmissionById(req: Request, res: Response) {
		try {
			const judgeId = await this.resolveJudgeId(req, res);
			if (!judgeId) return;

			const submission = await prisma.submission.findUnique({
				where: { id: String(req.params["submissionId"]) },
				include: { project: { include: { team: true } } },
			});
			if (!submission) return res.status(404).json({ message: "Submission not found" });

			// Verify judge is assigned to this project's evaluation
			const evaluation = await prisma.evaluation.findFirst({
				where: { projectId: submission.projectId, judgeId },
			});
			if (!evaluation) return res.status(403).json({ message: "You are not assigned to this project" });

			return res.status(200).json({ submission });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(500).json({ message: msg });
		}
	}

	// GET /api/judge/evaluations
	async getEvaluations(req: Request, res: Response) {
		try {
			const judgeId = await this.resolveJudgeId(req, res);
			if (!judgeId) return;

			const evaluations = await this.evaluationService.getEvaluationsByJudge(judgeId);
			return res.status(200).json({ evaluations });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(500).json({ message: msg });
		}
	}

	// GET /api/judge/evaluations/:id
	async getEvaluationById(req: Request, res: Response) {
		try {
			const judgeId = await this.resolveJudgeId(req, res);
			if (!judgeId) return;

			const evaluation = await prisma.evaluation.findUnique({
				where: { id: String(req.params["id"]) },
				include: { project: { include: { team: true } }, submission: true, judge: true },
			});
			if (!evaluation) return res.status(404).json({ message: "Evaluation not found" });
			if (evaluation.judgeId !== judgeId) {
				return res.status(403).json({ message: "You are not assigned to this evaluation" });
			}

			return res.status(200).json({ evaluation });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(500).json({ message: msg });
		}
	}
}
