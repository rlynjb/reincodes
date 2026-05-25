# Search ranking system design

**Industry name(s):** Information retrieval system, learned ranking, two-stage retrieval + reranking, IK Module: Search ranking
**Type:** Industry standard

> The interview prompt: "Design a search ranking system that takes a user query and returns the top-k most relevant items from a corpus." The 9-bullet reframe walks the standard architecture, the data model, the scale concerns at concrete thresholds, the eval framing, and how (or whether) reincodes applies.

**See also:** → [../03-retrieval-and-rag/11-rag.md](../03-retrieval-and-rag/11-rag.md) · → [../03-retrieval-and-rag/07-reranking.md](../03-retrieval-and-rag/07-reranking.md) · → [../03-retrieval-and-rag/06-hybrid-retrieval-rrf.md](../03-retrieval-and-rag/06-hybrid-retrieval-rrf.md)

---

- **The prompt:** Design a search ranking system that takes a user query and returns the top-k most relevant items from a large corpus, optimizing for both relevance and latency.

- **Standard architecture:**

  ```
  ┌─ Indexing pipeline (offline / batched) ──────────────────────────┐
  │                                                                  │
  │   docs ──► chunker ──► embedder ──► vector index (HNSW)         │
  │                  └──► BM25 indexer ──► inverted index            │
  │                                                                  │
  └──────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼  serves
  ┌─ Query path (online, p99 < 200ms) ───────────────────────────────┐
  │                                                                  │
  │   query ──► query understanding (typo fix, expansion)            │
  │           │                                                      │
  │           ├──► dense retrieval (top 100)  ─┐                     │
  │           └──► BM25 retrieval (top 100)   ─┴──► RRF fusion       │
  │                                                  │               │
  │                                                  ▼               │
  │                                          cross-encoder rerank    │
  │                                          (top 100 → top k)       │
  │                                                  │               │
  │                                                  ▼               │
  │                                          return top-k + scores   │
  │                                          (+ log for eval)        │
  │                                                                  │
  └──────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼  feeds back
  ┌─ Learning loop (offline) ────────────────────────────────────────┐
  │  click logs ──► training data ──► reranker fine-tune (weekly)    │
  └──────────────────────────────────────────────────────────────────┘
  ```

- **Data model:**
  - **Doc index**: `{ doc_id, title, body, embedding (1536-dim), metadata, last_indexed_at }` — the canonical doc store; HNSW index on `embedding` for ANN, inverted index on `body` for BM25.
  - **Click log**: `{ session_id, query, shown_doc_ids[], clicked_doc_ids[], dwell_ms[], timestamp }` — every search session captured for offline analysis and reranker training.
  - **Embedding model registry**: `{ model_id, version, dim, deployed_at }` — pinning model version per index batch enables clean re-embedding when models upgrade.
  - **Reranker model registry**: `{ model_id, version, deployed_at, eval_metrics }` — fine-tuned cross-encoders shipped behind feature flags with eval-driven rollout.

- **Key components:**
  - *Query understanding*: typo correction, query expansion, intent classification. Choice: small dedicated model (or rule-based for typos) — keeps latency under 20ms vs an LLM call.
  - *Hybrid retrieval*: dense (ANN over embeddings) + sparse (BM25) fused with RRF (k=60). Choice: hybrid beats either alone on mixed-domain queries; the +1 system to maintain pays for itself in recall.
  - *Reranker*: cross-encoder (Cohere Rerank or fine-tuned BGE-reranker) on the top 100 retrieved candidates. Choice: cross-encoders are 100x more expensive per pair than bi-encoders but only run on the top 100, so total cost is manageable; the lift on NDCG is 5-15 points.
  - *Serving layer*: Cloudflare Workers / serverless edge for query understanding, hosted ANN service (Pinecone/Qdrant/Vespa) for retrieval, GPU pool for the reranker. Choice: edge for the first 50ms of work, GPU for the heaviest 50ms.

- **Scale concerns:**
  - At ~10M docs: HNSW index size becomes meaningful (~10GB RAM). Solution: shard the index by topic / language / namespace; route queries to relevant shards via the query-understanding layer.
  - At ~1k QPS: cross-encoder reranking becomes the latency bottleneck (each rerank pass = 100 model calls). Solution: cache the reranker output for popular queries (LRU keyed by query+top-100); use a smaller reranker on the tail.
  - At ~100M docs: full re-indexing on model upgrade takes days. Solution: incremental indexing — only re-embed docs that changed since the last batch; mark stale rows and process in a background queue.

- **Eval framing:**
  - Offline: NDCG@10 (graded relevance), MRR (first-relevant position), hit@k (recall in top-k). Use a human-labeled golden set of 500-1000 (query, relevant docs) pairs.
  - Online: CTR (click-through rate), dwell time, session abandonment rate, downstream conversion. A/B test new rankers against the production ranker on a small slice (1-5%) of traffic.
  - Framing notes: no-click is NOT a strong negative signal (the user may have found the answer in the snippet). Long dwell is a strong positive. Abandonment after click-back is a strong negative.

- **Common failure modes:**
  - Stale index: docs updated but not re-indexed; users see outdated results. Mitigation: per-doc `last_indexed_at` + a background reindex worker; expose staleness in the result UI when relevant.
  - Cold start (new doc): just-added docs have no click signal, so the learned reranker can't score them well. Mitigation: rule-based boost for new docs in the first 24h; query the embedding-only ranking until click data accumulates.
  - Ranking bias: the reranker amplifies positions the prior model already favored (click data is biased). Mitigation: position-debiased click models (PBM, click models from the IR literature); randomize the top-N occasionally to gather counterfactual data.
  - Query-doc language mismatch: dense retrieval over English-trained embeddings misses non-English docs. Mitigation: multilingual embedding model, or per-language indexes routed by query language detection.

- **Applies to this codebase:** **no** — reincodes is a Next.js static-export DSA visualizer + portfolio with no search surface, no corpus, no users issuing queries. The site has a small `CONCEPT_CATEGORIES` array in `conceptsData.tsx` that powers the home grid, but it's 17 entries displayed in a fixed layout — there's no search box, no ranking decision, no relevance question.

- **How to make it apply:** as a thought experiment for interview prep, the closest "ranking" surface in reincodes would be the home-page concept grid — if the catalog grew to 200+ entries and the home page added a search box, this template would apply. Until then, the template is read as system-design study material, not as a buildable feature. The reincodes-specific buildable target (a `/ai/rag` pipeline visualizer with a small search-flavored layer) is named in `../03-retrieval-and-rag/11-rag.md`'s Project exercises block — that page would demonstrate retrieval-and-ranking mechanics against a precomputed corpus, which is the closest reincodes can come to "search ranking" under its static-export contract.
