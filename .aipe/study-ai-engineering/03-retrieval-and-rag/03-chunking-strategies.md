# Chunking strategies

**Industry name(s):** Chunking, document splitting, text segmentation, recursive splitting, semantic chunking
**Type:** Industry standard

> How to break a long document into the right-size pieces for embedding and retrieval — the step that decides whether retrieval surfaces "the answer" or "the paragraph next to the answer."

**See also:** → [01-embeddings](01-embeddings.md) · → [02-embedding-model-choice](02-embedding-model-choice.md) · → [05-dense-vs-sparse-retrieval](05-dense-vs-sparse-retrieval.md) · → [11-rag](11-rag.md) · → [../00-overview](../00-overview.md)

---

## Why care

### Move 1 — The grounded scenario

You've set up RAG over a corpus of 50 articles, each 5K-15K tokens long. You embed each article as one vector and retrieve top-3. The retrieval works — the right article comes back — but the model's answer is sometimes vague because it has 10K tokens of article in context and the *specific* paragraph it needed sits at position 7K, in the middle of the retrieved blob. Other times the retrieval misses the right article entirely because the article was about *three* things and the embedding pooled all three into a generic vector that didn't match any specific query well. The article-as-one-chunk granularity is too coarse for retrieval and too coarse for generation.

### Move 2 — Name the question

That granularity decision has a name — *chunking*. Not the embedding model, not the retrieval algorithm, not the LLM downstream — just the question of *how big each piece of your corpus should be when you embed it*. Chunking is the most-tweaked variable in any RAG system because it's the one that most-directly trades off retrieval precision (smaller chunks, more focused matches) against generation quality (larger chunks, more context per match).

### Move 3 — Why answering that question matters

**Why you need to answer that question at all:** because *the chunk is the unit of retrieval*. The retrieval system returns chunks, not documents. If your chunks are 10K tokens, retrieving the "right" chunk still means handing the model 10K tokens of context for one query. If your chunks are 50 tokens, you might retrieve 50 unrelated single-sentence chunks. The right chunk size is where the retrieval target is *focused enough* to be a clean match but *complete enough* to answer the question. I have shipped RAG systems where moving from "embed each article as one chunk" to "embed each section heading + its first 400 tokens" lifted retrieval accuracy by 18 percentage points on the same eval set — same model, same vector store, same downstream LLM, just a different way of splitting the corpus. The chunk size is load-bearing in the same way the embedding model is.

### Move 4 — Concrete before/after

Without thoughtful chunking (one chunk per article):

- 50 articles × ~10K tokens each = 50 chunks total
- Each chunk's embedding pools many topics; retrieval is coarse
- Retrieved chunks are 10K tokens long; lost-in-the-middle bites
- Hard to cite ("which paragraph?"); response is vague
- Adding a new article = re-embed one large chunk; cheap

With semantic chunking (~300-500 tokens per chunk):

- 50 articles × ~30 chunks each = ~1500 chunks
- Each chunk's embedding pools one topic / one sub-topic; retrieval is focused
- Retrieved chunks are 300-500 tokens long; fits the prompt cleanly
- Easy to cite (chunk has a source URL + position); response is specific
- Adding a new article = re-embed ~30 chunks; modestly more expensive

### Move 5 — The one-line summary

Chunking is the *resolution knob* for retrieval — turn it up (smaller chunks) for precision, turn it down (larger chunks) for context, and most production RAG systems settle around 300-500 tokens per chunk because that's the sweet spot for both objectives. The full mechanics are below.

---

## How it works

### Move 1 — The mental model

A chunk is the *atomic unit* of your retrieval index. Each chunk has an embedding (one vector), a source pointer (which document, what position), and a piece of text (what the LLM will see if this chunk is retrieved). Picking a chunking strategy means picking how to partition the corpus into these units. Four canonical strategies: fixed-size (simple), recursive (structured), semantic (boundary-aware), document-level (no chunking).

The strategy: start with recursive chunking at 300-500 tokens with ~50-token overlap, measure retrieval accuracy on an eval set, only move to semantic chunking if the measurement shows recall miss on edge cases. Don't optimize chunking before measuring.

```
Chunking strategies at a glance

corpus                                                       retrieval index
                                                             (chunks + embeddings)

┌──────────────────────────┐
│ source document          │ ──┐
└──────────────────────────┘   │     ┌─ fixed-size ─────────┐
                               ├─────│ [────][────][────]   │
                               │     │  500   500   500     │
                               │     └──────────────────────┘
                               │
                               │     ┌─ recursive split ────┐
                               ├─────│ [section header]     │
                               │     │ [paragraph 1]        │
                               │     │ [paragraph 2]        │
                               │     └──────────────────────┘
                               │
                               │     ┌─ semantic chunking ──┐
                               ├─────│ [topic-coherent A]   │
                               │     │ [topic-coherent B]   │
                               │     │ [topic-coherent C]   │
                               │     └──────────────────────┘
                               │
                               │     ┌─ document-level ─────┐
                               └─────│ [whole document]     │
                                     └──────────────────────┘
```

