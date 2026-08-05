import fs from "fs";
import path from "path";
import os from "os";
import type { EvaluationState } from "../state.js";
import type { ProgressCallback } from "../evalution-graph.js";

/** Download a URL to a temp file, return the temp path */
async function downloadToTemp(url: string, ext: string): Promise<string> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} downloading ${url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const tmp = path.join(os.tmpdir(), `eval-ppt-${Date.now()}${ext}`);
    fs.writeFileSync(tmp, buf);
    return tmp;
}

/** Detect file extension from URL or Content-Type */
function detectExt(url: string): string {
    const lower = url.toLowerCase();
    if (lower.includes(".pptx")) return ".pptx";
    if (lower.includes(".ppt"))  return ".ppt";
    return ".pptx"; // default
}

async function extractPptText(urlOrPath: string): Promise<string> {
    let filePath = urlOrPath;
    let isTmp = false;

    try {
        if (urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) {
            console.log(`[extractPpt] Downloading PPT: ${urlOrPath}`);
            const ext = detectExt(urlOrPath);
            filePath = await downloadToTemp(urlOrPath, ext);
            isTmp = true;
        } else {
            filePath = urlOrPath.startsWith("/uploads/")
                ? path.join(process.cwd(), urlOrPath)
                : urlOrPath;
        }

        if (!fs.existsSync(filePath)) {
            console.warn(`[extractPpt] File not found: ${filePath}`);
            return "";
        }

        const { parseOffice } = await import("officeparser");
        const text = await new Promise<string>((resolve, reject) => {
            parseOffice(
                filePath,
                (data: any, err: Error) => {
                    if (err) return reject(err);
                    const value =
                        typeof data?.toText === "function"
                            ? data.toText()
                            : String(data ?? "");
                    resolve(value);
                },
                {},
            );
        });

        const trimmed = text.trim();
        console.log(`[extractPpt] Extracted ${trimmed.length} chars`);
        return trimmed;
    } catch (err) {
        console.error(`[extractPpt] Failed: ${(err as Error).message}`);
        return "";
    } finally {
        if (isTmp && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }
}

export async function extractPpt(
    state: EvaluationState,
    onProgress: ProgressCallback,
): Promise<Partial<EvaluationState>> {
    if (!state.pptUrl) {
        console.log("[extractPpt] No pptUrl — skipping");
        return { pptText: "" };
    }
    onProgress({ step: "PPT Extraction", status: "started" });
    const text = await extractPptText(state.pptUrl);
    onProgress({ step: "PPT Extraction", status: text ? "done" : "skipped" });
    return { pptText: text };
}
