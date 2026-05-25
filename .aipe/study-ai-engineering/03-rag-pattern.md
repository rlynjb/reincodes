# RAG pattern

**Industry name(s):** Retrieval-augmented generation (Lewis et al., 2020); "ground-then-generate" pattern.
**Type:** Industry standard · Language-agnostic

> Embed the docs, embed the query, retrieve top-k, stuff into the prompt, generate. Five stages, each one independently failable, each one independently evaluable.

**See also:** → `02-embeddings-geometrically.md` · → `04-agents-and-tool-use.md`

---

## Why care

You've built a typeahead component. The user types into a search input, you `fetch('/api/suggest?q=' + query)`, the response comes back with a list of matches, you render them as a dropdown under the input. The user picks one. That's the entire shape. The dropdown isn't generating anything; it's *populating from a retrieved list*.

Now swap the dropdown for an LLM and the list for "context the LLM will read before answering." Same shape. The user types a question, you fetch a list of related documents, you stuff those documents into the prompt, the LLM reads them and generates an answer. The LLM doesn't know your private docs (your codebase, your journal, your knowledge base). It only knows what you put in the context window. RAG is the pattern that fills the context window with the *right* things before the model gets to read them.

The frontend instinct here is to ask "why not just put everything in the prompt?" — and the answer is the same as why you don't `fetch('/api/all-docs')` for your typeahead: it doesn't fit, and even if it did, the relevant items would be drowned in noise. Context windows have a fixed budget (`01-tokenization.md`); attention degrades over long contexts (the lost-in-the-middle problem); and you pay for every token in the input. Retrieval is how you keep the prompt small *and* on-topic.

**Why you need to answer that question at all:** because the LLM's answer quality is bounded by what's in the context. If retrieval returns the wrong chunks, the model generates a fluent but wrong answer — a hallucination shaped like a citation. The single biggest determinant of RAG quality is not the model; it's the retrieval step. And retrieval is a problem you can evaluate independently with classical metrics (hit@k, MRR) — you don't need an LLM-as-judge to know if the right chunk made it into the prompt.

Without thinking of RAG as a pipeline:
- You debug a bad answer by tweaking the prompt, but the bad chunk was retrieved upstream.
- You blame the model for hallucinating when the context didn't contain the answer at all.
- You can't tell if a fix improved retrieval, generation, or both.

With the pipeline framing:
- Each stage has its own metric: retrieval has hit@k; generation has rubric scores; end-to-end has user-facing eval.
- Failures get localized: "the chunk wasn't retrieved" vs "the chunk was retrieved but the model ignored it" are different bugs.
- Components swap independently: try a different embedding model without changing generation; try a different chunking strategy without re-embedding.

RAG is `fetch(matches) → useMatches(matches) → render(answer)` for LLMs. The retrieval step is the typeahead; the generation step is the renderer. The whole pattern is a discriminated union of failures, and each one is fixable in isolation.

---

## How it works

Five stages, in order. The two halves are *indexing* (offline, runs once per doc change) and *querying* (online, runs per user query).

```
INDEXING (offline, per document)
─────────────────────────────────────────────────────────────

Docs
  │
  ▼
┌─────────────────┐    ┌─────────────────┐    ┌──────────────┐
│ Chunk           │───▶│ Embed each      │───▶│ Vector store │
│ (split by       │    │ chunk           │    │ (HNSW index, │
│  section/size)  │    │ (embed model)   │    │  sqlite-vec) │
└─────────────────┘    └─────────────────┘    └──────────────┘


QUERYING (online, per user query)
─────────────────────────────────────────────────────────────

User query
  │
  ▼
┌─────────────────┐
│ Embed query     │  (same embedding model as indexing)
│ (embed model)   │
└────────┬────────┘
         │  query vector
         ▼
┌─────────────────┐
│ Retrieve top-k  │  cosine similarity over the index
│ from vector     │  k typically 5–20
│ store           │
└────────┬────────┘
         │  ranked chunks
         ▼
┌─────────────────┐
│ Rerank          │  optional: cross-encoder over top-N
│ (cross-encoder) │  expensive; only on hard queries
└────────┬────────┘
         │  final top-k
         ▼
┌─────────────────────────────────────────────┐
│ Stuff into prompt                           │
│ ────────────────────────────────────────    │
│ System: "Answer using only the context."    │
│ Context: chunk_1\n\nchunk_2\n\n...          │
│ User: {query}                               │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
              LLM generates
                   │
                   ▼
              Answer (ideally cites chunks)
```

