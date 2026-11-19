# Advanced Hybrid RAG Engine Documentation

For full implementation and technical architecture details, refer to:
[src/features/project-evaluation/rag/README.md](../src/features/project-evaluation/rag/README.md)

## Summary of Capabilities
1. **Multi-Modal Ingestion**: Ingests GitHub codebases, PDF technical documentation, PPT presentation decks, and Markdown READMEs.
2. **Code-Aware AST Chunking**: Slices code by function/class declarations and 45-line sliding windows with 10-line overlap, preserving file paths and line ranges.
3. **Sparse BM25 Search**: Code-tokenized keyword search splitting camelCase and snake_case to capture exact identifiers and libraries.
4. **Dense Vector Search**: High-dimensional semantic search with cosine similarity and deterministic local projection fallback.
5. **Reciprocal Rank Fusion (RRF)**: Merges dense and sparse rankings ($k=60$).
6. **Cross-Encoder Re-ranker**: Deep query-to-chunk relevance scoring filtering out boilerplate and ranking high-information snippets.
7. **LangGraph Grounding**: Injects exact file and line citations into the `evaluationAgent` prompt to eliminate scoring hallucinations.
