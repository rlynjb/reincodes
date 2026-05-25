# 03 — Retrieval and RAG

The retrieval surface: how to turn a corpus of documents into something an LLM can ground its answers in. Embeddings, vector stores, hybrid retrieval, reranking, RAG composition, and the failure modes that show up at production scale. **12 concept files**, all Case B for reincodes.

## Files

### Embeddings + storage
- [01-embeddings.md](01-embeddings.md) — vectors, cosine similarity, t-SNE / UMAP visualization.
- [02-embedding-model-choice.md](02-embedding-model-choice.md) — text-embedding-3 vs Voyage vs alternatives; dimension tradeoff.
- [03-chunking-strategies.md](03-chunking-strategies.md) — fixed-size vs semantic vs recursive; overlap windows.
- [04-vector-databases.md](04-vector-databases.md) — pgvector vs Pinecone vs Qdrant vs sqlite-vec; HNSW vs IVF.

### Retrieval algorithms
- [05-dense-vs-sparse-retrieval.md](05-dense-vs-sparse-retrieval.md) — BM25 vs embedding-based; when each wins.
- [06-hybrid-retrieval-rrf.md](06-hybrid-retrieval-rrf.md) — Reciprocal Rank Fusion (RRF); k=60 as the canonical constant.
- [07-reranking.md](07-reranking.md) — bi-encoder retrieve + cross-encoder rerank; Cohere Rerank.
- [08-query-rewriting-hyde.md](08-query-rewriting-hyde.md) — HyDE (Hypothetical Document Embeddings); multi-query expansion.

### Operational concerns
- [09-stale-embeddings.md](09-stale-embeddings.md) — when the index drifts from the source; `embedding_stale_at` as the primitive.
- [10-incremental-indexing.md](10-incremental-indexing.md) — append-only vs delete-and-rebuild; dirty-row pattern.

### Composition
- [11-rag.md](11-rag.md) — the canonical 5-stage pipeline; when RAG earns its place.
- [12-graph-rag.md](12-graph-rag.md) — entity-relationship-driven retrieval; Microsoft's GraphRAG.

## Reading order

01-04 first (embeddings + storage substrate), then 05-08 (retrieval algorithms), then 09-10 (operational), then 11-12 (composition). The composition files reference everything above them, so the building blocks come first.

## Related templates

For interview-prompt reframes that exercise the retrieval surface, see [`../07-system-design-templates/01-search-ranking.md`](../07-system-design-templates/01-search-ranking.md).
