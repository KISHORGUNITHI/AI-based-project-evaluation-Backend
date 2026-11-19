import type { Request, Response } from "express";
import TeamService from "../../../services/teamservices.js";
import prisma from "../../../db/prisma.js";

export default class TeamController {
	private teamService: TeamService;

	constructor() {
		this.teamService = new TeamService();
		this.createTeam = this.createTeam.bind(this);
		this.addMember = this.addMember.bind(this);
		this.removeMember = this.removeMember.bind(this);
		this.getTeams = this.getTeams.bind(this);
		this.getMyTeams = this.getMyTeams.bind(this);
		this.getTeamById = this.getTeamById.bind(this);
		this.getTeamByName = this.getTeamByName.bind(this);
		this.updateTeam = this.updateTeam.bind(this);
		this.deleteTeam = this.deleteTeam.bind(this);
	}

	async createTeam(req: Request, res: Response) {
		try {
			const userId = String((req as any).user.id);
			
			// Fetch the student profile to get the Student.id
			const student = await prisma.student.findUnique({ where: { userId } });
			if (!student) {
				return res.status(400).json({ message: "Student profile not found. Please complete your profile first." });
			}

			const team = await this.teamService.createTeam({
				name: String(req.body.name),
				createdBy: userId,
				teamLeaderId: String(req.body.teamLeaderId ?? student.id),
				members: (req.body.members ?? []).map((m: any) => ({ studentId: String(m.studentId) })),
			});
			return res.status(201).json({ message: "Team created successfully", team });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(400).json({ message: msg });
		}
	}

	async addMember(req: Request, res: Response) {
		try {
			const teamId = String(req.params["id"]);
			let studentId = req.body.studentId ? String(req.body.studentId).trim() : "";
			const rollNumber = req.body.rollNumber ? String(req.body.rollNumber).trim() : "";

			if (!studentId && rollNumber) {
				const foundStudent = await prisma.student.findFirst({
					where: { rollNumber: { equals: rollNumber, mode: "insensitive" } },
				});
				if (!foundStudent) {
					return res.status(404).json({ message: `No student found with roll number: ${rollNumber}` });
				}
				studentId = foundStudent.id;
			}

			if (!studentId) {
				return res.status(400).json({ message: "studentId or rollNumber is required" });
			}

			const member = await this.teamService.addMember({
				teamId,
				studentId,
			});
			return res.status(201).json({ message: "Member added successfully", member });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(400).json({ message: msg });
		}
	}

	async removeMember(req: Request, res: Response) {
		try {
			await this.teamService.removeMember({
				teamId: String(req.params["id"]),
				studentId: String(req.body.studentId),
			});
			return res.status(200).json({ message: "Member removed successfully" });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(400).json({ message: msg });
		}
	}

	async getTeams(_req: Request, res: Response) {
		try {
			const teams = await this.teamService.getTeams();
			return res.status(200).json({ teams });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(500).json({ message: msg });
		}
	}

	async getMyTeams(req: Request, res: Response) {
		try {
			const userId = String((req as any).user.id);
			const teams = await this.teamService.getTeamsByUserId(userId);
			return res.status(200).json({ teams });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(500).json({ message: msg });
		}
	}

	async getTeamById(req: Request, res: Response) {
		try {
			const team = await this.teamService.getTeamById(String(req.params["id"]));
			return res.status(200).json({ team });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(404).json({ message: msg });
		}
	}

	async getTeamByName(req: Request, res: Response) {
		try {
			const team = await this.teamService.getTeamByName(String(req.params["name"]));
			return res.status(200).json({ team });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(404).json({ message: msg });
		}
	}

	async updateTeam(req: Request, res: Response) {
		try {
			const team = await this.teamService.updateTeam(String(req.params["id"]), {
				name: req.body.name,
				teamLeaderId: req.body.teamLeaderId,
			});
			return res.status(200).json({ message: "Team updated successfully", team });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(400).json({ message: msg });
		}
	}

	async deleteTeam(req: Request, res: Response) {
		try {
			await this.teamService.deleteTeam(String(req.params["id"]));
			return res.status(200).json({ message: "Team deleted successfully" });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(400).json({ message: msg });
		}
	}
}
