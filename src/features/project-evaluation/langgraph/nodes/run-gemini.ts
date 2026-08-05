import { evaluateProject } from "../../../../utils/gemini.js";
import type { EvaluationState } from "../state.js";
import type { ProgressCallback } from "../evalution-graph.js";
import type { EvaluationResult } from "../types.js";

/**
 * @deprecated Legacy single-call node — superseded by the multi-agent pipeline
 * (documentAgent → githubAgent → evaluationAgent → validatorAgent → persistResult).
 * Kept for backward compatibility; not wired into the current evaluation graph.
 */
export async function runGemini(state: EvaluationState, onProgress: ProgressCallback): Promise<Partial<EvaluationState>> {
    onProgress({ step: "AI Analysis", status: "started" });
    const result = await evaluateProject({
        projectTitle: state.projectTitle,
        githubUrl: state.githubUrl,
        pdfText: state.pdfText,
        pptText: state.pptText,
        githubSummary: state.githubSummary,
        rubric: state.rubric,
    });
    onProgress({ step: "AI Analysis", status: "done" });

    // Map EvaluationOutput → EvaluationResult, supplying defaults for required fields
    const evaluation: EvaluationResult = {
        aiScore: result.aiScore,
        feedback: result.feedback,
        problemStatementScore: result.problemStatementScore ?? 0,
        solutionDesignScore: result.solutionDesignScore ?? 0,
        implementationScore: result.implementationScore ?? 0,
        innovationScore: result.innovationScore ?? 0,
        documentationScore: result.documentationScore ?? 0,
        strengths: result.strengths ?? [],
        weaknesses: result.weaknesses ?? [],
        suggestions: result.suggestions ?? [],
        reasoning: "",
    };

    return { evaluation };
}
