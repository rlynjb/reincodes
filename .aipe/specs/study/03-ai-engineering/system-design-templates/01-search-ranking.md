# Search ranking system design

**Industry name(s):** Information retrieval system, learned ranking, IK Module: Search ranking
**Type:** Industry standard

> The canonical interview prompt for retrieval + ranking systems — applied here as a thought experiment for what reincodes would look like if it shipped semantic search over the planned AI concept content.

**See also:** → [../03-dense-vs-sparse-retrieval](../03-dense-vs-sparse-retrieval.md) · → [../04-reranking-cross-encoder](../04-reranking-cross-encoder.md)

---

- **The prompt:** Design a search ranking system that takes a user query and returns the top-k most relevant items from a corpus.

- **Standard architecture:**

  ```
  ┌─ Client query ───────────────────────────────────────────────┐
  │  "doctor visit"                                              │
  └──────────────────────────────────────────────────────────────┘
              │
              ▼
  ┌─ Stage 1: Retrieval (recall-first) ──────────────────────────┐
  │  Query rewrite → tokenize → ┌─ Dense (embed → ANN) ─┐        │
  │                              ├─ Sparse (BM25 invert)─┤        │
  │                              └─ RRF combine ─────────┘        │
  │                                       │                       │
  │                                       ▼                       │
  │                                  top-100 candidates           │
  └──────────────────────────────────────────────────────────────┘
              │
              ▼
  ┌─ Stage 2: Reranking (precision-first) ───────────────────────┐
  │  Cross-encoder over (query, candidate) pairs → top-10        │
  └──────────────────────────────────────────────────────────────┘
              │
              ▼
  ┌─ Stage 3: Serve + log ──────────────────────────────────────┐
  │  Return top-k to user → log impressions + clicks → eval     │
  └──────────────────────────────────────────────────────────────┘
  ```

- **Data model:**
  - `documents{id, text, metadata, created_at}` — the corpus.
  - `dense_index{id, vector[1536], doc_id}` — embeddings; ANN index (HNSW).
  - `sparse_index` (inverted): `term → [posting list of doc_id + tf]`; IDF table.
  - `impressions{query_id, doc_id, position, shown_at}` — logging.
  - `clicks{query_id, doc_id, position, clicked_at, dwell_ms}` — engagement signal.

- **Key components:**
  - *Query rewriter*: optional LLM step that expands "doctor visit" → "doctor appointment OR physician visit". Adds latency; improves recall on under-specified queries.
  - *Dense retrieval*: embed query, ANN over `dense_index`. HNSW gives ~10ms top-100 at 1M docs. Choice of embedding model (text-embedding-3-small for cost, -large for quality).
  - *Sparse retrieval*: BM25 over `sparse_index`. Tantivy/Lucene/Elasticsearch. ~10ms at 1M docs.
  - *RRF combiner*: parameter-free fusion. `score(d) = Σ 1/(60 + rank_in_method(d))`.
  - *Cross-encoder reranker*: Cohere `rerank-3` or BGE reranker over top-100 (~500ms).
  - *Logger*: every impression and click; foundation of eval.

- **Scale concerns:**
  - At ~100k docs / 100 QPS: brute-force cosine + BM25 fine. Single host.
  - At ~10M docs / 1k QPS: ANN (HNSW) mandatory; sparse index sharded.
  - At ~1B docs / 100k QPS: distributed: embeddings sharded by ID, BM25 sharded by term, RRF + rerank on aggregator node. Latency dominated by network not retrieval.

- **Eval framing:**
  - Offline: hit@k, MRR, NDCG against a labelled golden set (~200 queries with relevance judgments).
  - Online: CTR@1, CTR@3, dwell-time-after-click, session length.
  - Caveats: no-click is not a negative label (users sometimes find what they want from snippets); position bias requires impression-weighted analysis.

- **Common failure modes:**
  - Stale embeddings (model upgraded, corpus not re-embedded). Mitigation: track `embedding_model_version` per doc; trigger re-embed on mismatch.
  - Cold-start (new docs not yet embedded). Mitigation: embed on commit, not in batch; mark `embedding_stale_at` when text changes.
  - Position bias dominates clicks. Mitigation: inverse-propensity weighting in offline eval; randomised position shuffle in eval traffic.
  - Adversarial queries (keyword stuffing in docs to game BM25). Mitigation: spam filters; trust signals (auth source, recency).

- **Applies to this codebase:** `no`. reincodes has no corpus to search and no retrieval surface. The featured-projects list is 4 items — not search territory. This template is a thought experiment for "what would the next-generation reincodes look like if it indexed every blog post / concept page across rlynjb's projects."

- **How to make it apply:** Two paths. (1) Add a `/search` route that indexes loopd journal entries (via the loopd RAG built in Phase 2A) and exposes the retrieval pipeline as a public demo — but this couples reincodes to loopd's database, which probably crosses the right architectural boundary. (2) Add a *visualizer-only* version: hard-code a corpus of ~50 docs (concept descriptions, project blurbs), implement client-side BM25 (`okapibm25`) + embeddings (Cohere or local model) + RRF in the browser, then ship the RAG-pipeline visualizer described in `[Cosine similarity playground]` and `[RAG pipeline visualizer]` curriculum exercises. The visualizer version is in scope; the live-search version isn't.

---

Updated: 2026-05-12 — initial version (system-design template, Applies: no, refactor path notes the RAG-pipeline visualizer as the in-scope alternative).
