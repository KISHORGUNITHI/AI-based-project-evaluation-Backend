import prisma from "../db/prisma.js";
import type EvaluationDTO from "../entites/evaluation.js";
import type { AiScoreDTO, AssignJudgeDTO, JudgeScoreDTO } from "../entites/evaluation.js";
import { buildEvaluationGraph } from "../features/project-evaluation/langgraph/evalution-graph.js";
import type { ProgressCallback } from "../features/project-evaluation/langgraph/evalution-graph.js";
import { getLangfuse } from "../lib/langfuse.js";
import NotificationService from "./notificationservice.js";
import { publishMessage } from "../queue/producer.js";
import { QUEUES } from "../queue/queues.js";
import type { DocAnalysisJob, GithubCloneJob } from "../queue/types.js";

export default class EvaluationService {

	private notificationService = new NotificationService();

	async createEvaluation(data: EvaluationDTO) {
		// Validate project & submission exist
		const project = await prisma.project.findUnique({ where: { id: data.projectId } });
		if (!project) throw new Error("Project not found");

		const submission = await prisma.submission.findUnique({ where: { id: data.submissionId } });
		if (!submission) throw new Error("Submission not found");
		if (submission.projectId !== data.projectId) throw new Error("Submission does not belong to this project");

		// Only one evaluation per submission
		const existing = await prisma.evaluation.findUnique({ where: { submissionId: data.submissionId } });
		if (existing) throw new Error("Evaluation already exists for this submission");

		// Mark project & submission as EVALUATING
		await prisma.project.update({ where: { id: data.projectId }, data: { status: "EVALUATING" } });
		await prisma.submission.update({ where: { id: data.submissionId }, data: { status: "EVALUATING" } });

		return await prisma.evaluation.create({
			data: {
				projectId: data.projectId,
				submissionId: data.submissionId,
				status: "PENDING",
			},
			include: { project: true, submission: true, judge: true },
		});
	}

	// ── Read ─────────────────────────────────────────────────────────────────

	async getEvaluationById(id: string) {
		const evaluation = await prisma.evaluation.findUnique({
			where: { id },
			include: { project: { include: { team: true } }, submission: true, judge: true },
		});
		if (!evaluation) throw new Error("Evaluation not found");
		return evaluation;
	}

	async getEvaluationsByProject(projectId: string) {
		const project = await prisma.project.findUnique({ where: { id: projectId } });
		if (!project) throw new Error("Project not found");

		return await prisma.evaluation.findMany({
			where: { projectId },
			include: { project: { include: { team: true } }, submission: true, judge: true },
			orderBy: { createdAt: "desc" },
		});
	}

	async getEvaluationBySubmission(submissionId: string) {
		const evaluation = await prisma.evaluation.findUnique({
			where: { submissionId },
			include: { project: { include: { team: true } }, submission: true, judge: true },
		});
		if (!evaluation) throw new Error("Evaluation not found for this submission");
		return evaluation;
	}

	// ── Assign Judge ─────────────────────────────────────────────────────────

	async assignJudge(id: string, data: AssignJudgeDTO) {
		const evaluation = await prisma.evaluation.findUnique({ where: { id } });
		if (!evaluation) throw new Error("Evaluation not found");

		// Accept either a Judge profile ID OR a User ID — resolve to Judge.id
		let judgeProfileId = data.judgeId;
		let judge = await prisma.judge.findUnique({ where: { id: data.judgeId } });
		if (!judge) {
			// Try resolving by userId (in case admin passes the User.id)
			judge = await prisma.judge.findUnique({ where: { userId: data.judgeId } });
			if (!judge) throw new Error("Judge not found — provide a valid Judge profile ID or User ID");
			judgeProfileId = judge.id;
		}

		const updated = await prisma.evaluation.update({
    where: { id },
    data: {
        judgeId: judgeProfileId,
        status: "JUDGE_EVALUATING",
    },
    include: {
        project: {
            include: {
                team: true,
            },
        },
        submission: true,
        judge: true,
    },
});

await this.notificationService.create(
    judge.userId,
    "JUDGE_ASSIGNED",
    `You have been assigned to review ${updated.project.title}`,
    updated.id
);

return updated;
}

	// ── Set Rubric ────────────────────────────────────────────────────────────

	async setRubric(id: string, judgeId: string, rubric: {
		rubricProblemStatement: number;
		rubricSolutionDesign: number;
		rubricImplementation: number;
		rubricInnovation: number;
		rubricDocumentation: number;
	}) {
		const evaluation = await prisma.evaluation.findUnique({ where: { id } });
		if (!evaluation) throw new Error("Evaluation not found");
		if (evaluation.judgeId !== judgeId) throw new Error("You are not assigned to this evaluation");

		return await prisma.evaluation.update({
			where: { id },
			data: {
				rubricProblemStatement: rubric.rubricProblemStatement,
				rubricSolutionDesign: rubric.rubricSolutionDesign,
				rubricImplementation: rubric.rubricImplementation,
				rubricInnovation: rubric.rubricInnovation,
				rubricDocumentation: rubric.rubricDocumentation,
				rubricSetByJudge: true,
			},
			include: { project: { include: { team: true } }, submission: true, judge: true },
		});
	}

