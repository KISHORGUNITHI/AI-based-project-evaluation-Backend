import type {
    DocumentChunk,
    ProjectAssetsInput,
    HybridQueryOptions,
    RerankedResult,
    ChunkSource,
} from "./types.js";
import { chunkProjectAssets } from "./chunking.js";
import { BM25Index } from "./bm25.js";
import { DenseVectorIndex } from "./dense-search.js";
import { reciprocalRankFusion } from "./rrf.js";
import { CrossEncoderReranker } from "./reranker.js";

export class HybridRagService {
    private chunks: DocumentChunk[] = [];
    private bm25Index = new BM25Index();
    private denseIndex = new DenseVectorIndex();
    private reranker = new CrossEncoderReranker();
    private isIndexed = false;

    /**
     * Ingests, chunks, and indexes all project assets (PDF, PPT, README, Code).
     */
    public async indexProject(input: ProjectAssetsInput): Promise<number> {
        console.log("[HybridRagService] Starting ingestion and chunking of project assets...");
        this.chunks = chunkProjectAssets(input);

        if (this.chunks.length === 0) {
            console.warn("[HybridRagService] No chunks created from input assets.");
            this.isIndexed = false;
            return 0;
        }

        console.log(`[HybridRagService] Created ${this.chunks.length} chunks. Building BM25 and Dense indexes...`);

        // 1. Build BM25 sparse index
        this.bm25Index.buildIndex(this.chunks);

        // 2. Build Dense vector index
        await this.denseIndex.buildIndex(this.chunks);

        this.isIndexed = true;
        console.log("[HybridRagService] Project indexing completed successfully.");
        return this.chunks.length;
    }

    /**
     * Executes Advanced RAG: Dense Search + BM25 Sparse Search + RRF + Cross-Encoder Re-ranking.
     */
    public async search(
        query: string,
        options?: HybridQueryOptions
    ): Promise<RerankedResult[]> {
        if (!this.isIndexed || this.chunks.length === 0) {
            return [];
        }

        const topKCandidates = options?.topK ?? 20;
        const rerankTopN = options?.rerankTopN ?? 6;

        // 1. Run Parallel Dense and Sparse Retrievals
        const [denseResults, sparseResults] = await Promise.all([
            this.denseIndex.search(query, topKCandidates),
            Promise.resolve(this.bm25Index.search(query, topKCandidates)),
        ]);

        // Filter by source if requested (e.g. only 'code' or only 'pdf')
        const filteredDense = options?.sourceFilter
            ? denseResults.filter((r) => options.sourceFilter!.includes(r.chunk.metadata.source))
            : denseResults;

        const filteredSparse = options?.sourceFilter
            ? sparseResults.filter((r) => options.sourceFilter!.includes(r.chunk.metadata.source))
            : sparseResults;

        // 2. Reciprocal Rank Fusion (RRF)
        const hybridCandidates = reciprocalRankFusion(filteredDense, filteredSparse, {
            k: options?.rrfK ?? 60,
            denseWeight: options?.denseWeight ?? 0.5,
            sparseWeight: options?.sparseWeight ?? 0.5,
            topK: topKCandidates,
        });

        // 3. Cross-Encoder Re-ranking
        const reranked = await this.reranker.rerank(query, hybridCandidates, rerankTopN);

        return reranked;
    }

    /**
     * Pre-packaged targeted queries for the 5 evaluation rubric dimensions.
     */
    public async retrieveEvidenceForRubric(
        dimension:
            | "problemStatement"
            | "solutionDesign"
            | "implementation"
            | "innovation"
            | "documentation"
    ): Promise<string> {
        if (!this.isIndexed || this.chunks.length === 0) {
            return "No indexed evidence available.";
        }

        const dimensionQueries: Record<string, { query: string; sources?: ChunkSource[] }> = {
            problemStatement: {
                query: "What problem is being solved? Problem statement, goals, background, target audience, real-world motivation.",
                sources: ["pdf", "ppt", "readme"],
            },
            solutionDesign: {
                query: "System architecture, components, data flow, design patterns, schemas, API endpoints, modular structure.",
                sources: ["code", "pdf", "ppt", "readme"],
            },
            implementation: {
                query: "Core algorithm logic, error handling, try catch, data validation, test files, testing suites, CI/CD, Dockerfile.",
                sources: ["code"],
            },
            innovation: {
                query: "Novelty, unique techniques, creative approaches, machine learning models, custom algorithms, competitive edge.",
                sources: ["code", "pdf", "ppt"],
            },
            documentation: {
                query: "README setup instructions, project documentation, code comments, API specifications, presentation slide deck.",
                sources: ["readme", "pdf", "ppt"],
            },
        };

        const config = dimensionQueries[dimension];
        const results = await this.search(config.query, {
            topK: 15,
            rerankTopN: 4,
            sourceFilter: config.sources,
        });

        if (results.length === 0) {
            return `No specific evidence retrieved for ${dimension}.`;
        }

        return results
            .map((r, i) => {
                const meta = r.chunk.metadata;
                const header = meta.filePath
                    ? `[Evidence ${i + 1} | File: ${meta.filePath} (Lines ${meta.startLine ?? 1}-${meta.endLine ?? ""}) | Relevance: ${r.relevanceScore}/100]`
                    : `[Evidence ${i + 1} | Source: ${meta.source.toUpperCase()} ${meta.section ? `(${meta.section})` : ""} | Relevance: ${r.relevanceScore}/100]`;
                return `${header}\n${r.chunk.content}`;
            })
            .join("\n\n---\n\n");
    }

    public getChunkCount(): number {
        return this.chunks.length;
    }
}
