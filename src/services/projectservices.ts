import prisma from "../db/prisma.js";
import type ProjectDTO from "../entites/project.js";

export default class ProjectService {
	// Create a project — only if the requesting user is the team creator or team leader
	async createProject(userId: string, data: ProjectDTO) {
		// Verify the team exists and user has rights
		const team = await prisma.team.findUnique({
			where: { id: data.teamId },
			include: { teamLeader: true },
		});
		if (!team) throw new Error("Team not found");

		const student = await prisma.student.findUnique({ where: { userId } });
		if (!student) throw new Error("Student profile not found");

		const isLeader = team.teamLeaderId === student.id;
		const isCreator = team.createdBy === userId;
		if (!isLeader && !isCreator) {
			throw new Error("Only the team leader or creator can create a project");
		}

		return await prisma.project.create({
			data: {
				title: data.title,
				description: data.description,
				domain: data.domain,
				githubUrl: data.githubUrl,
				reportUrl: data.reportUrl,
				pptUrl: data.pptUrl,
				videoUrl: data.videoUrl,
				teamId: data.teamId,
			},
			include: { team: true, submissions: true },
		});
	}

	// Get all projects (any authenticated user)
	async getAllProjects() {
		return await prisma.project.findMany({
			include: { team: true, submissions: true },
			orderBy: { createdAt: "desc" },
		});
	}

	// Get leaderboard — projects with final scores, sorted by finalScore desc
	async getLeaderboard() {
		const projects = await prisma.project.findMany({
			include: {
				team: { select: { id: true, name: true } },
				evaluations: {
					orderBy: { createdAt: "desc" },
					take: 1,
					select: {
						id: true,
						aiScore: true,
						judgeScore: true,
						finalScore: true,
						status: true,
					},
				},
			},
			orderBy: { createdAt: "desc" },
		});

		return [...projects].sort((a, b) => {
			const fa = a.evaluations[0]?.finalScore ? Number(a.evaluations[0].finalScore) : -1;
			const fb = b.evaluations[0]?.finalScore ? Number(b.evaluations[0].finalScore) : -1;
			return fb - fa;
		});
	}

	// Get a single project by id
	async getProjectById(id: string) {
		const project = await prisma.project.findUnique({
			where: { id },
			include: { team: true, submissions: true },
		});
		if (!project) throw new Error("Project not found");
		return project;
	}

	// Get all projects belonging to a team
	async getProjectsByTeam(teamId: string) {
		const team = await prisma.team.findUnique({ where: { id: teamId } });
		if (!team) throw new Error("Team not found");

		return await prisma.project.findMany({
			where: { teamId },
			include: { team: true, submissions: true },
			orderBy: { createdAt: "desc" },
		});
	}

	// Update project — only team leader / creator
	async updateProject(id: string, userId: string, data: Partial<Omit<ProjectDTO, "teamId">>) {
		const project = await prisma.project.findUnique({
			where: { id },
			include: { team: true },
		});
		if (!project) throw new Error("Project not found");

		const student = await prisma.student.findUnique({ where: { userId } });
		if (!student) throw new Error("Student profile not found");

		const isLeader = project.team.teamLeaderId === student.id;
		const isCreator = project.team.createdBy === userId;
		if (!isLeader && !isCreator) {
			throw new Error("Only the team leader or creator can update a project");
		}

		return await prisma.project.update({
			where: { id },
			data: {
				title: data.title,
				description: data.description,
				domain: data.domain,
				githubUrl: data.githubUrl,
				reportUrl: data.reportUrl,
				pptUrl: data.pptUrl,
				videoUrl: data.videoUrl,
			},
			include: { team: true, submissions: true },
		});
	}

	// Delete project — only team leader / creator
	async deleteProject(id: string, userId: string) {
		const project = await prisma.project.findUnique({
			where: { id },
			include: { team: true },
		});
		if (!project) throw new Error("Project not found");

		const student = await prisma.student.findUnique({ where: { userId } });
		if (!student) throw new Error("Student profile not found");

		const isLeader = project.team.teamLeaderId === student.id;
		const isCreator = project.team.createdBy === userId;
		if (!isLeader && !isCreator) {
			throw new Error("Only the team leader or creator can delete a project");
		}

		return await prisma.project.delete({ where: { id } });
	}
}
