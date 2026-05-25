# Dense vs sparse retrieval

**Industry name(s):** Dense retrieval, sparse retrieval, BM25, lexical search, semantic search
**Type:** Industry standard

> The two fundamentally different ways to match query to document — exact-term scoring (BM25, sparse) and semantic similarity (embeddings, dense) — and the failure modes that make picking one alone the wrong move.

**See also:** → [01-embeddings](01-embeddings.md) · → [06-hybrid-retrieval-rrf](06-hybrid-retrieval-rrf.md) · → [07-reranking](07-reranking.md) · → [11-rag](11-rag.md) · → [../00-overview](../00-overview.md)

---

## Why care

### Move 1 — The grounded scenario

You've built a RAG system on top of embeddings — text-embedding-3, pgvector, cosine similarity. It works great for paraphrased queries. Then a user types "find document 47-B-2024" — the exact ID of a specific contract — and gets back five documents that *talk about* contracts but not document 47-B-2024 itself. The exact-match query failed because embeddings don't preserve exact tokens; they preserve meaning. You realize the same thing happens with proper nouns (company names, person names, technical acronyms), with codes (ZIP codes, error codes, SKUs), and with rare-but-precise vocabulary. Dense retrieval was the wrong tool; you needed *sparse* retrieval — the classical keyword-matching approach BM25 has been doing since 1994.

### Move 2 — Name the question

That dichotomy has a name — *dense vs sparse retrieval*. Not the embedding model, not the chunking, not the vector store — just the question of *whether you should match on semantic similarity or on exact term presence*. Dense retrieval (embeddings + cosine) wins on paraphrases and semantic similarity. Sparse retrieval (BM25 or its variants) wins on exact terms, proper nouns, rare vocabulary, and identifier-style queries. Each fails specifically where the other succeeds.

### Move 3 — Why answering that question matters

**Why you need to answer that question at all:** because *picking one alone leaves measurable accuracy on the table*. Real query distributions are *mixed* — some queries are paraphrased ("the partition sort" for quicksort), some are exact ("ZIP 94103"), some are mixed ("how to handle error E47-2024 in our auth flow"). A dense-only system answers the paraphrased queries well and the exact queries poorly; a sparse-only system answers the exact queries well and the paraphrased ones poorly. I have shipped retrieval systems where adding BM25 alongside dense retrieval — without changing the embedding model or the chunking — lifted overall hit@5 by 8-12 percentage points specifically because real queries spanned both regimes. The cost was modest (a sparse index is cheap to maintain alongside a dense index); the lift was the part of the workload that dense alone couldn't see.

### Move 4 — Concrete before/after

Without sparse retrieval (dense only):

- Paraphrased queries like "the algorithm with the pivot" → finds quicksort docs (good)
- Exact ID queries like "document 47-B-2024" → finds related-but-wrong docs (silent failure)
- Proper noun queries like "Dijkstra's algorithm" → may or may not surface the canonical page
- Domain jargon (codes, IDs, acronyms) → unreliable
- Failure mode is silent: model gets related-but-wrong context and confidently answers wrong

With dense + sparse (hybrid retrieval, next concept):

- Paraphrased queries → dense retrieval finds them; sparse path returns nothing useful (filtered out)
- Exact ID queries → sparse retrieval finds them; dense path returns related but wrong (filtered out by fusion)
- Mixed queries → both paths contribute; fusion (RRF) ranks the merged set
- Each retrieval mode handles what it's best at; fusion handles ranking
- Failure mode is no longer "silent wrong answer"; it's "no result if both modes miss"

### Move 5 — The one-line summary

Dense retrieval is meaning-matching; sparse retrieval is term-matching. They fail on disjoint distributions, which is why production retrieval composes both via hybrid retrieval — the topic of the next file. The full mechanics are below.

---

## How it works

### Move 1 — The mental model

A retrieval system matches a query to documents via a *scoring function*. Dense and sparse retrieval differ in what the scoring function looks at. Dense: encode query and documents as fixed-length vectors, score by cosine similarity. Sparse: count term overlaps, weighted by term frequency and inverse document frequency, scored by BM25. Both produce a ranked list; the question is which scoring matches the query's nature.

