# Search ranking system design

**Industry name(s):** Two-stage retrieval + ranking; learning-to-rank; classic IR pipeline (IK Module 1, IK Module 2).
**Type:** Industry standard · Language-agnostic

> The interview prompt "design a search ranking system" reframed against reincodes — a project with no search surface — to document the standard architecture, the failure modes, and the honest "does not apply" verdict.

---

- **The prompt:** "Design a search ranking system that takes a user query and returns the top-k most relevant items from a corpus."

- **Standard architecture:**

  ```
  Query
    │
    ▼
  ┌──────────────────────────────────────────┐
  │ Query understanding                       │
  │  - tokenize, lowercase, expand synonyms   │
  │  - optional: LLM-rewrite hard queries     │
  └──────────────────────┬───────────────────┘
                         │
                         ▼
  ┌──────────────────────────────────────────┐
  │ Candidate retrieval (parallel)            │
  │  ┌─────────────────┐  ┌────────────────┐ │
  │  │ Sparse (BM25)   │  │ Dense (ANN)    │ │
  │  │ inverted index  │  │ HNSW over      │ │
  │  │ term → doc IDs  │  │ embeddings     │ │
  │  └────────┬────────┘  └────────┬───────┘ │
  │           │                    │         │
  │           └────── RRF fuse ────┘         │
  │                                          │
  │  N candidates (N typically 100–500)      │
  └──────────────────────┬───────────────────┘
                         │
                         ▼
  ┌──────────────────────────────────────────┐
  │ Ranking (learned-to-rank or LLM rerank)   │
  │  features: BM25 score, cosine, click     │
  │            logs, freshness, position-bias│
  │  model:    LightGBM LambdaMART, or       │
  │            cross-encoder rerank          │
  └──────────────────────┬───────────────────┘
                         │
                         │ top-k (k=10)
                         ▼
  ┌──────────────────────────────────────────┐
  │ Serving + logging                         │
  │  - cache (query → top-k)                 │
  │  - log {query, doc_id, position,         │
  │         clicked, dwell_time}              │
  │  - return ordered list                   │
  └──────────────────────┬───────────────────┘
                         │
                         ▼
                      Results
  ```

- **Data model:**
  - Document corpus: `{doc_id, text, title, metadata, created_at, updated_at, embedding, embedding_model_version}`. The embedding column is sized for ANN index ingestion.
  - Inverted index (sparse): term → `{doc_id, term_freq, doc_freq}`. Updated on doc write. Storage: Lucene/OpenSearch or Postgres GIN index.
  - Vector index (dense): HNSW over the embedding column. Storage: pgvector, sqlite-vec, or Qdrant/Pinecone depending on scale.
  - Click/interaction log: `{session_id, query, doc_id, rank_position, clicked (bool), dwell_time_ms, timestamp}`. The training signal for the ranker.
  - Query log: `{query, frequency, last_seen, top_k_clicked_distribution}`. Used for caching hot queries and detecting drift.
  - Eval set: `{query, expected_doc_ids}` — held-out human-labeled relevance for offline metrics.

- **Key components:**
  - *Query understanding* — normalizes and optionally rewrites the query. Decision: heuristic rules (lowercase, strip punct, expand 30 known synonyms) for ~90% of queries; LLM rewrite gated on low retrieval confidence to bound latency. Rationale: the LLM rewrite is expensive and only justifies itself when the cheap path retrieves nothing relevant.
  - *Sparse retrieval (BM25)* — catches exact-term queries (SKU codes, error strings, named entities). Decision: keep even when dense retrieval is good — exact-match is the failure mode dense doesn't cover. Rationale: 30 years of tuning behind BM25; the cost is near-zero compared to running an LLM.
  - *Dense retrieval (HNSW over embeddings)* — catches paraphrased queries. Decision: same embedding model for index and query (the load-bearing invariant). Rationale: a query vector from a different model is meaningless in the index's space.
  - *Fusion (RRF)* — reciprocal-rank-fusion combines sparse and dense rankings. Decision: RRF over learned linear blending because RRF has no parameters to tune and works reasonably well out of the box. Rationale: simplicity is a feature when the system is being bootstrapped.
  - *Ranking model* — LightGBM LambdaMART trained on click logs, or a cross-encoder reranker over the top-N. Decision: start with LambdaMART because it's interpretable (per-feature importance) and trains in minutes; move to cross-encoder for the top-20 if precision still lags. Rationale: avoid LLM-in-the-loop for the ranking step at production scale — latency and cost don't justify it for ranking 100 candidates.
  - *Serving + logging* — caches top-k per query, instruments traces, returns the ordered list. Decision: cache aggressively for the top-1000 head queries; never cache the long tail (where ranking quality matters most and click data is sparse).

