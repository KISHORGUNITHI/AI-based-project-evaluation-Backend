import type { LangfuseTraceClient } from "langfuse";
import type { EvaluationState } from "../state.js";
import type { ProgressCallback } from "../evalution-graph.js";
import { getNimModel } from "../../../../lib/nim.js";
import { z } from "zod";

export const evaluationResultZodSchema = z.object({
    aiScore:               z.number().min(0).max(100),
    problemStatementScore: z.number().min(0).max(10),
    solutionDesignScore:   z.number().min(0).max(10),
    implementationScore:   z.number().min(0).max(10),
    innovationScore:       z.number().min(0).max(10),
    documentationScore:    z.number().min(0).max(10),
    strengths:             z.array(z.string()),
    weaknesses:            z.array(z.string()),
    suggestions:           z.array(z.string()),
    feedback:              z.string(),
    reasoning:             z.string(),
});

function extractScore(text: string, label: string): number | null {
    const patterns = [
        new RegExp(`"${label}"\\s*:\\s*(\\d+(?:\\.\\d+)?)`, "i"),
        new RegExp(`${label}[^\\d]*(\\d+(?:\\.\\d+)?)`, "i"),
    ];
    for (const p of patterns) {
        const m = text.match(p);
        if (m) return parseFloat(m[1]);
    }
    return null;
}

