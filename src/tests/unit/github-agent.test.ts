/**
 * Unit tests for GithubAgent node
 * Requirements: 3.1–3.8, 8.1
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

import { githubAgent } from "../../features/project-evaluation/langgraph/nodes/github-agent.js";
import type { EvaluationState } from "../../features/project-evaluation/langgraph/state.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const RUBRIC = {
    problemStatement: 20,
    solutionDesign: 20,
    implementation: 20,
    innovation: 20,
    documentation: 20,
};

function makeState(overrides: Partial<EvaluationState> = {}): EvaluationState {
    return {
        evaluationId: "eval-1",
        projectTitle: "Test Project",
        githubUrl: undefined,
        reportUrl: undefined,
        pptUrl: undefined,
        rubric: RUBRIC,
        pdfText: "",
        pptText: "",
        githubSummary: "",
        documentAnalysis: undefined,
        codeAnalysis: undefined,
        evaluation: undefined,
        error: undefined,
        ...overrides,
    };
}

const ZEROED_CODE_ANALYSIS = {
    techStack: [],
    codeQualityNaming:        "N/A — no repository provided",
    codeQualityOrganization:  "N/A",
    codeQualityErrorHandling: "N/A",
    codeQualityTestCoverage:  "N/A",
    folderStructure: "N/A",
    architecturePattern: "N/A",
    hasTests: false,
    hasDocumentation: false,
    securityIssues: [],
    strengths: [],
    weaknesses: [],
    complexity: "low",
    repoMetrics: {
        totalFiles: 0,
        languageBreakdown: {},
        testFileRatio: 0,
        hasDockerfile: false,
        hasCiConfig: false,
        hasEnvExample: false,
        hasLintConfig: false,
        notebookCount: 0,
        avgFileSizeLines: 0,
    },
};

const VALID_CODE_ANALYSIS = {
    techStack: ["TypeScript", "Node.js"],
    codeQualityNaming:        "Descriptive, follows camelCase conventions",
    codeQualityOrganization:  "Feature-based folder structure with clear separation",
    codeQualityErrorHandling: "try/catch present in async handlers",
    codeQualityTestCoverage:  "Unit tests cover core logic",
    folderStructure: "Feature-based",
    architecturePattern: "MVC",
    hasTests: true,
    hasDocumentation: true,
    securityIssues: [],
    strengths: ["Clean code"],
    weaknesses: ["No e2e tests"],
    complexity: "medium" as const,
    repoMetrics: {
        totalFiles: 10,
        languageBreakdown: { ".ts": 8, ".json": 2 },
        testFileRatio: 0.2,
        hasDockerfile: false,
        hasCiConfig: false,
        hasEnvExample: false,
        hasLintConfig: false,
        notebookCount: 0,
        avgFileSizeLines: 50,
    },
};

beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_API_KEY = "test-api-key";
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("githubAgent", () => {
    describe("fast-path — empty githubSummary", () => {
        it("returns zeroed CodeAnalysis without calling LLM when githubSummary is empty", async () => {
            const onProgress = vi.fn();
            const result = await githubAgent(makeState(), onProgress);

            expect(mockInvoke).not.toHaveBeenCalled();
            expect(result.codeAnalysis).toEqual(ZEROED_CODE_ANALYSIS);
        });

        it("emits 'started' then 'done' on empty summary fast-path", async () => {
            const events: { step: string; status: string }[] = [];
            const onProgress = vi.fn((e) => events.push(e));

            await githubAgent(makeState(), onProgress);

            const statuses = events.map((e) => e.status);
            expect(statuses[0]).toBe("started");
            expect(statuses[statuses.length - 1]).toBe("done");
        });

        it("treats whitespace-only summary as empty — no LLM call", async () => {
            const state = makeState({ githubSummary: "   \n\t  " });
            const onProgress = vi.fn();

            const result = await githubAgent(state, onProgress);

            expect(mockInvoke).not.toHaveBeenCalled();
            expect(result.codeAnalysis).toEqual(ZEROED_CODE_ANALYSIS);
        });
    });

    describe("normal path — with githubSummary", () => {
        it("calls LLM and returns codeAnalysis matching fixture", async () => {
            mockInvoke.mockResolvedValue(VALID_CODE_ANALYSIS);
            const state = makeState({ githubSummary: "Some repo summary" });
            const onProgress = vi.fn();

            const result = await githubAgent(state, onProgress);

            expect(mockInvoke).toHaveBeenCalledOnce();
            // repoMetrics is merged in by the agent — check the LLM-derived fields
            expect(result.codeAnalysis).toMatchObject({
                techStack: VALID_CODE_ANALYSIS.techStack,
                codeQuality: VALID_CODE_ANALYSIS.codeQuality,
                folderStructure: VALID_CODE_ANALYSIS.folderStructure,
                architecturePattern: VALID_CODE_ANALYSIS.architecturePattern,
                hasTests: true, // true because testFileRatio > 0 OR LLM says true
                hasDocumentation: VALID_CODE_ANALYSIS.hasDocumentation,
                complexity: VALID_CODE_ANALYSIS.complexity,
            });
            expect(result.codeAnalysis?.repoMetrics).toBeDefined();
        });

        it("emits 'started' then 'done' on success", async () => {
            mockInvoke.mockResolvedValue(VALID_CODE_ANALYSIS);
            const events: { step: string; status: string }[] = [];
            const onProgress = vi.fn((e) => events.push(e));

            await githubAgent(makeState({ githubSummary: "repo" }), onProgress);

            const statuses = events.map((e) => e.status);
            expect(statuses[0]).toBe("started");
            expect(statuses[statuses.length - 1]).toBe("done");
        });
    });

    describe("error path", () => {
        it("emits 'failed' and rethrows when LLM throws", async () => {
            const boom = new Error("LLM error");
            mockInvoke.mockRejectedValue(boom);
            const events: { step: string; status: string }[] = [];
            const onProgress = vi.fn((e) => events.push(e));

            await expect(
                githubAgent(makeState({ githubSummary: "content" }), onProgress)
            ).rejects.toThrow("LLM error");

            expect(events.some((e) => e.status === "failed")).toBe(true);
        });
    });

    describe("input isolation", () => {
        it("does not access pdfText or pptText — they can be undefined without errors", async () => {
            const state = makeState({
                githubSummary: "",
                pdfText: undefined as unknown as string,
                pptText: undefined as unknown as string,
            });
            const onProgress = vi.fn();

            // Should not throw even when pdfText/pptText are undefined
            await expect(githubAgent(state, onProgress)).resolves.not.toThrow();
        });
    });
});
