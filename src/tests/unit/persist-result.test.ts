/**
 * Unit tests for PersistResult node
 * Requirements: 7.1, 7.2, 7.3
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock Prisma singleton ─────────────────────────────────────────────────────
// NOTE: vi.mock is hoisted — do NOT reference outer `const` vars inside the factory.
vi.mock("../../db/prisma.js", () => ({
    default: {
        evaluation: {
            update: vi.fn(),
        },
    },
}));

import prisma from "../../db/prisma.js";
import { persistResult } from "../../features/project-evaluation/langgraph/nodes/persist-result.js";
import type { EvaluationState } from "../../features/project-evaluation/langgraph/state.js";
import type { EvaluationResult } from "../../features/project-evaluation/langgraph/types.js";

// Typed handle to the mocked update function
const mockUpdate = prisma.evaluation.update as ReturnType<typeof vi.fn>;

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
        evaluationId: "eval-42",
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
        evaluation: EVALUATION,
        error: undefined,
        ...overrides,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("persistResult", () => {
    describe("guard", () => {
        it("throws 'Evaluation result missing' when state.evaluation is undefined", async () => {
            const state = makeState({ evaluation: undefined });
            const onProgress = vi.fn();

            await expect(persistResult(state, onProgress)).rejects.toThrow(
                "Evaluation result missing"
            );

            expect(mockUpdate).not.toHaveBeenCalled();
        });
    });

    describe("successful DB write", () => {
        it("calls prisma.evaluation.update with correct field mapping", async () => {
            mockUpdate.mockResolvedValue({});
            const onProgress = vi.fn();

            await persistResult(makeState(), onProgress);

            expect(mockUpdate).toHaveBeenCalledOnce();
            expect(mockUpdate).toHaveBeenCalledWith({
                where: { id: "eval-42" },
                data: {
                    aiScore: EVALUATION.aiScore,
                    feedback: EVALUATION.feedback,
                    problemStatementScore: EVALUATION.problemStatementScore,
                    solutionDesignScore: EVALUATION.solutionDesignScore,
                    implementationScore: EVALUATION.implementationScore,
                    innovationScore: EVALUATION.innovationScore,
                    documentationScore: EVALUATION.documentationScore,
                    strengths: EVALUATION.strengths,
                    weaknesses: EVALUATION.weaknesses,
                    suggestions: EVALUATION.suggestions,
                    status: "AI_COMPLETED",
                },
            });
        });

        it("returns an empty object on success", async () => {
            mockUpdate.mockResolvedValue({});
            const onProgress = vi.fn();

            const result = await persistResult(makeState(), onProgress);

            expect(result).toEqual({});
        });
    });

    describe("progress events", () => {
        it("emits 'started' before DB call and 'done' after", async () => {
            const callOrder: string[] = [];
            mockUpdate.mockImplementation(async () => {
                callOrder.push("db");
                return {};
            });

            const events: { step: string; status: string }[] = [];
            const onProgress = vi.fn((e) => {
                callOrder.push(e.status);
                events.push(e);
            });

            await persistResult(makeState(), onProgress);

            expect(callOrder[0]).toBe("started");
            expect(callOrder[1]).toBe("db");
            expect(callOrder[2]).toBe("done");
        });

        it("emits events with step 'Saving Results'", async () => {
            mockUpdate.mockResolvedValue({});
            const events: { step: string; status: string }[] = [];
            const onProgress = vi.fn((e) => events.push(e));

            await persistResult(makeState(), onProgress);

            expect(events.every((e) => e.step === "Saving Results")).toBe(true);
        });
    });
});
