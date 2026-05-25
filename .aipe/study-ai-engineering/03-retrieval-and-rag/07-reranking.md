# Reranking

**Industry name(s):** Cross-encoder reranking, two-stage retrieval, LLM rerank
**Type:** Industry standard

> Bi-encoder retrieval is fast and approximate; cross-encoder reranking is slow and accurate. Run them in sequence: bi-encoder fetches top-100 candidates cheaply, cross-encoder reranks to top-5 expensively. The pattern lifts NDCG 5-15 points at acceptable latency cost.

**See also:** → [06-hybrid-retrieval-rrf](06-hybrid-retrieval-rrf.md) · → [01-embeddings](01-embeddings.md) · → [11-rag](11-rag.md)

---

## Why care

### Move 1 — The grounded scenario

Your dense retrieval (or hybrid + RRF) returns the top-100 most-similar docs to a query. The top-5 are decent but not great — relevant in topic, sometimes misranked in actual usefulness. Users complain "the first answer wasn't the best one." You can't switch to a better embedding model without rebuilding the whole index; you can't make the bi-encoder smarter without re-training. The fix is to add a second stage that's *allowed* to be slow — rerank just the top-100 with a more expensive model.

### Move 2 — Name the question

The question is *how to combine the speed of bi-encoder retrieval with the accuracy of cross-encoder scoring*. Bi-encoders embed query and docs separately, compare via cosine — fast (O(1) per pair after pre-computation), approximate. Cross-encoders concatenate query + doc and score the pair end-to-end — slow (100x slower per pair), accurate. The two-stage pattern: bi-encoder narrows to 100; cross-encoder ranks those 100 precisely.

### Move 3 — Why answering that question matters

**Why you need to answer that question at all:** because retrieval quality dictates RAG quality. The wrong docs in the LLM's context produces wrong answers regardless of how good the LLM is. Reranking is the canonical lever for moving from "decent retrieval" to "great retrieval" without rebuilding the embedding index. The teams shipping serious RAG systems use rerank by default; the teams without it accept the ceiling that bi-encoder accuracy imposes.

### Move 4 — Concrete before/after

Without reranking:
- Bi-encoder returns top-5
- NDCG@5 on the eval set: 0.72
- User-facing: "first result was the right one" 65% of the time

With Cohere Rerank on top-100:
- Bi-encoder returns top-100; rerank to top-5
- NDCG@5: 0.84
- "First result was the right one" 81% of the time
- Cost: ~$0.001/query extra
- Latency: +200-400ms

### Move 5 — The one-line summary

Reranking is the natural extension of "ANN to narrow, then exact comparison to refine" — same pattern as image-search pipelines (perceptual hash → exact pixel diff). Mechanics below.

---

## How it works

### Move 1 — The mental model

Two stages. Stage 1 (bi-encoder, fast) finds candidates from the full corpus. Stage 2 (cross-encoder, slow) precisely ranks just the candidates. The split exploits the asymmetry: you can't run cross-encoder over 1M docs per query (too slow), but you can run it over 100 candidates (acceptable).

```
two-stage retrieval

stage 1: bi-encoder over full corpus
   query --embed--> 1M docs --cosine--> top 100
   latency: 50-100ms
   cost: ~$0 (after pre-computation)

stage 2: cross-encoder over top 100
   query + doc_i --pair-score--> 100 scores
   latency: 200-400ms (parallel or batched)
   cost: ~$0.001-0.01 per query
   
result: top 5 from re-ranked 100
```

### Move 2 — The layered walkthrough

#### Bi-encoder vs cross-encoder

The technical thing: bi-encoder embeds query and docs separately, never sees them together. Cross-encoder takes (query, doc) as a single concatenated input and outputs a relevance score. Bridge: this is the difference between hashing two files separately and comparing hashes (bi-encoder) vs diffing them byte-by-byte (cross-encoder). Concrete consequence: bi-encoder is symmetric (cosine is just math); cross-encoder is *aware of interaction* between query and doc — picks up nuances the bi-encoder couldn't see. Concrete condition where cross-encoder wins: when query meaning depends on context the bi-encoder embedded away.

#### The 100-candidate cutoff

The technical thing: retrieve top-100 from bi-encoder, rerank to top-5. The bridge: this is like SQL `LIMIT 100` before an `ORDER BY` that's expensive — narrow the candidate pool before the expensive sort. Concrete consequence: 100 is a calibration constant — large enough that the right doc is *somewhere in there* even if bi-encoder mis-ranked it; small enough that cross-encoder cost stays bounded. Concrete condition where it breaks: when the right doc isn't in the top-100 from bi-encoder; mitigation is hybrid retrieval before rerank (better candidate set).

