# RAG (the canonical pipeline)

**Industry name(s):** Retrieval-Augmented Generation, RAG, grounded generation
**Type:** Industry standard

> The 5-stage pipeline: chunk → embed → store → retrieve → generate. RAG earns its place when the corpus exceeds the model's knowledge cutoff, when citations matter, or when dynamic data has to be grounded. Doesn't earn its place for small corpora that fit in context.

**See also:** → [01-embeddings](01-embeddings.md) · → [03-chunking-strategies](03-chunking-strategies.md) · → [06-hybrid-retrieval-rrf](06-hybrid-retrieval-rrf.md) · → [07-reranking](07-reranking.md)

---

## Why care

### Move 1 — The grounded scenario

A user asks your support bot "what's our refund policy for digital goods?" The model doesn't know — it wasn't trained on your company's docs. Two options: bake the policy into the system prompt (works for 5 policies, breaks at 50), or *retrieve* the policy doc on demand and inject it into the prompt for that call. Retrieval is the second option's mechanism; RAG is the discipline of doing it well.

### Move 2 — Name the question

The question is *how to give the LLM access to information it wasn't trained on, on demand, per call*. RAG's answer: at index time, chunk + embed + store the corpus; at query time, embed the user question, retrieve top-k similar chunks, stuff them into the prompt under `<context>` tags, generate the answer grounded in those chunks. The pipeline is mechanical; the engineering work is in each stage's quality.

### Move 3 — Why answering that question matters

**Why you need to answer that question at all:** because the alternatives are worse. Bake everything into the system prompt: hits context window limits, expensive per call, requires re-deploy for every policy change. Fine-tune the model on your corpus: expensive, slow, retraining cycles, model drift. RAG: cheap, fast, citation-capable, source-of-truth stays in your DB. The pattern has become default infrastructure for any LLM feature that has to know specific things.

### Move 4 — Concrete before/after

Without RAG (system-prompt-bake):
- 50 policies × 500 tokens = 25K tokens of policies in every call
- $0.075 per call just for policy context
- Edit policy → redeploy
- Hits context limit at ~150 policies

With RAG:
- Index the 50 policies once
- Per call: embed query, retrieve top-3 (~1.5K tokens of context)
- $0.0045 per call for policy context (94% reduction)
- Edit policy → re-embed that row (5 min lag)
- Scales to 10K+ policies

### Move 5 — The one-line summary

RAG is `SELECT * FROM docs WHERE relevance(query, doc) > threshold` injected into the LLM prompt — same shape as a SQL JOIN, but the equality predicate is cosine similarity. Mechanics below.

---

## How it works

### Move 1 — The mental model

Five stages. Index time: chunk + embed + store. Query time: retrieve + generate.

```
RAG pipeline

INDEX TIME (offline, batched):
  docs ──► chunker ──► embedder ──► vector index

QUERY TIME (online, per call):
  query ──► retrieve top-k ──► generate (with chunks in context)
```

### Move 2 — The layered walkthrough

#### Stage 1: Chunk

The technical thing: split docs into 200-500 token chunks (with optional overlap). The bridge from frontend: this is `split()` on a string with a smart boundary. Concrete consequence: chunk size controls retrieval granularity. Concrete condition: too small = lose context; too large = retrieve irrelevant material. See [03-chunking-strategies](03-chunking-strategies.md).

#### Stage 2: Embed

The technical thing: each chunk goes through embedding model → vector. The bridge: like generating a hash per item, but the hash captures meaning instead of bytes. See [02-embedding-model-choice](02-embedding-model-choice.md).

#### Stage 3: Store

The technical thing: vectors + metadata go into a vector DB with ANN index. See [04-vector-databases](04-vector-databases.md).

#### Stage 4: Retrieve

The technical thing: embed query, ANN-search for top-k similar vectors, return those chunks. Add reranking ([07-reranking](07-reranking.md)) and hybrid retrieval ([06-hybrid-retrieval-rrf](06-hybrid-retrieval-rrf.md)) for quality.

#### Stage 5: Generate

The technical thing: build prompt = system + `<context>retrieved chunks</context>` + user message. The model grounds its answer in the chunks; cites them by metadata.

```
prompt shape

system: "You are a support agent. Answer based ONLY on the
         retrieved context below. Cite which doc you used."

context: <context>
  [doc 47, chunk 3]: "Refund policy for digital goods..."
  [doc 12, chunk 8]: "Exceptions to refund policy..."
</context>

user: "what's our refund policy for digital goods?"
```

### Move 3 — The principle

The principle: *retrieval is composable with generation; both improve independently*. Better retrieval → better grounding → better generation. The five-stage pipeline isolates concerns so each stage is independently optimizable, eval-able, debuggable.

Full picture below.

---

## RAG — diagram