The key invariant: **the same embedding model must be used on both sides.** A query embedded with text-embedding-3-small must search an index built with text-embedding-3-small. Mixing models means searching in a space the query vector doesn't live in.

Two RAG shapes the curriculum distinguishes — and the visualizer needs to make both legible:

1. **loopd-shape RAG** (retrieval-augmented *generation* over a personal corpus): index user journal entries, embed the query, retrieve top-k entries, feed them to a generation chain that produces a synthesis. The retrieval feeds an LLM that writes free-form prose.
2. **aipe-shape RAG** (retrieval-augmented *prompting* over project context): index `.aipe/` and `~/.config/aipe/global/`, embed the `/aipe:feature <intent>` invocation, retrieve top-k context chunks, *feed them as additional context to a Claude Code prompt that produces a spec markdown file*. The retrieval feeds an LLM whose output is constrained to a spec shape, not free-form prose.

Same five stages. Different shape of *what's generated downstream*. The visualizer covers both with a toggle so the reader can see them as variants of the same pattern, not two separate things.

Two architectural choices the visualizer surfaces:

- **Chunking strategy** — by section vs by fixed token window vs by sentence window. Each chunk choice changes what's retrievable and what gets returned. Chunks too big → low precision (lots of irrelevant text); too small → low recall (the answer is split across chunks).
- **Reranking** — the bi-encoder used for the index is fast but coarse; a cross-encoder (which reads query + doc together) is slow but precise. Standard pattern is bi-encoder for top-20 retrieval, cross-encoder rerank to top-5. The visualizer makes this stage toggleable.

---

## RAG — diagram

```
                        Two RAG shapes, same five stages
                        ────────────────────────────────

  loopd-shape (RAG over personal corpus)         aipe-shape (RAG over project context)
  ─────────────────────────────────────         ─────────────────────────────────────

  Journal entries                                .aipe/ + ~/.config/aipe/global/
       │                                              │
       ▼                                              ▼
  ┌─────────────┐                              ┌─────────────┐
  │ Chunk by    │                              │ Chunk by    │
  │ entry       │                              │ section     │
  └──────┬──────┘                              └──────┬──────┘
         │                                            │
         ▼                                            ▼
  ┌─────────────┐                              ┌─────────────┐
  │ Embed +     │                              │ Embed +     │
  │ store       │                              │ store       │
  │ (sqlite-vec)│                              │ (.aipe/.index)│
  └──────┬──────┘                              └──────┬──────┘
         │                                            │
  Query: "how did                              Query: "/aipe:feature
   I feel about                                        rate limiting"
   the launch"                                         │
         │                                            ▼
         ▼                                       Embed query
    Embed query                                       │
         │                                            ▼
         ▼                                       Top-k chunks
    Top-k entries                                     │
         │                                            ▼
         ▼                                       ┌──────────────────┐
  ┌─────────────────┐                            │ Stuffed into the │
  │ Stuffed into    │                            │ /aipe:feature    │
  │ interpret chain │                            │ system prompt    │
  └──────┬──────────┘                            └──────┬───────────┘
         │                                              │
         ▼                                              ▼
  Synthesis prose                                  Spec markdown file


  Both shapes: 5 stages (chunk → embed → store → retrieve → augment generate).
  Different shape of "what the LLM produces downstream."
```

---

## In this codebase

