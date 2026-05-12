# Reranking with a cross-encoder

**Industry name(s):** Cross-encoder reranking, two-stage retrieval, retrieve-then-rerank
**Type:** Industry standard

> After fast retrieval pulls top-k candidates, a slower but more accurate model rescores each (query, candidate) pair to produce the final ranking. Not yet built in this codebase — slated as part of the RAG-pipeline visualization.

**See also:** → [02-embeddings-geometrically](./02-embeddings-geometrically.md) · → [03-dense-vs-sparse-retrieval](./03-dense-vs-sparse-retrieval.md)

---

## Why care

Your hybrid retrieval returns 20 candidates. The top-1 is "doctor appointment scheduling" but the actual answer is at position 7: "How to reschedule a doctor visit." Pure retrieval (dense + BM25) is fast but not always *right* at top-1. A reranker rescores the 20 candidates with a slower-but-more-accurate model — typically pushing the actual answer into top-3.

This sits in **retrieval and RAG** — the production answer to "retrieval gives me close, not perfect." Same pattern: Google's two-stage ranking (recall first, precision later), recommender systems' coarse-then-fine, Spotify's playlist generation.

---

## How it works

Picture casting a wide net to catch many fish (retrieval), then dumping the catch on the deck and picking the best individually (reranking). The first step doesn't need to be perfect — just inclusive. The second step is slow but examines each candidate carefully.

### Bi-encoder vs cross-encoder

The model that produces embeddings is a *bi-encoder*: it encodes query and document independently into vectors, then compares vectors. Fast (pre-compute doc embeddings) but loses interaction signal — the model never sees query and doc *together*.

A *cross-encoder* takes (query, document) as a *pair* and outputs a relevance score. It's slow (must run per pair) but lets the model attend to both texts at once — picking up nuances like "this doc mentions doctor visit but only to say *don't* do X."

```
Bi-encoder (fast, less accurate):
    query → embed → vec_q
    doc   → embed → vec_d   (pre-computed, stored)
    score = cosine(vec_q, vec_d)

Cross-encoder (slow, more accurate):
    score = model("[query] doctor visit [SEP] [doc] How to ...")
    → must run model per (query, doc) pair
```

### Two-stage retrieval

```
1. Retrieve top-100 cheap:
   query → bi-encoder + BM25 + RRF → top-100 candidates
   (~50ms at 1M-doc corpus)

2. Rerank top-100 with cross-encoder:
   For each of 100 candidates:
     score = cross_encoder(query, candidate)
   Sort by score, take top-10.
   (~500ms — 100 model invocations)
```

The asymmetry: retrieval over 1M docs is fast; reranking 100 docs is slow. By restricting reranking to a small candidate set, you get cross-encoder quality at retrieval-stage latency budgets.

### The principle

