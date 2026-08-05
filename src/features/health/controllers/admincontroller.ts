import type { Request, Response } from "express";
import prisma from "../../../db/prisma.js";
import { auth } from "../../../db/auth.js";

export default class AdminController {
	constructor() {
		this.getUsers = this.getUsers.bind(this);
		this.getUserById = this.getUserById.bind(this);
		this.updateUser = this.updateUser.bind(this);
		this.deactivateUser = this.deactivateUser.bind(this);
		this.getDashboardStats = this.getDashboardStats.bind(this);
		this.getProjectsPipeline = this.getProjectsPipeline.bind(this);
		this.getProjectDetail = this.getProjectDetail.bind(this);
		this.getActivityLog = this.getActivityLog.bind(this);
		this.getLeaderboard = this.getLeaderboard.bind(this);
		this.getJudgesList = this.getJudgesList.bind(this);
		this.createJudge = this.createJudge.bind(this);
		this.deleteJudge = this.deleteJudge.bind(this);
	}

	// ── Users ─────────────────────────────────────────────────────────────────

	// GET /api/admin/users
	async getUsers(req: Request, res: Response) {
		try {
			const { role, search, page = "1", limit = "20" } = req.query;
			const pageNum = Math.max(1, parseInt(String(page)));
			const limitNum = Math.min(100, Math.max(1, parseInt(String(limit))));
			const skip = (pageNum - 1) * limitNum;

			const where: Record<string, unknown> = {};
			if (role && role !== "ALL") where.role = role;
			if (search) {
				where.OR = [
					{ name: { contains: String(search), mode: "insensitive" } },
					{ email: { contains: String(search), mode: "insensitive" } },
					{ username: { contains: String(search), mode: "insensitive" } },
				];
			}

			const [users, total] = await Promise.all([
				prisma.user.findMany({
					where,
					select: {
						id: true,
						name: true,
						username: true,
						email: true,
						role: true,
						emailVerified: true,
						mustChangePassword: true,
						createdAt: true,
						student: { select: { id: true, rollNumber: true, department: true, collegeName: true } },
						judge: { select: { id: true, organization: true, designation: true, expertise: true } },
					},
					orderBy: { createdAt: "desc" },
					skip,
					take: limitNum,
				}),
				prisma.user.count({ where }),
			]);

			return res.status(200).json({
				users,
				pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
			});
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(500).json({ message: msg });
		}
	}

	// GET /api/admin/users/:id
	async getUserById(req: Request, res: Response) {
		try {
			const user = await prisma.user.findUnique({
				where: { id: String(req.params["id"]) },
				select: {
					id: true,
					name: true,
					username: true,
					email: true,
					role: true,
					emailVerified: true,
					mustChangePassword: true,
					createdAt: true,
					updatedAt: true,
					student: {
						include: {
							teams: { include: { team: { select: { id: true, name: true } } } },
						},
					},
					judge: { include: { evaluations: { select: { id: true, status: true } } } },
				},
			});
			if (!user) return res.status(404).json({ message: "User not found" });
			return res.status(200).json({ user });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(500).json({ message: msg });
		}
	}

	// PATCH /api/admin/users/:id
	async updateUser(req: Request, res: Response) {
		try {
			const { name, username, role } = req.body;
			const updateData: Record<string, unknown> = {};
			if (name) updateData.name = String(name);
			if (username !== undefined) updateData.username = username ? String(username) : null;
			if (role && ["STUDENT", "JUDGE", "ADMIN"].includes(role)) updateData.role = role;

			const user = await prisma.user.update({
				where: { id: String(req.params["id"]) },
				data: updateData,
				select: { id: true, name: true, username: true, email: true, role: true },
			});
			return res.status(200).json({ message: "User updated", user });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(400).json({ message: msg });
		}
	}

	// PATCH /api/admin/users/:id/deactivate — deletes all sessions to force logout
	async deactivateUser(req: Request, res: Response) {
		try {
			await prisma.session.deleteMany({ where: { userId: String(req.params["id"]) } });
			return res.status(200).json({ message: "User sessions cleared — user has been logged out" });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(400).json({ message: msg });
		}
	}

	// ── Dashboard ─────────────────────────────────────────────────────────────