**Not yet implemented.** Deferred — reincodes is the interview-prep visualizer host per the curriculum; no AI viz built yet. There is no corpus inside reincodes that would be RAG'd — no docs, no journal, no knowledge base. The visualizer's job is to make the *stages* legible, not to be a working RAG system over reincodes itself. The page would load a small fixed example corpus (precomputed embeddings) and animate the query going through the five stages with toggleable steps.

The page slot is `/ai/rag` under the existing App Router, with the tile added to `CONCEPT_CATEGORIES` in `src/components/Home/conceptsData.tsx` under the same proposed `"ai-engineering"` category as the tokenization and embedding visualizers.

---

## Elaborate

### Where this pattern comes from

The original RAG paper (Lewis et al., 2020, "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks") trained a single model end-to-end with retrieval as part of the architecture. What the industry adopted was a simpler, looser version: retrieval is a separate module from generation, the two are wired together at inference time, and either can be swapped without retraining. The "RAG" that everyone ships today is closer to "stuff retrieved docs into the prompt of a frozen LLM" than to the original paper's joint training, but the name stuck.

### The deeper principle

Decompose a large problem into stages so each one is independently evaluable. The LLM by itself is an end-to-end black box; you give it a query and get an answer, and if the answer is wrong, you can't tell why. RAG breaks the black box into five stages, each with measurable inputs and outputs. Retrieval has a metric (hit@k). Reranking has a metric (NDCG over the top-N). Generation has a rubric. End-to-end has a user-facing metric. When something is broken, you bisect: each stage either passes its own metric or doesn't.

```
┌────────────────────────────────────────────────────────┐
│  Without RAG:                                          │
│    Query ──────────────────▶ LLM ──────▶ Answer       │
│                              (opaque)                  │
│                                                        │
│  Single metric: was the answer good?                   │
│  When wrong: no way to localize the bug.               │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│  With RAG:                                             │
│    Query ── chunk ── embed ── retrieve ── rerank ──▶   │
│              │        │         │           │          │
│              ▼        ▼         ▼           ▼          │
│           metric   metric    hit@k        NDCG         │
│                                                        │
│             ────▶ stuff ──▶ LLM ──▶ Answer            │
│                              │         │              │
│                              ▼         ▼              │
│                          rubric    end-to-end         │
│                                                        │
│  Five metrics. When wrong: bisect to the failing stage.│
└────────────────────────────────────────────────────────┘
```

### Where this breaks down

When the answer requires synthesis across the entire corpus, not just a few relevant chunks. "Summarize all my journal entries from the last year" is not a retrieval problem; it's a map-reduce problem. RAG retrieves top-k, but top-k can't represent the full distribution. The fix is either hierarchical summarization (summarize batches, then summarize the summaries) or full-context models if the corpus fits. Also breaks down when the query is genuinely about something the corpus doesn't contain — RAG happily retrieves the *least bad* chunks and generates a confident hallucination. The mitigation is a relevance gate: if the top-k similarity scores are all below a threshold, refuse to answer.

### What to explore next

- Chunking strategies → the stage with the most under-discussed impact. Where you split changes what's retrievable.
- Reranking with a cross-encoder → the precision-improving stage; bi-encoders are recall, cross-encoders are precision.
- HyDE and query rewriting → fixing the asymmetric-encoder problem at the query side instead of the doc side.
- Agents and tool use → RAG becomes one tool an agent calls, not the only flow. Agent loops with retrieval are the next abstraction layer up.

---

## Tradeoffs

### Comparison table — both costs in one frame

┌──────────────────┬─────────────────────────┬──────────────────────────┐
│ Cost dimension   │ Build RAG pipeline      │ Stuff entire corpus      │
│                  │                         │ into the prompt          │
├──────────────────┼─────────────────────────┼──────────────────────────┤
│ Build time       │ 5 stages of code        │ Trivial: one string concat│
│ Token cost/query │ ~2k tokens (top-5)      │ Full corpus every call    │
│ Latency          │ 200ms retrieval + gen   │ Generation only           │
│ Recall ceiling   │ Bounded by top-k        │ Whole corpus visible      │
│ Eval shape       │ Per-stage metrics       │ Only end-to-end           │
│ Cost at scale    │ Linear in queries       │ Linear in queries × corpus│
│ Failure modes    │ Bisectable              │ Lost-in-the-middle        │
└──────────────────┴─────────────────────────┴──────────────────────────┘

