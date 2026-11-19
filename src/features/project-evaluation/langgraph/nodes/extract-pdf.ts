import fs from "fs";
import path from "path";
import os from "os";
import type { EvaluationState } from "../state.js";
import type { ProgressCallback } from "../evalution-graph.js";

/** Download a URL to a temp file, return the temp path */
async function downloadToTemp(url: string, ext: string): Promise<string> {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} downloading ${url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const tmp = path.join(os.tmpdir(), `eval-pdf-${Date.now()}${ext}`);
    fs.writeFileSync(tmp, buf);
    return tmp;
}

async function extractPdfText(urlOrPath: string): Promise<string> {
    let filePath = urlOrPath;
    let isTmp = false;

    try {
        if (urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) {
            console.log(`[extractPdf] Downloading PDF: ${urlOrPath}`);
            filePath = await downloadToTemp(urlOrPath, ".pdf");
            isTmp = true;
        } else {
            // Local path — resolve relative /uploads/ paths
            filePath = urlOrPath.startsWith("/uploads/")
                ? path.join(process.cwd(), urlOrPath)
                : urlOrPath;
        }

        if (!fs.existsSync(filePath)) {
            console.warn(`[extractPdf] File not found: ${filePath}`);
            return "";
        }

        const buffer = fs.readFileSync(filePath);
        // pdf-parse v2: named export PDFParse is a class
        const { PDFParse } = await import("pdf-parse");
        const parser = new PDFParse({ data: buffer });
        const result = await parser.getText();
        const text = result.text?.trim() ?? "";
        console.log(`[extractPdf] Extracted ${text.length} chars`);
        return text;
    } catch (err) {
        console.error(`[extractPdf] Failed: ${(err as Error).message}`);
        return "";
    } finally {
        if (isTmp && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }
}

export async function extractPdf(
    state: EvaluationState,
    onProgress: ProgressCallback,
): Promise<Partial<EvaluationState>> {
    if (!state.reportUrl) {
        console.log("[extractPdf] No reportUrl — skipping");
        return { pdfText: "" };
    }
    onProgress({ step: "PDF Extraction", status: "started" });
    const text = await extractPdfText(state.reportUrl);
    onProgress({ step: "PDF Extraction", status: text ? "done" : "skipped" });
    return { pdfText: text };
}