### Move 2 — The layered walkthrough

#### Fixed-size chunking

The technical thing: split the document into chunks of exactly N tokens (e.g., 500), with optional overlap (e.g., 50 tokens) between chunks. The simplest possible strategy. Bridge from frontend: this is the equivalent of `Array.from({length: Math.ceil(text.length/500)})` — naive, fast, no understanding of content structure. Concrete consequence: fixed-size chunking is the *starting baseline*. It will break mid-sentence and mid-paragraph; some chunks will start with "and then..." because the previous chunk ended mid-thought. The overlap mitigates the mid-sentence problem — important content near a chunk boundary appears in both adjacent chunks. Use this only when the corpus has no clear structure (e.g., transcripts, scraped HTML stripped of tags).

```
fixed-size chunking with overlap

text: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.
       Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
       Ut enim ad minim veniam, quis nostrud exercitation..."

chunk 1 (tokens 0-500):       "Lorem ipsum dolor ... ut labore et"
chunk 2 (tokens 450-950):     "et dolore magna ... quis nostrud exer-"   ← 50-token overlap
chunk 3 (tokens 900-1400):    "exer-citation ... ad culpa qui"
                                ▲
                                broken word from previous chunk;
                                overlap means content shows up in
                                both chunks 2 and 3
```

#### Recursive splitting

The technical thing: split the document recursively along a hierarchy of separators. Try splitting on `\n\n` (paragraph breaks) first; if a resulting chunk is still too large, split it on `\n` (line breaks); if still too large, split on `. ` (sentence breaks); fallback to fixed-size if all else fails. LangChain's `RecursiveCharacterTextSplitter` is the canonical implementation. Bridge from frontend: this is the same shape as the CSS box model's collapse priority — try the outermost boundary first, fall back through inner boundaries. Concrete consequence: recursive splitting respects document structure for free — paragraphs stay together, sentences don't break mid-word. This is the default for ~80% of production RAG systems because it's fast, deterministic, and respects structure without requiring a model.

```
recursive splitting hierarchy

step 1: try splitting on \n\n (paragraphs)
        ├─ if all resulting chunks ≤ chunk_size, done
        └─ else, take the too-large chunk and recurse

step 2: try splitting on \n (lines)
        ├─ if all resulting chunks ≤ chunk_size, done
        └─ else, recurse

step 3: try splitting on ". " (sentences)
        ├─ if all resulting chunks ≤ chunk_size, done
        └─ else, fall back to fixed-size split

step 4: fixed-size split as last resort
```

#### Semantic chunking

The technical thing: use an embedding model to find natural topic boundaries. Embed each sentence; compute cosine similarity between adjacent sentences; place a chunk boundary wherever similarity drops below a threshold (e.g., 0.7). Bridge from frontend: this is closer to "find the natural section breaks in a Markdown document by looking at heading levels" — except the boundary detection is learned from the embedding model instead of read from markup. Concrete consequence: semantic chunking produces *topically-coherent* chunks — a chunk that starts with "Quicksort's average case..." doesn't end mid-paragraph with the start of "Mergesort, on the other hand,..." It's slower (you embed every sentence, then compare adjacent ones) and requires the embedding model to be loaded at chunking time, but the retrieval-quality lift is real on corpora with shifting topics.

```
semantic chunking — find boundaries via cosine similarity dips

sentences (embedded):    s1, s2, s3, s4, s5, s6, s7, s8

cosine(s1, s2) = 0.91     │ same topic
cosine(s2, s3) = 0.88     │ same topic
cosine(s3, s4) = 0.92     │ same topic
─────────────── 0.45 ─────┤ ◄── BOUNDARY (similarity drop)
cosine(s4, s5) = 0.85     │ new topic
cosine(s5, s6) = 0.89     │ new topic
─────────────── 0.52 ─────┤ ◄── BOUNDARY
cosine(s6, s7) = 0.84     │ another topic
cosine(s7, s8) = 0.91     │ same topic

resulting chunks:
  chunk 1: s1, s2, s3, s4
  chunk 2: s5, s6
  chunk 3: s7, s8
```

#### Chunk-size sweet spot