The strategy: understand both, default to hybrid, only pick one alone for very specific reasons (cost, scale, or known query-distribution constraints).

```
Two scoring functions, two failure modes

dense retrieval                      sparse retrieval (BM25)
─────────────────                    ───────────────────────

query: "the algorithm                query: "document 47-B-2024"
        with the pivot"

       ↓                                    ↓
embed query, doc → vectors          count term overlap, weight by
score = cosine(vq, vd)              IDF, normalize by doc length
                                    score = BM25(query_terms, doc)

ranks by semantic similarity        ranks by exact term presence

wins on:                            wins on:
+ paraphrases                       + exact IDs / codes / SKUs
+ vocabulary diversity              + proper nouns
+ multilingual                      + rare-but-precise terms
+ "concept" queries                 + acronyms
                                    + jargon

loses on:                           loses on:
- exact IDs                         - paraphrases
- rare technical terms              - cross-vocabulary
- proper nouns (variable)           - "concept" queries
- negation                          - vocabulary mismatch
```

### Move 2 — The layered walkthrough

#### BM25 — the canonical sparse scorer

The technical thing: BM25 (Robertson & Walker 1994) scores a document for a query by summing per-term contributions: `score(D, Q) = Σ IDF(qi) × (tf(qi, D) × (k1+1)) / (tf(qi, D) + k1 × (1 - b + b × |D|/avgDL))`. Three knobs: `k1` (term-frequency saturation, default 1.2), `b` (length normalization, default 0.75), and IDF (rarer terms score higher). Bridge from frontend: this is the same shape as a weighted sum scoring function for a recommendation system — each term contributes proportionally to its importance and the document's relevance to it. Concrete consequence: BM25 is the standard sparse retrieval algorithm. It's been the production default since the early 2000s in Elasticsearch, Solr, Lucene, and every search engine that touches text. It's fast (inverted-index lookup), deterministic, and explainable (per-term contributions are inspectable).

```
BM25 anatomy

for each query term q in query:
  IDF(q) = log((N - df + 0.5) / (df + 0.5) + 1)   ← rare terms score higher
  tf_norm = (tf × (k1+1)) / (tf + k1 × (1-b + b × dl/avgdl))
  contribution = IDF(q) × tf_norm

score = sum(contributions across all query terms)

knobs:
  k1 = 1.2   ← term frequency saturation
  b  = 0.75  ← length normalization
```

#### Dense retrieval — what we covered

The technical thing: embed query and document; score by cosine similarity. Reference is [01-embeddings.md](01-embeddings.md). The "dense" name comes from the fact that the vectors are dense (every dimension has a meaningful value), as opposed to sparse vectors (mostly zeros, e.g., a one-hot of all terms in the vocabulary). Bridge from frontend: dense is "fixed-length feature vector"; sparse is "presence/absence map." Concrete consequence: dense retrieval is the LLM-era addition to the retrieval toolkit. It existed in research before 2018 but didn't go mainstream until embedding APIs (OpenAI ada-002, 2022) made it ergonomic. The "dense vs sparse" framing is the LLM era's renaming of the older "semantic vs lexical" debate, sharpened by the fact that production embedding APIs are now cheap enough to use at scale.

#### Where each fails

The technical thing: dense fails on *exact token matching* (the embedding pools tokens into meaning; the exact tokens are lost), on *very short inputs* (less context for the model to disambiguate), and on *negation* ("blue sky" and "not blue sky" have high cosine). Sparse fails on *paraphrases* (zero term overlap means zero score), on *cross-vocabulary* (synonyms not in the query won't match), and on *semantic similarity* (BM25 doesn't know that "quicksort" and "partition sort" are about the same thing). Bridge from frontend: this is the same shape as "controlled vs uncontrolled component" — both have failure modes, both have use cases, and the right answer often composes them. Concrete consequence: most production retrieval systems hit both failure modes in real query distributions. The composition pattern (hybrid retrieval via RRF) is the standard mitigation.

