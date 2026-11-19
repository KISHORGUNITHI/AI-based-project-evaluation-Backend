import { describe, it, expect } from "vitest";
import {
    chunkProjectAssets,
    tokenizeCodeAndText,
    BM25Index,
    DenseVectorIndex,
    reciprocalRankFusion,
    CrossEncoderReranker,
    HybridRagService,
} from "../../features/project-evaluation/rag/index.js";

describe("Advanced Hybrid RAG Engine", () => {
    const sampleInput = {
        pdfText: `Project Title: Autonomous Drone Pathfinding
1. Problem Statement:
Search and rescue operations in disaster zones require rapid navigation through unstructured environments where GPS signals are jammed.
2. Proposed Solution:
We introduce a lightweight Vision-Transformer model running on edge microcontrollers that generates obstacle-avoidance vectors in real time.
3. Architecture:
The system consists of an on-drone stereo camera stream, an inference node written in C++, and a ground station telemetry dashboard in React.`,
        pptText: `Slide 1: Autonomous Drone Pathfinding
Deep Learning on Edge Hardware for Search and Rescue
---
Slide 2: System Methodology
Sensor fusion using Extended Kalman Filter + MobileViT inference. Tested on 50 simulated disaster environments with 94.2% obstacle evasion accuracy.`,
        readmeContent: `# Drone Navigation Agent
High-performance obstacle avoidance agent using Vision Transformers.

## Setup
\`\`\`bash
pip install -r requirements.txt
python main.py --stream /dev/video0
\`\`\``,
        files: [
            {
                path: "src/navigation/planner.py",
                content: `import numpy as np

class PathPlanner:
    def __init__(self, safe_distance: float = 1.5):
        self.safe_distance = safe_distance

    def compute_trajectory(self, depth_map: np.ndarray) -> np.ndarray:
        """Computes collision-free trajectory vector."""
        if depth_map is None or depth_map.size == 0:
            raise ValueError("Invalid depth map input")
        min_depth = np.min(depth_map)
        if min_depth < self.safe_distance:
            return np.array([0.0, -1.0, 0.5]) # Evasive maneuver
        return np.array([1.0, 0.0, 0.0]) # Forward velocity`,
            },
            {
                path: "src/utils/kalman.py",
                content: `class ExtendedKalmanFilter:
    def __init__(self, state_dim: int):
        self.state_dim = state_dim
    def update(self, measurement):
        try:
            # Matrix multiplication and Kalman gain update
            return measurement * 0.95
        except Exception as e:
            print(f"Kalman update failed: {e}")
            return None`,
            },
        ],
    };

    it("1. Chunker: correctly splits documents and code preserving metadata", () => {
        const chunks = chunkProjectAssets(sampleInput);
        expect(chunks.length).toBeGreaterThan(3);

        const codeChunk = chunks.find((c) => c.metadata.source === "code");
        expect(codeChunk).toBeDefined();
        expect(codeChunk?.metadata.filePath).toContain("planner.py");
        expect(codeChunk?.content).toContain("// File: src/navigation/planner.py");

        const pdfChunk = chunks.find((c) => c.metadata.source === "pdf");
        expect(pdfChunk).toBeDefined();
        expect(pdfChunk?.content).toContain("Problem Statement");
    });

    it("2. BM25 Tokenizer: handles camelCase, snake_case, and code terms", () => {
        const tokens = tokenizeCodeAndText("compute_trajectory for PathPlanner with safe_distance and minDepth");
        expect(tokens).toContain("compute");
        expect(tokens).toContain("trajectory");
        expect(tokens).toContain("path");
        expect(tokens).toContain("planner");
        expect(tokens).toContain("safe");
        expect(tokens).toContain("distance");
        expect(tokens).toContain("min");
        expect(tokens).toContain("depth");
    });

    it("3. BM25 Sparse Search: retrieves exact function and class identifiers", () => {
        const chunks = chunkProjectAssets(sampleInput);
        const bm25 = new BM25Index();
        bm25.buildIndex(chunks);

        const results = bm25.search("compute_trajectory depth_map safe_distance", 5);
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].chunk.metadata.filePath).toBe("src/navigation/planner.py");
        expect(results[0].matchedTerms).toContain("trajectory");
    });

    it("4. Dense Vector Index: finds conceptually related chunks via semantic embeddings", async () => {
        const chunks = chunkProjectAssets(sampleInput);
        const dense = new DenseVectorIndex();
        await dense.buildIndex(chunks);

        const results = await dense.search("disaster zone search and rescue navigation", 5);
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].score).toBeGreaterThan(0);
        // The PDF or PPT should rank at or near the top for disaster search
        const topSources = results.slice(0, 2).map((r) => r.chunk.metadata.source);
        expect(topSources.some((s) => s === "pdf" || s === "ppt")).toBe(true);
    });

    it("5. Reciprocal Rank Fusion: combines sparse and dense rankings properly", async () => {
        const chunks = chunkProjectAssets(sampleInput);
        const bm25 = new BM25Index();
        bm25.buildIndex(chunks);
        const sparseResults = bm25.search("obstacle avoidance and depth map", 5);

        const dense = new DenseVectorIndex();
        await dense.buildIndex(chunks);
        const denseResults = await dense.search("obstacle avoidance and depth map", 5);

        const fused = reciprocalRankFusion(denseResults, sparseResults, { k: 60, topK: 5 });
        expect(fused.length).toBeGreaterThan(0);
        expect(fused[0].rrfScore).toBeGreaterThan(0);
        expect(fused[0].rank).toBe(1);
    });

    it("6. Cross-Encoder Re-ranker: scores candidate relevance via heuristic fallback", () => {
        const reranker = new CrossEncoderReranker();
        const mockCandidates = [
            {
                chunk: {
                    id: "c1",
                    content: "compute_trajectory uses safe_distance to perform collision avoidance maneuver.",
                    metadata: { source: "code" as const, filePath: "src/navigation/planner.py" },
                },
                score: 0.05,
                denseScore: 0.8,
                sparseScore: 5.2,
                denseRank: 1,
                sparseRank: 1,
                rrfScore: 0.05,
            },
            {
                chunk: {
                    id: "c2",
                    content: "Slide 1: Title slide of project with names.",
                    metadata: { source: "ppt" as const },
                },
                score: 0.01,
                denseScore: 0.2,
                sparseScore: 0.1,
                denseRank: 10,
                sparseRank: 10,
                rrfScore: 0.01,
            },
        ];

        const reranked = reranker.heuristicRerank("compute trajectory collision avoidance", mockCandidates, 2);
        expect(reranked.length).toBe(2);
        expect(reranked[0].chunk.id).toBe("c1");
        expect(reranked[0].relevanceScore).toBeGreaterThan(reranked[1].relevanceScore);
    });

    it("7. HybridRagService: end-to-end index and rubric-targeted evidence retrieval", async () => {
        const rag = new HybridRagService();
        const chunkCount = await rag.indexProject(sampleInput);
        expect(chunkCount).toBeGreaterThan(3);

        const implementationEvidence = await rag.retrieveEvidenceForRubric("implementation");
        expect(implementationEvidence).toContain("planner.py");
        expect(implementationEvidence).toContain("compute_trajectory");

        const problemEvidence = await rag.retrieveEvidenceForRubric("problemStatement");
        expect(problemEvidence).toContain("disaster zones");
    });
});
