import prisma from "../../../../db/prisma.js";
import type { EvaluationState } from "../state.js";
import type { ProgressCallback } from "../evalution-graph.js";

export async function persistResult(state: EvaluationState, onProgress: ProgressCallback): Promise<Partial<EvaluationState>> {
    if (!state.evaluation) throw new Error("Evaluation result missing");

    onProgress({ step: "Saving Results", status: "started" });

    await prisma.evaluation.update({
        where: { id: state.evaluationId },
        data: {
            aiScore: state.evaluation.aiScore,
            feedback: state.evaluation.feedback,
            problemStatementScore: state.evaluation.problemStatementScore,
            solutionDesignScore: state.evaluation.solutionDesignScore,
            implementationScore: state.evaluation.implementationScore,
            innovationScore: state.evaluation.innovationScore,
            documentationScore: state.evaluation.documentationScore,
            strengths: state.evaluation.strengths,
            weaknesses: state.evaluation.weaknesses,
            suggestions: state.evaluation.suggestions,
            status: "AI_COMPLETED",
        },
    });

    onProgress({ step: "Saving Results", status: "done" });
    return {};
}