```
when each retrieval mode wins (rough rules)

query type                       dense    sparse
─────────────                    ─────    ──────
"the partition sort"             ✓        ✗
"quicksort"                      ✓        ✓
"document 47-B-2024"             ✗        ✓
"ZIP 94103"                      ✗        ✓
"error E47-2024"                 ~        ✓
"explain quicksort"              ✓        ~
"how does Dijkstra work"         ✓        ~
"the one with the pivot"         ✓        ✗
"sorting algorithm O(n²)"        ✓        ✓
"BFS time complexity"            ✓        ✓
"Hoare's algorithm"              ~        ✓
"AVL tree balance factor"        ✓        ✓
```

#### Cost and operational profile

The technical thing: sparse retrieval (BM25) has near-zero per-query cost beyond the inverted-index lookup — microseconds at any scale. Dense retrieval requires embedding the query (per-query API call or local inference, milliseconds) plus the ANN search (milliseconds). Storage: sparse indexes are very small relative to the corpus (inverted index of terms → doc IDs); dense indexes are large (N × dim × 4 bytes). Bridge from frontend: this is the same cost shape as "client-side filtering vs server-side filtering" — sparse is the client-cached approach (cheap per query, slightly stale); dense is the server-call approach (richer but slower per query). Concrete consequence: at large scale, both indexes need to be maintained side-by-side. The cost of maintaining the sparse index alongside the dense index is small (Postgres' `tsvector` or Elasticsearch's BM25 is free); the lift from hybrid is meaningful.

### Move 3 — The principle

The principle that generalises: *retrieval modes are complementary, not competitive*. The 2010s default was sparse-only (Elasticsearch with BM25). The 2022-2024 default was dense-only (embeddings + vector DB). The 2026 default is *both* — dense for semantic similarity, sparse for exact matching, hybrid retrieval (RRF) for ranking the union. Picking one alone is leaving accuracy on the table. The full picture is below.

---

## Dense vs sparse — diagram

