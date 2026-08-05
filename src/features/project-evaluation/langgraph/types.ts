export interface DocumentAnalysis {
    problemStatement: string;       // max 2000 chars
    proposedSolution: string;
    architecture: string;
    methodology: string;
    presentationQuality: string;
    features: string[];
}

export interface CodeQuality {
    naming: string;           // variable/function/class naming conventions
    organization: string;     // how well the code is modularized and separated
    errorHandling: string;    // presence and quality of error handling
    testCoverage: string;     // quality of tests, not just presence
}

export interface RepoMetrics {
    totalFiles: number;
    languageBreakdown: Record<string, number>;  // e.g. { ".py": 12, ".ts": 8 }
    testFileRatio: number;                       // 0–1 fraction of files that are tests
    hasDockerfile: boolean;
    hasCiConfig: boolean;
    hasEnvExample: boolean;
    hasLintConfig: boolean;
    notebookCount: number;
    avgFileSizeLines: number;
}

export interface CodeAnalysis {
    techStack: string[];            // max 20 entries
    // Flat quality fields — easier for small LLMs than nested objects
    codeQualityNaming: string;
    codeQualityOrganization: string;
    codeQualityErrorHandling: string;
    codeQualityTestCoverage: string;
    folderStructure: string;
    architecturePattern: string;
    hasTests: boolean;
    hasDocumentation: boolean;
    securityIssues: string[];       // max 10 entries
    strengths: string[];            // max 8 entries
    weaknesses: string[];           // max 8 entries
    complexity: 'low' | 'medium' | 'high';
    repoMetrics: RepoMetrics;       // pre-computed facts, not LLM guesses
}

export interface EvaluationResult {
    aiScore: number;                // 0–100 inclusive
    problemStatementScore: number;  // 0–10 inclusive
    solutionDesignScore: number;    // 0–10 inclusive
    implementationScore: number;    // 0–10 inclusive
    innovationScore: number;        // 0–10 inclusive
    documentationScore: number;     // 0–10 inclusive
    strengths: string[];
    weaknesses: string[];
    suggestions: string[];
    feedback: string;
    reasoning: string;
}