- **Scale concerns:**
  - At ~10M docs: the HNSW index size exceeds single-node RAM. Solution: shard the index by `doc_id` range (or by tenant for multi-tenant), query all shards in parallel, fuse results. Latency goes from network-free local lookup to network-bounded scatter-gather.
  - At ~1k QPS: cross-encoder rerank becomes the latency bottleneck — each query reranks 20 docs through a 100M-param model. Solution: cache reranks for the top-1000 head queries, distill the cross-encoder to a 30M-param model for cold queries, or skip rerank entirely when bi-encoder confidence is high.
  - At ~100M+ docs: full corpus re-embed during an embedding model upgrade becomes multi-day batch work. Solution: dual-serve during migration — keep the old index live until the new one is built, then atomic-swap. Track `embedding_model_version` per doc so partial migrations are queryable.
  - At ~10k QPS: click-log write throughput becomes a problem. Solution: batch writes with a 1-second buffer, separate the write-hot click log from the read-hot ranking features in storage.

- **Eval framing:**
  - Offline: hit@k (did the gold doc make the top k?), MRR (mean reciprocal rank — penalizes when the gold doc is far down), NDCG (rewards graded relevance — most relevant first). Set sizes: 100 queries for smoke-test, 1k+ for trustworthy numbers.
  - Online: CTR at positions 1–3 (does the user click the top result?), dwell time on clicked results (did they read it?), query reformulation rate (drops when ranking gets better — the user got their answer first try). Run as A/B tests, 1–2 weeks per experiment.
  - "No-click is not a negative label" — a user who didn't click a result may have read the snippet and gotten their answer. Click logs are biased; inverse propensity scoring or impression-weighted CTR is the mitigation.
  - Adversarial set: queries that historically retrieve the footer page, queries with typos that BM25 misses, queries in code symbols (`SKU-X42-RED`) that dense misses. Eval against these specifically to prevent regression.

- **Common failure modes:**
  - **Stale index** — a doc gets edited but the embedding/inverted-index entries don't refresh. The user searches for the current product version and gets the deprecated docs. Mitigation: `embedding_stale_at` timestamp per doc, batch re-index pass nightly + on-edit synchronous trigger for hot docs.
  - **Cold queries** — queries the system has never seen have no click history, so the learned ranker has no signal. Mitigation: fallback to BM25-only ranking for queries below a frequency threshold; warm the model on synthetic queries generated from the corpus.
  - **Position bias in training data** — the ranker learns "position 1 is good" because users click position 1 more, not because position 1 is more relevant. Mitigation: inverse propensity scoring during training, or randomized result-position experiments to collect debiased data.
  - **Embedding drift** — the embedding model is updated but the index isn't rebuilt; the query embeddings are in one space, the doc embeddings in another. Mitigation: pin the embedding model version per index; treat model upgrades as full re-index migrations.

- **Applies to this codebase:** **No.** reincodes is a Next.js static-export DSA visualizer + portfolio site. There is no search surface anywhere in the codebase. The `src/app/` routes are hand-coded algorithm visualizers and home-page content; navigation is link-based, not search-driven. There is no corpus of documents to index, no user queries to log, no ranking decisions to make. Adding a search ranking system would mean building a corpus first — and the project's role per the curriculum is *visualizer host*, not *search application*. The system-design template lives in this file because every AI engineering study guide includes it (per the spec, "all templates appear in every AI Engineering study guide — even when the current codebase doesn't exemplify them"), but the verdict is honest.

- **How to make it apply:** the thought experiment, not a buildable extension. If reincodes ever shipped a "search across all visualizers" surface — type `"dijkstra"` and get back the shortest-path page, type `"binary tree traversal"` and get back the BST page — the architecture would be: chunk the `conceptsData.tsx` entries + each page's prose, embed them once at build time, ship the precomputed JSON to `public/search/index.json`, run cosine retrieval in-browser. That's a tiny BM25 + dense system with no learned ranker (the click logs don't exist on a static site without analytics, and adding analytics to reincodes is explicitly out of scope per `.aipe/project/context.md`). The full architecture above is overkill for the ~25-page corpus reincodes would search; a real implementation would be a 100-line in-browser script, which is precisely why the template doesn't fit. The interview move when this question comes up: "I haven't built a search ranking system in reincodes, but here's how I'd build the loopd journal-search version" — and then walk the diagram with loopd's RAG retrieval as the retrieval layer.
