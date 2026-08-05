/**
 * Unit tests for ValidatorAgent node
 * Requirements: 5.1–5.9, 8.1
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

import { validatorAgent } from "../../features/project-evaluation/langgraph/nodes/validator-agent.js";
import type { EvaluationState } from "../../features/project-evaluation/langgraph/state.js";
import type { EvaluationResult } from "../../features/project-evaluation/langgraph/types.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const RUBRIC = {
    problemStatement: 20,
    solutionDesign: 20,
    implementation: 20,
    innovation: 20,
    documentation: 20,
};

const EVALUATION: EvaluationResult = {
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
    reasoning: "Scores based on analysis.",
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
        documentAnalysis: undefined,
        codeAnalysis: undefined,
        evaluation: EVALUATION,
        error: undefined,
        ...overrides,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_API_KEY = "test-api-key";
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("validatorAgent", () => {
    describe("guards", () => {
        it("throws correct error when evaluation is undefined — no LLM call", async () => {
            const state = makeState({ evaluation: undefined });
            const onProgress = vi.fn();

            await expect(validatorAgent(state, onProgress)).rejects.toThrow(
                "ValidatorAgent: evaluation is missing from state"
            );

            expect(mockInvoke).not.toHaveBeenCalled();
        });

        it("throws when GOOGLE_API_KEY is not set", async () => {
            delete process.env.GOOGLE_API_KEY;
            const onProgress = vi.fn();

            await expect(validatorAgent(makeState(), onProgress)).rejects.toThrow(
                "GOOGLE_API_KEY environment variable is not set"
            );

            expect(mockInvoke).not.toHaveBeenCalled();
        });
    });

    describe("passthrough path", () => {
        it("returns the evaluation unchanged when LLM confirms consistency", async () => {
            mockInvoke.mockResolvedValue({ ...EVALUATION });
            const onProgress = vi.fn();

            const result = await validatorAgent(makeState(), onProgress);

            expect(result.evaluation).toEqual(EVALUATION);
        });

        it("emits 'started' then 'done' on success", async () => {
            mockInvoke.mockResolvedValue({ ...EVALUATION });
            const events: { step: string; status: string }[] = [];
            const onProgress = vi.fn((e) => events.push(e));

            await validatorAgent(makeState(), onProgress);

            const statuses = events.map((e) => e.status);
            expect(statuses[0]).toBe("started");
            expect(statuses[statuses.length - 1]).toBe("done");
        });

        it("emits 'started' for 'Validation' step", async () => {
            mockInvoke.mockResolvedValue({ ...EVALUATION });
            const events: { step: string; status: string }[] = [];
            const onProgress = vi.fn((e) => events.push(e));

            await validatorAgent(makeState(), onProgress);

            expect(events[0]).toEqual({ step: "Validation", status: "started" });
        });
    });

    describe("correction path", () => {
        it("returns corrected aiScore when LLM adjusts it", async () => {
            const corrected: EvaluationResult = { ...EVALUATION, aiScore: 74 };
            mockInvoke.mockResolvedValue(corrected);
            const onProgress = vi.fn();

            const result = await validatorAgent(makeState(), onProgress);

            expect(result.evaluation?.aiScore).toBe(74);
        });
    });

    describe("error path", () => {
        it("emits 'failed' and rethrows when LLM throws", async () => {
            const boom = new Error("Validator LLM error");
            mockInvoke.mockRejectedValue(boom);
            const events: { step: string; status: string }[] = [];
            const onProgress = vi.fn((e) => events.push(e));

            await expect(validatorAgent(makeState(), onProgress)).rejects.toThrow(
                "Validator LLM error"
            );

            expect(events.some((e) => e.status === "failed")).toBe(true);
        });
    });
});