The technical thing: empirically, 300-500 tokens per chunk is the working range for most RAG systems on natural-language corpora. Smaller (50-150 tokens): chunks are too narrow; you lose context the LLM needs to use the chunk effectively. Larger (1000+ tokens): chunks are too broad; the embedding pools too many topics, retrieval gets noisy, and lost-in-the-middle bites the retrieved content. Bridge from frontend: this is the same shape as the "best content width is 50-75 characters" finding from typography — there's a sweet spot the field has converged on through measurement. Concrete consequence: start at 400 tokens, ~50-token overlap, recursive splitting. Tune from there based on eval-set measurements. Don't optimize without measuring.

```
chunk size vs retrieval quality (qualitative)

quality
  ▲
  │              ┌─── sweet spot ───┐
  │             ╱                    ╲
  │            ╱                      ╲
  │           ╱                        ╲
  │          ╱                          ╲
  │         ╱                            ╲
  │        ╱                              ╲___
  │   ____╱                                   ╲___
  │  ╱                                            ╲___
  └──────────────────────────────────────────────────▶ chunk size
  50  100  200  300  400  500  600  800  1K  2K  4K  10K
```

### Move 3 — The principle

The principle that generalises: *the chunk is the atom of retrieval, and atom size is a load-bearing decision*. Every retrieval-pipeline failure mode that isn't an embedding-model problem is a chunking problem. Chunks that are too big retrieve well but generate poorly (model has to find the answer in a long context); chunks that are too small generate well per-chunk but retrieve poorly (no chunk has enough context for the embedding to be specific). The senior move is to treat chunk size as a *measured* hyperparameter — eval set, ablation across chunk sizes, pick the size that wins on hit@K. The full picture is below.

---

## Chunking strategies — diagram

