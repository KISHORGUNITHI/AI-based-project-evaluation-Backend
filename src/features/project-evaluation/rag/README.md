# 🧠 Advanced Hybrid RAG Engine (Code & Multi-Modal Document Retrieval)

An enterprise-grade, domain-specialized **Retrieval-Augmented Generation (RAG)** engine built for automated project evaluation. It combines **AST code-aware chunking**, **sparse BM25 keyword search**, **dense vector semantic embeddings**, **Reciprocal Rank Fusion (RRF)**, and **Cross-Encoder Re-ranking** to provide surgically precise code and document evidence to LangGraph evaluation agents.

---

## 📌 Motivation: Why Advanced RAG for Code & Projects?

Standard naive RAG and context-stuffing fail when evaluating real software repositories and multi-page technical reports:

| Challenge | Naive Context Slicing | Standard Vector RAG | Our Advanced Hybrid RAG |
| :--- | :--- | :--- | :--- |
| **Token Limits & Costs** | Truncates after 2,500 chars, losing critical logic | Ingests arbitrary text blocks | **Targeted 45-line AST windows with exact line numbers** |
| **Exact Code Identifiers** | Misses unread files entirely | Poor: Vector embeddings blur exact symbols (`jwt.verify`, `computeTrajectory`) | **High: Code-aware BM25 captures exact functions, imports, and variables** |
| **Conceptual Understanding** | High token consumption | Good semantic recall | **High: Dense vector search captures architectural patterns and intent** |
| **Signal-to-Noise Ratio** | Low: Prompt filled with boilerplate | Medium: Bi-encoder cosine similarity includes irrelevant files | **Exceptional: Cross-Encoder scores deep query-chunk cross-attention** |

---

## 🏛️ End-to-End RAG Architecture

```
                       [Project Assets]
        (GitHub Codebase, PDF Technical Report, PPT Deck, README)
                              │
                              ▼
        ┌─────────────────────────────────────────────┐
        │       1. Code-Aware & Document Chunker      │
        │  - Code: Functions, Classes, 45-line window │
        │  - Docs: Slides, Headings, Paragraph breaks │
        └─────────────────────┬───────────────────────┘
                              │
                              ▼ Document Chunks
        ┌─────────────────────────────────────────────┐
        │          2. Dual Parallel Indexing          │
        ├──────────────────────┬──────────────────────┤
        │  Sparse Index (BM25) │  Dense Vector Index  │
        │  - Code Tokenization │  - NVIDIA NIM Embeds │
        │  - RSJ IDF Formula   │  - Cosine Similarity │
        └──────────┬───────────┴──────────┬───────────┘
                   │                      │
                   ▼ (Top-20 Candidates)  ▼ (Top-20 Candidates)
        ┌─────────────────────────────────────────────┐
        │       3. Reciprocal Rank Fusion (RRF)       │
        │     RRF(d) = Σ w_m / (k + rank_m(d))        │
        └─────────────────────┬───────────────────────┘
                              │
                              ▼ Top Candidates
        ┌─────────────────────────────────────────────┐
        │        4. Cross-Encoder Re-ranker           │
        │  - Deep token-level cross-attention scoring │
        │  - Filters boilerplate & irrelevant snippets│
        └─────────────────────┬───────────────────────┘
                              │
                              ▼ Top 5–7 Grounded Snippets
        ┌─────────────────────────────────────────────┐
        │     5. LangGraph Agent Ingestion            │
        │  Injects exact citations into prompt:       │
        │  "[File: src/planner.py (Lines 1-45)]"      │
        └─────────────────────────────────────────────┘
```

---

## 📂 Module Structure & Components

The engine is located under `src/features/project-evaluation/rag/`:

### 1. `chunking.ts` — Code-Aware & Multi-Modal Chunker
* **Code Chunking (`chunkSourceCode`)**:
  * Detects syntax boundaries: `class`, `function`, `def`, `async function`, and arrow function assignments.
  * Emits sliding line windows (default: **45 lines with 10-line overlap**).
  * Injects structured headers: `// File: <filePath> (Lines <start>-<end>)`.
* **Document Chunking (`chunkTextDocument` & `chunkPresentationText`)**:
  * Slices technical PDF reports by semantic paragraphs ($750$ chars with $150$ char overlap).
  * Slices slide decks by slide transitions (`Slide \d+`, `---`), retaining slide numbers and section headings.

### 2. `bm25.ts` — Code-Tokenized Sparse Keyword Search
* **Code Tokenizer (`tokenizeCodeAndText`)**:
  * Deconstructs programming identifiers:
    * `camelCase` $\rightarrow$ `getUserProfile` $\rightarrow$ `["get", "user", "profile"]`
    * `snake_case` $\rightarrow$ `compute_trajectory` $\rightarrow$ `["compute", "trajectory"]`
    * File path delimiters $\rightarrow$ `src/routes/auth.ts` $\rightarrow$ `["src", "routes", "auth", "ts"]`
  * Filters general stop words while strictly preserving critical programming tokens (`class`, `model`, `test`, `async`, `try`, `catch`, `schema`, `route`).
* **Scoring Formula**:
  * Calculates Robertson-Spärck Jones Inverse Document Frequency (RSJ IDF):
    $$\text{IDF}(t) = \ln\left(1 + \frac{N - \text{df}(t) + 0.5}{\text{df}(t) + 0.5}\right)$$
  * Okapi BM25 scoring with parameters $k_1 = 1.5, b = 0.75$.