This is what people mean by *funnel architecture*. Each stage trades off recall and precision differently — early stages prioritise recall (don't miss), late stages prioritise precision (return the best). Same pattern in display advertising bidding, music recommendation, search relevance.

The full picture is below.

---

## Reranking — diagram

```
Stage 1: Retrieval (recall-oriented)

  query
    │
    ▼
 ┌──────────────────────────────┐
 │  Dense + BM25 + RRF          │
 │  fast: 50ms over 1M docs     │
 └──────────────────────────────┘
    │
    ▼
 top-100 candidates    ← coarse list (high recall, mixed precision)


Stage 2: Reranking (precision-oriented)

    │
    ▼
 ┌──────────────────────────────┐
 │  Cross-encoder rerank        │
 │  for each (q, c) pair:       │
 │    score = model(q + c)      │
 │  slow: 500ms / 100 docs      │
 └──────────────────────────────┘
    │
    ▼
 top-10 final  ← precise list (best answers first)
```

---

## In this codebase

**Not yet implemented.** Curriculum's `[C2.6]` "Reranking with cross-encoder" is **Case B** for reincodes — included in the RAG pipeline visualizer (curriculum line 524).

---

## Elaborate

### Where this pattern comes from
Cross-encoder reranking emerged from BERT-era IR research (Nogueira & Cho, 2019). The two-stage retrieve-and-rerank shape is older — Google's original PageRank-then-relevance pipeline used it. Modern revival driven by RAG quality issues.

### The deeper principle
*Spend compute where it earns most.* Reranking pays cross-encoder cost on 100 docs to gain top-10 quality — far cheaper than running cross-encoder on the full corpus.

### Where this breaks down
- Latency-sensitive: 500ms extra is unacceptable in some UX.
- Cost: reranker model invocations add up.
- Stage-1 must have high recall — if the answer isn't in top-100, rerank can't recover it.

### What to explore next
- Late interaction models (ColBERT) — middle ground between bi and cross.
- LLM-as-reranker for very small top-k.

---

## Tradeoffs

### Comparison table

```
┌──────────────────┬──────────────────────────┬──────────────────────────┐
│ Cost dimension   │ Bi-encoder only          │ Bi + cross-encoder rerank │
├──────────────────┼──────────────────────────┼──────────────────────────┤
│ Latency          │ ~50ms                    │ ~50ms + ~500ms = ~550ms  │
│ Cost             │ One embedding/query      │ + N model invocations    │
│ Top-1 accuracy   │ Baseline                 │ +5–15 percentage points  │
│ Recall@10        │ ~85% typical             │ Slightly better          │
│ Hardware         │ Embedding API + ANN      │ + GPU/CPU for reranker   │
└──────────────────┴──────────────────────────┴──────────────────────────┘
```

### What we gave up

Latency budget. 500ms is real time the user feels. For interactive UX (autocomplete), you skip reranking. For high-stakes QA (legal, medical), you pay it.

### What the alternative would have cost

No rerank: top-1 from coarse retrieval is "good enough" but the user often has to scroll. With rerank: the top answer is more likely correct.

### The breakpoint

Worth it when (a) top-1 accuracy matters, (b) latency budget permits ~500ms, (c) corpus is heterogeneous enough that retrieval alone misses nuance.

---

## Tech reference (industry pairing)

### Cross-encoder models

- **Codebase would use:** Cohere's `rerank-english-v3.0` API (managed) or `BAAI/bge-reranker-v2` (self-host).
- **Leading today:** Cohere `rerank-3` — `adoption-leading` for managed reranking, 2026.
- **Why it leads:** higher accuracy than open BGE on most benchmarks; ~$0.001 / 100 docs.
- **Runner-up:** BGE reranker (BAAI, open weights) — `innovation-leading` for self-hosted; competitive quality, free at inference.

---

## Project exercises

### Reranking demonstration (within the RAG-pipeline visualizer)

- **Exercise ID:** *[reincodes-viz: RAG pipeline visualizer]* — `aieng-curriculum.md:524`, exercises C2.1 + C2.4 + **C2.6**.
- **What to build:** Within the RAG pipeline page (see [02](./02-embeddings-geometrically.md) and [03](./03-dense-vs-sparse-retrieval.md) for context), add a third pane showing the reranker's effect. After RRF produces top-5, run Cohere `rerank` over them and show the reordered list with the score delta. Highlight any answer that moved from position 4 → 1 to demonstrate the value.
- **Why it earns its place:** the rerank-effect is invisible unless you can A/B the same query without it. The viz must show "stage-1 said X was top; stage-2 said Y was actually top — and here's why" with the actual model outputs.
- **Files to touch:** `src/app/concepts/ai-engineering/rag-pipeline/page.tsx` (extending the previous exercise), Cohere API key env var, or fall back to a heuristic reranker (e.g., longest-match overlap) if no API key.
- **Done when:** Demo queries show at least one case where reranking pulls a top-3 result to top-1 with a visible "rerank delta" badge. Latency shown for each stage.
- **Estimated effort:** `1–2 days` (in addition to the base RAG-pipeline build).

---

## Summary

### Part 1 — concept recap

Reranking is the second stage of two-stage retrieval: fast retrieval pulls top-k candidates, a slower cross-encoder model rescores each (query, candidate) pair to produce a more precise final ranking. reincodes doesn't have it yet; the curriculum's RAG pipeline visualizer is where it lands. The constraint is "fast retrieval isn't precise enough at top-1 for production QA," and the cost is ~500ms latency + per-invocation reranker cost.

### Part 2 — key points to remember

- Bi-encoder: fast, encodes query and doc independently.
- Cross-encoder: slow, encodes (query, doc) together; sees the interaction.
- Retrieve top-100 cheaply, rerank top-100 slowly.
- Cross-encoder rerank adds ~500ms latency; production RAG often pays it.
- Cohere `rerank-3` and BGE rerankers are the two production choices.

---

## Interview defense

### Likely questions

**Q [mid]: Why not just use the cross-encoder for everything?**

A: It doesn't scale. Cross-encoder requires running the model on every (query, document) pair. Over 1M docs that's 1M model invocations per query — minutes of compute. Bi-encoder pre-computes doc embeddings once; query-time is a fast vector comparison. The two-stage funnel uses cheap retrieval to narrow to top-100, then pays cross-encoder cost on that small set.

**Q [senior]: When would you skip the reranker?**

A: Three cases. (1) Latency-sensitive: autocomplete or live-typing UX can't afford 500ms. (2) Corpus where retrieval is already very precise (homogeneous, well-tagged). (3) Cost-sensitive: reranker invocations add up at high QPS. The decision is empirical — run retrieve-only and retrieve-then-rerank on the eval set; if top-1 accuracy is within tolerance, skip the rerank.

**Q [arch]: At 100 QPS, what's the cost of reranking with Cohere?**

A: 100 QPS × ~$0.001 / query (Cohere rerank-3) × 86400 sec/day = ~$8640/day = ~$260k/year. Real money. For an interactive search product, you'd self-host BGE or train a smaller distilled model. For occasional high-stakes queries (legal review), API pricing is fine.

### The question candidates always dodge

**Q: Retrieval and reranking sound like a hack. Why doesn't one model handle both?**

A: Because the workload is asymmetric. Retrieval needs O(log n) access over the full corpus; reranking needs deep inspection of a small set. A single model would either be (a) too slow over the full corpus, or (b) not deep enough at top-k. The "hack" is the unavoidable shape of the cost curve. Production teams sometimes try late-interaction models (ColBERT) — fast retrieval *and* deeper-than-bi-encoder inspection — but the cross-encoder rerank is still the top-precision step.

```
┌── Bi-encoder ─────────────┐    ┌── Cross-encoder ──────────┐
│  Pre-compute doc vecs     │    │  Per-pair model call      │
│  Query-time: cosine       │    │  Query-time: model fwd    │
│  ~10ms / 1M docs (ANN)    │    │  ~5ms / pair × 100 = 500ms │
│  Lower top-1 accuracy     │    │  Higher top-1 accuracy    │
│  Stage 1                  │    │  Stage 2                  │
└───────────────────────────┘    └───────────────────────────┘
```

### One-line anchors

- "Retrieve cheaply; rerank carefully."
- "Bi-encoder: independent; cross-encoder: joint attention."
- "Reranking adds ~500ms; precision tradeoff."
- "Don't skip if top-1 accuracy matters."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Draw the two-stage pipeline: retrieve → top-100 → rerank → top-10.

### Level 2 — Explain it out loud
"Why does the cross-encoder need to see query and document together?"

### Level 3 — Apply it to a new scenario
"At 1B docs and 1000 QPS, design the retrieval pipeline including rerank."

### Level 4 — Defend the decision you'd change
"Would you self-host a reranker or use Cohere's API at 100 QPS?"

### Quick check
- Currently implemented? → No, Case B.
- Cross-encoder vs bi-encoder? → joint vs independent encoding.
- Typical added latency? → ~500ms for top-100 rerank.

✓ Pass: all three.
