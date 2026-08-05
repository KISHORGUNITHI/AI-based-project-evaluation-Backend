import { Annotation } from "@langchain/langgraph";
import type { DocumentAnalysis, CodeAnalysis, EvaluationResult } from "./types.js";

export const EvaluationStateAnnotation = Annotation.Root({
    evaluationId: Annotation<string>(),
    projectTitle: Annotation<string>(),
    githubUrl: Annotation<string | undefined>(),
    reportUrl: Annotation<string | undefined>(),
    pptUrl: Annotation<string | undefined>(),
    rubric: Annotation<{
        problemStatement: number;
        solutionDesign: number;
        implementation: number;
        innovation: number;
        documentation: number;
    }>(),
    pdfText: Annotation<string>(),
    pptText: Annotation<string>(),
    githubSummary: Annotation<string>(),
    documentAnalysis: Annotation<DocumentAnalysis | undefined>(),
    codeAnalysis: Annotation<CodeAnalysis | undefined>(),
    evaluation: Annotation<EvaluationResult | undefined>(),
    error: Annotation<string | undefined>(),
});

// Convenience type for use in node functions
export type EvaluationState = typeof EvaluationStateAnnotation.State;