	// ── Trigger AI ────────────────────────────────────────────────────────────

	/**
	 * Publishes doc-analysis and github-clone jobs to RabbitMQ in parallel.
	 * DocWorker and GithubWorker run concurrently, then AgentWorker fans-in.
	 */
	async queueAiEvaluation(id: string, judgeId: string) {
		const evaluation = await prisma.evaluation.findUnique({
			where: { id },
			include: { submission: true },
		});
		if (!evaluation) throw new Error("Evaluation not found");
		if (evaluation.judgeId !== judgeId) throw new Error("You are not assigned to this evaluation");
		if (evaluation.status === "AI_COMPLETED" || evaluation.status === "COMPLETED") {
			throw new Error("AI evaluation already completed for this evaluation");
		}
		if (!evaluation.rubricSetByJudge) throw new Error("Set the rubric before triggering AI evaluation");

		await prisma.evaluation.update({ where: { id }, data: { status: "AI_EVALUATING" } });

		const sub = evaluation.submission;

		await Promise.all([
			publishMessage<DocAnalysisJob>(QUEUES.DOC_ANALYSIS, {
				evaluationId: id,
				reportUrl: sub.reportUrl ?? undefined,
				pptUrl: sub.pptUrl ?? undefined,
			}),
			publishMessage<GithubCloneJob>(QUEUES.GITHUB_CLONE, {
				evaluationId: id,
				githubUrl: sub.githubUrl ?? undefined,
			}),
		]);

		console.log(`[EvaluationService] Queued doc + github workers for ${id}`);
	}

