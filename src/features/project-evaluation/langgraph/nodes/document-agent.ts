import { z } from "zod";
import type { LangfuseTraceClient } from "langfuse";
import type { EvaluationState } from "../state.js";
import type { ProgressCallback } from "../evalution-graph.js";
import { getNimModel } from "../../../../lib/nim.js";

const documentAnalysisZodSchema = z.object({
    problemStatement:    z.string().max(2000),
    proposedSolution:    z.string().max(2000),
    architecture:        z.string().max(2000),
    methodology:         z.string().max(2000),
    presentationQuality: z.string().max(2000),
    features:            z.array(z.string()),
});

export async function documentAgent(
    state: EvaluationState,
    onProgress: ProgressCallback,
    trace?: LangfuseTraceClient
): Promise<Partial<EvaluationState>> {
    const { pdfText, pptText } = state;
    const modelName = process.env.NIM_MODEL ?? "meta/llama-3.1-8b-instruct";

    onProgress({ step: "Document Analysis", status: "started" });

    // Span wraps the entire node; generation is nested inside it
    const span = trace?.span({ name: "document-agent", input: { pdfLen: pdfText?.length ?? 0, pptLen: pptText?.length ?? 0 } }) ?? null;

    try {
        const model = getNimModel();
        const hasContent = pdfText || pptText;

        const prompt = hasContent
            ? `You are an expert technical evaluator analyzing a student project submission.
Analyze the following document content and extract structured information.

PDF Report Content:
${pdfText || "No PDF content available."}

PowerPoint Presentation Content:
${pptText || "No PPT content available."}

Extract:
1. Problem Statement: What problem is the project solving?
2. Proposed Solution: What solution does the team propose?
3. Architecture: What is the technical architecture?
4. Methodology: What development approach was used?
5. Presentation Quality: How well is the project presented?
6. Key Features: List the main features.`
            : `No document content available. Return all string fields as "No content provided" and features as [].`;

        const generation = span?.generation({
            name:  "document-agent-llm",
            model: modelName,
            input: { promptLen: prompt.length },
        }) ?? null;

        const structured = model.withStructuredOutput(documentAnalysisZodSchema);
        const documentAnalysis = await structured.invoke(prompt);

        console.log(`[documentAgent] problemStatement len: ${documentAnalysis.problemStatement.length}, features: ${documentAnalysis.features.length}`);
        generation?.end({ output: documentAnalysis });
        span?.end({ output: { fields: Object.keys(documentAnalysis) } });
        onProgress({ step: "Document Analysis", status: "done" });

        return { documentAnalysis };
    } catch (error) {
        span?.end({ level: "ERROR", statusMessage: (error as Error).message });
        onProgress({ step: "Document Analysis", status: "failed" });
        throw error;
    }
}