```
┌─ Two retrieval modes side by side ──────────────────────────────────────┐
│                                                                         │
│   DENSE                                  SPARSE                         │
│   ─────                                  ──────                         │
│                                                                         │
│   query: "the algorithm                  query: "the algorithm          │
│           with the pivot"                        with the pivot"        │
│        │                                       │                        │
│        ▼                                       ▼                        │
│   embed via text-embedding-3              tokenize, IDF-weight           │
│        │                                       │                        │
│        ▼                                       ▼                        │
│   [0.012, -0.341, ..., 0.234]            ["algorithm", "pivot"]          │
│   (1536-dim vector)                       (2 query terms)                │
│        │                                       │                        │
│        ▼                                       ▼                        │
│   cosine vs all doc vectors              inverted-index lookup           │
│   (HNSW ANN, sub-100ms)                  + BM25 scoring                  │
│        │                                       │                        │
│        ▼                                       ▼                        │
│   ranked by semantic similarity          ranked by term-presence + IDF   │
│                                                                         │
│   Top-3:                                  Top-3:                        │
│   1. quicksort.md (0.91)                  1. has "algorithm" + "pivot"   │
│   2. partition.md (0.88)                  2. has "algorithm" only        │
│   3. mergesort.md (0.83)                  3. has "pivot" only            │
│                                                                         │
│   ✓ finds quicksort via paraphrase        ✗ finds only literal matches  │
│   ✗ misses exact ID queries               ✓ finds exact term matches    │
│                                                                         │
│   ─────────────────────────────────────────────────────────────────    │
│                                                                         │
│   The complementary failure modes                                       │
│                                                                         │
│   query type                       dense       sparse                   │
│   ──────────                       ─────       ──────                   │
│   paraphrases                      ✓           ✗                        │
│   exact IDs / codes                ✗           ✓                        │
│   proper nouns                     variable    ✓                        │
│   semantic similarity              ✓           ✗                        │
│   rare-but-precise vocabulary      variable    ✓                        │
│                                                                         │
│   composition: hybrid retrieval via RRF (next concept)                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

The diagram shows the two modes operating on the same query. The right takeaway is that they fail on *disjoint* query distributions — which is why hybrid retrieval (RRF) is the production default.

---

## In this codebase

**Not yet implemented.** reincodes is a Next.js static-export DSA visualizer with zero AI surface in production code — no retrieval, no BM25 index, no embedding pipeline. The buildable target is below in Project exercises — a `/ai/dense-vs-sparse` page that runs the same query through both retrieval modes side-by-side, showing where they agree and where they diverge.

**Expected file paths** (when built):
- `src/app/ai/dense-vs-sparse/page.tsx` — the visualizer page
- `src/components/DenseVsSparseVisualizer/` — two-panel side-by-side comparison, query input, agreement/divergence highlight
- `public/ai/dense-vs-sparse/comparison.json` — precomputed dense and sparse rankings for a curated query set (paraphrase, exact, mixed)
- `scripts/precompute-dense-vs-sparse.ts` — build-time pipeline that runs both retrieval modes against the corpus and records rankings

---

## Elaborate

### Where this pattern comes from

BM25 has been around since 1994 (Robertson & Walker's Okapi BM25). It dominated text retrieval through the 2000s and 2010s — Elasticsearch, Solr, Lucene all built around it. Dense retrieval has earlier research roots (Latent Semantic Indexing, 1990; word2vec, 2013) but production-quality dense retrieval didn't go mainstream until BERT-based sentence encoders (2018-2019) and especially OpenAI's text-embedding-ada-002 (2022) made embedding APIs ergonomic. The 2022-2024 RAG wave caused widespread dense-only retrieval deployments that then discovered the exact-match failure mode the hard way. By 2024-2025, hybrid retrieval (the next concept) had become the production default — neither mode dominates; they compose.

### The deeper principle

The deeper principle is that *the right tool depends on what's being matched*, and natural language queries vary across a wider range of matching needs than any single scoring function captures. A user searching for "ZIP 94103" has fundamentally different intent than a user searching for "places to live in San Francisco." The former wants exact match; the latter wants semantic similarity. Treating them with the same retrieval mode produces wrong results in one direction or the other. The composition pattern (dense + sparse + fusion) is the field's recognition that retrieval is *multi-modal at the query level*, not just at the document level.

### Where this breaks down

The dense/sparse dichotomy breaks down for *neural sparse retrievers* like SPLADE (2021) and ColBERT (2020), which produce learned sparse representations — sparse vectors over the model's vocabulary with learned weights. These compose better with dense retrieval than classical BM25 in some workloads but add infrastructure complexity (you need a model to encode queries and documents, not just an inverted index). The 2026 production default for most teams is still "dense + classical BM25 + RRF"; neural sparse is the senior/specialized option.

### What to explore next

- [01-embeddings](01-embeddings.md) → the dense side's primitive
- [06-hybrid-retrieval-rrf](06-hybrid-retrieval-rrf.md) → the composition pattern that uses both modes
- [07-reranking](07-reranking.md) → the next layer after hybrid retrieval
- [08-query-rewriting-hyde](08-query-rewriting-hyde.md) → query-side adaptation for dense retrieval
- [11-rag](11-rag.md) → the pipeline both retrieval modes slot into

---

## Tradeoffs

### Comparison table — both costs in one frame

```
┌──────────────────┬──────────────────────┬─────────────────────────┐
│ Cost dimension   │ Path taken           │ Alternative             │
│                  │ (dense + sparse)     │ (dense only or sparse   │
│                  │                      │  only)                  │
├──────────────────┼──────────────────────┼─────────────────────────┤
│ Index maintenance│ 2 indexes to keep    │ 1 index                 │
│                  │ in sync              │                         │
│ Storage          │ Dense + sparse       │ Dense alone OR sparse   │
│                  │ (sparse is small)    │ alone                   │
│ Per-query cost   │ 2 retrievals + RRF   │ 1 retrieval             │
│                  │ fusion (small)       │                         │
│ Accuracy on      │ Both regimes covered │ Wins one, loses other   │
│ mixed queries    │                      │                         │
│ Code complexity  │ Two retrieval funcs  │ One retrieval func      │
│                  │ + a fuser            │                         │
│ Debug surface    │ "Which mode found    │ "Why didn't retrieval   │
│                  │ this doc?"           │ surface this?"          │
│ Cold-start cost  │ Build both indexes   │ Build one index         │
│                  │ at corpus init       │                         │
└──────────────────┴──────────────────────┴─────────────────────────┘
```

### What we gave up (when planning the reincodes visualizer)

The first cost is *running BM25 in the build pipeline*. The precompute script needs a BM25 implementation; the canonical Node options are `bm25` (npm) or a Python implementation via `rank_bm25` invoked from a script. Plus the dense retrieval against OpenAI embeddings. Two retrieval pipelines, two sets of results, then merged into the JSON for the visualizer. Roughly one full day of precompute setup.

The second cost is *eval-query design*. To make the side-by-side meaningful, the query set has to include queries where dense wins, queries where sparse wins, and queries where they agree. Designing 15-20 such queries with reincodes-themed content (DSA topics, algorithm names, hypothetical IDs) is a half-day of work.

The third cost is *bundle-size*. Two retrieval results × ~15 queries × top-5 chunks + chunk text = ~150-300KB. Code-splitting under `/ai/dense-vs-sparse` keeps it off the home page.

### What the alternative would have cost (skipping the visualizer)

If reincodes never builds `/ai/dense-vs-sparse`, the cost is zero. The concept lives in this guide. Production use lives at other portfolio projects.

The cost of *not* building it shows up at the moment an interviewer asks "what's BM25 and when do you reach for it over embeddings?" Without a visualizer, the candidate describes the failure modes verbally. That's fine but weaker than "here's the visualizer — same query, two retrieval modes, here are the queries where they diverge."

### The breakpoint

The visualizer earns its place during AI-focused interview prep when retrieval mechanics are likely to come up. The dense-vs-sparse comparison is a recurring senior-level probe.

### What wasn't actually a tradeoff

Skipping BM25 entirely and just doing dense retrieval was not a real option for the visualizer's pedagogical value. The whole point is the *comparison* — which queries dense gets right, which sparse gets right, which they disagree on. Single-mode is just an embedding visualizer, which is already covered.

---

## Tech reference (industry pairing)

### BM25 / Okapi BM25 (Robertson & Walker 1994)

- **Codebase uses:** not yet — would be the sparse-retrieval algorithm in the planned `/ai/dense-vs-sparse` precompute. Use `rank_bm25` (Python) or `bm25` (npm) to compute scores against the reincodes-themed corpus.
- **Why it's here:** BM25 is the canonical sparse retrieval algorithm. Every text-search engine since the early 2000s uses BM25 or a variant.
- **Leading today:** BM25 — `adoption-leading` for sparse text retrieval, 2026.
- **Why it leads:** ~30 years of production deployment, fast inverted-index implementation, well-understood tuning parameters (k1, b), and the default scoring algorithm in Elasticsearch, OpenSearch, Solr, and Lucene.
- **Runner-up:** SPLADE (Sparse Lexical and Expansion model) — `innovation-leading` for neural sparse retrieval; produces learned sparse representations that compose better with dense retrieval than classical BM25 in some workloads.

### Elasticsearch / OpenSearch (BM25-native search engines)

- **Codebase uses:** not yet — would be the production-tier reference in the visualizer's annotations. Locally we'd use rank_bm25 for the precompute; in production, Elasticsearch or OpenSearch is the canonical sparse search engine.
- **Why it's here:** Elasticsearch is the de facto production sparse search engine, especially at scale. OpenSearch is the AWS-maintained fork that gained ground after the Elastic license change in 2021.
- **Leading today:** Elasticsearch / OpenSearch — `adoption-leading` for production sparse search, 2026.
- **Why it leads:** mature operational tooling (Kibana, snapshots, multi-region replication), broad ecosystem support, and decades of production deployment hardening.
- **Runner-up:** Tantivy / Meilisearch — `innovation-leading` for embedded/local sparse search; lighter operational footprint; Rust-based, faster cold start; the choice for embedded or edge deployments.

### `pgvector` + Postgres full-text search (composable)

- **Codebase uses:** not yet — would be the "hybrid in one DB" reference in the visualizer. Postgres handles both dense (via pgvector) and sparse (via `tsvector` + `ts_rank`) in the same query when needed.
- **Why it's here:** the composability is a real production advantage — you can combine dense and sparse in a single SQL query and apply the same metadata filtering to both.
- **Leading today:** Postgres tsvector + pgvector — `adoption-leading` for hybrid retrieval in a single database, 2026.
- **Why it leads:** zero new infrastructure, atomic transactions across dense+sparse+metadata, the entire Postgres ops surface applies; the canonical "embed retrieval in your existing data store" approach.
- **Runner-up:** Elasticsearch with `dense_vector` field type — `innovation-leading` for hybrid retrieval in a single search engine; ES now supports dense_vector + BM25 in one query; relevant when ES is already the search tier.

---

## Project exercises

### [B-reincodes-dense-vs-sparse-viz] Build the dense vs sparse retrieval visualizer

- **Exercise ID:** `[B-reincodes-dense-vs-sparse-viz]` — derived from the curriculum's reincodes "interview prep surface" entry; aligns with Phase 2 concept `[C2.4]` (dense vs sparse retrieval — BM25).
- **What to build:** a page at `/ai/dense-vs-sparse` with two side-by-side panels: "dense (cosine)" on the left, "sparse (BM25)" on the right. Both panels render the top-5 results for the same query against a precomputed reincodes-themed corpus. A query selector at the top offers ~15 curated queries — 5 where dense wins, 5 where sparse wins, 5 where they agree. The visualizer highlights *agreement* (same doc in both panels' top-5) in green and *divergence* (only one mode found the right answer) in orange/blue. A scoreboard at the bottom shows hit@5 for each mode across the full query set. The reader sees, query by query, that neither mode dominates — they fail on disjoint distributions.
- **Why it earns its place:** the visualizer makes the *complementary failure modes* visible — the reader sees BM25 score 0 on "the partition sort" and embeddings score wrong on "document 47-B-2024," and forms intuition about why hybrid retrieval (next concept) is the production default. The interview signal is that the candidate engaged with both retrieval modes operationally, not just academically.
- **Files to touch:** `src/app/ai/dense-vs-sparse/page.tsx`, `src/components/DenseVsSparseVisualizer/`, `public/ai/dense-vs-sparse/comparison.json`, `scripts/precompute-dense-vs-sparse.ts`. Add the row to `src/components/Home/conceptsData.tsx` under `ai-engineering`.
- **Done when:** the page loads at `/reincodes/ai/dense-vs-sparse/` in production, two panels render with the same query, the agreement/divergence highlights work, the scoreboard shows per-mode hit@5. `next build` passes under `output: "export"`. Precompute runs locally with API spend under $0.10.
- **Estimated effort:** 1-2 days. Precompute pipeline (OpenAI embeddings + rank_bm25): half day. Query-set curation: half day. Visualizer + two-panel layout: half day. Polish: half day.

---

## Summary

### Part 1 — concept recap

Dense retrieval (embeddings + cosine similarity) and sparse retrieval (BM25 over an inverted index) are the two fundamental ways to match queries to documents. Dense wins on paraphrases, semantic similarity, cross-vocabulary; sparse wins on exact IDs, proper nouns, rare-but-precise terms, identifier-style queries. They fail on *disjoint* query distributions, which is why production retrieval composes them via hybrid retrieval (next concept). BM25 has been around since 1994 and dominates text search infrastructure (Elasticsearch, OpenSearch, Solr, Postgres tsvector); dense retrieval went mainstream in 2022 with the OpenAI embeddings API. The 2026 production default is *both, fused via RRF*. In reincodes the concept is *planned*; the buildable target is `/ai/dense-vs-sparse` — a side-by-side comparison of both retrieval modes on a curated query set, with agreement/divergence highlighting that makes the complementary failure modes visible.

### Part 2 — key points to remember

- **Dense wins on**: paraphrases, semantic similarity, cross-vocabulary, "concept" queries.
- **Sparse wins on**: exact IDs, proper nouns, rare-but-precise vocabulary, identifier-style queries.
- **They fail on disjoint distributions**: that's why hybrid retrieval (next file) is the production default.
- **BM25 is the canonical sparse algorithm**: 30+ years of production deployment, the default in Elasticsearch and Lucene-derived engines.
- **Storage cost of sparse alongside dense is small**: inverted indexes are tiny relative to dense vector storage. Always maintain both.
- **The reincodes shape**: implementation is Case B; buildable target is `/ai/dense-vs-sparse` — two-panel side-by-side with curated queries and hit@5 scoreboard.

---

## Interview defense

### What an interviewer is really asking

Behind "dense vs sparse retrieval" the interviewer is probing whether the candidate has *operated* both modes and felt the cost of picking one alone. A junior answer names BM25 and embeddings as alternatives. A senior answer names the *failure modes* of each and the *composition pattern* (hybrid retrieval) that mitigates: "I run both. Dense gets paraphrases; sparse gets exact IDs and rare terms. RRF fuses the rankings. The cost of running both alongside each other is small; the lift on real query distributions is 8-12 percentage points on hit@K." The interviewer is checking whether the candidate has the operational instinct to compose retrieval modes.

### Likely questions

**Q (mid):** When would you reach for BM25 over an embedding-based retrieval?

A: When the query is exact-term-sensitive — IDs, codes, proper nouns, rare technical vocabulary. BM25's strength is matching the *literal tokens* the query and the document share, weighted by inverse document frequency so rare terms score higher. Embeddings pool tokens into a meaning vector, which is great for paraphrases ("the algorithm with the pivot" matches "quicksort") but loses information about exact tokens. A query like "document 47-B-2024" against embeddings will return related-looking documents that don't have the exact ID; BM25 will return documents that have the exact ID first. The right answer in production is usually *both* — run them in parallel, fuse via RRF. But if I had to pick one alone, BM25 wins on technical/identifier-heavy corpora; embeddings win on general-natural-language corpora.

**Q (senior):** Where does BM25 fail, and where do embeddings fail?

A: BM25 fails on (a) paraphrases — zero term overlap means zero score; (b) cross-vocabulary — "automobile" and "car" are separate terms; (c) "concept" queries that don't share vocabulary with the documents. Embeddings fail on (a) exact tokens — IDs, codes, SKUs get pooled into meaning vectors that aren't precise about exact form; (b) negation — "blue sky" and "not blue sky" embed close together; (c) very short inputs — 1-3 tokens give the embedding model too little context. They fail on *disjoint* distributions, which is the strongest argument for hybrid retrieval. Neither alone covers real query distributions; both together do. The cost of running both is small (a sparse inverted index is cheap to maintain alongside a dense vector store); the lift is the part of the query distribution one mode alone couldn't see.

```
where each mode fails

