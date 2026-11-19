import type { DocumentChunk, DenseSearchResult } from "./types.js";

const EMBEDDING_DIM = 256;
const NVIDIA_EMBEDDING_MODEL = process.env.NIM_EMBEDDING_MODEL ?? "nvidia/nv-embedqa-e5-v5";
const NIM_BASE_URL = "https://integrate.api.nvidia.com/v1/embeddings";

export class DenseVectorIndex {
    private chunks: DocumentChunk[] = [];
    private embeddings: Float32Array[] = [];

    public async buildIndex(chunks: DocumentChunk[]): Promise<void> {
        this.chunks = chunks;
        this.embeddings = [];

        if (chunks.length === 0) return;

        // Try remote embedding in batches; fallback to deterministic local projection if remote fails
        try {
            this.embeddings = await this.generateEmbeddingsBatch(chunks.map((c) => c.content));
        } catch (err) {
            console.warn(
                "[DenseVectorIndex] Remote embedding API unavailable, using local semantic projection:",
                (err as Error).message
            );
            this.embeddings = chunks.map((c) => this.generateLocalSemanticEmbedding(c.content));
        }
    }

    public async search(query: string, topK = 15): Promise<DenseSearchResult[]> {
        if (this.chunks.length === 0) return [];

        let queryEmbedding: Float32Array;
        try {
            const [emb] = await this.generateEmbeddingsBatch([query]);
            queryEmbedding = emb;
        } catch {
            queryEmbedding = this.generateLocalSemanticEmbedding(query);
        }

        const scored: Array<{ chunk: DocumentChunk; score: number }> = [];

        for (let i = 0; i < this.chunks.length; i++) {
            const sim = cosineSimilarity(queryEmbedding, this.embeddings[i]);
            scored.push({
                chunk: this.chunks[i],
                score: sim,
            });
        }

        scored.sort((a, b) => b.score - a.score);

        return scored.slice(0, topK).map((item, idx) => ({
            chunk: item.chunk,
            score: item.score,
            cosineSimilarity: item.score,
            rank: idx + 1,
        }));
    }

    private async generateEmbeddingsBatch(texts: string[]): Promise<Float32Array[]> {
        const apiKey = process.env.NVIDIA_API_KEY;
        if (!apiKey) {
            throw new Error("No NVIDIA API key configured");
        }

        // Limit individual text length to 1000 chars for embedding stability
        const truncated = texts.map((t) => t.slice(0, 1000));
        const batchSize = 16;
        const results: Float32Array[] = [];

        for (let i = 0; i < truncated.length; i += batchSize) {
            const batch = truncated.slice(i, i + batchSize);

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 6000);

            try {
                const res = await fetch(NIM_BASE_URL, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        input: batch,
                        model: NVIDIA_EMBEDDING_MODEL,
                        input_type: "query",
                        encoding_format: "float",
                    }),
                    signal: controller.signal,
                });

                clearTimeout(timeout);

                if (!res.ok) {
                    throw new Error(`Embedding request failed with HTTP ${res.status}`);
                }

                const data = (await res.json()) as { data?: Array<{ embedding: number[] }> };
                if (!data.data || data.data.length === 0) {
                    throw new Error("Empty embedding response");
                }

                for (const item of data.data) {
                    results.push(new Float32Array(item.embedding));
                }
            } catch (error) {
                clearTimeout(timeout);
                // Fall back for this batch
                for (const text of batch) {
                    results.push(this.generateLocalSemanticEmbedding(text));
                }
            }
        }

        return results;
    }

    /**
     * Deterministic, subword/n-gram semantic hashed vector projection.
     * Normalized unit vector that captures morphological and lexical similarity.
     */
    public generateLocalSemanticEmbedding(text: string): Float32Array {
        const vec = new Float32Array(EMBEDDING_DIM);
        const clean = text.toLowerCase();

        // 1. Word n-grams
        const words = clean.split(/[^a-z0-9_]+/).filter(Boolean);
        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            const h = fnv1a(word) % EMBEDDING_DIM;
            vec[h] += 1.0;

            // Bi-gram
            if (i < words.length - 1) {
                const bigram = `${word}_${words[i + 1]}`;
                const bh = fnv1a(bigram) % EMBEDDING_DIM;
                vec[bh] += 1.5;
            }
        }

        // 2. Character 3-grams for code symbols and substrings
        for (let i = 0; i < clean.length - 2; i++) {
            const tri = clean.slice(i, i + 3);
            const th = fnv1a(tri) % EMBEDDING_DIM;
            vec[th] += 0.2;
        }

        // L2 normalize
        let norm = 0;
        for (let i = 0; i < EMBEDDING_DIM; i++) norm += vec[i] * vec[i];
        norm = Math.sqrt(norm);
        if (norm > 0) {
            for (let i = 0; i < EMBEDDING_DIM; i++) vec[i] /= norm;
        }

        return vec;
    }
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
    const len = Math.min(a.length, b.length);
    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < len; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom > 0 ? Math.max(0, dot / denom) : 0;
}

function fnv1a(str: string): number {
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return Math.abs(hash >>> 0);
}
