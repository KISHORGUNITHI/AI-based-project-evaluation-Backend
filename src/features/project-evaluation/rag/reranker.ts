import type { HybridSearchResult, RerankedResult } from "./types.js";

export class CrossEncoderReranker {
    /**
     * Re-ranks a list of candidate chunks against a query using LLM cross-attention scoring.
     */
    public async rerank(
        query: string,
        candidates: HybridSearchResult[],
        topN = 6
    ): Promise<RerankedResult[]> {
        if (candidates.length === 0) return [];
        if (candidates.length <= topN) {
            return candidates.map((c) => ({
                chunk: c.chunk,
                relevanceScore: Math.round(c.rrfScore * 1000),
                reasoning: "Retrieved via Hybrid RRF",
            }));
        }

        // Limit candidates sent to re-ranker to top 15 to keep latency low (<1.5s)
        const toRerank = candidates.slice(0, 15);

        try {
            const { z } = await import("zod");
            const { getNimModel } = await import("../../../lib/nim.js");

            const rerankBatchZodSchema = z.object({
                rankings: z.array(
                    z.object({
                        chunkId: z.string(),
                        relevanceScore: z.number().min(0).max(100),
                        reasoning: z.string().optional(),
                    })
                ),
            });

            const model = getNimModel();

            const candidatesContext = toRerank
                .map((c, i) => {
                    const sourceInfo = c.chunk.metadata.filePath
                        ? `File: ${c.chunk.metadata.filePath}`
                        : `Source: ${c.chunk.metadata.source} (${c.chunk.metadata.section ?? ""})`;
                    const snippet = c.chunk.content.slice(0, 500);
                    return `[Candidate ID: ${c.chunk.id}]\n${sourceInfo}\nContent:\n${snippet}\n---`;
                })
                .join("\n\n");

            const prompt = `You are a Cross-Encoder Re-ranking model for code and technical documentation.
Your job is to rate the relevance of each candidate snippet against the evaluation query on a scale from 0 to 100.

EVALUATION QUERY:
"${query}"

CANDIDATES TO RANK:
${candidatesContext}

Assign higher scores (75-100) to snippets containing concrete implementation logic, architecture, error handling, or evidence directly answering the query.
Assign lower scores (0-40) to boilerplate, trivial comments, or irrelevant modules.

Return a JSON array containing each chunkId, relevanceScore (0-100), and a 1-sentence reasoning.`;

            const structured = model.withStructuredOutput(rerankBatchZodSchema);
            const res = await structured.invoke(prompt);

            const scoreMap = new Map<string, { score: number; reasoning?: string }>();
            for (const item of res.rankings) {
                scoreMap.set(item.chunkId, {
                    score: item.relevanceScore,
                    reasoning: item.reasoning,
                });
            }

            const reranked: RerankedResult[] = toRerank.map((item) => {
                const llmScore = scoreMap.get(item.chunk.id);
                const finalScore = llmScore ? llmScore.score : Math.round(item.rrfScore * 500);
                return {
                    chunk: item.chunk,
                    relevanceScore: finalScore,
                    reasoning: llmScore?.reasoning ?? "Ranked via Hybrid RRF",
                };
            });

            reranked.sort((a, b) => b.relevanceScore - a.relevanceScore);
            return reranked.slice(0, topN);
        } catch (error) {
            console.warn(
                "[CrossEncoderReranker] LLM re-ranking failed, falling back to heuristic cross-scoring:",
                (error as Error).message
            );
            return this.heuristicRerank(query, toRerank, topN);
        }
    }

    /**
     * Heuristic token-overlap and density fallback when LLM re-ranker is unavailable.
     */
    public heuristicRerank(
        query: string,
        candidates: HybridSearchResult[],
        topN = 6
    ): RerankedResult[] {
        const queryTerms = query.toLowerCase().split(/[^a-z0-9_]+/).filter((t) => t.length > 2);

        const scored = candidates.map((cand) => {
            const content = cand.chunk.content.toLowerCase();
            let overlapCount = 0;

            for (const term of queryTerms) {
                if (content.includes(term)) overlapCount++;
            }

            // Combine RRF score with exact lexical density
            const termRatio = queryTerms.length > 0 ? overlapCount / queryTerms.length : 0;
            const heuristicScore = Math.round(cand.rrfScore * 500 + termRatio * 50);

            return {
                chunk: cand.chunk,
                relevanceScore: Math.min(100, Math.max(0, heuristicScore)),
                reasoning: `Heuristic match: ${overlapCount}/${queryTerms.length} query terms matched`,
            };
        });

        scored.sort((a, b) => b.relevanceScore - a.relevanceScore);
        return scored.slice(0, topN);
    }
}