	// GET /api/admin/dashboard
	async getDashboardStats(_req: Request, res: Response) {
		try {
			const [
				totalUsers,
				totalStudents,
				totalJudges,
				totalProjects,
				totalSubmissions,
				evaluationStats,
			] = await Promise.all([
				prisma.user.count(),
				prisma.user.count({ where: { role: "STUDENT" } }),
				prisma.user.count({ where: { role: "JUDGE" } }),
				prisma.project.count(),
				prisma.submission.count(),
				prisma.evaluation.groupBy({
					by: ["status"],
					_count: { status: true },
				}),
			]);

			const evalCounts = Object.fromEntries(
				evaluationStats.map((e) => [e.status, e._count.status]),
			);

			return res.status(200).json({
				totalUsers,
				totalStudents,
				totalJudges,
				totalProjects,
				totalSubmissions,
				evaluations: {
					PENDING: evalCounts["PENDING"] ?? 0,
					AI_EVALUATING: evalCounts["AI_EVALUATING"] ?? 0,
					AI_COMPLETED: evalCounts["AI_COMPLETED"] ?? 0,
					JUDGE_EVALUATING: evalCounts["JUDGE_EVALUATING"] ?? 0,
					COMPLETED: evalCounts["COMPLETED"] ?? 0,
				},
			});
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(500).json({ message: msg });
		}
	}

	// ── Projects ──────────────────────────────────────────────────────────────

	// GET /api/admin/projects — full pipeline view with eval status, judge, scores
	async getProjectsPipeline(_req: Request, res: Response) {
		try {
			const projects = await prisma.project.findMany({
				include: {
					team: { select: { id: true, name: true } },
					submissions: {
						orderBy: { version: "desc" },
						take: 1,
						select: {
							id: true,
							version: true,
							status: true,
							githubUrl: true,
							reportUrl: true,
							pptUrl: true,
						},
					},
					evaluations: {
						orderBy: { createdAt: "desc" },
						take: 1,
						include: {
							judge: {
								select: {
									id: true,
									organization: true,
									designation: true,
									expertise: true,
									user: {
										select: {
											name: true,
											username: true,
											email: true,
										},
									},
								},
							},
						},
					},
				},
				orderBy: { createdAt: "desc" },
			});

			return res.status(200).json({ projects });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(500).json({ message: msg });
		}
	}

	// GET /api/admin/projects/:id — full project detail
	async getProjectDetail(req: Request, res: Response) {
		try {
			const project = await prisma.project.findUnique({
				where: { id: String(req.params["id"]) },
				include: {
					team: {
						include: {
							members: {
								include: {
									student: {
										include: {
											user: {
												select: {
													id: true,
													name: true,
													username: true,
													email: true,
												},
											},
										},
									},
								},
							},
						},
					},
					submissions: {
						orderBy: { version: "desc" },
						include: {
							evaluation: {
								include: {
									judge: {
										select: {
											id: true,
											organization: true,
											designation: true,
											user: {
												select: {
													name: true,
													username: true,
												},
											},
										},
									},
								},
							},
						},
					},
					evaluations: {
						orderBy: { createdAt: "desc" },
						include: {
							judge: {
								select: {
									id: true,
									organization: true,
									designation: true,
									expertise: true,
									user: {
										select: {
											name: true,
											username: true,
											email: true,
										},
									},
								},
							},
						},
					},
				},
			});
			if (!project) return res.status(404).json({ message: "Project not found" });
			return res.status(200).json({ project });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(500).json({ message: msg });
		}
	}

	// ── Judges ────────────────────────────────────────────────────────────────

	// GET /api/admin/judges — list judges for assign-judge dropdown + management table
	async getJudgesList(_req: Request, res: Response) {
		try {
			const judgeUsers = await prisma.user.findMany({
				where: { role: "JUDGE" },
				select: {
					id: true,
					name: true,
					username: true,
					email: true,
					mustChangePassword: true,
					createdAt: true,
					judge: {
						select: {
							id: true,
							organization: true,
							designation: true,
							expertise: true,
							_count: { select: { evaluations: true } },
						},
					},
				},
				orderBy: { createdAt: "asc" },
			});

			// Shape to match what the judges page expects: { id, name, email, judge, mustChangePassword }
			// and also what the assign modal expects: judge.id, judge.user.name etc
			const judges = judgeUsers.map((u) => ({
				id: u.id,
				name: u.name,
				username: u.username,
				email: u.email,
				mustChangePassword: u.mustChangePassword,
				createdAt: u.createdAt,
				judge: u.judge,
				// Also expose as nested user for the assign modal
				user: { id: u.id, name: u.name, username: u.username, email: u.email },
				_count: { evaluations: u.judge?._count.evaluations ?? 0 },
				organization: u.judge?.organization,
				designation: u.judge?.designation,
				expertise: u.judge?.expertise ?? [],
			}));

			return res.status(200).json({ judges });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(500).json({ message: msg });
		}
	}

