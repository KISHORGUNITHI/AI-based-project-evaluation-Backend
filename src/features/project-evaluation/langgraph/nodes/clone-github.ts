import { GithubCloneService } from "../../github/github-clone-service.js";
import { GithubParserService } from "../../github/github-parser-service.js";
import { GithubSummaryService } from "../../github/github-summary-service.js";
import type { EvaluationState } from "../state.js";
import type { ProgressCallback } from "../evalution-graph.js";

const githubClone = new GithubCloneService();
const githubParser = new GithubParserService();
const githubSummaryService = new GithubSummaryService();

export async function cloneGithub(state: EvaluationState, onProgress: ProgressCallback): Promise<Partial<EvaluationState>> {
    onProgress({ step: "GitHub Analysis", status: "started" });

    if (!state.githubUrl) {
        console.log("[cloneGithub] No GitHub URL provided — skipping");
        onProgress({ step: "GitHub Analysis", status: "skipped" });
        return { githubSummary: "" };
    }

    let repoPath: string | null = null;
    try {
        console.log(`[cloneGithub] Cloning ${state.githubUrl}…`);
        repoPath = await githubClone.cloneRepository(state.githubUrl);
        const project = await githubParser.parseRepository(repoPath);
        const summary = githubSummaryService.generateSummary(project);
        console.log(`[cloneGithub] Summary generated — ${summary.length} chars for ${state.githubUrl}`);
        onProgress({ step: "GitHub Analysis", status: "done" });
        return { githubSummary: summary };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Log the full error — this is why github analysis silently skips
        console.error(`[cloneGithub] FAILED for ${state.githubUrl}:\n  ${message}`);
        onProgress({ step: "GitHub Analysis", status: "failed" });
        // Re-throw so the worker surfaces the real error instead of silently producing N/A results
        throw new Error(`GitHub clone failed: ${message}`);
    } finally {
        if (repoPath) await githubClone.deleteRepository(repoPath).catch(() => {});
    }
}