```
┌─ The four strategies and where each wins ───────────────────────────────┐
│                                                                         │
│   Fixed-size                                                            │
│   ──────────                                                            │
│   ┌──────────────────────────────────────────────────────┐             │
│   │ corpus → [500-tok chunk][500-tok chunk][500-tok ...] │             │
│   │ wins on: simplicity, deterministic, speed             │             │
│   │ loses on: breaks mid-sentence, ignores structure      │             │
│   └──────────────────────────────────────────────────────┘             │
│                                                                         │
│   Recursive splitting (the default)                                     │
│   ──────────────────                                                    │
│   ┌──────────────────────────────────────────────────────┐             │
│   │ try \n\n → try \n → try ". " → fall back to fixed     │             │
│   │ wins on: respects structure, deterministic, fast       │             │
│   │ loses on: still can produce topically-mixed chunks    │             │
│   │ default for ~80% of production RAG                    │             │
│   └──────────────────────────────────────────────────────┘             │
│                                                                         │
│   Semantic chunking                                                     │
│   ─────────────────                                                     │
│   ┌──────────────────────────────────────────────────────┐             │
│   │ embed sentences → find cosine dips → boundary there  │             │
│   │ wins on: topically-coherent chunks                    │             │
│   │ loses on: slower, requires embedding model at chunk   │             │
│   │           time, threshold tuning needed               │             │
│   └──────────────────────────────────────────────────────┘             │
│                                                                         │
│   Document-level (no chunking)                                          │
│   ─────────────────────────                                             │
│   ┌──────────────────────────────────────────────────────┐             │
│   │ one document = one chunk                              │             │
│   │ wins on: simplest possible, no chunking logic         │             │
│   │ loses on: coarse retrieval, lost-in-the-middle in     │             │
│   │           the retrieved chunk, hard to cite specific   │             │
│   │           passages                                    │             │
│   │ acceptable only for short documents (< 1K tokens)     │             │
│   └──────────────────────────────────────────────────────┘             │
│                                                                         │
│   ─────────────────────────────────────────────────────────────────    │
│                                                                         │
│   The sweet spot dimensions                                             │
│                                                                         │
│   ┌──────────────────────────────────────────────────────┐             │
│   │ chunk size:    300-500 tokens                         │             │
│   │ overlap:       ~50 tokens between adjacent chunks     │             │
│   │ strategy:      recursive splitting (default)          │             │
│   │ separators:    [\n\n, \n, ". ", " "]                  │             │
│   │ metric to tune:hit@3 on held-out eval set             │             │
│   └──────────────────────────────────────────────────────┘             │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

The diagram shows the four canonical strategies in increasing operational complexity (top to bottom). Most production systems live at "recursive splitting with 400-token chunks and 50-token overlap" and only move to semantic chunking when the eval set shows recall miss on specific edge cases.

---

## In this codebase

**Not yet implemented.** reincodes is a Next.js static-export DSA visualizer with zero AI surface in production code — no chunking pipelines, no corpora being indexed. The buildable target for this concept is below in Project exercises — a `/ai/chunking` page that renders the same source document chunked four different ways, with the retrieval results on a precomputed query set per strategy.

**Expected file paths** (when built):
- `src/app/ai/chunking/page.tsx` — the visualizer page
- `src/components/ChunkingVisualizer/` — strategy selector, document panel with colored chunk bands, retrieval result panel, query set runner
- `public/ai/chunking/strategy-comparison.json` — precomputed chunks + embeddings + retrieval results for 4 strategies on the same source document
- `scripts/precompute-chunking.ts` — build-time script that applies each chunking strategy, embeds chunks, runs the query set, records hit@K per strategy

---

## Elaborate

### Where this pattern comes from

Chunking became a named concern around 2022 when retrieval-augmented LLMs hit production. Earlier semantic search (Elasticsearch dense retrieval, sentence-transformers benchmarks) chunked documents but didn't have to coordinate with a downstream LLM's context window or generation quality. The RAG era forced the question: "what's the *right* unit to retrieve, given that the retrieval target then goes into an LLM prompt?" LangChain's `TextSplitter` family (2022-2023) standardized the recursive splitting pattern. Semantic chunking (using embeddings to find boundaries) emerged as a research-paper move in 2023 and became operational in 2024 via libraries like Greg Kamradt's `semantic-chunkers` and LlamaIndex's `SemanticSplitterNodeParser`. The current state (2026): recursive splitting is the default, semantic chunking is the next-level optimization, and Anthropic's "contextual chunking" (embed each chunk with a 50-100 token context-summary prefix) is the cutting-edge alternative for high-stakes retrieval.

### The deeper principle

The deeper principle is that *the unit of indexing determines the unit of retrieval determines the unit of generation*. The pipeline composes: chunk size → embedding granularity → retrieval target → LLM context payload. A decision at the first link constrains every link downstream. Treating chunking as a "later optimization" means committing to whatever you started with, because re-chunking forces re-embedding (which re-trains the whole vector store's geometry). Treating chunking as a first-class design decision — measured, ablated, documented — pays off because the whole pipeline downstream gets the right shape.

### Where this breaks down

The chunking framing breaks down for *code* and *structured data*. Code shouldn't be chunked by character count — it should be chunked by *AST boundaries* (functions, classes, modules) because that's where semantic coherence lives in code. Libraries like tree-sitter + custom splitters handle this. Structured data (JSON, CSV, XML) shouldn't be chunked as text at all — chunk by record, key, or schema-defined boundary. The recursive-splitting-on-text default fails on both. For mixed corpora (some text, some code), you need a router that picks the strategy per document type.

### What to explore next

- [01-embeddings](01-embeddings.md) → the parent — chunks become embeddings; chunk granularity determines embedding focus
- [02-embedding-model-choice](02-embedding-model-choice.md) → the model choice interacts with chunk size; some models work better at certain chunk sizes
- [05-dense-vs-sparse-retrieval](05-dense-vs-sparse-retrieval.md) → BM25's chunking sensitivity is different from dense retrieval's; hybrid retrieval may want different chunk sizes for each path
- [07-reranking](07-reranking.md) → reranking after retrieval is the mitigation when chunking-induced noise creeps into top-K
- [11-rag](11-rag.md) → the pipeline chunking slots into

---

## Tradeoffs

### Comparison table — both costs in one frame

```
┌──────────────────┬──────────────────────┬─────────────────────────┐
│ Cost dimension   │ Path taken           │ Alternative             │
│                  │ (recursive splitting,│ (document-level or      │
│                  │  300-500 tok chunks) │  fixed-size)            │
├──────────────────┼──────────────────────┼─────────────────────────┤
│ Setup cost       │ Pick chunker config  │ Trivial — embed each    │
│                  │ + token counts +     │ document whole          │
│                  │ separators           │                         │
│ Chunks per corpus│ ~30 per 10K-tok doc  │ 1 per document          │
│                  │ (more vectors stored)│                         │
│ Embedding cost   │ N chunks × per-1M    │ 1 × per-1M cost         │
│                  │ cost (10-30× more)   │                         │
│ Storage cost     │ 30× more vectors     │ 1× vectors              │
│ Retrieval        │ Focused chunks,      │ Coarse — whole doc      │
│                  │ better precision     │ retrieved per match     │
│ Generation       │ Clean context, easy  │ Large context, hard to  │
│                  │ to cite              │ cite specific passages  │
│ Re-chunking cost │ Full re-embed when   │ N/A — no chunks to redo │
│                  │ size changes         │                         │
│ Operational      │ Tune chunk size as a │ One less hyperparameter │
│ overhead         │ measured hyperparam  │                         │
└──────────────────┴──────────────────────┴─────────────────────────┘
```

### What we gave up (when planning the reincodes visualizer)

The first cost is *the 4-strategy precompute*. The visualizer's pedagogical value requires showing the *same source document* chunked 4 ways with each chunking's embeddings, retrieval results, and per-strategy hit@K. That means 4× the embedding work, 4× the storage in the bundle, and a precompute script that handles each strategy with its own quirks (semantic chunking needs sentence-level embeddings as input; document-level skips chunking entirely). Roughly one full day of precompute design before the page renders anything.

The second cost is *the eval-set design*. To make the strategy comparison meaningful, the visualizer needs a held-out query set with known-correct answers tied to *specific passages* in the source document — not just "the right document," but "the right paragraph within the right document." That's harder to design than a normal eval set because the granularity of ground truth has to match the chunk-size question being asked.

The third cost is *the static-export bundle hit*. Four chunking strategies × ~30 chunks per strategy × embeddings + chunk text = ~150-300KB of JSON in the route bundle. Code-splitting under `/ai/chunking` keeps it off the home page but the route is moderately heavy.

### What the alternative would have cost (skipping the visualizer)

If reincodes never builds `/ai/chunking`, the cost is zero in the codebase. The concept is documented here and reinforced in the RAG file. Production chunking lives at other portfolio projects (loopd's planned RAG over personal corpus). reincodes stays pure-DSA.

The cost of *not* building it shows up at the moment an interviewer asks "walk me through how you chose your chunking strategy." Without a visualizer, the candidate describes recursive splitting verbally. That's fine but weaker than "here's the visualizer — same document, four strategies, fixed-size hits 51% recall, recursive hits 67%, semantic hits 71%, document-level hits 43%."

### The breakpoint

The visualizer earns its place the day the candidate is preparing for an AI-focused interview where retrieval mechanics are likely to come up. Chunking is a recurring senior-level question because it's where most RAG systems leave accuracy on the table. The breakpoint is event-shaped.

### What wasn't actually a tradeoff

Skipping the per-strategy hit@K comparison was not a real option for the visualizer's pedagogical value. Without the measurement, the visualizer would just show four different ways to split a document — visually different, no clear winner. The whole point is *measurement-driven choice*, which requires the eval set and the per-strategy scores. Skipping the measurement collapses the visualizer into a "look at the colored bands" demo with no decision to teach.

---

## Tech reference (industry pairing)

### LangChain `RecursiveCharacterTextSplitter` (JS / Python)

- **Codebase uses:** not yet — would be the default chunker in the planned `/ai/chunking` precompute script. Configure with `chunk_size=400`, `chunk_overlap=50`, separators=`["\n\n", "\n", ". ", " ", ""]`.
- **Why it's here:** LangChain's recursive splitter is the de facto canonical implementation of recursive chunking in 2026 — battle-tested, well-documented, integrates with every downstream RAG component.
- **Leading today:** LangChain RecursiveCharacterTextSplitter — `adoption-leading` for recursive chunking, 2026.
- **Why it leads:** the configurable separator hierarchy, deterministic output, broad ecosystem support, and 3+ years of production use in thousands of deployments.
- **Runner-up:** LlamaIndex `SentenceSplitter` — `innovation-leading` for sentence-aware splitting; cleaner sentence boundary handling than character-based recursive splitting; gaining ground in LlamaIndex-native stacks.

### LlamaIndex `SemanticSplitterNodeParser`

- **Codebase uses:** not yet — would be the "semantic chunking" comparison candidate in the visualizer. Requires embedding model to be loaded at chunking time; produces chunks with topical coherence.
- **Why it's here:** LlamaIndex's implementation of semantic chunking is the most-deployed of the embedding-based chunkers in 2026 — well-integrated with their vector store layer, sensible default thresholds.
- **Leading today:** LlamaIndex SemanticSplitterNodeParser — `innovation-leading` for semantic chunking, 2026.
- **Why it leads:** integrated with the broader LlamaIndex retrieval stack, configurable similarity threshold, and matches the published "semantic chunking" research papers in approach.
- **Runner-up:** Greg Kamradt's `semantic-chunkers` library — `innovation-leading` for stand-alone semantic chunking; framework-agnostic, simpler API, but requires more wiring to integrate with a full RAG pipeline.

### tree-sitter + custom chunkers (for code corpora)

- **Codebase uses:** not yet — would be the code-corpus chunker if the visualizer ever extends to a "chunking for code" panel. Parse source files into an AST, chunk by function / class / module boundaries.
- **Why it's here:** code shouldn't be chunked by character count; tree-sitter's language grammars give you AST-level boundaries for ~30+ languages. The right answer for code corpora.
- **Leading today:** tree-sitter — `adoption-leading` for code parsing across IDE and tooling ecosystems, 2026.
- **Why it leads:** language coverage (30+ grammars), incremental parsing, the de facto standard for editor / language-server tooling (used by Neovim, GitHub, Anthropic's Code Search internally).
- **Runner-up:** language-specific parsers (e.g., `@babel/parser` for JS/TS, `ast` for Python) — `innovation-leading` per language; better depth for that language but no cross-language consistency; pick tree-sitter when the corpus is multi-language.

---

## Project exercises

### [B-reincodes-chunking-viz] Build the chunking strategies visualizer

- **Exercise ID:** `[B-reincodes-chunking-viz]` — derived from the curriculum's reincodes "interview prep surface" entry; aligns with Phase 2 concept `[C2.3]` (chunking strategies).
- **What to build:** a page at `/ai/chunking` that renders the same source document (a 5K-10K-token reincodes-themed essay on DSA, formatted with section headings and paragraphs) chunked four different ways: fixed-size, recursive splitting, semantic chunking, document-level. Each chunking renders as colored bands over the same document — the bands show *where the boundaries land*. Below each chunking is a hit@K scoreboard from a precomputed 10-query eval set. A query input lets the reader pick or type a query and see which chunk each strategy retrieves (with the retrieved chunk highlighted in the source document). The reader sees, in one interaction, why chunking matters and what the tradeoffs look like in practice.
- **Why it earns its place:** the visualizer makes the chunking question *visual and measurable* — the reader sees the chunk boundaries painted over the document, sees which chunk the retrieval picks per strategy, and sees the hit@K scoreboard that turns "recursive vs semantic" from an aesthetic choice into a measurement. The interview signal is that the candidate distinguishes "I picked a chunker" from "I measured chunker strategies and chose."
- **Files to touch:** `src/app/ai/chunking/page.tsx` (visualizer page), `src/components/ChunkingVisualizer/` (4-strategy band overlay, query input, retrieval-highlight, hit@K scoreboard), `public/ai/chunking/strategy-comparison.json` (4 chunkings × 10-query eval × retrieval results × hit@K), `scripts/precompute-chunking.ts` (build-time pipeline using LangChain's splitters + OpenAI embeddings + cosine retrieval). Add a row to `src/components/Home/conceptsData.tsx`'s `CONCEPT_CATEGORIES` under the `ai-engineering` category.
- **Done when:** the page loads at `/reincodes/ai/chunking/` in production, four chunking strategies render as colored bands on the same source document, the query input updates the retrieved-chunk highlight per strategy, the hit@K scoreboard shows precomputed scores. `next build` passes under `output: "export"`. Precompute script runs against OpenAI API (locally, total cost under $0.20).
- **Estimated effort:** 2-3 days. Source-document selection + eval-query design: half day. Precompute pipeline (4 chunkers + embed + retrieve + score): one day. Visualizer page + band overlay component: one day. Polish + cross-browser: half day.

---

## Summary

### Part 1 — concept recap

Chunking is the step that decides how a long document gets broken into the right-size pieces for embedding and retrieval. Four canonical strategies: fixed-size (simple, breaks mid-sentence), recursive splitting (the default, ~80% of production RAG, respects structure via separator hierarchy), semantic chunking (slower, embedding-driven, topically-coherent), document-level (no chunking, acceptable only for short documents). The sweet spot is 300-500 tokens per chunk with ~50-token overlap, using recursive splitting as the default. Chunking is the most-tweaked variable in RAG because the chunk is the atomic unit of retrieval — chunks that are too big retrieve well but generate poorly; chunks that are too small generate well but retrieve poorly. In reincodes the concept is *planned*; the buildable target is `/ai/chunking` — four chunking strategies applied to the same document with precomputed hit@K scores from a held-out query set, rendered as colored boundary bands. The static-export contract forces the precompute approach; the measurement-driven framing is the pedagogical payload.

### Part 2 — key points to remember

- **Four canonical strategies**: fixed-size, recursive splitting (default), semantic chunking, document-level. Use recursive splitting at 400 tokens with 50-token overlap unless measurement says otherwise.
- **The sweet spot**: 300-500 tokens per chunk. Smaller = retrieve well, generate poorly. Larger = retrieve poorly, generate well.
- **The chunk is the atom of retrieval**: chunk size determines embedding focus determines retrieval target determines LLM context payload. Pipeline downstream is constrained by chunk decision.
- **Tuning is measured**: ablate chunk sizes (200, 400, 800) on the eval set and pick the size that wins on hit@K. Don't optimize without measurement.
- **Code is different**: chunk by AST boundaries (tree-sitter), not by character count. Recursive text splitting fails on code.
- **The reincodes shape**: implementation is Case B; buildable target is `/ai/chunking` — 4-strategy band overlay on the same source document with precomputed hit@K scoreboard.

---

## Interview defense

### What an interviewer is really asking

Behind "how do you chunk your documents?" the interviewer is probing whether the candidate has *measured* their chunking or just *picked* a chunking. A junior answer names a strategy ("I use recursive splitting at 500 tokens"). A senior answer describes the *measurement process*: "I started with recursive splitting at 400 tokens with 50 overlap, ran my eval set, ablated chunk sizes at 200, 400, 800, picked the size that won hit@5, and documented the choice. I'd move to semantic chunking only if a specific failure mode in the eval set pointed to topically-mixed chunks." The interviewer is checking whether the candidate distinguishes "I read the LangChain docs" from "I ran the experiment."

### Likely questions

**Q (mid):** What chunk size do you use?

A: It depends on the corpus, but my starting point is 400 tokens with 50 tokens of overlap, using recursive splitting on `["\n\n", "\n", ". ", " "]` separators. That's the empirical sweet spot for natural-language corpora — small enough that each chunk's embedding is focused on a specific topic, large enough that the retrieved chunk gives the LLM useful context. From that baseline, I run an eval set with at least 3 ablations (200 tokens, 400 tokens, 800 tokens) and pick the size that wins on hit@5. If the eval set shows specific failures where the right answer was split across a chunk boundary, that's the signal to either increase overlap or switch to semantic chunking. If the eval set shows the right chunk being retrieved but the model couldn't use it because the chunk was too narrow, that's the signal to increase chunk size.

**Q (senior):** When do you reach for semantic chunking over recursive splitting?

A: When the eval set shows retrieval failures specifically tied to *topically-mixed chunks*. The diagnostic: look at the retrieved chunks for failing queries; if you see chunks where the right topic is *one of several* in the chunk and the embedding pooled them all together, recursive splitting picked a boundary at a paragraph break that happened to span topics. Semantic chunking would have placed the boundary at the topic shift instead. The cost is real — semantic chunking requires embedding every sentence in the corpus at chunk time, then comparing adjacent sentences, which is 5-10× more expensive than recursive splitting. The lift is also real, typically 5-10 percentage points on hit@K for corpora with shifting topics (long-form articles, technical documentation with mixed sub-topics per section). For corpora with strong structural signals (markdown headings, code with function boundaries), structure-aware chunking via tree-sitter or markdown parsers usually beats semantic chunking at lower cost.

```
when to use semantic chunking