```
┌─ INDEX TIME ──────────────────────────────────────────────────────┐
│                                                                   │
│   docs ──► chunker (200-500 tok) ──► chunks                       │
│                                        │                          │
│                                        ▼                          │
│                                     embedder ──► vectors          │
│                                                    │              │
│                                                    ▼              │
│                                            vector index (HNSW)    │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘

┌─ QUERY TIME ──────────────────────────────────────────────────────┐
│                                                                   │
│   query ──► embedder ──► ANN search ──► top-k chunks              │
│                                              │                    │
│                                              │ (optional)         │
│                                              ▼                    │
│                                           reranker                │
│                                              │                    │
│                                              ▼                    │
│   prompt = system + <context>chunks</context> + user              │
│              │                                                    │
│              ▼                                                    │
│           LLM ──► response with citations                         │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**Not yet implemented.** The buildable target is the most prominent visualizer in the planned `/ai/*` family — a `/ai/rag` 5-stage pipeline animator. Toggle chunking strategy, retrieval mode (dense/sparse/hybrid), rerank on/off. Final panel shows the prompt with retrieved chunks highlighted.

**Expected file paths:**
- `src/app/ai/rag/page.tsx`
- `src/components/RagVisualizer/`
- `public/ai/rag/scenarios.json`

---

## Elaborate

### Where this pattern comes from

Lewis et al. 2020 ("Retrieval-Augmented Generation for Knowledge-Intensive NLP"). The five-stage pipeline crystallized in 2023 with LangChain / LlamaIndex.

### The deeper principle

*Grounding generation in retrieved evidence beats hallucinating from training data alone* — for any domain where ground truth is dynamic.

### Where this breaks down

For small corpora (<10K tokens) that fit in context — just include everything. For domains where the model genuinely knows the answer (basic facts), RAG adds latency for no gain.

### What to explore next

- [12-graph-rag](12-graph-rag.md) — RAG variant for multi-hop questions
- [../05-evals-and-observability/01-eval-set-types](../05-evals-and-observability/01-eval-set-types.md) — RAG eval is the load-bearing discipline

---

## Tradeoffs

```
┌──────────────────┬───────────────────┬─────────────────────────┐
│ Cost dimension   │ With RAG          │ System-prompt-bake      │
├──────────────────┼───────────────────┼─────────────────────────┤
│ Per-call cost    │ ~retrieval +      │ Full corpus tokens      │
│                  │ top-k tokens      │                         │
│ Corpus updates   │ Re-embed delta    │ Re-deploy               │
│ Citation         │ Native (chunk ID) │ Manual                  │
│ Setup            │ Indexing pipeline │ Edit system prompt      │
│ Latency          │ +50-200ms         │ Baseline                │
│ Quality          │ Depends on        │ Limited by context      │
│                  │ retrieval         │ window                  │
└──────────────────┴───────────────────┴─────────────────────────┘
```

### Breakpoint

RAG earns place when corpus > model context window OR corpus mutates between deploys OR citations matter.

---

## Tech reference

### LangChain / LlamaIndex

- **Codebase uses:** not yet.
- **Why it's here:** RAG framework, batteries-included.
- **Leading today:** LlamaIndex — `adoption-leading` for RAG-specific framework, 2026.

### Pinecone / Qdrant / pgvector

- **Codebase uses:** not yet.
- **Leading today:** Qdrant — `adoption-leading` OSS vector DB, 2026.

### Cohere Rerank

- **Codebase uses:** not yet.
- **Why it's here:** post-retrieval rerank lifts NDCG.

---

## Project exercises

### [B-reincodes-rag-viz] Build the RAG visualizer

- **Exercise ID:** `[B-reincodes-rag-viz]`
- **What to build:** 5-stage pipeline animator; chunk → embed → store → retrieve → generate. Toggles: chunking strategy, retrieval mode, rerank on/off.
- **Why it earns its place:** the most central RAG visualizer; demonstrates the pipeline mechanics.
- **Files to touch:** standard pattern.
- **Done when:** all 5 stages animate; toggles work; precomputed outputs render correctly.
- **Estimated effort:** 2 days.

---

## Summary

### Part 1 — concept recap

RAG: 5-stage pipeline (chunk, embed, store, retrieve, generate) for grounding LLM output in a corpus. Earns place when corpus exceeds context window, mutates between deploys, or requires citations. In reincodes Case B; visualizer is the most prominent planned `/ai/*` page.

### Part 2 — key points

- 5 stages, each independently optimizable.
- Index time: chunk + embed + store.
- Query time: retrieve + generate.
- Costs scale with chunk count (not corpus size at query time).
- Citation native (chunk IDs).

---

## Interview defense

### Likely questions

**Q (mid):** Walk me through RAG.

A: Five stages. Offline: chunk docs into 200-500 token pieces, embed each chunk, store vectors in a vector DB. Online: embed the user query, ANN search for top-k similar chunks, optionally rerank, inject the chunks into the prompt under `<context>` tags, generate the answer grounded in those chunks.

**Q (senior):** When NOT to use RAG?

A: Small corpora that fit in context (<10K tokens). When the model already knows the domain (RAG adds latency for no gain). When the retrieval surface is unstable (chunking + embedding never settle into reliable quality).

**Q (arch):** At 10M docs, what changes about RAG?

A: Storage cost ($10K+/year for embeddings). Retrieval latency creeps (need sharding by topic/locale). Reranking becomes load-bearing for quality. Hybrid retrieval mandatory. Eval set grows monotonically with production failures.

### One-line anchors

- "5 stages: chunk, embed, store, retrieve, generate."
- "Retrieval and generation are independently optimizable."
- "Citations are native — chunk IDs come back with the answer."
- "RAG > prompt-bake when corpus > context or corpus mutates."
- "RAG eval is the load-bearing discipline."

---

## Validate

### Level 1
Draw the 5-stage pipeline.

### Level 2
Explain under 90s.

### Level 3
A new feature needs grounding in 100K policy docs. Design RAG vs alternatives.

### Level 4
Tradeoff: rerank on or off in your visualizer demo?

### Quick check
- Static-export file? Visualizer registration? JSON file?
