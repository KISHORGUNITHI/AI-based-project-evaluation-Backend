/**
 * Doc Analysis Worker
 *
 * Consumes: DOC_ANALYSIS queue
 * Does:
 *   1. Extracts text from PDF (reportUrl) and PPT (pptUrl)
 *   2. Runs DocumentAgent LLM to produce DocumentAnalysis
 *   3. Saves pdfText, pptText, documentAnalysis back to the evaluation row
 *   4. Publishes WorkerResultReadyJob { workerType: "doc" } to AGENT_RUN queue
 */
import "dotenv/config";
import fs from "fs";
import os from "os";
import path from "path";
import { consumeQueue } from "../queue/consumer.js";
import { publishMessage, publishTransient } from "../queue/producer.js";
import { QUEUES } from "../queue/queues.js";
import type { DocAnalysisJob, WorkerResultReadyJob } from "../queue/types.js";
import prisma from "../db/prisma.js";
import { getLangfuse } from "../lib/langfuse.js";
import { progressQueueName } from "./progress.js";
import { PLACEHOLDER_DOCUMENT_ANALYSIS } from "./placeholders.js";

async function extractPdfText(reportUrl: string): Promise<string> {
    try {
        let buffer: Buffer;

        if (reportUrl.startsWith("http://") || reportUrl.startsWith("https://")) {
            // Remote URL — download in memory with 15s timeout
            console.log(`[doc-worker] Downloading PDF: ${reportUrl}`);
            const res = await fetch(reportUrl, { signal: AbortSignal.timeout(15_000) });
            if (!res.ok) {
                console.warn(`[doc-worker] PDF download failed: HTTP ${res.status}`);
                return "";
            }
            buffer = Buffer.from(await res.arrayBuffer());
        } else {
            // Local path fallback (dev only)
            const absPath = reportUrl.startsWith("/uploads/")
                ? path.join(process.cwd(), reportUrl)
                : reportUrl;
            if (!fs.existsSync(absPath)) {
                console.warn(`[doc-worker] PDF not found at path: ${absPath}`);
                return "";
            }
            buffer = fs.readFileSync(absPath);
        }

        const { PDFParse } = await import("pdf-parse");
        const parser = new PDFParse({ data: buffer });
        const result = await parser.getText();
        return result.text?.trim() ?? "";
    } catch (err) {
        console.error("[doc-worker] PDF extraction failed:", err);
        return "";
    }
}

