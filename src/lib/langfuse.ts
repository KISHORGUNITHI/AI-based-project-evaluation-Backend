import { Langfuse, type LangfuseTraceClient, type LangfuseSpanClient } from "langfuse";

let _langfuse: Langfuse | null = null;

export function getLangfuse(): Langfuse | null {
    const secretKey = process.env.LANGFUSE_SECRET_KEY;
    const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
    const baseUrl = process.env.LANGFUSE_BASE_URL ?? "https://cloud.langfuse.com";

    if (!secretKey || !publicKey) {
        return null;
    }

    if (!_langfuse) {
        _langfuse = new Langfuse({ secretKey, publicKey, baseUrl });
    }
    return _langfuse;
}

/**
 * Creates a span for a pipeline node and returns it.
 * The span should be ended by the caller via span.end().
 *
 * Usage:
 *   const span = startNodeSpan(trace, "document-agent", { pdfLen: pdfText.length });
 *   // ... do work ...
 *   span?.end({ output: result });          // success
 *   span?.end({ level: "ERROR", ... });     // failure
 */
export function startNodeSpan(
    trace: LangfuseTraceClient | null | undefined,
    nodeName: string,
    input?: Record<string, unknown>
): LangfuseSpanClient | null {
    if (!trace) return null;
    return trace.span({ name: nodeName, input });
}
