import prisma from "../db/prisma.js";

export default class StudentDashboardService {
	// ── Overview stats ────────────────────────────────────────────────────────

	async getDashboard(userId: string) {
		const student = await prisma.student.findUnique({ where: { userId } });
		if (!student) throw new Error("Student profile not found");

		// All teams the student belongs to (member or leader or creator)
		const teams = await prisma.team.findMany({
			where: {
				OR: [
					{ createdBy: userId },
					{ members: { some: { studentId: student.id } } },
				],
			},
		});
		const teamIds = teams.map((t) => t.id);

		const [totalProjects, totalSubmissions, evaluationStats] = await Promise.all([
			prisma.project.count({ where: { teamId: { in: teamIds } } }),
			prisma.submission.count({
				where: { project: { teamId: { in: teamIds } } },
			}),
			prisma.evaluation.groupBy({
				by: ["status"],
				where: { project: { teamId: { in: teamIds } } },
				_count: { status: true },
			}),
		]);

		const evalCounts = Object.fromEntries(
			evaluationStats.map((e) => [e.status, e._count.status]),
		);

		return {
			totalTeams: teams.length,
			totalProjects,
			totalSubmissions,
			evaluations: {
				PENDING: evalCounts["PENDING"] ?? 0,
				AI_EVALUATING: evalCounts["AI_EVALUATING"] ?? 0,
				AI_COMPLETED: evalCounts["AI_COMPLETED"] ?? 0,
				JUDGE_EVALUATING: evalCounts["JUDGE_EVALUATING"] ?? 0,
				COMPLETED: evalCounts["COMPLETED"] ?? 0,
			},
		};
	}

	// ── Teams ─────────────────────────────────────────────────────────────────

	async getMyTeams(userId: string) {
		const student = await prisma.student.findUnique({ where: { userId } });
		if (!student) throw new Error("Student profile not found");

		return await prisma.team.findMany({
			where: {
				OR: [
					{ createdBy: userId },
					{ members: { some: { studentId: student.id } } },
				],
			},
			include: {
				members: { include: { student: { include: { user: { select: { name: true, email: true } } } } } },
				teamLeader: { include: { user: { select: { name: true, email: true } } } },
				projects: { select: { id: true, title: true, status: true } },
			},
			orderBy: { createdAt: "desc" },
		});
	}

	// ── Projects ──────────────────────────────────────────────────────────────

	async getMyProjects(userId: string) {
		const student = await prisma.student.findUnique({ where: { userId } });
		if (!student) throw new Error("Student profile not found");

		const teamIds = await prisma.team
			.findMany({
				where: {
					OR: [
						{ createdBy: userId },
						{ members: { some: { studentId: student.id } } },
					],
				},
				select: { id: true },
			})
			.then((teams) => teams.map((t) => t.id));

		return await prisma.project.findMany({
			where: { teamId: { in: teamIds } },
			include: {
				team: { select: { id: true, name: true } },
				submissions: {
					orderBy: { version: "desc" },
					take: 1,
					select: { id: true, version: true, status: true, createdAt: true },
				},
				evaluations: {
					select: {
						id: true,
						status: true,
						aiScore: true,
						judgeScore: true,
						finalScore: true,
						feedback: true,
					},
					orderBy: { createdAt: "desc" },
					take: 1,
				},
			},
			orderBy: { createdAt: "desc" },
		});
	}

	// ── Submissions ───────────────────────────────────────────────────────────

	async getMySubmissions(userId: string) {
		const student = await prisma.student.findUnique({ where: { userId } });
		if (!student) throw new Error("Student profile not found");

		const teamIds = await prisma.team
			.findMany({
				where: {
					OR: [
						{ createdBy: userId },
						{ members: { some: { studentId: student.id } } },
					],
				},
				select: { id: true },
			})
			.then((teams) => teams.map((t) => t.id));

		return await prisma.submission.findMany({
			where: { project: { teamId: { in: teamIds } } },
			include: {
				project: {
					select: {
						id: true,
						title: true,
						domain: true,
						status: true,
						team: { select: { id: true, name: true } },
					},
				},
				evaluation: {
					select: {
						id: true,
						status: true,
						aiScore: true,
						judgeScore: true,
						finalScore: true,
						feedback: true,
					},
				},
			},
			orderBy: [{ project: { title: "asc" } }, { version: "desc" }],
		});
	}

	// ── Evaluations ───────────────────────────────────────────────────────────

	async getMyEvaluations(userId: string) {
		const student = await prisma.student.findUnique({ where: { userId } });
		if (!student) throw new Error("Student profile not found");

		const teamIds = await prisma.team
			.findMany({
				where: {
					OR: [
						{ createdBy: userId },
						{ members: { some: { studentId: student.id } } },
					],
				},
				select: { id: true },
			})
			.then((teams) => teams.map((t) => t.id));

		return await prisma.evaluation.findMany({
			where: { project: { teamId: { in: teamIds } } },
			include: {
				project: {
					select: {
						id: true,
						title: true,
						domain: true,
						team: { select: { id: true, name: true } },
					},
				},
				submission: {
					select: { id: true, version: true, githubUrl: true, reportUrl: true, pptUrl: true, videoUrl: true },
				},
				judge: {
					select: { id: true, organization: true, designation: true },
				},
			},
			orderBy: { createdAt: "desc" },
		});
	}

	// ── Single project detail (with all submissions + evaluation) ─────────────

	async getProjectDetail(userId: string, projectId: string) {
		const student = await prisma.student.findUnique({ where: { userId } });
		if (!student) throw new Error("Student profile not found");

		const project = await prisma.project.findUnique({
			where: { id: projectId },
			include: {
				team: {
					include: {
						members: {
							include: {
								student: { include: { user: { select: { name: true, email: true } } } },
							},
						},
					},
				},
				submissions: {
					orderBy: { version: "desc" },
					include: {
						evaluation: {
							select: {
								id: true,
								status: true,
								aiScore: true,
								judgeScore: true,
								finalScore: true,
								feedback: true,
								judge: { select: { organization: true, designation: true } },
							},
						},
					},
				},
				evaluations: {
					include: {
						judge: { select: { id: true, organization: true, designation: true } },
					},
					orderBy: { createdAt: "desc" },
				},
			},
		});

		if (!project) throw new Error("Project not found");

		// Ensure the student belongs to this team
		const isMember =
			project.team.createdBy === userId ||
			project.team.members.some((m) => m.student.userId === userId);

		if (!isMember) throw new Error("You do not have access to this project");

		return project;
	}
}