### Sub-block 1 — what building the pipeline costs

Five stages of code, five places to break. Chunking decisions (size, overlap, boundary) live in one file. Embedding model choice and call lives in another. Vector store schema and query lives in a third. Reranker (when present) is a fourth. Prompt-assembly logic is a fifth. A new contributor has to read all five to debug an end-to-end retrieval failure, and the failure is usually in the stage they didn't look at first.

For the reincodes visualizer specifically, the cost is bundle size — a tokenizer worker, a precomputed corpus JSON, a t-SNE / d3 layer, and the prompt-assembly preview. The page is heavier than the existing sort/graph pages; route-chunking it under `/ai/rag` is required to keep the home bundle small.

### Sub-block 2 — what stuffing the whole corpus would cost

For a real corpus (1MB of text = ~250k tokens), full-context stuffing exceeds every model's window today (Claude's 200k is the leading edge; 250k still doesn't fit). Even when the corpus fits, every query pays the full corpus cost in tokens — at $3/M input tokens, every query costs ~$0.75 instead of ~$0.006 with retrieval. The lost-in-the-middle problem also degrades quality: facts buried in the middle of long contexts get attention-starved relative to facts near the top or bottom.

For a visualization corpus of 20 sentences this argument doesn't bite — the whole "corpus" is ~500 tokens. But the visualizer must teach the *general* tradeoff, not the toy-case one. The page has to make legible that "for real corpora, stuffing doesn't scale" even though the toy is small enough to fit in a single prompt.

### Sub-block 3 — the breakpoint

Stuffing is fine until the corpus exceeds ~5k tokens or queries exceed ~1k/day, whichever comes first. Below those numbers, the pipeline complexity isn't worth the token savings. Above them, retrieval becomes a forcing function: you don't have a choice. The reincodes visualizer sits in the toy region (20 sentences) deliberately — so the human can hold the whole space in their head while learning the stages. The breakpoint discussion lives in the visualization's prose, not in the page's behavior.

---

## Tech reference (industry pairing)

### sqlite-vec / pgvector / in-memory cosine

- **Codebase uses:** not yet — the visualizer would use an in-memory cosine over the precomputed JSON, no vector DB needed at toy scale. Existing data structures in `src/utils/data_structures/` (BinaryHeap, PriorityQueue) are the reincodes precedent: in-memory, hand-written, sufficient for the scale.
- **Why it's here:** stores the indexed embeddings and answers nearest-neighbor queries. The "vector store" stage of the pipeline.
- **Leading today:** pgvector — adoption-leading for production RAG, 2026.
- **Why it leads:** runs inside the database that already holds the source docs, so retrieval and metadata filtering compose. HNSW index built in. Supabase, Neon, RDS all ship it.
- **Runner-up:** sqlite-vec — innovation-leading for local-first / on-device RAG (used by loopd in the curriculum). Qdrant and Pinecone are the dedicated-vector-DB picks when scale or features (multi-vector, filtering) demand them.

### text-embedding-3-small (or BGE / Cohere)

- **Codebase uses:** not imported. Would be hit by `scripts/embed-corpus.ts` at build time to produce the visualizer's precomputed JSON.
- **Why it's here:** turns chunks and queries into vectors. The "embed" stage of the pipeline.
- **Leading today:** OpenAI `text-embedding-3-small` — adoption-leading, 2026.
- **Why it leads:** dimension-flexible (Matryoshka), cheap, broad training. Default pick when the corpus isn't niche.
- **Runner-up:** BGE-large or Cohere Embed v3 — innovation-leading on retrieval benchmarks; sentence-transformers/all-MiniLM-L6-v2 is the local-inference workhorse.

### A reranker — cross-encoder model

