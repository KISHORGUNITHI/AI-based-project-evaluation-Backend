/**
 * Unit tests for DocumentAgent node
 * Requirements: 2.1–2.8, 8.1
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

import { documentAgent } from "../../features/project-evaluation/langgraph/nodes/document-agent.js";
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

const VALID_DOCUMENT_ANALYSIS = {
    problemStatement: "Solves X",
    proposedSolution: "Using Y",
    architecture: "Microservices",
    methodology: "Agile",
    presentationQuality: "Good",
    features: ["feature-a", "feature-b"],
};

beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_API_KEY = "test-api-key";
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("documentAgent", () => {
    describe("missing GOOGLE_API_KEY", () => {
        it("throws before making any LLM call when GOOGLE_API_KEY is not set", async () => {
            delete process.env.GOOGLE_API_KEY;
            const onProgress = vi.fn();
            const state = makeState({ pdfText: "some content" });

            await expect(documentAgent(state, onProgress)).rejects.toThrow(
                "GOOGLE_API_KEY environment variable is not set"
            );

            expect(mockInvoke).not.toHaveBeenCalled();
        });
    });

    describe("normal path — with content", () => {
        it("returns documentAnalysis matching the LLM fixture", async () => {
            mockInvoke.mockResolvedValue(VALID_DOCUMENT_ANALYSIS);
            const onProgress = vi.fn();

            const state = makeState({ pdfText: "pdf content", pptText: "ppt content" });
            const result = await documentAgent(state, onProgress);

            expect(result.documentAnalysis).toEqual(VALID_DOCUMENT_ANALYSIS);
        });

        it("emits 'started' then 'done' on success", async () => {
            mockInvoke.mockResolvedValue(VALID_DOCUMENT_ANALYSIS);
            const events: { step: string; status: string }[] = [];
            const onProgress = vi.fn((e) => events.push(e));

            await documentAgent(makeState({ pdfText: "some" }), onProgress);

            const statuses = events.map((e) => e.status);
            expect(statuses[0]).toBe("started");
            expect(statuses[statuses.length - 1]).toBe("done");
        });
    });

    describe("empty input fast-path", () => {
        it("invokes the LLM even when both pdfText and pptText are empty", async () => {
            const sentinel = {
                problemStatement: "No content provided",
                proposedSolution: "No content provided",
                architecture: "No content provided",
                methodology: "No content provided",
                presentationQuality: "No content provided",
                features: [],
            };
            mockInvoke.mockResolvedValue(sentinel);
            const onProgress = vi.fn();

            const result = await documentAgent(makeState(), onProgress);

            expect(mockInvoke).toHaveBeenCalledOnce();
            expect(result.documentAnalysis?.features).toEqual([]);
        });
    });

    describe("error path", () => {
        it("emits 'failed' and rethrows when LLM throws", async () => {
            const boom = new Error("LLM unavailable");
            mockInvoke.mockRejectedValue(boom);
            const events: { step: string; status: string }[] = [];
            const onProgress = vi.fn((e) => events.push(e));

            await expect(
                documentAgent(makeState({ pdfText: "content" }), onProgress)
            ).rejects.toThrow("LLM unavailable");

            expect(events.some((e) => e.status === "failed")).toBe(true);
        });
    });
});
