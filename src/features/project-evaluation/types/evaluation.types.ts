export interface EvaluationResult {
    projectTitle: string;
    problemStatementScore: number;
    solutionDesignScore: number;
    implementationScore: number;
    innovationScore: number;
    documentationScore: number;
    overallScore: number;
    strengths: string[];
    weaknesses: string[];
    suggestions: string[];
}