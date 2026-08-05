import { StateGraph, START, END } from "@langchain/langgraph";
import { EvaluationStateAnnotation } from "./state.js";
import type { EvaluationState } from "./state.js";
import type { LangfuseTraceClient } from "langfuse";

export type ProgressCallback = (event: { step: string; status: "started" | "done" | "failed" | "skipped" }) => void;

function makeExtractPdf(onProgress: ProgressCallback) {
    return async function extractPdf(state: EvaluationState): Promise<Partial<EvaluationState>> {
        const { extractPdf: _extractPdf } = await import("./nodes/extract-pdf.js");
        return _extractPdf(state, onProgress);
    };
}

function makeExtractPpt(onProgress: ProgressCallback) {
    return async function extractPpt(state: EvaluationState): Promise<Partial<EvaluationState>> {
        const { extractPpt: _extractPpt } = await import("./nodes/extract-ppt.js");
        return _extractPpt(state, onProgress);
    };
}

function makeCloneGithub(onProgress: ProgressCallback) {
    return async function cloneGithub(state: EvaluationState): Promise<Partial<EvaluationState>> {
        const { cloneGithub: _cloneGithub } = await import("./nodes/clone-github.js");
        return _cloneGithub(state, onProgress);
    };
}

function makeDocumentAgent(onProgress: ProgressCallback, trace?: LangfuseTraceClient) {
    return async function documentAgent(state: EvaluationState): Promise<Partial<EvaluationState>> {
        const { documentAgent: _documentAgent } = await import("./nodes/document-agent.js");
        return _documentAgent(state, onProgress, trace);
    };
}

function makeGithubAgent(onProgress: ProgressCallback, trace?: LangfuseTraceClient) {
    return async function githubAgent(state: EvaluationState): Promise<Partial<EvaluationState>> {
        const { githubAgent: _githubAgent } = await import("./nodes/github-agent.js");
        return _githubAgent(state, onProgress, trace);
    };
}

function makeEvaluationAgent(onProgress: ProgressCallback, trace?: LangfuseTraceClient) {
    return async function evaluationAgent(state: EvaluationState): Promise<Partial<EvaluationState>> {
        const { evaluationAgent: _evaluationAgent } = await import("./nodes/evaluation-agent.js");
        return _evaluationAgent(state, onProgress, trace);
    };
}

function makeValidatorAgent(onProgress: ProgressCallback, trace?: LangfuseTraceClient) {
    return async function validatorAgent(state: EvaluationState): Promise<Partial<EvaluationState>> {
        const { validatorAgent: _validatorAgent } = await import("./nodes/validator-agent.js");
        return _validatorAgent(state, onProgress, trace);
    };
}

function makePersistResult(onProgress: ProgressCallback) {
    return async function persistResult(state: EvaluationState): Promise<Partial<EvaluationState>> {
        const { persistResult: _persistResult } = await import("./nodes/persist-result.js");
        return _persistResult(state, onProgress);
    };
}

/**
 * Build a graph for the full pipeline (used by the single evaluation-worker).
 * Runs extraction + agents from scratch.
 */
export function buildEvaluationGraph(onProgress: ProgressCallback, trace?: LangfuseTraceClient) {
    const graph = new StateGraph(EvaluationStateAnnotation)
        .addNode("extractPdf",      makeExtractPdf(onProgress))
        .addNode("extractPpt",      makeExtractPpt(onProgress))
        .addNode("cloneGithub",     makeCloneGithub(onProgress))
        .addNode("documentAgent",   makeDocumentAgent(onProgress, trace))
        .addNode("githubAgent",     makeGithubAgent(onProgress, trace))
        .addNode("evaluationAgent", makeEvaluationAgent(onProgress, trace))
        .addNode("validatorAgent",  makeValidatorAgent(onProgress, trace))
        .addNode("persistResult",   makePersistResult(onProgress))
        .addEdge(START, "extractPdf")
        .addEdge(START, "extractPpt")
        .addEdge(START, "cloneGithub")
        .addEdge("extractPdf",      "documentAgent")
        .addEdge("extractPpt",      "documentAgent")
        .addEdge("cloneGithub",     "githubAgent")
        .addEdge("documentAgent",   "evaluationAgent")
        .addEdge("githubAgent",     "evaluationAgent")
        .addEdge("evaluationAgent", "validatorAgent")
        .addEdge("validatorAgent",  "persistResult")
        .addEdge("persistResult",   END);

    return graph.compile();
}

/**
 * Build a graph that SKIPS extraction — used by the 4-worker pipeline
 * where doc-worker and github-worker have already populated documentAnalysis
 * and codeAnalysis in the DB/state. Runs only the LLM agents + persist.
 *
 * Topology: START → evaluationAgent → validatorAgent → persistResult → END
 */
export function buildAgentsOnlyGraph(onProgress: ProgressCallback, trace?: LangfuseTraceClient) {
    const graph = new StateGraph(EvaluationStateAnnotation)
        .addNode("evaluationAgent", makeEvaluationAgent(onProgress, trace))
        .addNode("validatorAgent",  makeValidatorAgent(onProgress, trace))
        .addNode("persistResult",   makePersistResult(onProgress))
        .addEdge(START,             "evaluationAgent")
        .addEdge("evaluationAgent", "validatorAgent")
        .addEdge("validatorAgent",  "persistResult")
        .addEdge("persistResult",   END);

    return graph.compile();
}