async function extractPptText(pptUrl: string): Promise<string> {
    try {
        let filePath: string;
        let isTmp = false;

        if (pptUrl.startsWith("http://") || pptUrl.startsWith("https://")) {
            // Remote URL — download to temp file with 15s timeout (officeparser needs a file path)
            console.log(`[doc-worker] Downloading PPT: ${pptUrl}`);
            const res = await fetch(pptUrl, { signal: AbortSignal.timeout(15_000) });
            if (!res.ok) {
                console.warn(`[doc-worker] PPT download failed: HTTP ${res.status}`);
                return "";
            }
            const buf = Buffer.from(await res.arrayBuffer());
            const ext = pptUrl.toLowerCase().includes(".ppt") && !pptUrl.toLowerCase().includes(".pptx") ? ".ppt" : ".pptx";
            filePath = path.join(os.tmpdir(), `doc-worker-ppt-${Date.now()}${ext}`);
            fs.writeFileSync(filePath, buf);
            isTmp = true;
        } else {
            // Local path fallback (dev only)
            filePath = pptUrl.startsWith("/uploads/")
                ? path.join(process.cwd(), pptUrl)
                : pptUrl;
            if (!fs.existsSync(filePath)) {
                console.warn(`[doc-worker] PPT not found at path: ${filePath}`);
                return "";
            }
        }

        try {
            const { parseOffice } = await import("officeparser");
            return await new Promise<string>((resolve) => {
                parseOffice(filePath, (data: unknown, err: Error) => {
                    if (err) { resolve(""); return; }
                    const text = typeof (data as any)?.toText === "function"
                        ? (data as any).toText()
                        : String(data ?? "");
                    resolve(text.trim());
                }, {});
            });
        } finally {
            if (isTmp && fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
    } catch (err) {
        console.error("[doc-worker] PPT extraction failed:", err);
        return "";
    }
}

async function startDocWorker() {
    console.log("[doc-worker] Starting...");

    // Resolve the backend base URL for downloading uploaded files.
    // Workers run in a separate container and can't access the API server's filesystem.
    // BACKEND_URL takes priority; falls back to BETTER_AUTH_URL which is the Railway public URL.
    const backendBaseUrl = process.env.BACKEND_URL ?? process.env.BETTER_AUTH_URL ?? "";

    function resolveFileUrl(urlOrPath: string | undefined): string | undefined {
        if (!urlOrPath) return undefined;
        // Already a full URL
        if (urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) return urlOrPath;
        // Relative /uploads/ path — prepend backend base URL
        if (urlOrPath.startsWith("/uploads/") && backendBaseUrl) {
            return `${backendBaseUrl.replace(/\/$/, "")}${urlOrPath}`;
        }
        // Local path (dev fallback)
        return urlOrPath;
    }

    await consumeQueue(QUEUES.DOC_ANALYSIS, async (job: DocAnalysisJob) => {
        const { evaluationId, reportUrl: rawReportUrl, pptUrl: rawPptUrl } = job;
        console.log(`[doc-worker] Processing evaluation ${evaluationId}`);

        // Resolve relative /uploads/ paths to full URLs so this worker
        // (running in a separate container) can fetch files from the API server
        const reportUrl = resolveFileUrl(rawReportUrl);
        const pptUrl = resolveFileUrl(rawPptUrl);
        console.log(`[doc-worker] Resolved reportUrl: ${reportUrl ?? "none"}, pptUrl: ${pptUrl ?? "none"}`);

        const progressQueue = progressQueueName(evaluationId);
        const sendProgress = (step: string, status: "started" | "done" | "failed" | "skipped") =>
            publishTransient(progressQueue, { step, status }).catch(() => {});

        const langfuse = getLangfuse();
        const trace = langfuse?.trace({ name: "doc-worker", metadata: { evaluationId } });

        try {
            // PDF extraction
            sendProgress("PDF Extraction", "started");
            const pdfText = reportUrl ? await extractPdfText(reportUrl) : "";
            sendProgress("PDF Extraction", pdfText ? "done" : "skipped");

            // PPT extraction
            sendProgress("PPT Analysis", "started");
            const pptText = pptUrl ? await extractPptText(pptUrl) : "";
            sendProgress("PPT Analysis", pptText ? "done" : "skipped");

            console.log(`[doc-worker] Extracted PDF:${pdfText.length}c PPT:${pptText.length}c`);

            // Run DocumentAgent
            sendProgress("Document Analysis", "started");
            const { documentAgent } = await import("../features/project-evaluation/langgraph/nodes/document-agent.js");
            const fakeState = { pdfText, pptText } as any;
            const result = await documentAgent(fakeState, () => {}, trace as any);
            const documentAnalysis = result.documentAnalysis ?? null;
            sendProgress("Document Analysis", documentAnalysis ? "done" : "failed");

            // Persist to DB
            await prisma.evaluation.update({
                where: { id: evaluationId },
                data: { pdfText, pptText, documentAnalysis: documentAnalysis as any },
            });
            console.log(`[doc-worker] Saved documentAnalysis for ${evaluationId}`);
            trace?.span({ name: "doc-worker-complete" }).end({ output: { pdfLen: pdfText.length } });

            await publishMessage(QUEUES.AGENT_RUN, { evaluationId, workerType: "doc" } as WorkerResultReadyJob);
        } catch (err) {
            console.error(`[doc-worker] Failed for ${evaluationId}:`, err);
            sendProgress("Document Analysis", "failed");
            trace?.span({ name: "doc-worker-error" }).end({ level: "ERROR", statusMessage: String(err) });

            await prisma.evaluation.update({
                where: { id: evaluationId },
                data: {
                    pdfText: "",
                    pptText: "",
                    documentAnalysis: PLACEHOLDER_DOCUMENT_ANALYSIS as any,
                },
            }).catch(() => {});

            await publishMessage(QUEUES.AGENT_RUN, { evaluationId, workerType: "doc" } as WorkerResultReadyJob);
        } finally {
            await langfuse?.flushAsync().catch(() => {});
        }
    });
}

startDocWorker().catch(console.error);