function extractArray(text: string, label: string): string[] {
    const m = text.match(new RegExp(`"${label}"\\s*:\\s*\\[([^\\]]*?)\\]`, "is"));
    if (!m) return [];
    return m[1].split(",")
        .map(s => s.replace(/^["'\s]+|["'\s]+$/g, "").trim())
        .filter(Boolean);
}

function extractString(text: string, label: string): string {
    const m = text.match(new RegExp(`"${label}"\\s*:\\s*"([^"]*?)"`, "is"));
    return m ? m[1].trim() : "";
}

export async function evaluationAgent(
    state: EvaluationState,
    onProgress: ProgressCallback,
    trace?: LangfuseTraceClient
): Promise<Partial<EvaluationState>> {
    if (state.documentAnalysis === undefined) {
        throw new Error("EvaluationAgent: documentAnalysis is missing from state");
    }
    if (state.codeAnalysis === undefined) {
        throw new Error("EvaluationAgent: codeAnalysis is missing from state");
    }

    const modelName = process.env.NIM_MODEL ?? "meta/llama-3.1-8b-instruct";
    onProgress({ step: "AI Scoring", status: "started" });

    const span = trace?.span({ name: "evaluation-agent", input: { rubric: state.rubric } }) ?? null;

    try {
        const model = getNimModel();
        const doc  = state.documentAnalysis;
        const code = state.codeAnalysis;

        // ── Build rich document context ──────────────────────────────────────
        const docContext = [
            doc.problemStatement  ? `PROBLEM STATEMENT:\n${doc.problemStatement}` : "",
            doc.proposedSolution  ? `PROPOSED SOLUTION:\n${doc.proposedSolution}` : "",
            doc.architecture      ? `ARCHITECTURE:\n${doc.architecture}` : "",
            doc.methodology       ? `METHODOLOGY:\n${doc.methodology}` : "",
            doc.presentationQuality ? `PRESENTATION QUALITY:\n${doc.presentationQuality}` : "",
            doc.features?.length  ? `KEY FEATURES:\n${doc.features.slice(0, 10).map((f: string) => `- ${f}`).join("\n")}` : "",
        ].filter(Boolean).join("\n\n").slice(0, 2500);

        // ── Build rich code context ───────────────────────────────────────────
        const hasCode = code.techStack?.length > 0 || code.codeQualityNaming !== "N/A — no repository provided";
        // Support both new flat fields and legacy codeQuality string (old DB records)
        const legacyQuality = (code as any).codeQuality;
        const codeQualityText = typeof legacyQuality === "string"
            ? legacyQuality
            : [
                `  Naming: ${code.codeQualityNaming ?? "N/A"}`,
                `  Organization: ${code.codeQualityOrganization ?? "N/A"}`,
                `  Error Handling: ${code.codeQualityErrorHandling ?? "N/A"}`,
                `  Test Coverage: ${code.codeQualityTestCoverage ?? "N/A"}`,
            ].join("\n");
        const metricsText = code.repoMetrics ? [
            `  Total files: ${code.repoMetrics.totalFiles}`,
            `  Test file ratio: ${(code.repoMetrics.testFileRatio * 100).toFixed(0)}%`,
            `  Has Dockerfile: ${code.repoMetrics.hasDockerfile}`,
            `  Has CI/CD: ${code.repoMetrics.hasCiConfig}`,
            `  Notebooks: ${code.repoMetrics.notebookCount}`,
        ].join("\n") : "";
        const codeContext = hasCode ? [
            `TECH STACK: ${(code.techStack ?? []).join(", ")}`,
            `COMPLEXITY: ${code.complexity ?? "unknown"}`,
            `CODE QUALITY:\n${codeQualityText}`,
            metricsText ? `REPO METRICS:\n${metricsText}` : "",
            `ARCHITECTURE PATTERN: ${code.architecturePattern ?? "N/A"}`,
            `FOLDER STRUCTURE: ${code.folderStructure ?? "N/A"}`,
            `HAS TESTS: ${code.hasTests ? "Yes" : "No"}`,
            `HAS DOCUMENTATION: ${code.hasDocumentation ? "Yes" : "No"}`,
            code.strengths?.length  ? `CODE STRENGTHS:\n${code.strengths.slice(0, 5).map((s: string) => `- ${s}`).join("\n")}` : "",
            code.weaknesses?.length ? `CODE WEAKNESSES:\n${code.weaknesses.slice(0, 5).map((w: string) => `- ${w}`).join("\n")}` : "",
            code.securityIssues?.length ? `SECURITY ISSUES:\n${code.securityIssues.slice(0, 5).map((s: string) => `- ${s}`).join("\n")}` : "",
        ].filter(Boolean).join("\n") : "No GitHub repository available.";

        const hasDoc = (doc.problemStatement?.length ?? 0) > 30;

        const prompt = `You are an expert technical judge evaluating a student hackathon project. You have been given FULL analysis of their documents and code. Use ALL the evidence provided to give a fair, specific, and detailed evaluation.

=== PROJECT: ${state.projectTitle} ===

=== DOCUMENT ANALYSIS ===
${hasDoc ? docContext : "No document content available."}

=== CODE ANALYSIS ===
${codeContext}

=== RUBRIC WEIGHTS ===
${Object.entries(state.rubric).map(([k, v]) => `${k}: ${v}%`).join(", ")}

=== SCORING INSTRUCTIONS ===
Score each dimension from 0–10. Be specific — reference actual evidence from the analysis above.

1. problemStatementScore (0–10):
   - Is the problem real, clearly defined, and well-understood?
   - Evidence from: problemStatement, proposedSolution
   - 8–10: Excellent, specific real-world problem with deep understanding
   - 5–7: Good problem but somewhat generic or unclear scope
   - 2–4: Vague or missing problem definition

2. solutionDesignScore (0–10):
   - Is the solution well-designed, technically sound, and appropriate?
   - Evidence from: architecture, methodology, techStack, architecturePattern
   - 8–10: Elegant, appropriate architecture with good design choices
   - 5–7: Reasonable design with minor issues
   - 2–4: Poor or inappropriate design

3. implementationScore (0–10):
   - How well is the solution actually built?
   - Evidence from: complexity, codeQuality, hasTests, techStack, folderStructure
   - 8–10: High quality, complex, well-tested implementation
   - 5–7: Working implementation with some quality issues
   - 2–4: Basic or poor implementation
   - 0: No code / no repository

4. innovationScore (0–10):
   - How creative, unique, or novel is the solution?
   - Evidence from: features, proposedSolution, techStack
   - 8–10: Highly innovative, novel approach or clever combination
   - 5–7: Some creative elements but mostly conventional
   - 2–4: Standard/copied approach

5. documentationScore (0–10):
   - How well is the project documented?
   - Evidence from: presentationQuality, hasDocumentation, pdfText, pptText
   - 8–10: Comprehensive, clear, professional documentation
   - 5–7: Adequate documentation with gaps
   - 2–4: Poor or minimal documentation

Compute aiScore = (problemStatementScore × ${state.rubric.problemStatement} + solutionDesignScore × ${state.rubric.solutionDesign} + implementationScore × ${state.rubric.implementation} + innovationScore × ${state.rubric.innovation} + documentationScore × ${state.rubric.documentation}) × 10 / 100

For strengths, weaknesses, and suggestions: be SPECIFIC. Reference actual findings from the analysis (e.g., "Uses FastAPI with proper async handling" not "Good code").

For feedback: write 3–4 sentences that summarize the project's overall quality, what stands out, and the main area for improvement. Be constructive and specific.

Respond ONLY with valid JSON (no markdown, no extra text):
{
  "problemStatementScore": <integer 0-10>,
  "solutionDesignScore": <integer 0-10>,
  "implementationScore": <integer 0-10>,
  "innovationScore": <integer 0-10>,
  "documentationScore": <integer 0-10>,
  "aiScore": <computed float>,
  "strengths": ["<specific strength 1>", "<specific strength 2>", "<specific strength 3>"],
  "weaknesses": ["<specific weakness 1>", "<specific weakness 2>"],
  "suggestions": ["<actionable suggestion 1>", "<actionable suggestion 2>"],
  "feedback": "<3-4 sentence specific summary>",
  "reasoning": "<brief explanation of scoring decisions>"
}`;

        const generation = span?.generation({
            name: "evaluation-agent-llm",
            model: modelName,
            input: { promptLen: prompt.length, hasDoc, hasCode },
        }) ?? null;

        const response = await model.invoke(prompt);
        const rawText = typeof response.content === "string" ? response.content : JSON.stringify(response.content);

        console.log(`[evaluationAgent] Raw response (500c): ${rawText.slice(0, 500)}`);

        let parsed: any = null;
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try { parsed = JSON.parse(jsonMatch[0]); } catch { /* fall through */ }
        }

        const problemStatementScore = Math.min(10, Math.max(0, parsed?.problemStatementScore ?? extractScore(rawText, "problemStatementScore") ?? (hasDoc ? 5 : 2)));
        const solutionDesignScore   = Math.min(10, Math.max(0, parsed?.solutionDesignScore   ?? extractScore(rawText, "solutionDesignScore")   ?? (hasDoc ? 5 : 2)));
        const implementationScore   = Math.min(10, Math.max(0, parsed?.implementationScore   ?? extractScore(rawText, "implementationScore")   ?? (hasCode ? 5 : 0)));
        const innovationScore       = Math.min(10, Math.max(0, parsed?.innovationScore       ?? extractScore(rawText, "innovationScore")       ?? 4));
        const documentationScore    = Math.min(10, Math.max(0, parsed?.documentationScore    ?? extractScore(rawText, "documentationScore")    ?? (code.hasDocumentation ? 6 : 3)));

        const aiScore = Math.round(
            (problemStatementScore * state.rubric.problemStatement +
             solutionDesignScore   * state.rubric.solutionDesign   +
             implementationScore   * state.rubric.implementation   +
             innovationScore       * state.rubric.innovation       +
             documentationScore    * state.rubric.documentation) * 10 / 100
        );

        // Use specific strengths/weaknesses from code analysis if LLM doesn't provide good ones
        const defaultStrengths = [
            ...(code.strengths?.slice(0, 2) ?? []),
            ...(doc.features?.slice(0, 1) ?? []),
        ].filter(Boolean);
        const defaultWeaknesses = [
            ...(code.weaknesses?.slice(0, 2) ?? []),
            ...(code.securityIssues?.slice(0, 1) ?? []),
        ].filter(Boolean);

        const strengths   = Array.isArray(parsed?.strengths)   && parsed.strengths.length   ? parsed.strengths   : (extractArray(rawText, "strengths").length   ? extractArray(rawText, "strengths")   : defaultStrengths);
        const weaknesses  = Array.isArray(parsed?.weaknesses)  && parsed.weaknesses.length  ? parsed.weaknesses  : (extractArray(rawText, "weaknesses").length  ? extractArray(rawText, "weaknesses")  : defaultWeaknesses);
        const suggestions = Array.isArray(parsed?.suggestions) && parsed.suggestions.length ? parsed.suggestions : extractArray(rawText, "suggestions");
        const feedback    = (parsed?.feedback ?? extractString(rawText, "feedback") ?? "").trim() || "Evaluation completed.";
        const reasoning   = (parsed?.reasoning ?? extractString(rawText, "reasoning") ?? "").trim();

        const evaluation = {
            aiScore,
            problemStatementScore,
            solutionDesignScore,
            implementationScore,
            innovationScore,
            documentationScore,
            strengths:   strengths.filter(Boolean),
            weaknesses:  weaknesses.filter(Boolean),
            suggestions: suggestions.filter(Boolean),
            feedback:    String(feedback),
            reasoning:   String(reasoning),
        };

        console.log(`[evaluationAgent] Final scores: aiScore=${aiScore} problem=${problemStatementScore} solution=${solutionDesignScore} impl=${implementationScore} innov=${innovationScore} docs=${documentationScore}`);

        generation?.end({ output: { aiScore } });
        span?.end({ output: { aiScore } });
        onProgress({ step: "AI Scoring", status: "done" });

        return { evaluation };
    } catch (err) {
        span?.end({ level: "ERROR", statusMessage: (err as Error).message });
        onProgress({ step: "AI Scoring", status: "failed" });
        throw err;
    }
}