	// POST /api/admin/judges — create a judge account via Better Auth then create Judge profile
	async createJudge(req: Request, res: Response) {
		try {
			const { name, email, tempPassword, organization, designation } = req.body;
			if (!name || !email || !tempPassword) {
				return res.status(400).json({ message: "name, email and tempPassword are required" });
			}

			// Sign up via Better Auth so password hashing is handled correctly
			const signupRes = await auth.api.signUpEmail({
				body: {
					name: String(name),
					email: String(email),
					password: String(tempPassword),
				},
			});

			if (!signupRes?.user?.id) {
				return res.status(400).json({ message: "Failed to create user account" });
			}

			// Set role to JUDGE and mark mustChangePassword
			await prisma.user.update({
				where: { id: signupRes.user.id },
				data: { role: "JUDGE", mustChangePassword: true },
			});

			// Create Judge profile
			const judgeProfile = await prisma.judge.create({
				data: {
					userId: signupRes.user.id,
					organization: organization ? String(organization) : undefined,
					designation: designation ? String(designation) : undefined,
				},
			});

			return res.status(201).json({
				message: "Judge account created",
				judge: {
					id: signupRes.user.id,
					name: signupRes.user.name,
					email: signupRes.user.email,
					judgeProfileId: judgeProfile.id,
				},
			});
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(400).json({ message: msg });
		}
	}

	// DELETE /api/admin/judges/:userId — delete judge user account
	async deleteJudge(req: Request, res: Response) {
		try {
			const userId = String(req.params["userId"]);
			const user = await prisma.user.findUnique({ where: { id: userId } });
			if (!user) return res.status(404).json({ message: "Judge not found" });
			if (user.role !== "JUDGE") return res.status(400).json({ message: "User is not a judge" });

			// Cascade: Better Auth + Prisma cascade handles sessions, accounts, judge profile
			await prisma.user.delete({ where: { id: userId } });
			return res.status(200).json({ message: "Judge removed" });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(400).json({ message: msg });
		}
	}

	// ── Leaderboard ───────────────────────────────────────────────────────────

	// GET /api/admin/leaderboard
	async getLeaderboard(_req: Request, res: Response) {
		try {
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

			const ranked = [...projects].sort((a, b) => {
				const fa = a.evaluations[0]?.finalScore ? Number(a.evaluations[0].finalScore) : -1;
				const fb = b.evaluations[0]?.finalScore ? Number(b.evaluations[0].finalScore) : -1;
				return fb - fa;
			});

			return res.status(200).json({ projects: ranked });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(500).json({ message: msg });
		}
	}

	// ── Activity log ──────────────────────────────────────────────────────────

	// GET /api/admin/activity
	async getActivityLog(req: Request, res: Response) {
		try {
			const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "50"))));

			const [recentEvals, recentSubmissions] = await Promise.all([
				prisma.evaluation.findMany({
					orderBy: { updatedAt: "desc" },
					take: limit,
					include: {
						project: { select: { title: true } },
						judge: {
							select: {
								user: { select: { name: true, username: true } },
							},
						},
					},
				}),
				prisma.submission.findMany({
					orderBy: { createdAt: "desc" },
					take: limit,
					include: {
						project: {
							select: {
								title: true,
								team: {
									select: {
										teamLeader: {
											select: {
												user: { select: { name: true, username: true } },
											},
										},
									},
								},
							},
						},
					},
				}),
			]);

			const events = [
				...recentEvals.map((e) => ({
					type: "EVALUATION",
					timestamp: e.updatedAt,
					message: e.judge
						? `Judge ${e.judge.user.name} updated evaluation for "${e.project.title}" → ${e.status}`
						: `Evaluation for "${e.project.title}" → ${e.status}`,
					entityId: e.id,
					entityType: "evaluation",
				})),
				...recentSubmissions.map((s) => ({
					type: "SUBMISSION",
					timestamp: s.createdAt,
					message: `Team submitted v${s.version} for "${s.project.title}"`,
					entityId: s.id,
					entityType: "submission",
				})),
			]
				.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
				.slice(0, limit);

			return res.status(200).json({ events });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(500).json({ message: msg });
		}
	}
}