### 3. `dense-search.ts` — Dense Vector Semantic Search
* Generates dense vector embeddings:
  * **Primary**: Remote NVIDIA NIM API (`nvidia/nv-embedqa-e5-v5`) with batching.
  * **Local Fallback**: Deterministic 256-dimensional subword & n-gram semantic hashed vector projection, ensuring zero pipeline crashes during network or API rate limits.
* Computes normalized cosine similarity:
  $$\text{cosine\_similarity}(\vec{u}, \vec{v}) = \frac{\sum u_i v_i}{\|\vec{u}\| \|\vec{v}\|}$$

### 4. `rrf.ts` — Reciprocal Rank Fusion
* Merges dense and sparse result lists without requiring score normalization:
  $$\text{RRF\_Score}(d) = \frac{w_{\text{dense}}}{k + \text{rank}_{\text{dense}}(d)} + \frac{w_{\text{sparse}}}{k + \text{rank}_{\text{sparse}}(d)}$$
  * Default smoothing constant: $k = 60$.
  * Balanced weights: $w_{\text{dense}} = 0.5, w_{\text{sparse}} = 0.5$.

### 5. `reranker.ts` — Cross-Encoder Re-ranker
* Evaluates top candidate snippets against the query using deep cross-attention:
  * **LLM Re-ranker**: Prompts NVIDIA NIM to assess query-chunk relevance on a 0–100 scale, filtering out boilerplate and empty files.
  * **Heuristic Fallback**: Lexical density and query-term coverage cross-scorer for offline execution.
* Returns top $N$ high-information snippets.

### 6. `hybrid-rag-service.ts` — Unified Service Orchestrator
* **`indexProject(input: ProjectAssetsInput)`**: Ingests, chunks, and indexes all project assets.
* **`search(query: string, options?: HybridQueryOptions)`**: Runs parallel dense + sparse retrieval, fuses via RRF, and re-ranks.
* **`retrieveEvidenceForRubric(dimension)`**: Pre-tuned domain queries for the 5 evaluation dimensions:
  1. `problemStatement`: Real-world relevance, motivation, problem scope.
  2. `solutionDesign`: System architecture, schemas, API routes, data flow.
  3. `implementation`: Error handling, data validation, testing suites, CI/CD, Dockerfile.
  4. `innovation`: Creative algorithms, machine learning models, custom techniques.
  5. `documentation`: README instructions, API specifications, slide deck structure.

---

## 🔌 Integration with LangGraph Evaluation Pipeline

In `src/features/project-evaluation/langgraph/nodes/evaluation-agent.ts`:

```typescript
// 1. Initialize RAG service
const rag = new HybridRagService();
await rag.indexProject({
    pdfText: state.pdfText,
    pptText: state.pptText,
    readmeContent: state.githubSummary,
});

// 2. Retrieve targeted evidence across rubric dimensions
const [implEv, solEv, probEv] = await Promise.all([
    rag.retrieveEvidenceForRubric("implementation"),
    rag.retrieveEvidenceForRubric("solutionDesign"),
    rag.retrieveEvidenceForRubric("problemStatement"),
]);

// 3. Inject grounded evidence with exact file citations into prompt
const prompt = `...
=== GROUNDED RAG EVIDENCE (HYBRID RETRIEVAL + CROSS-ENCODER RE-RANKING) ===
[Problem Statement Evidence]:
${probEv}

[Architecture & Design Evidence]:
${solEv}

[Implementation & Code Quality Evidence]:
${implEv}
...`;
```

---

## 💻 Programmatic Usage Example

```typescript
import { HybridRagService } from "./src/features/project-evaluation/rag/index.js";

const rag = new HybridRagService();

// 1. Index submission assets
await rag.indexProject({
    pdfText: "Extracted PDF report text...",
    pptText: "Extracted presentation slide text...",
    readmeContent: "# Project Title\nProject documentation...",
    files: [
        { path: "src/auth/jwt.ts", content: "export function verifyToken() { ... }" },
        { path: "src/db/prisma.ts", content: "export const prisma = new PrismaClient();" },
    ],
});

// 2. Query for exact technical implementation
const results = await rag.search("How is token expiration and authentication handled?", {
    topK: 10,
    rerankTopN: 3,
    sourceFilter: ["code"],
});

for (const r of results) {
    console.log(`[Relevance: ${r.relevanceScore}/100] ${r.chunk.metadata.filePath}`);
    console.log(r.chunk.content);
}

// 3. Retrieve rubric-specific evidence
const implementationEvidence = await rag.retrieveEvidenceForRubric("implementation");
console.log(implementationEvidence);
```

---

## 🧪 Verification & Unit Testing

The RAG engine is fully tested and verified via `src/tests/unit/hybrid-rag.test.ts`:

* **Chunking Verification**: Verifies line windowing, syntax extraction, and metadata preservation.
* **BM25 Inverted Index**: Verifies code tokenization and exact symbol recall.
* **Dense Cosine Index**: Verifies semantic matching and local projection fallback.
* **RRF Ranking**: Verifies rank fusion accuracy.
* **Cross-Encoder**: Verifies candidate scoring and boilerplate filtering.
* **End-to-End Service**: Verifies multi-asset ingestion and rubric evidence extraction.
