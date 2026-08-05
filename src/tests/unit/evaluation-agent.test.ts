/**
 * Unit tests for EvaluationAgent node
 * Requirements: 4.1–4.8, 8.1
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock ChatGoogleGenerativeAI using a class so `new` works ─────────────────
const mockInvoke = vi.fn();

vi.mock("@langchain/google-genai", () => {
    const MockChatGoogleGenerativeAI = vi.fn().mockImplementation(function () {
        return {
            withStructuredOutput: vi.fn().mockReturnValue({ invoke: mockInvoke }),
        };
    });
    return { ChatGoogleGenerativeAI: MockChatGoogleGenerativeAI };
});

import { evaluationAgent } from "../../features/project-evaluation/langgraph/nodes/evaluation-agent.js";
import type { EvaluationState } from "../../features/project-evaluation/langgraph/state.js";
import type { DocumentAnalysis, CodeAnalysis } from "../../features/project-evaluation/langgraph/types.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const RUBRIC = {
    problemStatement: 20,
    solutionDesign: 20,
    implementation: 20,
    innovation: 20,
    documentation: 20,
};

const DOC_ANALYSIS: DocumentAnalysis = {
    problemStatement: "Solves X",
    proposedSolution: "Using Y",
    architecture: "Microservices",
    methodology: "Agile",
    presentationQuality: "Good",
    features: ["feature-a"],
};

const CODE_ANALYSIS: CodeAnalysis = {
    techStack: ["TypeScript"],
    codeQualityNaming:        "Descriptive and consistent camelCase",
    codeQualityOrganization:  "Feature-based, good separation of concerns",
    codeQualityErrorHandling: "try/catch used in async handlers",
    codeQualityTestCoverage:  "Unit tests cover main logic paths",
    folderStructure: "Feature-based",
    architecturePattern: "MVC",
    hasTests: true,
    hasDocumentation: true,
    securityIssues: [],
    strengths: ["Clean code"],
    weaknesses: [],
    complexity: "medium",
    repoMetrics: {
        totalFiles: 10,
        languageBreakdown: { ".ts": 10 },
        testFileRatio: 0.2,
        hasDockerfile: false,
        hasCiConfig: false,
        hasEnvExample: false,
        hasLintConfig: false,
        notebookCount: 0,
        avgFileSizeLines: 60,
    },
};

const VALID_EVALUATION = {
    aiScore: 72,
    problemStatementScore: 8,
    solutionDesignScore: 7,
    implementationScore: 7,
    innovationScore: 7,
    documentationScore: 8,
    strengths: ["Well structured"],
    weaknesses: ["Missing e2e tests"],
    suggestions: ["Add tests"],
    feedback: "Good overall project.",
    reasoning: "Scores based on document and code analysis.",
};

function makeState(overrides: Partial<EvaluationState> = {}): EvaluationState {
    return {
        evaluationId: "eval-1",
        projectTitle: "Test Project",
        githubUrl: undefined,
        reportUrl: undefined,
        pptUrl: undefined,
        rubric: RUBRIC,
        pdfText: "pdf",
        pptText: "ppt",
        githubSummary: "summary",
        documentAnalysis: DOC_ANALYSIS,
        codeAnalysis: CODE_ANALYSIS,
        evaluation: undefined,
        error: undefined,
        ...overrides,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_API_KEY = "test-api-key";
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("evaluationAgent", () => {
    describe("guards", () => {
        it("throws correct error when documentAnalysis is undefined — no LLM call", async () => {
            const state = makeState({ documentAnalysis: undefined });
            const onProgress = vi.fn();

            await expect(evaluationAgent(state, onProgress)).rejects.toThrow(
                "EvaluationAgent: documentAnalysis is missing from state"
            );

            expect(mockInvoke).not.toHaveBeenCalled();
        });

        it("throws correct error when codeAnalysis is undefined — no LLM call", async () => {
            const state = makeState({ codeAnalysis: undefined });
            const onProgress = vi.fn();

            await expect(evaluationAgent(state, onProgress)).rejects.toThrow(
                "EvaluationAgent: codeAnalysis is missing from state"
            );

            expect(mockInvoke).not.toHaveBeenCalled();
        });

        it("throws when GOOGLE_API_KEY is not set", async () => {
            delete process.env.GOOGLE_API_KEY;
            const onProgress = vi.fn();

            await expect(evaluationAgent(makeState(), onProgress)).rejects.toThrow(
                "GOOGLE_API_KEY environment variable is not set"
            );

            expect(mockInvoke).not.toHaveBeenCalled();
        });
    });

    describe("normal path", () => {
        it("returns evaluation matching the LLM fixture", async () => {
            mockInvoke.mockResolvedValue(VALID_EVALUATION);
            const onProgress = vi.fn();

            const result = await evaluationAgent(makeState(), onProgress);

            expect(result.evaluation).toEqual(VALID_EVALUATION);
        });

        it("emits 'started' then 'done' on success", async () => {
            mockInvoke.mockResolvedValue(VALID_EVALUATION);
            const events: { step: string; status: string }[] = [];
            const onProgress = vi.fn((e) => events.push(e));

            await evaluationAgent(makeState(), onProgress);

            const statuses = events.map((e) => e.status);
            expect(statuses[0]).toBe("started");
            expect(statuses[statuses.length - 1]).toBe("done");
        });

        it("emits 'started' for 'AI Scoring' step", async () => {
            mockInvoke.mockResolvedValue(VALID_EVALUATION);
            const events: { step: string; status: string }[] = [];
            const onProgress = vi.fn((e) => events.push(e));

            await evaluationAgent(makeState(), onProgress);

            expect(events[0]).toEqual({ step: "AI Scoring", status: "started" });
        });
    });

    describe("error path", () => {
        it("emits 'failed' and rethrows when LLM throws", async () => {
            const boom = new Error("LLM failure");
            mockInvoke.mockRejectedValue(boom);
            const events: { step: string; status: string }[] = [];
            const onProgress = vi.fn((e) => events.push(e));

            await expect(evaluationAgent(makeState(), onProgress)).rejects.toThrow(
                "LLM failure"
            );

            expect(events.some((e) => e.status === "failed")).toBe(true);
        });
    });
});