#### Cohere Rerank vs LLM-as-judge rerank

The technical thing: dedicated rerank models (Cohere Rerank, BGE-reranker) are cross-encoders fine-tuned for relevance scoring; LLM-as-judge uses a general LLM to score relevance via rubric. The bridge: dedicated reranker = compiled function; LLM-as-judge = interpreter. Concrete consequence: dedicated reranker is faster + cheaper + more deterministic; LLM-as-judge is more flexible for unusual rubrics. Concrete condition: use dedicated for high-volume production; LLM-as-judge for low-volume or unusual scoring criteria.

### Move 3 — The principle

The principle: *layered retrieval beats single-stage*. The same pattern shows up in image search (perceptual hash → exact compare), code search (n-gram index → AST match), recommender systems (candidate generation → ranking). Reranking is the LLM-specific application of a general two-stage pipeline.

Full picture below.

---

## Reranking — diagram

```
┌─ Query ───────────────────────────────────────────────────────────┐
│  "how do I implement OAuth2 authorization code flow"              │
└───────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─ Stage 1: bi-encoder (fast, broad) ───────────────────────────────┐
│                                                                   │
│  embed query → ANN over 1M docs → top-100 candidates              │
│                                                                   │
│  candidates (ranked by cosine):                                   │
│    1. OAuth2 flows overview                                       │
│    2. JWT authentication basics                                   │
│    3. OAuth2 authorization code spec (the actual answer)          │
│    4. Token exchange patterns                                     │
│    ... 96 more                                                    │
│                                                                   │
│  latency: 50-100ms                                                │
└──────────────────────────────────│────────────────────────────────┘
                                   │
                                   ▼
┌─ Stage 2: cross-encoder (slow, precise) ──────────────────────────┐
│                                                                   │
│  for each candidate: score = cross_encoder(query, candidate)      │
│  sort by score; take top-5                                        │
│                                                                   │
│  re-ranked top-5:                                                 │
│    1. OAuth2 authorization code spec  ← promoted from rank 3      │
│    2. OAuth2 flows overview                                       │
│    3. Token exchange patterns                                     │
│    4. PKCE flow guide                                             │
│    5. Redirect URI patterns                                       │
│                                                                   │
│  latency: 200-400ms                                               │
│  cost: ~$0.001 per query (100 pairs scored)                       │
└───────────────────────────────────────────────────────────────────┘
```

The two-stage split is what makes "expensive but accurate scoring" economically viable.

---

## In this codebase

**Not yet implemented.** No retrieval, no docs. The buildable target is a `/ai/reranking` visualizer rendering top-20 retrieved before rerank + top-5 after rerank side-by-side with cosine vs cross-encoder scores; show how the ranking shifts.

**Expected file paths:**
- `src/app/ai/reranking/page.tsx`
- `src/components/RerankingVisualizer/`
- `public/ai/reranking/scenarios.json`

---

## Elaborate

### Where this pattern comes from

Cross-encoder rerank predates LLMs (BERT-rerank in 2019). The LLM-era addition is dedicated commercial rerankers (Cohere Rerank, 2023) that ship as managed services.

### The deeper principle

*Latency budget allocation is the design tool.* Stage 1 is broad/cheap; stage 2 is narrow/expensive. The same principle drives database query planning, recommender pipelines, web search.

### Where this breaks down

Reranking breaks when the bi-encoder doesn't surface the right doc in the top-100. Mitigation: hybrid retrieval (BM25 + dense) before rerank; better embedding model.

### What to explore next

- [11-rag](11-rag.md) — RAG with reranking is the production-grade variant
- [08-query-rewriting-hyde](08-query-rewriting-hyde.md) — orthogonal lever for retrieval quality

---

## Tradeoffs

### Comparison table

```
┌──────────────────┬─────────────────────┬─────────────────────────┐
│ Cost dimension   │ With rerank         │ Bi-encoder only         │
├──────────────────┼─────────────────────┼─────────────────────────┤
│ Per-query cost   │ +$0.001-0.01        │ Baseline                │
│ Per-query latency│ +200-400ms          │ Baseline                │
│ NDCG lift        │ +5-15pp             │ —                       │
│ Setup            │ Integrate rerank API│ None                    │
│ Index changes    │ None                │ None                    │
│ Maintenance      │ Rerank model version│ None                    │
│                  │ tracking            │                         │
└──────────────────┴─────────────────────┴─────────────────────────┘
```

