export const QUEUES = {
    // Legacy
    PDF_EVAL:       process.env.PDF_EVAL_QUEUE    ?? "pdf-eval",
    GITHUB_EVAL:    process.env.GITHUB_EVAL_QUEUE ?? "github-eval",

    // Legacy single-worker pipeline
    AI_EVALUATION:  "ai-evaluation",

    // 4-worker pipeline
    DOC_ANALYSIS:   "doc-analysis",     // Web → DocWorker
    GITHUB_CLONE:   "github-clone",     // Web → GithubWorker
    AGENT_RUN:      "agent-run",        // DocWorker + GithubWorker → AgentWorker
    NOTIFICATION:   "notification",     // AgentWorker → NotificationWorker
} as const;