recursive splitting OK              semantic chunking earns place
─────────────────────               ─────────────────────────────
docs with markdown headings         long-form articles, mixed topics
docs with stable paragraph topics   transcripts with shifting subjects
code (use tree-sitter instead)      narrative text with no clear sections
short docs, < 2K tokens             docs > 5K tokens with no headings
high-throughput indexing            high-stakes retrieval, lower throughput
```

**Q (arch):** At 10× scale — say, 10M documents — does the chunking strategy still matter, or do you just use whatever the framework gives you?

A: It matters more, not less. At 10M docs, the cost of *re-chunking and re-embedding* the whole corpus is non-trivial — easily $5-50K of embedding spend and weeks of throttled API time. Picking the chunking strategy carelessly means committing to it for at least 6-12 months. The eval set discipline becomes the production-engineering investment: you build a held-out query set that's representative of real user queries, you ablate chunk sizes against it, you document the choice with the measurement attached, and you make re-chunking a planned operation rather than an emergency response to a quality regression. The strategy that scales is *recursive splitting at the measured-optimal size* — fast enough to chunk 10M docs in hours, deterministic enough to reproduce, structured enough to respect document boundaries. Semantic chunking at 10M doc scale is uncommon because the chunking cost (embedding every sentence) becomes a meaningful fraction of total infrastructure cost.

```
10M-doc chunking economics (rough)

