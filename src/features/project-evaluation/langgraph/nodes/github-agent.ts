import { z } from "zod";
import type { LangfuseTraceClient } from "langfuse";
import type { EvaluationState } from "../state.js";
import type { ProgressCallback } from "../evalution-graph.js";
import { getNimModel } from "../../../../lib/nim.js";
import { extractRepoMetrics } from "../../github/github-summary-service.js";
import type { RepoMetrics } from "../types.js";

// ─── Flat schema — Llama 8B works best with flat, simple JSON ────────────────
// Nested objects are unreliable with small models and withStructuredOutput.
// We keep all fields at the top level and limit array sizes aggressively.

const codeAnalysisZodSchema = z.object({
    techStack:                 z.array(z.string()).max(15),
    codeQualityNaming:         z.string().max(200),
    codeQualityOrganization:   z.string().max(200),
    codeQualityErrorHandling:  z.string().max(200),
    codeQualityTestCoverage:   z.string().max(200),
    folderStructure:           z.string().max(300),
    architecturePattern:       z.string().max(300),
    hasTests:                  z.boolean(),
    hasDocumentation:          z.boolean(),
    securityIssues:            z.array(z.string()).max(5),
    strengths:                 z.array(z.string()).max(5),
    weaknesses:                z.array(z.string()).max(5),
    complexity:                z.enum(["low", "medium", "high"]),
});

// ─── Empty/zeroed result ──────────────────────────────────────────────────────

function zeroedAnalysis(metrics: RepoMetrics) {
    return {
        techStack: [],
        codeQualityNaming:        "N/A — no repository provided",
        codeQualityOrganization:  "N/A",
        codeQualityErrorHandling: "N/A",
        codeQualityTestCoverage:  "N/A",
        folderStructure:          "N/A",
        architecturePattern:      "N/A",
        hasTests:                 false,
        hasDocumentation:         false,
        securityIssues:           [] as string[],
        strengths:                [] as string[],
        weaknesses:               [] as string[],
        complexity:               "low" as const,
        repoMetrics:              metrics,
    };
}

// ─── Node ─────────────────────────────────────────────────────────────────────

export async function githubAgent(
    state: EvaluationState,
    onProgress: ProgressCallback,
    trace?: LangfuseTraceClient
): Promise<Partial<EvaluationState>> {
    const modelName = process.env.NIM_MODEL ?? "meta/llama-3.1-8b-instruct";
    const summary = state.githubSummary ?? "";

    onProgress({ step: "Code Analysis", status: "started" });

    const span = trace?.span({
        name:  "github-agent",
        input: { summaryLen: summary.length, hasContent: summary.trim().length > 0 },
    }) ?? null;

    // Pre-compute metrics whether or not we call the LLM
    const metricsMatch = summary.match(/=== REPOSITORY METRICS \(pre-computed facts\) ===\n([\s\S]*?)\n===/);
    const repoMetrics = parseMetricsFromText(metricsMatch?.[1] ?? "");

    // Fast-path: no GitHub repo or empty summary
    if (summary.trim() === "") {
        span?.end({ output: { skipped: true, reason: "empty summary" } });
        onProgress({ step: "Code Analysis", status: "done" });
        return { codeAnalysis: zeroedAnalysis(repoMetrics) };
    }

    try {
        const model = getNimModel();

        // Keep the prompt compact — Llama 8B has ~8K token context.
        // The summary itself already contains the key information.
        // We truncate aggressively to leave room for the output.
        const summaryForPrompt = summary.slice(0, 4000);

        const prompt = `You are a software engineer reviewing a GitHub repository. Analyse the summary below and return structured JSON.

Fields to fill:
- techStack: array of up to 15 tech/library names detected (ML libs, backend, frontend, DevOps)
- codeQualityNaming: 1-2 sentences on naming conventions (descriptive? consistent? follows language standards?)
- codeQualityOrganization: 1-2 sentences on code organization (modular? concerns separated? clear folder hierarchy?)
- codeQualityErrorHandling: 1-2 sentences on error handling (try/catch present? validation? edge cases?)
- codeQualityTestCoverage: 1-2 sentences on test quality (based on test file ratio shown in metrics)
- folderStructure: 1-2 sentences describing repo layout
- architecturePattern: patterns found (MVC, pipeline, agent-based, RAG, event-driven, etc.)
- hasTests: true if test files exist (use test file ratio from metrics)
- hasDocumentation: true if README or docstrings are present
- securityIssues: up to 5 SPECIFIC issues (e.g. "No auth middleware on upload route"). Empty array if none found.
- strengths: up to 5 SPECIFIC technical strengths referencing actual files or patterns
- weaknesses: up to 5 SPECIFIC gaps (missing error handling, no tests, no CI, etc.)
- complexity: "low", "medium", or "high" based on system scope

Repository Summary:
${summaryForPrompt}`;

        const generation = span?.generation({
            name:  "github-agent-llm",
            model: modelName,
            input: { promptLen: prompt.length },
        }) ?? null;

        const structured = model.withStructuredOutput(codeAnalysisZodSchema);
        const llmResult = await structured.invoke(prompt);

        // Merge LLM output with pre-computed metrics
        const codeAnalysis = {
            ...llmResult,
            repoMetrics,
            // Override hasTests with hard metric if it's more accurate
            hasTests: repoMetrics.testFileRatio > 0 || llmResult.hasTests,
        };

        console.log(`[githubAgent] techStack: ${JSON.stringify(codeAnalysis.techStack)}, complexity: ${codeAnalysis.complexity}, testRatio: ${repoMetrics.testFileRatio}`);
        generation?.end({ output: { techStack: codeAnalysis.techStack, complexity: codeAnalysis.complexity } });
        span?.end({ output: { techStack: codeAnalysis.techStack, complexity: codeAnalysis.complexity } });
        onProgress({ step: "Code Analysis", status: "done" });
        return { codeAnalysis };

    } catch (error) {
        span?.end({ level: "ERROR", statusMessage: (error as Error).message });
        onProgress({ step: "Code Analysis", status: "failed" });
        throw error;
    }
}

// ─── Helper: re-parse metrics from the embedded text block ───────────────────

function parseMetricsFromText(text: string): RepoMetrics {
    const get = (key: string) => {
        const match = text.match(new RegExp(`${key}:\\s*(.+)`));
        return match?.[1]?.trim() ?? "";
    };

    const totalFiles      = parseInt(get("Total source files")) || 0;
    const notebookCount   = parseInt(get("Jupyter notebooks")) || 0;
    const avgFileSizeLines = parseInt(get("Average file size")) || 0;
    const testRatioStr    = get("Test file ratio");
    const testFileRatio   = testRatioStr ? parseInt(testRatioStr) / 100 : 0;

    const langStr = get("Languages");
    const languageBreakdown: Record<string, number> = {};
    if (langStr && langStr !== "N/A") {
        for (const part of langStr.split(",")) {
            const m = part.trim().match(/^(.+?):\s*(\d+)\s*files?$/);
            if (m) languageBreakdown[m[1].trim()] = parseInt(m[2]);
        }
    }

    return {
        totalFiles,
        languageBreakdown,
        testFileRatio:  Math.round(testFileRatio * 100) / 100,
        hasDockerfile:  get("Has Dockerfile")  === "true",
        hasCiConfig:    get("Has CI/CD config") === "true",
        hasEnvExample:  get("Has .env.example") === "true",
        hasLintConfig:  get("Has lint config")  === "true",
        notebookCount,
        avgFileSizeLines,
    };
}
