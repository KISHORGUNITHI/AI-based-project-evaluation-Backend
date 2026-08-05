import type { LangfuseTraceClient } from "langfuse";
import type { EvaluationState } from "../state.js";
import type { ProgressCallback } from "../evalution-graph.js";
import { evaluationResultZodSchema } from "./evaluation-agent.js";
import { getNimModel } from "../../../../lib/nim.js";

export async function validatorAgent(
    state: EvaluationState,
    onProgress: ProgressCallback,
    trace?: LangfuseTraceClient
): Promise<Partial<EvaluationState>> {
    if (state.evaluation === undefined) {
        throw new Error("ValidatorAgent: evaluation is missing from state");
    }

    const modelName = process.env.NIM_MODEL ?? "meta/llama-3.1-8b-instruct";
    onProgress({ step: "Validation", status: "started" });

    const span = trace?.span({
        name:  "validator-agent",
        input: { currentAiScore: state.evaluation.aiScore },
    }) ?? null;

    try {
        const model = getNimModel();

        const prompt = `You are an AI evaluation validator. Review this evaluation for internal consistency and correct any issues.

EVALUATION RESULT:
${JSON.stringify(state.evaluation, null, 2)}

RUBRIC WEIGHTS:
${JSON.stringify(state.rubric, null, 2)}

Rules:
1. Recompute aiScore = (problemStatementScore × ${state.rubric.problemStatement} + solutionDesignScore × ${state.rubric.solutionDesign} + implementationScore × ${state.rubric.implementation} + innovationScore × ${state.rubric.innovation} + documentationScore × ${state.rubric.documentation}) × 10 / 100. Correct if deviation > 1.0.
2. If any sub-score ≥ 7, strengths must be non-empty.
3. If any sub-score ≤ 4, weaknesses must be non-empty.
4. Fix feedback that contradicts scores.
5. IMPORTANT: Do NOT change scores to 0 unless there is absolutely no evidence. Keep existing non-zero scores.

Respond ONLY with valid JSON (no markdown):
{
  "problemStatementScore": <0-10>,
  "solutionDesignScore": <0-10>,
  "implementationScore": <0-10>,
  "innovationScore": <0-10>,
  "documentationScore": <0-10>,
  "aiScore": <computed>,
  "strengths": [...],
  "weaknesses": [...],
  "suggestions": [...],
  "feedback": "...",
  "reasoning": "..."
}`;

        const generation = span?.generation({
            name:  "validator-agent-llm",
            model: modelName,
            input: { promptLen: prompt.length },
        }) ?? null;

        const evaluation = await model
            .withStructuredOutput(evaluationResultZodSchema)
            .invoke(prompt);

        generation?.end({ output: { correctedAiScore: evaluation.aiScore } });
        span?.end({ output: { aiScore: evaluation.aiScore } });
        onProgress({ step: "Validation", status: "done" });

        return { evaluation };
    } catch (err) {
        span?.end({ level: "ERROR", statusMessage: (err as Error).message });
        onProgress({ step: "Validation", status: "failed" });
        throw err;
    }
}