- **Codebase uses:** not yet. The visualizer would simulate the reranker stage with a precomputed "what would the cross-encoder say" mapping for the toy corpus, since real cross-encoders are too heavy to ship to the browser. The reranker toggle is a teaching surface, not a live model.
- **Why it's here:** improves precision over the top-N candidates by reading query + doc together. The "rerank" stage.
- **Leading today:** `bge-reranker-large` (or Cohere's `rerank-v3`) — adoption-leading for production reranking, 2026.
- **Why it leads:** dramatic precision improvement over bi-encoder retrieval, well-distilled to small sizes, hosted as an API on most platforms.
- **Runner-up:** MS Marco-trained cross-encoders from sentence-transformers — open-source baseline; ColBERT is the innovation-leading multi-vector approach.

### The LLM (generation)

- **Codebase uses:** not yet. The visualizer would *show* the assembled prompt that would go to an LLM but not actually call one — the page is about the retrieval pipeline, not the generation. Live generation can come later via a precomputed answer for each preset query.
- **Why it's here:** the final stage — reads retrieved context + query, generates the answer.
- **Leading today:** Claude Sonnet 4.7 / GPT-4.1 / Gemini 2.5 — adoption-leading for high-quality RAG generation, 2026.
- **Why it leads:** strong instruction following, long context, good at citing retrieved passages when asked.
- **Runner-up:** smaller open-weight models (Llama 3.1, Mistral) for cost-sensitive RAG; gpt-4o-mini / Claude Haiku as the cheap-API pick.

---

## Project exercises

### [B-reincodes-rag] RAG pipeline visualizer

- **Exercise ID:** Curriculum reference: interview-prep entry `RAG pipeline visualizer [exercises C2.1, C2.4, C2.6]`. Concepts referenced: `[C2.1]` (embeddings), `[C2.3]` (chunking), `[C2.4]` (dense vs sparse retrieval), `[C2.6]` (reranking with cross-encoder).
- **What to build:** A page at `/ai/rag` that animates the five RAG stages against a small precomputed corpus (10–20 chunks, embeddings + cross-encoder scores precomputed). Stages: (1) chunk the input corpus (toggleable strategy: by section / by N tokens / by sentence), (2) embed each chunk, (3) embed the query, (4) retrieve top-k by cosine — show the scores, (5) optionally rerank — show the score changes. The final panel shows the prompt that would be stuffed into the LLM with the retrieved chunks highlighted. A top-of-page toggle switches between *loopd-shape* (synthesis prose downstream) and *aipe-shape* (spec markdown downstream) so the reader sees both RAG variants from the curriculum side by side.
- **Why it earns its place:** RAG is the single most-asked AI engineering interview pattern, and the failure modes (bad chunking, asymmetric embedding, missing rerank) are all in the pipeline — not in the LLM. A visualizer that lets the reader toggle each stage and watch the retrieved chunks change is the closest thing to debugging a real RAG system that fits in a static-export browser page.
- **Files to touch:**
  - `scripts/build-rag-corpus.ts` (new — precomputes chunks, embeddings, cross-encoder scores for the toy corpus)
  - `public/rag/corpus.json` (new — the precomputed pipeline data)
  - `src/app/ai/rag/page.tsx` (new — the `"use client"` page)
  - `src/components/RAGPipeline/RAGPipeline.tsx` (new — animates the five stages)
  - `src/components/RAGPipeline/PromptPreview.tsx` (new — shows the assembled prompt with retrieved chunks highlighted)
  - `src/utils/cosine.ts` (shared with the embeddings page)
  - `src/components/Home/conceptsData.tsx` (add the tile)
- **Done when:** the page loads, all five stages animate in sequence with a "step" / "play" control, toggling chunking strategy re-runs retrieval against precomputed embeddings, toggling the loopd/aipe shape changes only the final prompt preview. Build passes `next build` under `output: "export"`.
- **Estimated effort:** 1 week.

---

## Interview defense

### What an interviewer is really asking

When an interviewer asks "walk me through how RAG works," they're not asking for the diagram — they assume you know it. They're asking: when RAG fails, do you know which stage failed and how to debug it? Most candidates can recite the five stages. The senior+ answer goes one level deeper: "retrieval failed because the bi-encoder couldn't bridge the query phrasing to the doc phrasing — the fix is hybrid retrieval or HyDE; I'd verify with hit@k before changing the model." That answer demonstrates you've debugged RAG, not just shipped it.

### Likely questions

[mid] Q: What's the difference between the indexing path and the query path in RAG?

A: Indexing runs once per document (or per document change): chunk → embed → store in a vector index. It's offline; latency doesn't matter. Querying runs per user request: embed query → retrieve top-k → optionally rerank → stuff into prompt → generate. It's online; every stage budgets latency. The critical invariant is the embedding model — must be the same on both sides, because a query vector from one model is meaningless in another model's space.

Diagram:
```
Indexing (offline, batch)         Querying (online, per-request)
─────────────────────────         ──────────────────────────────
Docs → chunk → embed → store      Query → embed → retrieve → ...
                  │                            │
                  └─── SAME EMBEDDING MODEL ───┘
                       (must match or search fails silently)
```

[senior] Q: Your RAG system answers a question wrongly. Walk me through how you'd debug it.

A: First, check if the gold doc made it into the retrieved top-k — that's a retrieval problem, not a generation problem. If yes but the model still got it wrong, check whether the model cited the right chunk in its output or ignored it — that's a generation problem (or a context-too-long problem if you're stuffing too many chunks). If the gold doc didn't make top-k, compute the cosine similarity directly between the query and the gold doc; if it's low, you have an asymmetric-encoder problem (fix with hybrid retrieval or HyDE); if it's high but the doc was outranked by something less relevant, you have a corpus-density problem (fix with a reranker). I'd produce a hit@k number on a 20-item eval set before changing anything to know which fix is justified.

Diagram:
```
Bad answer
   │
   ▼
Did gold doc make top-k?
   │
   ├── NO ──▶ Retrieval issue
   │          │
   │          ▼ Check query↔doc cosine
   │          │
   │          ├── Low ──▶ Asymmetric encoder
   │          │           Fix: hybrid retrieval / HyDE
   │          │
   │          └── High ─▶ Crowded neighborhood
   │                     Fix: reranker over top-N
   │
   └── YES ─▶ Generation issue
              │
              ▼ Did model cite the right chunk?
              │
              ├── NO ──▶ Lost-in-the-middle / too many chunks
              │          Fix: reduce k, reorder, restructure
              │
              └── YES ─▶ Model misread the chunk
                         Fix: prompt engineering / model swap
```

[arch] Q: Your RAG corpus grows from 10k chunks to 100M chunks. What changes?

A: At 10k, flat in-memory cosine is fine — every query is a single matmul of a few MB of vectors. At 1M, you need an approximate-nearest-neighbor index (HNSW in pgvector or sqlite-vec) for sub-100ms retrieval. At 10M, the index itself starts pushing single-node RAM; you partition by metadata (tenant, date range) and route queries to the right shard. At 100M, you go full distributed: shard the index, query all shards in parallel, fuse results. Embedding dimension also matters more at scale — a 3072-D model uses 2x the RAM of a 1536-D model, and Matryoshka truncation to 256 dims (with ~5% recall loss) is often the right move. Reranking goes from "always" to "only on hard queries" because cross-encoder cost is per-comparison and doesn't amortize. Eval also gets harder: hit@k on a 50-item set was enough at 10k; at 100M you need a much larger eval set to cover the long tail.

Diagram:
```
Scale ──▶  10k         1M          10M         100M
           ───         ──          ───         ────
Index      flat        HNSW        HNSW +      sharded
                                   shards
                                              
Recall@10  ~99%        ~95%        ~92%        ~90% (gets
                                                hard to
                                                measure)

Rerank     always      cheap-      gated       gated +
                       always                  approximate

Eval set   50 q        500 q       5k q        50k q
```

### The question candidates always dodge

Q: If RAG is just "stuff retrieved context into the prompt," why do we still need vector embeddings at all? Why not BM25 alone, which is 30 years old and works?

A: For some workloads, BM25 alone is the right answer — and the candidates who pretend otherwise lose credibility. BM25 is exceptional at exact-term matching, has near-zero latency, requires no model, and is a perfect fit for technical documentation where users search for symbol names, error codes, or API method names. The reason dense embeddings exist alongside it is paraphrase coverage: a user who searches `"how do I cancel my subscription"` gets nothing from BM25 if the docs say `"unsubscribe from billing"`. Hybrid retrieval (RRF-fused BM25 + dense) wins both: BM25 catches exact-match queries, dense catches paraphrased ones. The interview answer is not "dense > sparse" — it's "the failure modes are complementary, and production systems run both."

Diagram:
```
What we picked (hybrid)        vs   The "dense only" claim
────────────────────                ──────────────────────
BM25  ●●●●● exact terms             BM25  ✗ skipped
Dense ●●●●● paraphrases             Dense ●●●●●

RRF fuses both rankings              Misses exact-match queries
                                     entirely. The user types
                                     "SKU-X42-RED" and gets back
                                     5 semantically-similar but
                                     wrong SKUs.
```

### One-line anchors

- "RAG is `typeahead → renderer` for LLMs: retrieve the right items, then generate from them."
- "The single biggest determinant of RAG quality is retrieval, not the model."
- "Same embedding model on both sides; mixing models is a silent miss."
- "Five stages, five metrics — when RAG breaks, bisect to the failing stage."
- "Production retrieval is hybrid (dense + sparse); pretending dense-only is universal is a junior signal."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw the five-stage RAG pipeline from memory, with the indexing path on top and the querying path on the bottom. Label every arrow with what flows along it.

Open the file. Compare.

- Did you show that indexing happens offline and querying happens online?
- Did you mark the invariant that the same embedding model must be used on both sides?
- Did you show the rerank stage as optional?

### Level 2 — Explain it out loud

Explain RAG to a frontend colleague who just asked "isn't this just a fancier typeahead?" No notes. Under 90 seconds.

Checkpoints — did you:
- Use the typeahead-as-anchor framing?
- Name the five stages in order?
- Mention that the embedding model has to match on both sides?
- Mention at least one failure mode (asymmetric encoder, lost-in-the-middle, or stale index)?

### Level 3 — Apply it to a new scenario

Answer this without looking at the file:

"You have a RAG system over a company's internal docs. The CEO complains that asking 'what's our refund policy' returns the footer of the homepage instead of the actual refund docs. Walk through how you'd debug this — what stages do you check first, second, third?"

Write your answer. 3–5 sentences minimum.

### Level 4 — Defend the decision you'd change

The Project exercise above ships a precomputed corpus instead of running embeddings live in the browser. Answer in writing:

"If you were building the RAG visualizer today, would you still precompute, or would you ship Transformers.js so users can paste their own corpus? Why? What would the static-export contract force you to do either way?"

Reference the actual constraints:
- Point to `next.config.ts` (`output: "export"`).
- Point to where the corpus JSON would live in `public/`.

### Quick check — code reference test

Without opening any files, answer:
- What's the file path of the build script that would produce the precomputed corpus?
- What's the difference between *loopd-shape* RAG and *aipe-shape* RAG as described above?
- What `src/utils/` file would be shared between the embeddings page and the RAG page?

Then open the files and verify.

- Pass: `scripts/build-rag-corpus.ts`.
- Pass: loopd-shape generates synthesis prose; aipe-shape generates a spec markdown file.
- Pass: `src/utils/cosine.ts`.

---

## Summary

RAG is a five-stage pipeline — chunk, embed, store, retrieve, generate — that fills an LLM's context with the right documents before generation. The pipeline framing matters because each stage is independently evaluable and independently failable. For reincodes, the planned `/ai/rag` visualizer animates the stages against a precomputed corpus with a toggle between the two RAG shapes from the curriculum (loopd-shape: synthesis prose downstream; aipe-shape: spec markdown downstream).