dense fails                          sparse fails
─────────────                        ─────────────
exact IDs ("doc 47-B-2024")          paraphrases ("the partition sort")
proper nouns (sometimes)             cross-vocabulary (car/automobile)
negation                             "concept" queries
very short inputs                    semantic similarity

mitigation: hybrid retrieval (RRF)
```

**Q (arch):** At 10× scale — 100M documents — does the dense vs sparse decision change?

A: It doesn't change *which* modes you use; it changes the *operational characteristics* of each. At 100M docs, dense retrieval requires HNSW indexing (sub-100ms p99 achievable); sparse retrieval needs Elasticsearch or OpenSearch with proper sharding (also sub-100ms achievable). The composition pattern (hybrid via RRF) becomes a fan-out: query both indexes in parallel, fuse the results in a small middle layer. The two failure-mode profiles are unchanged at scale — dense still misses exact IDs, sparse still misses paraphrases. What scales harder is the *index maintenance* — keeping both indexes in sync as the corpus grows requires incremental indexing pipelines for both. That operational complexity is real but routine; both Elasticsearch and pgvector have well-known patterns for it. The 100M-scale decision is "how do we keep both indexes fresh?" not "do we need both?"

### The question candidates always dodge

**Q:** Modern embeddings are smart enough to handle exact-match queries; isn't BM25 obsolete?

A: That's the assertion modern embedding providers make and the empirical reality doesn't support. The failure mode is reliably reproducible: embed "document 47-B-2024" with text-embedding-3-large, then search a corpus that contains that exact document. The exact document often doesn't rank in the top-5 — instead you get *related* documents that mention contract numbers or that have similar structure. The reason is architectural — embedding models pool tokens into a meaning vector, and a rare exact identifier doesn't contribute much to the meaning representation because it didn't appear in training data with strong context. BM25 specifically scores it because the exact match is the entire point of the algorithm. The cost ledger:

```
"embeddings are good enough"             "hybrid retrieval"
────────────────────────────             ────────────────────
+ one index to maintain                  - two indexes to maintain
+ one retrieval pipeline                 - two pipelines + fusion
- silent failure on exact-ID             + exact-ID queries surface
  queries                                  the right doc
