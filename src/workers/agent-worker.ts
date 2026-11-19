/**
 * Agent Worker
 *
 * Consumes: AGENT_RUN queue
 *
 * Fan-in logic:
 *   Both DocWorker and GithubWorker publish a WorkerResultReadyJob here.
 *   We collect BOTH signals in a pendingSignals Map before doing ANY work.
 *   Only when both "doc" and "github" signals have been received do we
 *   run the LLM pipeline — exactly once.
 *
 *   This eliminates the requeue/retry loop entirely and guarantees:
 *     - No duplicate runs
 *     - Agent always gets both doc + github results
 *     - Clean, predictable flow
 */
import "dotenv/config";
import { connectRabbitMQ } from "../config/rabbitmq.js";
import { publishMessage, publishTransient } from "../queue/producer.js";
import { QUEUES } from "../queue/queues.js";
import type { WorkerResultReadyJob, NotificationJob } from "../queue/types.js";
import prisma from "../db/prisma.js";
import { buildAgentsOnlyGraph } from "../features/project-evaluation/langgraph/evalution-graph.js";
import { getLangfuse } from "../lib/langfuse.js";
import { progressQueueName } from "./progress.js";

const SIGNAL_WAIT_TIMEOUT_MS = 45 * 1000; // 45 seconds max wait for second signal

