/**
 * Legacy single-worker entry point.
 * Runs the full LangGraph pipeline in one process.
 * Do NOT run alongside doc-worker — both consume DOC_ANALYSIS.
 */
import "dotenv/config";
import { consumeQueue } from "../queue/consumer.js";
import { publishTransient } from "../queue/producer.js";
import { QUEUES } from "../queue/queues.js";
import type { AiEvaluationJob } from "../queue/types.js";
import EvaluationService from "../services/evaluationservices.js";
import { progressQueueName } from "./progress.js";

const evaluationService = new EvaluationService();

async function startWorker() {
    console.log("[worker] Starting AI evaluation worker...");

    await consumeQueue(QUEUES.AI_EVALUATION, async (job: AiEvaluationJob) => {
        const { evaluationId, judgeId } = job;
        console.log(`[worker] Processing AI evaluation for ${evaluationId}`);

        const progressQueue = progressQueueName(evaluationId);

        const onProgress = async (event: { step: string; status: string }) => {
            try {
                await publishTransient(progressQueue, event);
            } catch (err) {
                console.error(`[worker] Failed to publish progress event:`, err);
            }
        };

        try {
            await evaluationService.triggerAiEvaluation(evaluationId, judgeId, onProgress);
            await publishTransient(progressQueue, { step: "done", status: "completed" });
            console.log(`[worker] AI evaluation complete for ${evaluationId}`);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`[worker] AI evaluation failed for ${evaluationId}: ${message}`);
            await publishTransient(progressQueue, { step: "error", status: "failed", message }).catch(() => {});
        }
    });
}

const isMain = process.argv[1]?.endsWith("evaluation-worker.ts") || process.argv[1]?.endsWith("evaluation-worker.js");
if (isMain) {
    startWorker().catch(console.error);
}

export { progressQueueName } from "./progress.js";
