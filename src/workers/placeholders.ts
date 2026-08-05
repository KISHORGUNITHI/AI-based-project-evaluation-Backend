/** Fallback values persisted when a worker fails so the agent fan-in can proceed. */
export const PLACEHOLDER_DOCUMENT_ANALYSIS = {
    problemStatement: "Analysis unavailable",
    proposedSolution: "Analysis unavailable",
    architecture: "Analysis unavailable",
    methodology: "Analysis unavailable",
    presentationQuality: "Analysis unavailable",
    features: [] as string[],
};

export const PLACEHOLDER_CODE_ANALYSIS = {
    techStack: [] as string[],
    codeQuality: "N/A",
    folderStructure: "N/A",
    architecturePattern: "N/A",
    hasTests: false,
    hasDocumentation: false,
    securityIssues: [] as string[],
    strengths: [] as string[],
    weaknesses: [] as string[],
    complexity: "low" as const,
};