recursive splitting              semantic chunking
─────────────────────            ─────────────────────
chunk time: ~2 hours              chunk time: ~24 hours
embed cost: ~$200                 embed cost: ~$1000 (sentence-level
                                                       embeddings used
                                                       in chunking too)
chunks produced: ~300M            chunks produced: ~250M (fewer but
                                                          topically-coherent)
re-chunking event: ~$1K, day     re-chunking event: ~$5K, multi-day
```

### The question candidates always dodge

**Q:** Why not just throw the whole document into the LLM context and skip chunking entirely? The 1M-context models handle it.

A: That argument confuses three different costs. First, retrieval: even with a 1M-token context, you still need to retrieve the right documents because the corpus is bigger than the window; chunking is the unit of *retrieval*, not just the unit of *context*. Second, cost: passing 200K tokens of "all the documents that might be relevant" through the LLM costs ~$0.40 per call at Claude Sonnet 4.7 input prices; passing 5 chunks × 400 tokens = 2K tokens is ~$0.005 per call — 80× cheaper. Third, attention: lost-in-the-middle still applies even at 1M context; if the right answer is at position 500K, the model attends to it less reliably than if the right answer is in a focused 400-token chunk at position 5K. The cost ledger:

```
dump all docs in 1M window           chunked retrieval (5 × 400 tokens)
─────────────────────────────        ────────────────────────────────────
+ no chunking pipeline                + chunking pipeline + eval set
- $0.40 input cost per call           + $0.005 input cost per call
- 5-30s latency                       + 1-3s latency
- lost-in-the-middle at scale         + focused chunks at HIGH-attention
- no audit of "which fact"            + chunks logged → reproducible
- model swap re-embeds nothing        + model swap re-embeds the chunks
- corpus growth → "we exceeded 1M"    + corpus growth → more retrieval,
                                        same context budget
