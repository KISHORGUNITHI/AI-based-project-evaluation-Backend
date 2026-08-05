/**
 * GitHub Analysis Worker
 *
 * Consumes: GITHUB_CLONE queue
 * Does:
 *   1. Clones the GitHub repo and generates a text summary
 *   2. Runs GithubAgent LLM to produce CodeAnalysis
 *   3. Saves githubSummary, codeAnalysis back to the evaluation row
 *   4. Publishes WorkerResultReadyJob { workerType: "github" } to AGENT_RUN queue
 */
import "dotenv/config";
import { consumeQueue } from "../queue/consumer.js";
import { publishMessage, publishTransient } from "../queue/producer.js";
import { QUEUES } from "../queue/queues.js";
import type { GithubCloneJob, WorkerResultReadyJob } from "../queue/types.js";
import prisma from "../db/prisma.js";
import { GithubCloneService } from "../features/project-evaluation/github/github-clone-service.js";
import { GithubParserService } from "../features/project-evaluation/github/github-parser-service.js";
import { GithubSummaryService } from "../features/project-evaluation/github/github-summary-service.js";
import { getLangfuse } from "../lib/langfuse.js";
import { progressQueueName } from "./progress.js";
import { PLACEHOLDER_CODE_ANALYSIS } from "./placeholders.js";

const githubClone = new GithubCloneService();
const githubParser = new GithubParserService();
const githubSummaryService = new GithubSummaryService();

async function startGithubWorker() {
    console.log("[github-worker] Starting...");

    await consumeQueue(QUEUES.GITHUB_CLONE, async (job: GithubCloneJob) => {
        const { evaluationId, githubUrl } = job;
        console.log(`[github-worker] Processing evaluation ${evaluationId}`);

        const langfuse = getLangfuse();
        const trace = langfuse?.trace({ name: "github-worker", metadata: { evaluationId } });

        let githubSummary = "";
        let repoPath: string | null = null;

        try {
            if (githubUrl) {
                repoPath = await githubClone.cloneRepository(githubUrl);
                const project = await githubParser.parseRepository(repoPath);
                githubSummary = githubSummaryService.generateSummary(project);
                console.log(`[github-worker] Summary: ${githubSummary.length}c for ${githubUrl}`);
            } else {
                console.log(`[github-worker] No GitHub URL for ${evaluationId} — skipping clone`);
            }

            // Run GithubAgent LLM
            const { githubAgent } = await import("../features/project-evaluation/langgraph/nodes/github-agent.js");
            const fakeState = { githubSummary } as any;
            const noopProgress = () => {};
            const result = await githubAgent(fakeState, noopProgress, trace as any);
            const codeAnalysis = result.codeAnalysis ?? null;

            // Save to DB
            await prisma.evaluation.update({
                where: { id: evaluationId },
                data: { githubSummary, codeAnalysis: codeAnalysis as any },
            });
            console.log(`[github-worker] Saved codeAnalysis for ${evaluationId}`);

            trace?.span({ name: "github-worker-complete" }).end({ output: { summaryLen: githubSummary.length } });
        } catch (err) {
            console.error(`[github-worker] Failed for ${evaluationId}:`, err);
            trace?.span({ name: "github-worker-error" }).end({ level: "ERROR", statusMessage: String(err) });

            await prisma.evaluation.update({
                where: { id: evaluationId },
                data: { githubSummary: "", codeAnalysis: PLACEHOLDER_CODE_ANALYSIS as any },
            }).catch(() => {});
        } finally {
            if (repoPath) await githubClone.deleteRepository(repoPath).catch(() => {});
            await langfuse?.flushAsync().catch(() => {});

            // Always signal AgentWorker (even on failure — agent handles null codeAnalysis)
            const readyJob: WorkerResultReadyJob = { evaluationId, workerType: "github" };
            await publishMessage(QUEUES.AGENT_RUN, readyJob);
        }
    });
}

startGithubWorker().catch(console.error);
