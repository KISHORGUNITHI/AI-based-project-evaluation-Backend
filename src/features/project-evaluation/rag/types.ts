export type ChunkSource = "pdf" | "ppt" | "code" | "readme";

export interface ChunkMetadata {
    source: ChunkSource;
    filePath?: string;
    language?: string;
    startLine?: number;
    endLine?: number;
    title?: string;
    section?: string;
    slideNumber?: number;
    functionOrClass?: string;
}

export interface DocumentChunk {
    id: string;
    content: string;
    metadata: ChunkMetadata;
    tokenCount?: number;
}

export interface SearchScoreResult {
    chunk: DocumentChunk;
    score: number;
    rank?: number;
}

export interface SparseSearchResult extends SearchScoreResult {
    matchedTerms: string[];
}

export interface DenseSearchResult extends SearchScoreResult {
    cosineSimilarity: number;
}

export interface HybridSearchResult extends SearchScoreResult {
    denseScore: number;
    sparseScore: number;
    denseRank: number;
    sparseRank: number;
    rrfScore: number;
}

export interface RerankedResult {
    chunk: DocumentChunk;
    relevanceScore: number; // 0 - 100
    reasoning?: string;
}

export interface HybridQueryOptions {
    topK?: number;
    denseWeight?: number;
    sparseWeight?: number;
    rrfK?: number;
    rerankTopN?: number;
    sourceFilter?: ChunkSource[];
}

export interface ProjectAssetsInput {
    pdfText?: string;
    pptText?: string;
    readmeContent?: string;
    files?: Array<{ path: string; content: string; extension?: string }>;
    folderStructure?: string[];
}
