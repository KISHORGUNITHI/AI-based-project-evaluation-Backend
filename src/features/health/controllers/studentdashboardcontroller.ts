import type { Request, Response } from "express";
import StudentDashboardService from "../../../services/studentdashboardservice.js";

export default class StudentDashboardController {
	private service: StudentDashboardService;

	constructor() {
		this.service = new StudentDashboardService();
		this.getDashboard = this.getDashboard.bind(this);
		this.getMyTeams = this.getMyTeams.bind(this);
		this.getMyProjects = this.getMyProjects.bind(this);
		this.getMySubmissions = this.getMySubmissions.bind(this);
		this.getMyEvaluations = this.getMyEvaluations.bind(this);
		this.getProjectDetail = this.getProjectDetail.bind(this);
	}

	private userId(req: Request): string {
		return String((req as any).user.id);
	}

	async getDashboard(req: Request, res: Response) {
		try {
			const data = await this.service.getDashboard(this.userId(req));
			return res.status(200).json(data);
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(400).json({ message: msg });
		}
	}

	async getMyTeams(req: Request, res: Response) {
		try {
			const teams = await this.service.getMyTeams(this.userId(req));
			return res.status(200).json({ teams });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(400).json({ message: msg });
		}
	}

	async getMyProjects(req: Request, res: Response) {
		try {
			const projects = await this.service.getMyProjects(this.userId(req));
			return res.status(200).json({ projects });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(400).json({ message: msg });
		}
	}

	async getMySubmissions(req: Request, res: Response) {
		try {
			const submissions = await this.service.getMySubmissions(this.userId(req));
			return res.status(200).json({ submissions });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(400).json({ message: msg });
		}
	}

	async getMyEvaluations(req: Request, res: Response) {
		try {
			const evaluations = await this.service.getMyEvaluations(this.userId(req));
			return res.status(200).json({ evaluations });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(400).json({ message: msg });
		}
	}

	async getProjectDetail(req: Request, res: Response) {
		try {
			const project = await this.service.getProjectDetail(
				this.userId(req),
				String(req.params["projectId"]),
			);
			return res.status(200).json({ project });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(400).json({ message: msg });
		}
	}
}
