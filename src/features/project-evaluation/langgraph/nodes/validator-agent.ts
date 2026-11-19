import type { LangfuseTraceClient } from "langfuse";
import type { EvaluationState } from "../state.js";
import type { ProgressCallback } from "../evalution-graph.js";

export async function validatorAgent(
    state: EvaluationState,
    onProgress: ProgressCallback,
    trace?: LangfuseTraceClient
): Promise<Partial<EvaluationState>> {
    if (state.evaluation === undefined) {
        throw new Error("ValidatorAgent: evaluation is missing from state");
    }

    onProgress({ step: "Validation", status: "started" });

    const span = trace?.span({
        name:  "validator-agent",
        input: { currentAiScore: state.evaluation.aiScore },
    }) ?? null;

    try {
        const ev = { ...state.evaluation };
        const r = state.rubric;

        // Ensure sub-scores are bounded between 0 and 10
        ev.problemStatementScore = Math.min(10, Math.max(0, Number(ev.problemStatementScore ?? 5)));
        ev.solutionDesignScore   = Math.min(10, Math.max(0, Number(ev.solutionDesignScore   ?? 5)));
        ev.implementationScore   = Math.min(10, Math.max(0, Number(ev.implementationScore   ?? 5)));
        ev.innovationScore       = Math.min(10, Math.max(0, Number(ev.innovationScore       ?? 4)));
        ev.documentationScore    = Math.min(10, Math.max(0, Number(ev.documentationScore    ?? 5)));

        // Deterministically recompute exact weighted aiScore
        const totalWeight =
            (r.problemStatement ?? 20) +
            (r.solutionDesign ?? 20) +
            (r.implementation ?? 25) +
            (r.innovation ?? 20) +
            (r.documentation ?? 15);
        const normalizedWeight = totalWeight > 0 ? totalWeight : 100;

        ev.aiScore = Math.round(
            ((ev.problemStatementScore * (r.problemStatement ?? 20) +
              ev.solutionDesignScore   * (r.solutionDesign   ?? 20) +
              ev.implementationScore   * (r.implementation   ?? 25) +
              ev.innovationScore       * (r.innovation       ?? 20) +
              ev.documentationScore    * (r.documentation    ?? 15)) / normalizedWeight) * 10
        );

        // Ensure arrays are initialized and filtered
        ev.strengths = Array.isArray(ev.strengths) ? ev.strengths.filter(Boolean) : [];
        ev.weaknesses = Array.isArray(ev.weaknesses) ? ev.weaknesses.filter(Boolean) : [];
        ev.suggestions = Array.isArray(ev.suggestions) ? ev.suggestions.filter(Boolean) : [];

        // Quality rule validations
        if (ev.strengths.length === 0 && (ev.problemStatementScore >= 7 || ev.implementationScore >= 7 || ev.solutionDesignScore >= 7)) {
            ev.strengths.push("Demonstrates solid execution and sound technical fundamentals.");
        }
        if (ev.weaknesses.length === 0 && (ev.problemStatementScore <= 4 || ev.implementationScore <= 4 || ev.documentationScore <= 4)) {
            ev.weaknesses.push("Implementation or documentation depth could be improved with comprehensive testing and clearer architecture.");
        }

        span?.end({ output: { aiScore: ev.aiScore } });
        onProgress({ step: "Validation", status: "done" });

        return { evaluation: ev };
    } catch (err) {
        span?.end({ level: "ERROR", statusMessage: (err as Error).message });
        onProgress({ step: "Validation", status: "failed" });
        throw err;
    }
}