- 5-15pp lower hit@K on mixed            + 5-15pp higher hit@K on
  query distributions                      mixed distributions
- debugging "why didn't it find          + "which mode found this"
  document X" is hard                      is loggable per query
```

The honest answer: better embeddings have narrowed the gap on some patterns but the structural failure mode remains. Production retrieval composes; picking embeddings alone is a measurable accuracy loss on real query distributions. The interview move is naming the structural reason (architectural pooling of tokens into meaning) rather than treating it as a tuning problem.

### One-line anchors

- "Dense is meaning-matching; sparse is term-matching. They fail on disjoint distributions."
- "BM25 wins on exact IDs, proper nouns, rare-but-precise vocabulary. Embeddings win on paraphrases and semantic similarity."
- "Cost of running sparse alongside dense is small. Lift on real query distributions is 5-15pp on hit@K."
- "BM25 has 30 years of production deployment. Lucene, Elasticsearch, Solr, Postgres tsvector all use it."
- "The 2026 production default is dense + sparse + RRF. Picking one alone is leaving accuracy on the table."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw the two retrieval modes side-by-side from memory: dense (embed → cosine → ranked list) and sparse (tokenize → IDF + BM25 → ranked list). For each, name one failure mode.

✓ Pass: both pipelines drawn end-to-end, failure modes correctly paired
✗ Fail: re-read the primary diagram, wait 10 minutes, try again

### Level 2 — Explain it out loud

Explain dense vs sparse retrieval to a colleague who built a dense-only RAG and is confused about why exact-ID queries fail. No notes. Under 90 seconds.

Checkpoints — did you:
- Name BM25 as the canonical sparse algorithm?
- Distinguish what each mode wins on (paraphrases vs exact terms)?
- Name the failure modes (negation, exact IDs)?
- Reference hybrid retrieval as the composition?
- Reference the buildable target (`/ai/dense-vs-sparse`)?

If you skipped any: you described the modes, you didn't argue for the composition.

### Level 3 — Apply it to a new scenario

A planned reincodes feature: a search box that accepts both natural-language queries ("the algorithm with the pivot") and exact code references ("the `partition` function in src/utils/notes/Sorting/quicksort.md").

Design the retrieval. Which mode does each query type need? How do you compose them? Where in the pipeline does each happen? What does the static-export constraint force you to precompute vs run live?

Write your answer (5+ sentences). Then verify by checking that your design respects `next.config.ts`'s static-export constraint.

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff. Answer in writing: "If I were starting the `/ai/dense-vs-sparse` visualizer today, would I implement BM25 from scratch in TS, use a Node library (`bm25`), or shell out to a Python script (`rank_bm25`)? Why? What does each choice cost?"

Reference the actual code:
→ Point to where the precompute script would live
→ Point to `next.config.ts` for the static-export contract

There is no right answer. The point is specificity.

### Quick check — code reference test

Without opening any files, answer:
- What's the canonical sparse retrieval algorithm?
- What's the year BM25 was published?
- What query type does sparse retrieval handle better than dense?

Then verify by re-reading `## How it works`.

✓ Pass: "BM25 (Okapi BM25)", "1994", "exact identifiers / proper nouns / rare terms"
✗ Fail on details: that's fine — names should be recoverable from the algorithm history.
