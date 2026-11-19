import type { Request, Response } from "express";
import EvaluationService from "../../../services/evaluationservices.js";
import { connectRabbitMQ } from "../../../config/rabbitmq.js";
import { progressQueueName } from "../../../workers/progress.js";
import { QUEUES } from "../../../queue/queues.js";

export default class EvaluationController {
	private evaluationService: EvaluationService;

	constructor() {
		this.evaluationService = new EvaluationService();
		this.createEvaluation = this.createEvaluation.bind(this);
		this.getEvaluationById = this.getEvaluationById.bind(this);
		this.getEvaluationsByProject = this.getEvaluationsByProject.bind(this);
		this.getEvaluationBySubmission = this.getEvaluationBySubmission.bind(this);
		this.assignJudge = this.assignJudge.bind(this);
		this.setAiScore = this.setAiScore.bind(this);
		this.setJudgeScore = this.setJudgeScore.bind(this);
		this.finalizeEvaluation = this.finalizeEvaluation.bind(this);
		this.setRubric = this.setRubric.bind(this);
		this.triggerAiEvaluation = this.triggerAiEvaluation.bind(this);
	}

	async createEvaluation(req: Request, res: Response) {
		try {
			const evaluation = await this.evaluationService.createEvaluation({
				projectId: String(req.body.projectId),
				submissionId: String(req.body.submissionId),
			});
			return res.status(201).json({ message: "Evaluation created successfully", evaluation });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(400).json({ message: msg });
		}
	}

	async getEvaluationById(req: Request, res: Response) {
		try {
			const evaluation = await this.evaluationService.getEvaluationById(String(req.params["id"]));
			return res.status(200).json({ evaluation });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(404).json({ message: msg });
		}
	}

	async getEvaluationsByProject(req: Request, res: Response) {
		try {
			const evaluations = await this.evaluationService.getEvaluationsByProject(
				String(req.params["projectId"]),
			);
			return res.status(200).json({ evaluations });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(404).json({ message: msg });
		}
	}

	async getEvaluationBySubmission(req: Request, res: Response) {
		try {
			const evaluation = await this.evaluationService.getEvaluationBySubmission(
				String(req.params["submissionId"]),
			);
			return res.status(200).json({ evaluation });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(404).json({ message: msg });
		}
	}

	async assignJudge(req: Request, res: Response) {
		try {
			const evaluation = await this.evaluationService.assignJudge(
				String(req.params["id"]),
				{ judgeId: String(req.body.judgeId) },
			);
			return res.status(200).json({ message: "Judge assigned successfully", evaluation });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(400).json({ message: msg });
		}
	}

	async setAiScore(req: Request, res: Response) {
		try {
			const evaluation = await this.evaluationService.setAiScore(
				String(req.params["id"]),
				{
					aiScore: Number(req.body.aiScore),
					feedback: req.body.feedback,
				},
			);
			return res.status(200).json({ message: "AI score recorded", evaluation });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(400).json({ message: msg });
		}
	}

	async setJudgeScore(req: Request, res: Response) {
		try {
			const judge = await this._resolveJudge(req, res);
			if (!judge) return;

			const evaluation = await this.evaluationService.setJudgeScore(
				String(req.params["id"]),
				judge.id,
				{
					judgeScore: Number(req.body.judgeScore),
					feedback: req.body.feedback,
				},
			);
			return res.status(200).json({ message: "Judge score recorded", evaluation });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(400).json({ message: msg });
		}
	}

	async finalizeEvaluation(req: Request, res: Response) {
		try {
			const evaluation = await this.evaluationService.finalizeEvaluation(
				String(req.params["id"]),
			);
			return res.status(200).json({ message: "Evaluation finalized", evaluation });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(400).json({ message: msg });
		}
	}

	async setRubric(req: Request, res: Response) {
		try {
			const judge = await this._resolveJudge(req, res);
			if (!judge) return;

			const evaluation = await this.evaluationService.setRubric(
				String(req.params["id"]),
				judge.id,
				{
					rubricProblemStatement: Number(req.body.rubricProblemStatement),
					rubricSolutionDesign: Number(req.body.rubricSolutionDesign),
					rubricImplementation: Number(req.body.rubricImplementation),
					rubricInnovation: Number(req.body.rubricInnovation),
					rubricDocumentation: Number(req.body.rubricDocumentation),
				},
			);
			return res.status(200).json({ message: "Rubric saved", evaluation });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(400).json({ message: msg });
		}
	}

