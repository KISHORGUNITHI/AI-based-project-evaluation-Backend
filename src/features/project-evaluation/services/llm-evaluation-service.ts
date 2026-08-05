import { getNimModel } from "../../../lib/nim.js";
import { z } from "zod";
import type { EvaluationResult } from "../types/evaluation.types";

const evaluationSchema = z.object({
    project_title:              z.string().optional(),
    problem_statement_score:    z.number().min(0).max(10),
    solution_design_score:      z.number().min(0).max(10),
    implementation_score:       z.number().min(0).max(10),
    innovation_score:           z.number().min(0).max(10),
    documentation_score:        z.number().min(0).max(10),
    overall_score:              z.number().min(0).max(10),
    strengths:                  z.string(),
    weaknesses:                 z.string(),
    suggestions:                z.string(),
});

export class LlmEvaluationService {
    async evaluate(reportText: string): Promise<EvaluationResult> {
        const model = getNimModel();

        const prompt = `You are an expert academic project evaluator.
Evaluate the following project report and provide:
- project_title
- problem_statement_score (1-10)
- solution_design_score (1-10)
- implementation_score (1-10)
- innovation_score (1-10)
- documentation_score (1-10)
- overall_score (1-10)
- strengths (precise, at most 3 lines)
- weaknesses (precise, at most 3 lines)
- suggestions (precise, at most 3 lines)

Project Report:
${reportText.slice(0, 20000)}`;

        const structured = model.withStructuredOutput(evaluationSchema);
        const result = await structured.invoke(prompt);
        return result as unknown as EvaluationResult;
    }
}