async function startAgentWorker() {
    console.log("[agent-worker] Starting...");

    // Map of evaluationId → Set of worker types whose signals have arrived
    const pendingSignals = new Map<string, Set<string>>();
    // Map of evaluationId → buffered messages waiting to be acked
    const pendingMsgs    = new Map<string, any[]>();
    // Set of evaluationIds currently running the LLM pipeline (dedup guard)
    const processingSet  = new Set<string>();
    // Map of evaluationId → timeout handle (to clean up stale entries)
    const timeoutHandles = new Map<string, ReturnType<typeof setTimeout>>();

    const channel = await connectRabbitMQ();
    await channel.assertQueue(QUEUES.AGENT_RUN, { durable: true });
    channel.prefetch(10); // allow buffering both signals
    console.log(`Listening on ${QUEUES.AGENT_RUN}`);

    function cleanup(evaluationId: string) {
        pendingSignals.delete(evaluationId);
        pendingMsgs.delete(evaluationId);
        processingSet.delete(evaluationId);
        const t = timeoutHandles.get(evaluationId);
        if (t) { clearTimeout(t); timeoutHandles.delete(evaluationId); }
    }

    async function runPipeline(evaluationId: string, msgs: any[]) {
        if (processingSet.has(evaluationId)) {
            console.log(`[agent-worker] ${evaluationId} already processing — acking duplicates`);
            msgs.forEach(m => channel.ack(m));
            return;
        }
        processingSet.add(evaluationId);

        // Ack all buffered messages for this evaluation
        msgs.forEach(m => channel.ack(m));

        const evaluation = await prisma.evaluation.findUnique({
            where: { id: evaluationId },
            include: {
                submission: true,
                project: {
                    include: {
                        team: {
                            include: {
                                members: { include: { student: { include: { user: true } } } },
                            },
                        },
                    },
                },
            },
        });

        if (!evaluation) {
            console.error(`[agent-worker] Evaluation ${evaluationId} not found — skipping`);
            cleanup(evaluationId);
            return;
        }

        if (["AI_COMPLETED", "COMPLETED"].includes(evaluation.status)) {
            console.log(`[agent-worker] ${evaluationId} already ${evaluation.status} — skipping`);
            cleanup(evaluationId);
            return;
        }

        const progressQueue = progressQueueName(evaluationId);
        const langfuse = getLangfuse();
        const trace = langfuse?.trace({
            name: "evaluation-pipeline",
            id: evaluationId,
            metadata: { evaluationId, projectTitle: evaluation.project.title },
        });
        const onProgress = async (event: { step: string; status: string }) => {
            await publishTransient(progressQueue, event).catch(() => {});
        };

        try {
            console.log(`[agent-worker] Both results ready for ${evaluationId} — running agents`);

            const rubric = {
                problemStatement: evaluation.rubricProblemStatement ?? 20,
                solutionDesign:   evaluation.rubricSolutionDesign   ?? 20,
                implementation:   evaluation.rubricImplementation   ?? 25,
                innovation:       evaluation.rubricInnovation       ?? 20,
                documentation:    evaluation.rubricDocumentation    ?? 15,
            };

            await buildAgentsOnlyGraph(onProgress, trace ?? undefined).invoke({
                evaluationId,
                projectTitle:     evaluation.project.title,
                githubUrl:        evaluation.submission.githubUrl ?? undefined,
                reportUrl:        evaluation.submission.reportUrl ?? undefined,
                pptUrl:           evaluation.submission.pptUrl    ?? undefined,
                rubric,
                pdfText:          evaluation.pdfText       ?? "",
                pptText:          evaluation.pptText       ?? "",
                githubSummary:    evaluation.githubSummary ?? "",
                documentAnalysis: evaluation.documentAnalysis as any,
                codeAnalysis:     evaluation.codeAnalysis     as any,
                evaluation:       undefined,
                error:            undefined,
            });

            const finishedEvaluation = await prisma.evaluation.findUnique({
                where: { id: evaluationId },
                include: {
                    project: { include: { team: true } },
                    submission: true,
                    judge: true,
                },
            });

            await publishTransient(progressQueue, { 
                step: "done", 
                status: "completed", 
                evaluation: finishedEvaluation 
            });

            const userIds = evaluation.project.team.members.map((m: any) => m.student.user.id);
            await publishMessage(QUEUES.NOTIFICATION, {
                evaluationId,
                projectTitle: evaluation.project.title,
                userIds,
            } as NotificationJob);

            console.log(`[agent-worker] Complete for ${evaluationId}`);
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            console.error(`[agent-worker] LLM pipeline failed for ${evaluationId}: ${errMsg}`);
            await publishTransient(progressQueue, { step: "error", status: "failed", message: errMsg }).catch(() => {});
        } finally {
            cleanup(evaluationId);
            await langfuse?.flushAsync().catch(() => {});
        }
    }

    channel.consume(QUEUES.AGENT_RUN, async (msg) => {
        if (!msg) return;

        let evaluationId = "";
        try {
            const job = JSON.parse(msg.content.toString()) as WorkerResultReadyJob;
            evaluationId = job.evaluationId;
            const workerType = job.workerType; // "doc" | "github"

            console.log(`[agent-worker] Signal from ${workerType}-worker for ${evaluationId}`);

            // Already running or done — discard
            if (processingSet.has(evaluationId)) {
                console.log(`[agent-worker] ${evaluationId} in-flight — discarding extra signal`);
                channel.ack(msg);
                return;
            }

            // Track this signal
            if (!pendingSignals.has(evaluationId)) {
                pendingSignals.set(evaluationId, new Set());
                pendingMsgs.set(evaluationId, []);

                // Safety timeout: if second signal never arrives, release after 5 min
                const t = setTimeout(async () => {
                    console.warn(`[agent-worker] Timeout waiting for second signal on ${evaluationId} — checking DB directly`);
                    const buffered = pendingMsgs.get(evaluationId) ?? [];
                    // Check DB — maybe second worker wrote but signal was lost
                    const ev = await prisma.evaluation.findUnique({ where: { id: evaluationId } });
                    if (ev?.documentAnalysis && ev?.codeAnalysis) {
                        console.log(`[agent-worker] DB has both results for ${evaluationId} despite missing signal — running`);
                        cleanup(evaluationId);
                        await runPipeline(evaluationId, buffered);
                    } else {
                        console.error(`[agent-worker] Timeout: missing result(s) for ${evaluationId} (doc:${!!ev?.documentAnalysis} github:${!!ev?.codeAnalysis})`);
                        await publishTransient(progressQueueName(evaluationId), {
                            step: "error", status: "failed",
                            message: "Timed out waiting for both workers",
                        }).catch(() => {});
                        buffered.forEach(m => channel.ack(m));
                        cleanup(evaluationId);
                    }
                }, SIGNAL_WAIT_TIMEOUT_MS);
                timeoutHandles.set(evaluationId, t);
            }

            pendingSignals.get(evaluationId)!.add(workerType);
            pendingMsgs.get(evaluationId)!.push(msg);

            const received = pendingSignals.get(evaluationId)!;
            console.log(`[agent-worker] Signals received for ${evaluationId}: [${[...received].join(", ")}]`);

            // Wait for BOTH "doc" and "github" signals before running
            if (received.has("doc") && received.has("github")) {
                const buffered = pendingMsgs.get(evaluationId)!.slice();
                cleanup(evaluationId);
                await runPipeline(evaluationId, buffered);
            }
            // else: still waiting for the second signal — message stays buffered (not acked yet)
        } catch (err) {
            console.error(`[agent-worker] Unexpected error for ${evaluationId}:`, err);
            channel.nack(msg, false, false);
        }
    });
}

startAgentWorker().catch(console.error);
