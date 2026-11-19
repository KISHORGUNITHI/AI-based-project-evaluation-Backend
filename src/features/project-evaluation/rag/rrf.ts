import type {
    DocumentChunk,
    DenseSearchResult,
    SparseSearchResult,
    HybridSearchResult,
} from "./types.js";

const DEFAULT_RRF_K = 60;

export interface RRFOptions {
    k?: number;
    denseWeight?: number;
    sparseWeight?: number;
    topK?: number;
}

/**
 * Combines ranked lists from Dense Vector Search and Sparse BM25 Search using Reciprocal Rank Fusion (RRF).
 */
export function reciprocalRankFusion(
    denseResults: DenseSearchResult[],
    sparseResults: SparseSearchResult[],
    options?: RRFOptions
): HybridSearchResult[] {
    const k = options?.k ?? DEFAULT_RRF_K;
    const denseWeight = options?.denseWeight ?? 0.5;
    const sparseWeight = options?.sparseWeight ?? 0.5;
    const topK = options?.topK ?? 20;

    // Map chunkId -> metadata and ranks
    const chunkMap = new Map<string, DocumentChunk>();
    const denseRankMap = new Map<string, { rank: number; score: number }>();
    const sparseRankMap = new Map<string, { rank: number; score: number }>();

    for (let i = 0; i < denseResults.length; i++) {
        const item = denseResults[i];
        chunkMap.set(item.chunk.id, item.chunk);
        denseRankMap.set(item.chunk.id, { rank: i + 1, score: item.score });
    }

    for (let i = 0; i < sparseResults.length; i++) {
        const item = sparseResults[i];
        chunkMap.set(item.chunk.id, item.chunk);
        sparseRankMap.set(item.chunk.id, { rank: i + 1, score: item.score });
    }

    const hybridList: HybridSearchResult[] = [];
    const maxDenseRank = denseResults.length + 10;
    const maxSparseRank = sparseResults.length + 10;

    for (const [chunkId, chunk] of chunkMap.entries()) {
        const denseInfo = denseRankMap.get(chunkId);
        const sparseInfo = sparseRankMap.get(chunkId);

        const dRank = denseInfo ? denseInfo.rank : maxDenseRank;
        const sRank = sparseInfo ? sparseInfo.rank : maxSparseRank;

        const dScore = denseInfo ? denseInfo.score : 0;
        const sScore = sparseInfo ? sparseInfo.score : 0;

        // Standard RRF formula
        const rrfDense = denseWeight / (k + dRank);
        const rrfSparse = sparseWeight / (k + sRank);
        const totalRrf = rrfDense + rrfSparse;

        hybridList.push({
            chunk,
            score: totalRrf,
            denseScore: dScore,
            sparseScore: sScore,
            denseRank: dRank,
            sparseRank: sRank,
            rrfScore: totalRrf,
        });
    }

    hybridList.sort((a, b) => b.rrfScore - a.rrfScore);

    return hybridList.slice(0, topK).map((item, idx) => ({
        ...item,
        rank: idx + 1,
    }));
}
