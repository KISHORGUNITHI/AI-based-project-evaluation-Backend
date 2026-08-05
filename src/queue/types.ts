// ── Legacy jobs (kept for backward compat) ──────────────────────────────────
export interface PdfEvaluationJob {
    filePath: string;
}
export interface GithubEvaluationJob {
    repositoryUrl: string;
}

// ── Single-worker job (current simple flow) ──────────────────────────────────
export interface AiEvaluationJob {
    evaluationId: string;
    judgeId: string;
}

// ── 4-worker pipeline jobs ────────────────────────────────────────────────────

/** Published by the API when a judge triggers AI evaluation */
export interface DocAnalysisJob {
    evaluationId: string;
    reportUrl?: string;
    pptUrl?: string;
}

/** Published by the API when a judge triggers AI evaluation */
export interface GithubCloneJob {
    evaluationId: string;
    githubUrl?: string;
}

/**
 * Published by DocWorker AND GithubWorker to signal their result is ready.
 * The AgentWorker checks the DB — once both doc + github are done it runs the LLM agents.
 */
export interface WorkerResultReadyJob {
    evaluationId: string;
    workerType: "doc" | "github";
    /** Incremented by agent-worker when fan-in is not ready yet */
    attempt?: number;
}

/** Published by AgentWorker once AI scoring is complete */
export interface NotificationJob {
    evaluationId: string;
    projectTitle: string;
    /** IDs of users to notify */
    userIds: string[];
}
