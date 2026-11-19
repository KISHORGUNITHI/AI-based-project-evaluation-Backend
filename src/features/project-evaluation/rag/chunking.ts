import type { DocumentChunk, ProjectAssetsInput, ChunkMetadata } from "./types.js";

const DEFAULT_CODE_CHUNK_LINES = 45;
const DEFAULT_CODE_OVERLAP_LINES = 10;
const DEFAULT_DOC_CHUNK_CHARS = 750;
const DEFAULT_DOC_OVERLAP_CHARS = 150;

/**
 * Creates deterministic, structured chunks from code files, PDF text, PPT text, and README.
 */
export function chunkProjectAssets(input: ProjectAssetsInput): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    let chunkIdCounter = 1;

    const nextId = (prefix: string) => `${prefix}-${chunkIdCounter++}`;

    // 1. Chunk README if available
    if (input.readmeContent && input.readmeContent.trim().length > 0) {
        const readmeChunks = chunkTextDocument(
            input.readmeContent,
            { source: "readme", filePath: "README.md", title: "Project README" },
            nextId
        );
        chunks.push(...readmeChunks);
    }

    // 2. Chunk PDF report text
    if (input.pdfText && input.pdfText.trim().length > 0) {
        const pdfChunks = chunkTextDocument(
            input.pdfText,
            { source: "pdf", title: "Technical Project Report" },
            nextId
        );
        chunks.push(...pdfChunks);
    }

    // 3. Chunk PPT text
    if (input.pptText && input.pptText.trim().length > 0) {
        const pptChunks = chunkPresentationText(input.pptText, nextId);
        chunks.push(...pptChunks);
    }

    // 4. Chunk Source Code Files
    if (input.files && input.files.length > 0) {
        for (const file of input.files) {
            if (!file.content || file.content.trim().length === 0) continue;
            const codeChunks = chunkSourceCode(file.path, file.content, nextId);
            chunks.push(...codeChunks);
        }
    }

    return chunks;
}

/**
 * Splits plain or markdown text into overlapping paragraph-based chunks.
 */
export function chunkTextDocument(
    text: string,
    metadataBase: ChunkMetadata,
    nextId: (prefix: string) => string
): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const paragraphs = text
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter((p) => p.length > 20);

    let currentBuffer = "";
    let startChar = 0;

    for (let i = 0; i < paragraphs.length; i++) {
        const p = paragraphs[i];

        if (currentBuffer.length + p.length > DEFAULT_DOC_CHUNK_CHARS && currentBuffer.length > 0) {
            chunks.push({
                id: nextId(metadataBase.source),
                content: currentBuffer.trim(),
                metadata: {
                    ...metadataBase,
                    section: inferSectionHeading(currentBuffer),
                },
                tokenCount: estimateTokens(currentBuffer),
            });

            // Overlap: keep the last 150 chars or the previous paragraph if short
            const overlap = currentBuffer.slice(-DEFAULT_DOC_OVERLAP_CHARS);
            currentBuffer = `${overlap}\n\n${p}`;
        } else {
            currentBuffer = currentBuffer ? `${currentBuffer}\n\n${p}` : p;
        }
    }

    if (currentBuffer.trim().length > 0) {
        chunks.push({
            id: nextId(metadataBase.source),
            content: currentBuffer.trim(),
            metadata: {
                ...metadataBase,
                section: inferSectionHeading(currentBuffer),
            },
            tokenCount: estimateTokens(currentBuffer),
        });
    }

    return chunks;
}

/**
 * Splits presentation decks by slide boundaries or slide markers.
 */
export function chunkPresentationText(
    pptText: string,
    nextId: (prefix: string) => string
): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const slideSplits = pptText.split(/(?:^|\n)(?=Slide \d+|---|\f)/i);

    let slideNum = 1;
    for (const slide of slideSplits) {
        const trimmed = slide.trim();
        if (trimmed.length < 25) continue;

        chunks.push({
            id: nextId("ppt"),
            content: trimmed,
            metadata: {
                source: "ppt",
                slideNumber: slideNum++,
                title: `Slide Deck Content`,
                section: inferSectionHeading(trimmed),
            },
            tokenCount: estimateTokens(trimmed),
        });
    }

    return chunks;
}

/**
 * AST-like semantic chunking for code: extracts function/class blocks or sliding line windows.
 */
export function chunkSourceCode(
    filePath: string,
    content: string,
    nextId: (prefix: string) => string
): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const lines = content.split("\n");
    const ext = filePath.split(".").pop()?.toLowerCase() ?? "";

    if (lines.length <= DEFAULT_CODE_CHUNK_LINES) {
        return [
            {
                id: nextId("code"),
                content: formatCodeChunk(filePath, 1, lines.length, content),
                metadata: {
                    source: "code",
                    filePath,
                    language: ext,
                    startLine: 1,
                    endLine: lines.length,
                },
                tokenCount: estimateTokens(content),
            },
        ];
    }

    // Sliding window chunking with line overlaps
    let startLine = 0;
    while (startLine < lines.length) {
        const endLine = Math.min(startLine + DEFAULT_CODE_CHUNK_LINES, lines.length);
        const slice = lines.slice(startLine, endLine).join("\n");

        const detectedSymbol = detectPrimarySymbol(lines.slice(startLine, endLine));

        chunks.push({
            id: nextId("code"),
            content: formatCodeChunk(filePath, startLine + 1, endLine, slice),
            metadata: {
                source: "code",
                filePath,
                language: ext,
                startLine: startLine + 1,
                endLine,
                functionOrClass: detectedSymbol,
            },
            tokenCount: estimateTokens(slice),
        });

        if (endLine >= lines.length) break;
        startLine += DEFAULT_CODE_CHUNK_LINES - DEFAULT_CODE_OVERLAP_LINES;
    }

    return chunks;
}

function formatCodeChunk(filePath: string, start: number, end: number, code: string): string {
    return `// File: ${filePath} (Lines ${start}-${end})\n${code}`;
}

function detectPrimarySymbol(lines: string[]): string | undefined {
    for (const line of lines) {
        const classMatch = line.match(/\bclass\s+([A-Za-z0-9_]+)/);
        if (classMatch) return `class ${classMatch[1]}`;

        const funcMatch = line.match(/\b(?:function|def|async function)\s+([A-Za-z0-9_]+)/);
        if (funcMatch) return `fn ${funcMatch[1]}`;

        const arrowMatch = line.match(/\b(?:const|let|var)\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?\(/);
        if (arrowMatch) return `fn ${arrowMatch[1]}`;
    }
    return undefined;
}

function inferSectionHeading(text: string): string | undefined {
    const firstLine = text.split("\n")[0].trim();
    if (firstLine.length < 60 && !firstLine.endsWith(".")) {
        return firstLine.replace(/^[#*-\s]+/, "");
    }
    return undefined;
}

function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}