	/**
	 * Executes the full LangGraph pipeline synchronously.
	 * Called by the worker — NOT directly by the HTTP controller.
	 */
	async triggerAiEvaluation(id: string, judgeId: string, onProgress: ProgressCallback) {
		const evaluation = await prisma.evaluation.findUnique({
			where: { id },
			include: { submission: true, project: true },
		});
		if (!evaluation) throw new Error("Evaluation not found");
		if (evaluation.judgeId !== judgeId) throw new Error("You are not assigned to this evaluation");
		if (evaluation.status === "AI_COMPLETED" || evaluation.status === "COMPLETED") {
			throw new Error("AI evaluation already completed for this evaluation");
		}

		// Mark as running immediately so the frontend can show progress
		await prisma.evaluation.update({ where: { id }, data: { status: "AI_EVALUATING" } });

		const sub = evaluation.submission;
		const rubric = {
			problemStatement: evaluation.rubricProblemStatement ?? 20,
			solutionDesign: evaluation.rubricSolutionDesign ?? 20,
			implementation: evaluation.rubricImplementation ?? 25,
			innovation: evaluation.rubricInnovation ?? 20,
			documentation: evaluation.rubricDocumentation ?? 15,
		};

		// Run the LangGraph evaluation pipeline — builds a fresh graph with the SSE callback
		const langfuse = getLangfuse();
		const trace = langfuse?.trace({
			name: "evaluation-pipeline",
			id,
			metadata: {
				evaluationId: id,
				projectTitle: evaluation.project.title,
			},
		});

		const evaluationGraph = buildEvaluationGraph(onProgress, trace ?? undefined);
		await evaluationGraph.invoke({
			evaluationId: id,
			projectTitle: evaluation.project.title,
			githubUrl: sub.githubUrl ?? undefined,
			reportUrl: sub.reportUrl ?? undefined,
			pptUrl: sub.pptUrl ?? undefined,
			rubric,
			pdfText: "",
			pptText: "",
			githubSummary: "",
		},);

		// Flush all Langfuse spans before returning
		await langfuse?.flushAsync();

		// Return the evaluation row as updated by the persistResult node
		const updated = await prisma.evaluation.findUnique({
    where: { id },
    include: {
        project: {
            include: {
                team: {
                    include: {
                        members: {
                            include: {
                                student: {
                                    include: {
                                        user: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
        submission: true,
        judge: true,
    },
});

if (updated) {
    for (const member of updated.project.team.members) {
        await this.notificationService.create(
            member.student.user.id,
            "AI_COMPLETE",
            `AI evaluation complete for ${updated.project.title}`,
            updated.id
        );
    }
}

return updated;
}

	async setAiScore(id: string, data: AiScoreDTO) {
		const evaluation = await prisma.evaluation.findUnique({ where: { id } });
		if (!evaluation) throw new Error("Evaluation not found");

		return await prisma.evaluation.update({
			where: { id },
			data: {
				aiScore: data.aiScore,
				feedback: data.feedback ?? evaluation.feedback,
				status: "AI_COMPLETED",
			},
			include: { project: { include: { team: true } }, submission: true, judge: true },
		});
	}

	// ── Judge Score ───────────────────────────────────────────────────────────

	async setJudgeScore(id: string, judgeId: string, data: JudgeScoreDTO) {
		const evaluation = await prisma.evaluation.findUnique({ where: { id } });
		if (!evaluation) throw new Error("Evaluation not found");

		if (evaluation.judgeId !== judgeId) {
			throw new Error("You are not assigned to this evaluation");
		}

		// Build merged feedback
		const mergedFeedback = data.feedback
			? evaluation.feedback
				? `${evaluation.feedback}\n\nJudge: ${data.feedback}`
				: `Judge: ${data.feedback}`
			: evaluation.feedback;

		// If AI score already exists, auto-compute finalScore and finalize
		const aiScore = evaluation.aiScore ? Number(evaluation.aiScore) : null;
		const judgeScore = Number(data.judgeScore);

		if (aiScore !== null) {
			// finalScore = (aiScore * 0.4) + (judgeScore * 0.6)
			const finalScore = aiScore * 0.4 + judgeScore * 0.6;

			const updated = await prisma.evaluation.update({
				where: { id },
				data: {
					judgeScore,
					finalScore,
					feedback: mergedFeedback,
					status: "COMPLETED",
				},
				include: {
    project: {
        include: {
            team: {
                include: {
                    members: {
                        include: {
                            student: {
                                include: {
                                    user: true,
                                },
                            },
                        },
                    },
                },
            },
        },
    },
    submission: true,
    judge: true,
},
			});

			// Mark project and submission as EVALUATED
			await prisma.project.update({
				where: { id: evaluation.projectId },
				data: { status: "EVALUATED" },
			});
			await prisma.submission.update({
				where: { id: evaluation.submissionId },
				data: { status: "EVALUATED" },
			});

			for (const member of updated.project.team.members) {
                await this.notificationService.create(
                    member.student.user.id,
                   "EVALUATION_COMPLETE",
                   `Your project has been evaluated. Final score: ${updated.finalScore}`,
                   updated.id
                );
            }


			return updated;
		}

		// AI score not yet available — store judge score and wait
		return await prisma.evaluation.update({
			where: { id },
			data: {
				judgeScore,
				feedback: mergedFeedback,
			},
			include: { project: { include: { team: true } }, submission: true, judge: true },
		});
	}

	// ── Finalize ──────────────────────────────────────────────────────────────
	// This is now mainly a safety valve — auto-finalize happens in setJudgeScore
	// when both AI and judge scores are present.

	async finalizeEvaluation(id: string) {
		const evaluation = await prisma.evaluation.findUnique({ where: { id } });
		if (!evaluation) throw new Error("Evaluation not found");
		if (!evaluation.aiScore) throw new Error("AI score is required before finalizing");
		if (!evaluation.judgeScore) throw new Error("Judge score is required before finalizing");

		if (evaluation.status === "COMPLETED") {
			// Already finalized — just return current state
			return await prisma.evaluation.findUnique({
				where: { id },
				include: { project: { include: { team: true } }, submission: true, judge: true },
			});
		}

		const aiScore = Number(evaluation.aiScore);
		const judgeScore = Number(evaluation.judgeScore);
		const finalScore = aiScore * 0.4 + judgeScore * 0.6;

		const updated = await prisma.evaluation.update({
			where: { id },
			data: { finalScore, status: "COMPLETED" },
			include: { project: { include: { team: true } }, submission: true, judge: true },
		});

		await prisma.project.update({ where: { id: evaluation.projectId }, data: { status: "EVALUATED" } });
		await prisma.submission.update({ where: { id: evaluation.submissionId }, data: { status: "EVALUATED" } });

		return updated;
	}

	// ── Judge-specific reads ──────────────────────────────────────────────────

	async getEvaluationsByJudge(judgeId: string) {
		return await prisma.evaluation.findMany({
			where: { judgeId },
			include: { project: { include: { team: true } }, submission: true, judge: true },
			orderBy: { createdAt: "desc" },
		});
	}

	async getAssignedProjectsByJudge(judgeId: string) {
		return await prisma.project.findMany({
			where: {
				evaluations: { some: { judgeId } },
			},
			include: {
				team: true,
				evaluations: { where: { judgeId } },
				submissions: { orderBy: { version: "desc" }, take: 1 },
			},
			orderBy: { createdAt: "desc" },
		});
	}

	async getJudgeDashboard(judgeId: string) {
		const [assigned, completed, pending] = await Promise.all([
			prisma.evaluation.count({ where: { judgeId } }),
			prisma.evaluation.count({ where: { judgeId, status: "COMPLETED" } }),
			prisma.evaluation.count({ where: { judgeId, status: { in: ["JUDGE_EVALUATING", "AI_COMPLETED"] } } }),
		]);

		return {
			assignedProjects: assigned,
			completedEvaluations: completed,
			pendingEvaluations: pending,
		};
	}
}