	/**
	 * POST /api/evaluation/:id/trigger-ai
	 *
	 * 1. Publishes an AI evaluation job to RabbitMQ (returns immediately)
	 * 2. Opens an SSE stream and subscribes to the per-evaluation progress queue
	 * 3. Forwards each progress event to the client until "done" or "error"
	 */
	async triggerAiEvaluation(req: Request, res: Response) {
		try {
			const judge = await this._resolveJudge(req, res);
			if (!judge) return;

			const evaluationId = String(req.params["id"]);

			// Set SSE headers before publishing the job
			res.setHeader("Content-Type", "text/event-stream");
			res.setHeader("Cache-Control", "no-cache");
			res.setHeader("Connection", "keep-alive");
			res.setHeader("Access-Control-Allow-Origin", "*");
			res.flushHeaders();

			const send = (event: object) => {
				if (!res.writableEnded) {
					res.write(`data: ${JSON.stringify(event)}\n\n`);
				}
			};

			send({ step: "starting", status: "started" });

			// Check if background RabbitMQ workers are available and listening
			let useWorkers = false;
			let channel: any = null;
			const progressQueue = progressQueueName(evaluationId);
			let consumerTag = "";

			try {
				channel = await connectRabbitMQ();
				const docQ = await channel.assertQueue(QUEUES.DOC_ANALYSIS, { durable: true });
				const agentQ = await channel.assertQueue(QUEUES.AGENT_RUN, { durable: true });
				// Only delegate to workers if both doc-worker and agent-worker are actively consuming
				if (docQ.consumerCount > 0 && agentQ.consumerCount > 0) {
					useWorkers = true;
				}
			} catch (err: unknown) {
				console.warn(
					"[triggerAiEvaluation] RabbitMQ not ready or unavailable — falling back to in-process execution:",
					(err as Error).message,
				);
			}

			if (useWorkers && channel) {
				console.log(`[triggerAiEvaluation] Active workers detected — delegating ${evaluationId} to RabbitMQ`);
				try {
					await channel.assertQueue(progressQueue, { durable: false, autoDelete: true });

					const { consumerTag: tag } = await channel.consume(progressQueue, (msg: any) => {
						if (!msg) return;

						try {
							const event = JSON.parse(msg.content.toString()) as Record<string, unknown>;
							send(event);
							channel.ack(msg);

							const isDone =
								(event.step === "done" && event.status === "completed") ||
								(event.step === "error" && event.status === "failed");

							if (isDone) {
								channel.cancel(consumerTag).catch(() => {});
								res.end();
							}
						} catch {
							channel.nack(msg, false, false);
						}
					});

					consumerTag = tag;

					req.on("close", () => {
						channel.cancel(consumerTag).catch(() => {});
					});

					await this.evaluationService.queueAiEvaluation(evaluationId, judge.id);
					return;
				} catch (err: unknown) {
					console.error("[triggerAiEvaluation] Failed worker subscription, falling back to in-process:", err);
				}
			}

			// In-process execution:
			// Executes the evaluation graph directly inside this process.
			// This guarantees that running 'npm run dev' works out-of-the-box without hanging!
			console.log(`[triggerAiEvaluation] Running evaluation ${evaluationId} in-process...`);
			try {
				const updated = await this.evaluationService.triggerAiEvaluation(
					evaluationId,
					judge.id,
					(event) => send(event),
				);
				send({ step: "done", status: "completed", evaluation: updated });
				res.end();
			} catch (err: unknown) {
				const msg = err instanceof Error ? err.message : "AI evaluation failed";
				console.error(`[triggerAiEvaluation] In-process evaluation failed for ${evaluationId}:`, msg);
				send({ step: "error", status: "failed", message: msg });
				res.end();
			}
		} catch (error: unknown) {
			if (!res.headersSent) {
				const msg = error instanceof Error ? error.message : "Unknown error";
				res.status(400).json({ message: msg });
			}
		}
	}

	private async _resolveJudge(req: Request, res: Response) {
		const { default: prisma } = await import("../../../db/prisma.js");
		const judge = await prisma.judge.findUnique({
			where: { userId: String((req as any).user.id) },
		});
		if (!judge) {
			res.status(400).json({ message: "Judge profile not found" });
			return null;
		}
		return judge;
	}
}
