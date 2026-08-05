import type { Request, Response } from "express";
import ProjectService from "../../../services/projectservices.js";

export default class ProjectController {
	private projectService: ProjectService;

	constructor() {
		this.projectService = new ProjectService();
		this.createProject = this.createProject.bind(this);
		this.getAllProjects = this.getAllProjects.bind(this);
		this.getLeaderboard = this.getLeaderboard.bind(this);
		this.getProjectById = this.getProjectById.bind(this);
		this.getProjectsByTeam = this.getProjectsByTeam.bind(this);
		this.updateProject = this.updateProject.bind(this);
		this.deleteProject = this.deleteProject.bind(this);
	}

	async createProject(req: Request, res: Response) {
		try {
			const userId = String((req as any).user.id);
			const project = await this.projectService.createProject(userId, {
				title: String(req.body.title),
				description: req.body.description,
				domain: req.body.domain ? String(req.body.domain) : "",
				githubUrl: req.body.githubUrl,
				reportUrl: req.body.reportUrl,
				pptUrl: req.body.pptUrl,
				videoUrl: req.body.videoUrl,
				teamId: String(req.body.teamId),
			});
			return res.status(201).json({ message: "Project created successfully", project });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(400).json({ message: msg });
		}
	}

	async getAllProjects(_req: Request, res: Response) {
		try {
			const projects = await this.projectService.getAllProjects();
			return res.status(200).json({ projects });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(500).json({ message: msg });
		}
	}

	async getLeaderboard(_req: Request, res: Response) {
		try {
			const projects = await this.projectService.getLeaderboard();
			return res.status(200).json({ projects });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(500).json({ message: msg });
		}
	}

	async getProjectById(req: Request, res: Response) {
		try {
			const project = await this.projectService.getProjectById(String(req.params["id"]));
			return res.status(200).json({ project });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(404).json({ message: msg });
		}
	}

	async getProjectsByTeam(req: Request, res: Response) {
		try {
			const projects = await this.projectService.getProjectsByTeam(String(req.params["teamId"]));
			return res.status(200).json({ projects });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(404).json({ message: msg });
		}
	}

	async updateProject(req: Request, res: Response) {
		try {
			const userId = String((req as any).user.id);
			const project = await this.projectService.updateProject(
				String(req.params["id"]),
				userId,
				{
					title: req.body.title,
					description: req.body.description,
					domain: req.body.domain,
					githubUrl: req.body.githubUrl,
					reportUrl: req.body.reportUrl,
					pptUrl: req.body.pptUrl,
					videoUrl: req.body.videoUrl,
				},
			);
			return res.status(200).json({ message: "Project updated successfully", project });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(400).json({ message: msg });
		}
	}

	async deleteProject(req: Request, res: Response) {
		try {
			const userId = String((req as any).user.id);
			await this.projectService.deleteProject(String(req.params["id"]), userId);
			return res.status(200).json({ message: "Project deleted successfully" });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(400).json({ message: msg });
		}
	}
}
