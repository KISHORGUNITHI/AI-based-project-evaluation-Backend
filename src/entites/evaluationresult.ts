export default interface EvaluationResult{
    overallScore: number;
    problemStatementScore: number;
    solutionDesignScore: number;
    implementationScore: number;
    innovationScore: number;
    documentationScore: number;
    strengths: string[];
    weaknesses: string[];
    suggestions: string[];
    feedback: string;
}