### What we gave up

200-400ms latency per query. $0.001-0.01 per query (manageable at scale). Integration work for the rerank API.

### What the alternative would have cost

Bi-encoder-only retrieval ceiling-limits RAG quality. Users see "the first answer wasn't the best one" too often; eventually the team rebuilds embedding pipelines hoping for a magic improvement instead of adding the rerank stage.

### The breakpoint

Reranking earns its place when retrieval quality is the bottleneck (eval shows wrong docs in top-5 for >10% of queries). For simpler use cases (small corpus, exact-match dominant), it doesn't earn its place.

---

## Tech reference (industry pairing)

### Cohere Rerank

- **Codebase uses:** not yet.
- **Why it's here:** dedicated rerank-as-a-service; integrates with any retrieval pipeline.
- **Leading today:** Cohere Rerank — `adoption-leading` for managed reranking, 2026.
- **Why it leads:** purpose-built; fast (200ms for top-100); good cost.
- **Runner-up:** BGE-reranker (OSS) — `innovation-leading` for self-hosted needs.

### Cross-encoder transformers (BGE-reranker, ms-marco-MiniLM)

- **Codebase uses:** not yet.
- **Why it's here:** OSS alternative when self-hosting matters.
- **Leading today:** BGE-reranker — `adoption-leading` for OSS reranker, 2026.

---

## Project exercises

### [B-reincodes-reranking-viz] Build the reranking visualizer

- **Exercise ID:** `[B-reincodes-reranking-viz]`
- **What to build:** a page at `/ai/reranking` rendering top-20 retrieved + top-5 after rerank side-by-side. Show cosine + cross-encoder scores per doc.
- **Why it earns its place:** seeing the rank shifts makes the bi-encoder-vs-cross-encoder asymmetry concrete.
- **Files to touch:** standard pattern.
- **Done when:** page loads, scores render, rank changes highlighted.
- **Estimated effort:** 1 day.

---

## Summary

### Part 1 — concept recap

Reranking is the two-stage pattern: bi-encoder (fast) for candidate generation, cross-encoder (slow) for precise ranking of top-100. NDCG@5 lifts 5-15pp at 200-400ms cost. In reincodes Case B; visualizer demonstrates the rank shifts. Cohere Rerank is the canonical service; BGE-reranker the OSS alternative.

### Part 2 — key points to remember

- **Two stages**: bi-encoder broad, cross-encoder narrow.
- **Top-100 cutoff** per query before rerank.
- **NDCG lift**: 5-15pp typical.
- **Cost**: $0.001-0.01/query + 200-400ms.
- **Cross-encoder sees query+doc together**; bi-encoder doesn't.

---

## Interview defense

### Likely questions

**Q (mid):** Why not just use the cross-encoder for everything?

A: Latency. Cross-encoder over 1M docs = ~100K seconds per query. Bi-encoder over 1M docs + cross-encoder over 100 candidates = ~500ms total. The pattern uses each model where it's economical: bi-encoder for breadth, cross-encoder for precision.

**Q (senior):** When does reranking not help?

A: When bi-encoder already returns the right doc at rank 1-5. Adding rerank shifts ranks 1-100 but doesn't fix the case where the right doc is at rank 200+. The fix there is better retrieval (hybrid, better embeddings), not better reranking.

**Q (arch):** At 10x scale, what changes?

A: Cost matters more. At 1M queries/day × $0.005 = $5K/day rerank cost. Optimize via cached rerank for popular queries; sample rerank (every 10th query) if cost is constrained.

### One-line anchors

- "Bi-encoder broad; cross-encoder narrow."
- "Top-100 candidates; top-5 after rerank."
- "NDCG +5-15pp at 200-400ms cost."
- "Cross-encoder sees query+doc together. Bi-encoder can't."
- "Cohere Rerank: managed. BGE-reranker: OSS."

---

## Validate

### Level 1
Draw the two-stage pipeline.

### Level 2
Explain reranking under 90s.

### Level 3
Design rerank for a 10M-doc corpus + 100k queries/day. Cost budget?

### Level 4
Tradeoff: rerank with Cohere or self-host BGE?

### Quick check
- Static-export config?
- Visualizer registration?
- JSON file?
