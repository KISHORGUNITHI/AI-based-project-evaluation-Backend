import type { DocumentChunk, SparseSearchResult } from "./types.js";

const DEFAULT_K1 = 1.5;
const DEFAULT_B = 0.75;

const STOP_WORDS = new Set([
    "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are",
    "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", "but",
    "by", "could", "did", "do", "does", "doing", "down", "during", "each", "few", "for", "from",
    "further", "had", "has", "have", "having", "he", "her", "here", "hers", "herself", "him",
    "himself", "his", "how", "i", "if", "in", "into", "is", "it", "its", "itself", "me", "more",
    "most", "my", "myself", "no", "nor", "not", "of", "off", "on", "once", "only", "or", "other",
    "ought", "our", "ours", "ourselves", "out", "over", "own", "same", "she", "should", "so",
    "some", "such", "than", "that", "the", "their", "theirs", "them", "themselves", "then",
    "there", "these", "they", "this", "those", "through", "to", "too", "under", "until", "up",
    "very", "was", "we", "were", "what", "when", "where", "which", "while", "who", "whom", "why",
    "with", "would", "you", "your", "yours", "yourself", "yourselves"
]);

/**
 * Splits identifiers (camelCase, snake_case, paths) and general prose into tokens.
 */
export function tokenizeCodeAndText(text: string): string[] {
    // 1. Separate camelCase: "processUserInput" -> "process User Input"
    const splitCamel = text.replace(/([a-z])([A-Z])/g, "$1 $2");
    
    // 2. Replace non-alphanumeric characters with spaces
    const clean = splitCamel.replace(/[^a-zA-Z0-9_]/g, " ");
    
    // 3. Extract tokens, splitting on whitespace and underscores
    const rawTokens = clean.split(/[\s_]+/);
    const tokens: string[] = [];

    for (const raw of rawTokens) {
        const lower = raw.toLowerCase().trim();
        if (lower.length >= 2 && !STOP_WORDS.has(lower)) {
            tokens.push(lower);
        }
    }

    return tokens;
}

export class BM25Index {
    private chunks: DocumentChunk[] = [];
    private docTokens: string[][] = [];
    private docLengths: number[] = [];
    private avgDocLength = 0;
    private docCount = 0;
    
    // Term -> Map of docIndex -> term frequency
    private invertedIndex: Map<string, Map<number, number>> = new Map();
    // Term -> Inverse Document Frequency
    private idfCache: Map<string, number> = new Map();

    private k1: number;
    private b: number;

    constructor(k1 = DEFAULT_K1, b = DEFAULT_B) {
        this.k1 = k1;
        this.b = b;
    }

    public buildIndex(chunks: DocumentChunk[]): void {
        this.chunks = chunks;
        this.docCount = chunks.length;
        this.docTokens = [];
        this.docLengths = [];
        this.invertedIndex.clear();
        this.idfCache.clear();

        let totalTokens = 0;

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const tokens = tokenizeCodeAndText(chunk.content);
            this.docTokens.push(tokens);
            this.docLengths.push(tokens.length);
            totalTokens += tokens.length;

            const tfMap = new Map<string, number>();
            for (const token of tokens) {
                tfMap.set(token, (tfMap.get(token) ?? 0) + 1);
            }

            for (const [token, count] of tfMap.entries()) {
                if (!this.invertedIndex.has(token)) {
                    this.invertedIndex.set(token, new Map());
                }
                this.invertedIndex.get(token)!.set(i, count);
            }
        }

        this.avgDocLength = this.docCount > 0 ? totalTokens / this.docCount : 0;

        // Compute Robertson-Spärck Jones IDF for all terms
        for (const [term, postingList] of this.invertedIndex.entries()) {
            const df = postingList.size;
            // Standard BM25 IDF formulation
            const idf = Math.log(1 + (this.docCount - df + 0.5) / (df + 0.5));
            this.idfCache.set(term, Math.max(0.01, idf));
        }
    }

    public search(query: string, topK = 15): SparseSearchResult[] {
        if (this.docCount === 0) return [];

        const queryTokens = tokenizeCodeAndText(query);
        if (queryTokens.length === 0) return [];

        const scores = new Float64Array(this.docCount);
        const matchedTermsMap = new Map<number, Set<string>>();

        for (const token of queryTokens) {
            const postingList = this.invertedIndex.get(token);
            if (!postingList) continue;

            const idf = this.idfCache.get(token) ?? 0;

            for (const [docIdx, tf] of postingList.entries()) {
                const docLen = this.docLengths[docIdx];
                const denominator = tf + this.k1 * (1 - this.b + this.b * (docLen / this.avgDocLength));
                const termScore = idf * ((tf * (this.k1 + 1)) / (denominator || 1));

                scores[docIdx] += termScore;

                if (!matchedTermsMap.has(docIdx)) {
                    matchedTermsMap.set(docIdx, new Set());
                }
                matchedTermsMap.get(docIdx)!.add(token);
            }
        }

        const results: SparseSearchResult[] = [];
        for (let i = 0; i < this.docCount; i++) {
            if (scores[i] > 0) {
                results.push({
                    chunk: this.chunks[i],
                    score: scores[i],
                    matchedTerms: Array.from(matchedTermsMap.get(i) ?? []),
                });
            }
        }

        results.sort((a, b) => b.score - a.score);
        return results.slice(0, topK).map((res, rank) => ({ ...res, rank: rank + 1 }));
    }
}