```

The honest answer: bigger windows don't replace chunking; they relax the *upper bound* on chunk size but the *retrieval economics* still favor focused chunks. Skipping chunking means paying 80× more per call for worse quality. The interview move is naming the three different costs (retrieval, dollar, attention) rather than treating "big context" as a unified answer.

### One-line anchors

- "The chunk is the atom of retrieval. Chunk size determines embedding focus, retrieval target, and LLM context payload."
- "Default: recursive splitting at 400 tokens, 50-token overlap. ~80% of production RAG lives here."
- "Sweet spot: 300-500 tokens per chunk. Smaller = retrieve well, generate poorly. Larger = retrieve poorly, generate well."
- "Reach for semantic chunking when the eval set shows topically-mixed chunks specifically. Otherwise recursive wins on cost."
- "Code chunks by AST (tree-sitter), not by character count. Recursive text splitting fails on code."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw the four chunking strategies from memory: fixed-size, recursive splitting, semantic chunking, document-level. For each, note one strength and one weakness.

✓ Pass: four strategies named, strengths and weaknesses paired correctly
✗ Fail: re-read the primary diagram, wait 10 minutes, try again

### Level 2 — Explain it out loud

Explain chunking strategies to a colleague who has just been asked to set up RAG over their company's documentation. No notes. Under 90 seconds.

Checkpoints — did you:
- Name the sweet-spot chunk size (300-500 tokens)?
- Recommend recursive splitting as the default?
- Mention overlap and why it matters?
- Name when to reach for semantic chunking (eval set shows topically-mixed chunks)?
- Reference the buildable target (`/ai/chunking` visualizer)?

If you skipped any: you described the strategies, you didn't argue for the choice process.

### Level 3 — Apply it to a new scenario

A planned reincodes feature: a "search across the visualizer guides" feature that indexes the inline pseudo-code, the prose explanations, and the spec.md files. The corpus is ~30 documents, ranging from 500 tokens (short visualizer notes) to 15K tokens (the long DSA primers).

Design the chunking strategy. Which strategy? What chunk size? Why? How would your eval set look? What ablations would you run?

Write your answer (5+ sentences). Then verify against the `## How it works` section's sweet-spot reasoning.

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff from the Tradeoffs section. Answer in writing: "If I were starting the `/ai/chunking` visualizer today with a $1 build-time API budget, would I still embed all four chunkings, or would I cut to two (recursive and semantic) and lean on the literature for fixed-size and document-level? Why? What does each choice cost?"

Reference the actual code:
→ Point to where the precompute script lives (`scripts/precompute-chunking.ts`)
→ Point to `next.config.ts` for the static-export contract

There is no right answer. The point is specificity.

### Quick check — code reference test

Without opening any files, answer:
- What's the default chunking strategy for ~80% of production RAG systems?
- What's the sweet-spot chunk size range?
- What library do you reach for to chunk code by AST boundaries?

Then verify by re-reading the `## How it works` section.

✓ Pass: "recursive splitting", "300-500 tokens", "tree-sitter"
✗ Fail on details: that's fine — the shape is what matters. Names should be recoverable from the strategies.
