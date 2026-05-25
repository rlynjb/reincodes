# Embeddings

**Industry name(s):** Embeddings, vector embeddings, dense representations, semantic vectors
**Type:** Industry standard

> The model's view of meaning as a fixed-length vector — the primitive every retrieval system, recommendation engine, and semantic-search feature reduces to.

**See also:** → [02-embedding-model-choice](02-embedding-model-choice.md) · → [04-vector-databases](04-vector-databases.md) · → [05-dense-vs-sparse-retrieval](05-dense-vs-sparse-retrieval.md) · → [11-rag](11-rag.md) · → [../00-overview](../00-overview.md)

---

## Why care

### Move 1 — The grounded scenario

You've built a search box for the visualizer site. A user types "how fast is quicksort" and you do the obvious thing — `string.includes("quicksort")` against the page titles. It works for the literal match. Then a user types "the partition sort" or "Hoare's algorithm" and gets zero results. You add some manual aliases. The next user types "the one with the pivot." The aliases don't scale; you're playing whack-a-mole with vocabulary. What you needed was a way for the *meaning* of "the one with the pivot" to match the *meaning* of "quicksort" — not the strings, the concepts they're pointing at.

### Move 2 — Name the question

That match-by-meaning question has a name — *embeddings*. Not the keyword index, not the regex, not the LLM call — just the question of *can I represent the meaning of a string as a thing I can compare to the meaning of another string?* An embedding is a fixed-length vector — typically 384, 768, 1536, or 3072 floats — produced by an embedding model that has been trained so that semantically-similar inputs end up at nearby points in vector space. Cosine similarity between two embeddings is the standard metric for "how close in meaning."

### Move 3 — Why answering that question matters

**Why you need to answer that question at all:** because *every retrieval system that handles natural language reduces to "find the things whose meaning is closest to this query's meaning,"* and that question is unanswerable without a meaning-as-vector primitive. RAG depends on it (retrieve chunks whose embeddings are close to the query embedding). Recommendation depends on it (recommend items whose embeddings are close to the user's prior items). Deduplication depends on it (collapse items whose embeddings are nearly identical). Without embeddings, the whole stack collapses back to keyword matching, which collapses back to manual aliases, which collapses back to "we don't have search." I have shipped features where the difference between "the embedding model is good enough" and "the embedding model is wrong for this domain" was 20 percentage points of recall — same retrieval pipeline, same downstream LLM, just a different vector representation, completely different product.

### Move 4 — Concrete before/after

Without embeddings (keyword-only search):

- "quicksort" matches; "the partition sort" doesn't
- "Hoare's algorithm" doesn't match unless you build a synonym dictionary
- Synonyms are a manual maintenance burden — every new vocabulary needs a new entry
- Domain jargon (a specific company's terminology) requires per-customer customization
- Conceptual queries ("the algorithm with the pivot") never work

With embeddings:

- "quicksort", "the partition sort", "Hoare's algorithm", "the one with the pivot" all produce embeddings near the canonical quicksort page's embedding
- Cosine similarity ≥ 0.7 (or whatever threshold) returns the right page
- New vocabulary is handled by the embedding model's training data, not a manual dictionary
- Quality scales with the embedding model, not with manual effort
- Failures are explainable (cosine distance is a number)

### Move 5 — The one-line summary

An embedding is the LLM's `JSON.stringify` for meaning — a deterministic transformation from a string of text into a fixed-length vector of floats where the geometry encodes the semantic content. The full mechanics are below.

---

## How it works

### Move 1 — The mental model

An embedding model is a function `embed: string → float[N]` where N is fixed per model (384, 768, 1536, 3072). The function is deterministic — the same input string always produces the same output vector. The vectors live in a high-dimensional space where the trained property is: strings that mean similar things have vectors that point in similar directions (high cosine similarity), strings that mean different things have vectors that point in different directions (low cosine similarity).

The strategy: embed your corpus once, store the vectors, and answer "find the most-similar to query X" by embedding X and running cosine similarity against the stored vectors.

```
Embedding model as a function: string → vector

   "quicksort"                    ┌───────────────────────────┐
        │                         │   embedding model         │
        ▼                         │   (text-embedding-3-small)│
   ┌─────────────┐                │                           │
   │ tokenizer   │ ───────────────▶│   transformer encoder    │
   └─────────────┘   tokens        │                           │
                                   │            │              │
                                   │            ▼              │
                                   │   ┌──────────────┐        │
                                   │   │ pool tokens  │        │
                                   │   │ to fixed-len │        │
                                   │   └──────────────┘        │
                                   │            │              │
                                   └────────────│──────────────┘
                                                ▼
                              [0.012, -0.341, 0.087, ..., 0.234]
                                       1536 floats
```

### Move 2 — The layered walkthrough

#### The vector itself

The technical thing: an embedding is a 1-D array of floats. The length (N) is fixed per model — OpenAI's `text-embedding-3-small` returns N=1536, `text-embedding-3-large` returns N=3072, sentence-transformers' `all-MiniLM-L6-v2` returns N=384. The values are typically in [-1, +1] (the vectors are normalized to unit length by most modern models, so cosine similarity reduces to dot product). Bridge from frontend: this is the same shape as a fixed-size hash output — a deterministic, fixed-length representation of input content. Concrete consequence: pick the model first; the dimension count then dictates storage cost and similarity-search cost. A million 1536-dim float32 vectors is ~6GB at full precision; the same million 384-dim vectors is ~1.5GB.

```
vector shape per model (2026)

text-embedding-3-small        [0.012, ..., 0.234]   N=1536
text-embedding-3-large        [0.087, ..., 0.119]   N=3072
voyage-3                      [0.041, ..., 0.176]   N=1024
all-MiniLM-L6-v2              [0.205, ..., 0.082]   N=384
mxbai-embed-large-v1          [0.034, ..., 0.291]   N=1024
gemini-embedding-001          [0.061, ..., 0.183]   N=3072
```

#### Cosine similarity — the comparison metric

The technical thing: given two embeddings `a` and `b`, cosine similarity is `dot(a, b) / (||a|| × ||b||)`. For normalized embeddings (unit length), this simplifies to just `dot(a, b)`. The output is a scalar in [-1, +1] where 1 means "identical direction" (high semantic similarity) and -1 means "opposite direction" (semantically antonymous, though rare in practice). Bridge from frontend: this is the same intuition as comparing color hex codes by their RGB distance — except the space is 1536-dimensional and the geometry was learned, not assigned. Concrete consequence: cosine similarity is the *standard* metric because it ignores vector magnitude and only compares direction. For non-normalized embeddings, Euclidean distance is sometimes used instead, but cosine is the convention.

```
cosine similarity intuition

         direction(quicksort)
              ▲
              │  ●  embedding(partition sort)
              │
              │      cos(θ) = 0.89
              │      ●  embedding(Hoare's algorithm)
              │   θ
              │ ─────── ▶ direction(query)
              │
              │
              │       ●  embedding(bubble sort)
              │       cos(θ) = 0.41
              │
              └────────────────────────────────▶

higher cosine = closer in direction = more semantically similar
```

#### Per-token vs per-sentence embeddings

The technical thing: embedding models come in two flavors. *Token-level* embeddings (from a model like BERT used raw) produce one vector per input token; you have to pool them yourself (mean, [CLS] token, attention-weighted) to get a single vector per input. *Sentence-level* embeddings (OpenAI's `text-embedding-3-*`, Cohere, Voyage, sentence-transformers) pool internally and return one vector per input string. For retrieval, you want sentence-level — one input, one vector. Bridge from frontend: this is the same shape as "render a list" (per-item state) vs "render an aggregate" (one summary statistic) — sentence-level is the aggregate. Concrete consequence: when picking an embedding model, "sentence-level out of the box" should be the default. Token-level only earns its place when you need per-word semantics (rare in production retrieval).

```
per-token (raw BERT)              per-sentence (text-embedding-3)
────────────────────              ──────────────────────────────
input: "quicksort is fast"        input: "quicksort is fast"
       ↓                                 ↓
[tok1, tok2, tok3]                [single 1536-dim vector]
       ↓ pool yourself
[single vector]

3 token vectors → 1 sentence       1 input → 1 vector, ready to compare
needs pooling decision             no pooling decision
```

#### "Semantic similarity" ≠ "logical entailment"

The technical thing: high cosine similarity means the two inputs are *about similar things*, not that one *implies* the other. "Quicksort is O(n log n)" and "Quicksort is O(n²)" have very high cosine similarity (both about quicksort's complexity) but they are *contradictory*. The embedding model doesn't know one is true and one is false; it knows they're talking about the same topic. Bridge from frontend: this is the same trap as confusing "two URLs that look similar" with "two URLs that point to the same resource" — the surface form matches; the meaning may not. Concrete consequence: embeddings are great for *retrieval* (find related content) but they don't do reasoning. The retrieved-relevant chunks still need an LLM (or a logic system) to actually determine *which* of the related-but-contradictory facts is correct.

### Move 3 — The principle

The principle that generalises: *meaning is a vector*. This is one of the foundational moves of deep learning — embeddings showed up in word2vec (2013), GloVe (2014), and BERT (2018) before becoming the canonical primitive for retrieval in 2022. The deeper principle is that *similarity is a geometric question, not a string-matching question*, and once you have a geometry of meaning, every downstream task that involves "similar to X" becomes a vector operation rather than a string operation. The full picture is below.

---

## Embeddings — diagram

```
┌─ Embeddings as a function and a geometry ───────────────────────────────┐
│                                                                         │
│   The function                                                          │
│                                                                         │
│   ┌──────────────────────────────────────────────────────────────────┐  │
│   │                                                                  │  │
│   │   input: "the algorithm with the pivot"                          │  │
│   │       │                                                          │  │
│   │       ▼                                                          │  │
│   │   ┌────────────────┐                                             │  │
│   │   │ tokenize       │                                             │  │
│   │   └────────────────┘                                             │  │
│   │       │                                                          │  │
│   │       ▼                                                          │  │
│   │   ┌────────────────┐                                             │  │
│   │   │ encoder        │  trained transformer that maps              │  │
│   │   │ (transformer)  │  tokens → contextual vectors                │  │
│   │   └────────────────┘                                             │  │
│   │       │                                                          │  │
│   │       ▼                                                          │  │
│   │   ┌────────────────┐                                             │  │
│   │   │ pooling        │  mean / CLS / attention-weighted            │  │
│   │   └────────────────┘                                             │  │
│   │       │                                                          │  │
│   │       ▼                                                          │  │
│   │   [0.012, -0.341, 0.087, ..., 0.234]   ← single 1536-dim vector  │  │
│   │                                                                  │  │
│   └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│   The geometry (2D projection via t-SNE / UMAP for visualization)       │
│                                                                         │
│   ┌──────────────────────────────────────────────────────────────────┐  │
│   │                                                                  │  │
│   │           sorting                                                │  │
│   │              ●  quicksort                                        │  │
│   │              ●  mergesort                                        │  │
│   │              ●  heapsort                                         │  │
│   │              ●  the partition sort  ← clusters with quicksort    │  │
│   │              ●  the algorithm with the pivot                     │  │
│   │                                                                  │  │
│   │                                              graphs              │  │
│   │                                                ●  Dijkstra       │  │
│   │                                                ●  BFS            │  │
│   │                                                ●  DFS            │  │
│   │       trees                                    ●  shortest path  │  │
│   │         ●  BST insert                                            │  │
│   │         ●  AVL balance                                           │  │
│   │         ●  red-black                                             │  │
│   │                                                                  │  │
│   └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│   Cosine similarity between two vectors = how close their directions    │
│   are in the high-dim space (visualized via 2D projection).             │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

The diagram shows the two halves of the concept: the *mechanical* half (input string → embedding model → fixed-length vector) and the *geometric* half (semantically-related strings cluster together in vector space). Production retrieval uses the geometric half to answer "find the K closest to this query."

---

## In this codebase

**Not yet implemented.** reincodes is a Next.js static-export DSA visualizer with zero AI surface in production code — there are no embeddings being computed, no vector store, no retrieval pipelines. The existing study guide already names `/ai/embeddings` as one of the planned visualizers (see `00-overview.md`'s "planned surface" diagram); this file is the conceptual study that surfaces what the visualizer would teach. The buildable target is below in Project exercises.

**Expected file paths** (when built):
- `src/app/ai/embeddings/page.tsx` — the visualizer page
- `src/components/EmbeddingsVisualizer/` — 2D t-SNE projection rendered via D3 (already in the dependency list), hover-to-highlight, click-to-show-nearest-neighbors
- `public/ai/embeddings/sentences.json` — 20 precomputed sentence embeddings with their original text and pre-projected 2D coordinates
- `scripts/precompute-embeddings.ts` — build-time script that calls OpenAI's `text-embedding-3-small`, runs t-SNE in the script (not the browser), commits the JSON

---

## Elaborate

### Where this pattern comes from

The embedding-as-vector pattern goes back to word2vec (Mikolov et al., 2013), which trained a small neural network to predict surrounding words and discovered that the trained word vectors had striking geometric properties — `king - man + woman ≈ queen` in the trained space. GloVe (Pennington et al., 2014) made the geometry explicit by training against co-occurrence statistics. BERT (Devlin et al., 2018) generalized to contextual embeddings — the same word in different sentences gets different vectors. Sentence-transformers (Reimers & Gurevych, 2019) made the sentence-level embedding ergonomic. OpenAI's `text-embedding-ada-002` (2022) was the first widely-deployed production embedding API. The current generation (text-embedding-3, Voyage, Cohere v3) is the convergence of all of these — sentence-level, contextual, API-served, optimized for cosine similarity.

### The deeper principle

The deeper principle is *representation learning* — the idea that the right way to handle high-dimensional unstructured data (text, images, audio) is to learn a function that maps it to a lower-dimensional structured space where downstream tasks become tractable. Embeddings are the textual instance of this principle; image embeddings (CLIP, ViT features) are the visual instance; audio embeddings (wav2vec) are the auditory instance. The whole modern AI stack reduces to "embed things into a learned space, then run geometry on that space." Retrieval is one application; classification, clustering, and generation are others.

### Where this breaks down

Embeddings break down on three specific patterns. First, *exact-match keyword queries* — an embedding for "ZIP code 94103" is close to embeddings for other addresses; you'd retrieve nearby addresses, not the *exact* one. BM25 (sparse retrieval) beats dense retrieval here; cross-reference [05-dense-vs-sparse-retrieval](05-dense-vs-sparse-retrieval.md). Second, *very short inputs* — embeddings of 1-3 word inputs are noisier than embeddings of full sentences, because the model has less context to disambiguate. Third, *adversarial similarity* — an embedding can be high-cosine to its negation ("the sky is blue" vs "the sky is not blue") because both are about-the-sky statements; the model doesn't reliably encode negation. Each of these is mitigated by composing embeddings with another technique (hybrid retrieval, query rewriting, downstream LLM reasoning).

### What to explore next

- [02-embedding-model-choice](02-embedding-model-choice.md) → which embedding model to use — dimension tradeoffs, domain-specific vs general
- [03-chunking-strategies](03-chunking-strategies.md) → how to break documents into embed-able units
- [04-vector-databases](04-vector-databases.md) → where the embeddings get stored and how nearest-neighbor search works
- [05-dense-vs-sparse-retrieval](05-dense-vs-sparse-retrieval.md) → when embeddings (dense) are the wrong tool and BM25 (sparse) is better
- [11-rag](11-rag.md) → the canonical pipeline embeddings show up in

---

## Tradeoffs

### Comparison table — both costs in one frame

```
┌──────────────────┬──────────────────────┬─────────────────────────┐
│ Cost dimension   │ Path taken           │ Alternative             │
│                  │ (embedding-based     │ (keyword-only search)   │
│                  │  semantic search)    │                         │
├──────────────────┼──────────────────────┼─────────────────────────┤
│ Setup cost       │ Pick model, embed    │ Build inverted index    │
│                  │ corpus, store        │ (5 lines of code)       │
│                  │ vectors              │                         │
│ Per-query cost   │ Embed query +        │ Inverted-index lookup   │
│                  │ vector search        │ (microseconds)          │
│ Storage cost     │ N × dim × 4 bytes    │ Inverted index (small)  │
│                  │ (e.g., 1M × 1536 ×   │                         │
│                  │  4 = ~6GB)           │                         │
│ Query quality —  │ "Hoare's algorithm"  │ Zero results unless     │
│ paraphrases      │ matches "quicksort"  │ explicit alias added    │
│ Query quality —  │ Approximate, may not │ Exact match works       │
│ exact strings    │ surface exact match  │ perfectly               │
│ Operational      │ Re-embed on model    │ Rebuild index on        │
│ overhead         │ upgrade or corpus    │ corpus edit             │
│                  │ edit                 │                         │
│ Domain adapt     │ Pick domain model    │ Add domain dictionary   │
│                  │ or fine-tune base    │ entries                 │
│ Failure mode     │ Returns related-but- │ Returns nothing on      │
│                  │ wrong (the negation  │ vocabulary mismatch     │
│                  │ problem)             │                         │
└──────────────────┴──────────────────────┴─────────────────────────┘
```

### What we gave up (when planning the reincodes visualizer)

The first cost is *precompute spend and time*. The visualizer needs 20+ sentence embeddings to render a meaningful 2D projection. At OpenAI's `text-embedding-3-small` pricing (~$0.02 per 1M tokens), embedding 20 short sentences is negligible — under a cent. The 2D projection step (t-SNE or UMAP) is where the work is: it has to run in the precompute script (Python, since JS implementations of t-SNE are slower/less mature), then the resulting 2D coordinates ship as JSON. Tooling complexity: the precompute script needs both a Node toolchain (for OpenAI calls and JSON output) and a Python toolchain (for t-SNE via scikit-learn). Roughly half a day of pipeline setup before the page renders anything.

The second cost is *the 2D projection is a lie*. t-SNE and UMAP are great for *visualization* but they distort distances — two points that look close in 2D may not actually be close in the original 1536-dim space, and vice versa. The visualizer has to either show this honestly (a footnote: "2D projection for visualization; cosine similarity is computed in the original 1536-dim space") or risk reinforcing a wrong intuition.

The third cost is *the same static-export bundle constraint*. 20 sentences × 1536 floats × 4 bytes/float = ~120KB of raw embedding data, plus the 2D projected coords, plus the source sentences. Code-splitting under `/ai/embeddings` keeps it off the home page bundle, but the route itself is heavier than most reincodes pages.

### What the alternative would have cost (skipping the visualizer)

If reincodes never builds `/ai/embeddings`, the cost is zero in the codebase. The concept is documented here and cross-referenced from the RAG file. Production embedding usage lives at other portfolio projects (loopd's planned RAG over personal corpus, per the curriculum). reincodes stays pure-DSA.

The cost of *not* building it shows up at the moment an interviewer asks "explain embeddings to a non-technical PM." Without a visualizer, the candidate describes the geometry verbally — perfectly fine for a strong candidate, but weaker than "here's the 2D projection, watch what happens when I hover over 'the partition sort' and the 'quicksort' cluster lights up."

### The breakpoint

The visualizer earns its place the day the candidate is preparing for an AI-focused interview round that includes retrieval/RAG questions. Embeddings are the most-fundamental retrieval primitive; a visualizer demonstrating intuition for the geometry is a strong interview signal. The breakpoint is event-shaped.

### What wasn't actually a tradeoff

Computing embeddings in the browser via WASM-compiled embedding models was not a real option. Embedding models small enough to run in the browser (~100MB compressed) are 5–10× lower quality than the production API models — they're useful for prototyping but they'd undermine the visualizer's pedagogical value because the geometry would be different from what the reader would see in production. The precompute-at-build-time path with a real production API is the right call.

---

## Tech reference (industry pairing)

### OpenAI `text-embedding-3-small` / `-large`

- **Codebase uses:** not yet — the planned `/ai/embeddings` precompute script would call `openai.embeddings.create({ model: "text-embedding-3-small", input: sentences })` against 20 reincodes-themed sentences (DSA topics, algorithm names, paraphrases) and commit the 1536-dim vectors plus a 2D projection.
- **Why it's here:** OpenAI's text-embedding-3 family is the de facto production embedding API in 2026 — strong quality across general-purpose text, generous rate limits, and the cheapest dollar-per-million-tokens of any commercial provider.
- **Leading today:** OpenAI text-embedding-3 — `adoption-leading` for general-purpose embeddings, 2026.
- **Why it leads:** consistent quality across domains, the `dimensions` parameter (request fewer dimensions to save storage), and the largest existing tooling ecosystem (LangChain, LlamaIndex, every vector DB integration).
- **Runner-up:** Voyage AI `voyage-3` — `innovation-leading` for retrieval-specific embeddings; consistently tops the MTEB retrieval leaderboard; the choice when retrieval quality is the priority and you're not blocked on ecosystem integrations.

### Cohere `embed-english-v3.0` / `embed-multilingual-v3.0`

- **Codebase uses:** not yet — would be the cross-provider comparison anchor if the `/ai/embeddings` visualizer ever ships with a "same sentences, three embedding models" panel.
- **Why it's here:** Cohere's embed-v3 family has strong multilingual coverage (100+ languages) and the explicit `input_type` parameter ("search_query", "search_document", "classification") that bakes the use case into the embedding.
- **Leading today:** Cohere embed-v3 — `innovation-leading` for typed-input embeddings, 2026.
- **Why it leads:** the `input_type` parameter is a real differentiator — it tells the model "embed this for the role it will play" rather than asking for a generic representation, and the resulting embeddings perform meaningfully better on asymmetric retrieval tasks (where queries and documents have different structures).
- **Runner-up:** OpenAI `text-embedding-3-large` — `adoption-leading` for general-purpose embeddings; less specialized but broader ecosystem support.

### sentence-transformers (open-source, locally-runnable)

- **Codebase uses:** not yet — would be the fallback if the visualizer ever needs *local* embedding (no API calls) for a privacy-sensitive feature or to demonstrate self-hosted retrieval.
- **Why it's here:** the canonical open-source embedding library; `all-MiniLM-L6-v2` is the most-downloaded embedding model on HuggingFace Hub. Useful for local prototyping and for the "you can embed without an API" narrative.
- **Leading today:** sentence-transformers — `adoption-leading` for open-source / self-hosted embeddings, 2026.
- **Why it leads:** the largest selection of pre-trained embedding models on Hugging Face, the simplest Python API (`model.encode(texts)`), and the de facto choice for ML engineers who want to swap models freely.
- **Runner-up:** `fastembed` (Qdrant's ONNX-runtime embedding library) — `innovation-leading` for local embedding inference; smaller bundle, ONNX runtime means it runs in Node and Rust without a Python dependency. The choice for JS/TS projects that need local embeddings without bundling a Python environment.

---

## Project exercises

### [B-reincodes-embeddings-viz] Build the embeddings visualizer

- **Exercise ID:** `[B-reincodes-embeddings-viz]` — derived from the curriculum's reincodes "interview prep surface" entry; aligns with Phase 2 concept `[C2.1]` (what an embedding is geometrically) and Phase 2 concept `[C2.9]` (embedding visualization — t-SNE vs PCA).
- **What to build:** a page at `/ai/embeddings` that renders 20 precomputed sentence embeddings as points in a 2D t-SNE projection (rendered via D3, already a project dependency). The sentences are reincodes-themed (DSA topics, algorithm names, paraphrases). Hovering a point shows the sentence; clicking a point highlights the top-3 nearest neighbors by cosine similarity (computed in the original 1536-dim space, not the 2D projection) with lines drawn to them. A footnote panel explains the 2D-projection caveat ("close in 2D ≠ close in vector space; cosine is computed in original 1536-dim").
- **Why it earns its place:** the visualizer makes the *geometry of meaning* visceral — the reader sees paraphrases ("the partition sort", "the algorithm with the pivot") cluster with "quicksort" while "bubble sort" lives elsewhere. The interview signal is that the candidate teaches embeddings *through visualization*, not through hand-waving about "vectors of meaning."
- **Files to touch:** `src/app/ai/embeddings/page.tsx` (visualizer page), `src/components/EmbeddingsVisualizer/` (D3-based 2D scatter, hover and click handlers, neighbor highlighting), `public/ai/embeddings/sentences.json` (20 sentences + 1536-dim embeddings + 2D projection coords + precomputed top-3 neighbors per sentence), `scripts/precompute-embeddings.ts` + a small Python helper `scripts/project-tsne.py` (build-time pipeline). Add a row to `src/components/Home/conceptsData.tsx`'s `CONCEPT_CATEGORIES` under the `ai-engineering` category.
- **Done when:** the page loads at `/reincodes/ai/embeddings/` in production, 20 points render in a 2D scatter, hover shows the sentence, click highlights top-3 neighbors with lines and similarity scores, the 2D-projection footnote is visible. `next build` passes under `output: "export"`. Precompute script runs against OpenAI API (locally, total cost under $0.01).
- **Estimated effort:** 1–2 days. Precompute pipeline (OpenAI call + t-SNE + JSON shape): half day. Visualizer page + D3 scatter with interaction: half to one day. Polish + footnote panel + cross-browser: half day.

---

## Summary

### Part 1 — concept recap

An embedding is a fixed-length vector that represents the meaning of a string of text — produced by a trained embedding model, deterministic, comparable to other embeddings via cosine similarity. Embeddings are the primitive every modern retrieval system reduces to: instead of matching strings (keyword search), match vectors (semantic search). The same input always produces the same vector; semantically-related inputs produce vectors with high cosine similarity (closer in direction); semantically-different inputs produce vectors with low cosine similarity. In reincodes the concept is *planned* rather than implemented; the buildable target is `/ai/embeddings` — a 2D t-SNE projection of 20 precomputed sentence embeddings rendered via D3, with hover-to-show-text and click-to-show-nearest-neighbors. The static-export contract forces the precompute approach; the geometry of meaning is the pedagogical payload. The conceptual sibling is the model-choice question (next file); the operational sibling is the chunking question (file after that).

### Part 2 — key points to remember

- **The function**: embedding model maps string → fixed-length vector. Deterministic, sentence-level, output dimensions fixed per model (384, 768, 1536, 3072 are common).
- **The metric**: cosine similarity (for normalized vectors, simplifies to dot product). Output in [-1, +1]. Higher = more semantically similar.
- **The geometry**: semantically-related inputs cluster; semantically-different inputs separate. Visualizable via t-SNE/UMAP but only as a projection (distances distort).
- **The failure modes**: exact-match keyword queries (BM25 wins), very short inputs (noisy embeddings), adversarial similarity (negation problem). Hybrid retrieval mitigates.
- **The reincodes shape**: implementation is Case B; buildable target is `/ai/embeddings` — D3-rendered 2D scatter of 20 precomputed embeddings with neighbor-highlighting on click.

---

## Interview defense

### What an interviewer is really asking

Behind "what's an embedding?" the interviewer is probing whether the candidate has *operationalized* embeddings in production or just heard about them. A junior answer describes embeddings as "vectors of numbers that represent meaning." A senior answer describes them as *the primitive every retrieval system reduces to*, names a specific embedding model they've used in production, and names a failure mode they've debugged (typically the exact-match-keyword problem or the negation problem). The interviewer is checking whether the candidate can ship embedding-based systems and debug them, not just describe them at a whiteboard.

### Likely questions

**Q (mid):** What's an embedding, and how do you compare two of them?

A: An embedding is a fixed-length vector — typically 1536 floats from `text-embedding-3-small`, 3072 floats from `text-embedding-3-large` — produced by an embedding model that has been trained so semantically-similar inputs end up at nearby points in vector space. You compare two embeddings by cosine similarity: the dot product of the two vectors divided by the product of their magnitudes. For normalized embeddings (which most modern models produce), magnitudes are 1, so cosine similarity reduces to just the dot product. The output is in [-1, +1] where 1 is "identical direction in vector space" (very semantically similar) and 0 is "orthogonal" (semantically unrelated).

```
cosine similarity: sim(a, b) = dot(a, b) / (||a|| × ||b||)
                              = dot(a, b)       (for normalized vectors)

interpretation:
  1.0   → identical direction (very similar)
  0.8   → close direction (related)
  0.5   → moderate angle (somewhat related)
  0.0   → orthogonal (unrelated)
 -1.0   → opposite direction (rarely meaningful in practice)
```

**Q (senior):** Where do embeddings fail, and what do you compose them with?

A: Embeddings fail on three patterns. First, exact-match keyword queries — an embedding for "ZIP 94103" lands near other addresses; if the user wants *exactly* 94103, BM25 (sparse retrieval) is the right tool because it scores exact term matches highly. Second, very short inputs — 1-3 word queries have noisier embeddings because the model has less context to disambiguate. Third, adversarial similarity — "the sky is blue" and "the sky is not blue" have very high cosine similarity because the embedding doesn't reliably encode negation. The mitigation for all three is *hybrid retrieval*: combine dense retrieval (embeddings) with sparse retrieval (BM25) via Reciprocal Rank Fusion. The dense path handles paraphrases and semantic similarity; the sparse path handles exact keywords and rare terms. RRF fuses the rankings, and the composite is more robust than either alone.

```
when each retrieval mode wins
─────────────────────────────
dense (embeddings):                sparse (BM25):
+ paraphrases                      + exact keywords (IDs, codes)
+ semantic similarity              + rare terms (domain jargon)
+ cross-vocabulary                 + named entities (proper nouns)
- exact keyword matching           - paraphrases
- very short inputs                - cross-vocabulary
- negation                         - semantic similarity

mitigation: hybrid retrieval with RRF (next concept)
```

**Q (arch):** At 10× scale — say, 100M embedded chunks — does the embedding-comparison primitive still hold, or does it break?

A: The primitive holds. What breaks is *brute-force comparison*: 100M × 1536 floats × cosine per query is 150 billion float multiplications per query, which won't run in any user-facing latency budget. The mitigation is *approximate nearest neighbor* (ANN) indexing — HNSW (Hierarchical Navigable Small World graphs), IVF (inverted file index), or LSH (locality-sensitive hashing). HNSW is the dominant choice in 2026 — sub-100ms p99 queries on 100M-vector indices on commodity hardware. The cost of ANN is recall: you get ~95-98% of the true top-K instead of 100%, in exchange for a 1000× speedup. The composition is "embeddings as the meaning primitive, HNSW as the search primitive." Cross-reference [04-vector-databases](04-vector-databases.md) for the storage and indexing operational side.

```
brute force vs ANN at 100M vectors

brute force                       HNSW
─────────────────────             ─────────────────────
- O(N) per query                  + O(log N) per query
- 100M × 1536 floats              + sub-100ms p99 latency
- minutes-to-hours per query      + ~95-98% recall (not 100%)
+ exact top-K                     - approximate top-K
+ no index to build               - index build cost (one-time)
                                  - index size (memory-resident)
```

### The question candidates always dodge

**Q:** Embeddings are just multiplication and dot products under the hood. Why not just use TF-IDF or BM25 and skip the embedding model entirely?

A: That argument confuses two things — the *math* of the comparison and the *representation* being compared. Yes, BM25's score is a scalar like cosine similarity; both reduce to math on vectors. But the *representation* is fundamentally different. BM25 represents a document as a sparse vector of term frequencies — "this document has the word 'quicksort' 3 times and the word 'pivot' 2 times." Embeddings represent a document as a dense vector of *learned* features that encode meaning across vocabulary. The query "the algorithm with the pivot" has *zero* term overlap with a document that says "quicksort" — BM25 scores it zero. The same query embedded has high cosine similarity to a document about quicksort because the embedding model learned, during training, that "pivot" and "quicksort" tend to co-occur and represent related concepts. The cost ledger:

```
BM25 / TF-IDF                          Embeddings
─────────────────────                  ─────────────────────
+ no model to run                      - need to run embedding model
+ sub-millisecond per query            + dozens of ms per query
+ exact keyword matching wins          - exact keyword matching loses
+ explainable scores                   - black-box scores
- zero recall on paraphrases           + high recall on paraphrases
- requires manual synonym dicts        + handles vocabulary diversity
  for domain jargon                      from training
- per-domain customization             + general-purpose representation
- no semantic similarity               + semantic similarity is the
                                         core property
```

The honest answer: BM25 isn't a substitute for embeddings; it's a *complement*. The hybrid retrieval pattern (next concept after this section) uses both because they fail on disjoint patterns. Picking only one is leaving recall on the table. The interview move is naming the complementary failure modes rather than defending one side.

### One-line anchors

- "An embedding is the LLM's `JSON.stringify` for meaning — deterministic transformation from string to fixed-length vector."
- "Cosine similarity is the standard metric. For normalized embeddings, it's just the dot product."
- "Embeddings fail on exact keywords, very short inputs, and negation. Compose with BM25 via hybrid retrieval to mitigate."
- "Pick the embedding model first; the dimension count then dictates storage cost and ANN-index cost."
- "Brute-force comparison breaks at ~1M vectors. HNSW handles 100M with sub-100ms latency at ~95% recall."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw the embedding function diagram from memory: input string → tokenize → encoder → pool → fixed-length vector. Then draw the 2D-projection geometry showing 3-4 clusters (sorting, trees, graphs, recursion) with at least 2 points per cluster.

✓ Pass: function pipeline drawn with 4 stages, geometry shows clusters with paraphrases inside the same cluster as canonical names
✗ Fail: re-read the primary diagram, wait 10 minutes, try again

### Level 2 — Explain it out loud

Explain embeddings to a colleague who has only used keyword search and is wondering why their search box gets zero results when users phrase queries differently. No notes. Under 90 seconds.

Checkpoints — did you:
- Define embedding as a fixed-length vector representing meaning?
- Name cosine similarity as the comparison metric?
- Distinguish "semantic similarity" from "exact match" (and explain when each wins)?
- Name at least one failure mode (negation, exact keywords, short inputs)?
- Reference the buildable target (`/ai/embeddings` visualizer) as how you'd teach it?

If you skipped any: you described the function, you didn't argue for the geometry.

### Level 3 — Apply it to a new scenario

A planned reincodes feature: a "find related visualizers" link on each algorithm page (e.g., on the quicksort page, show "related: mergesort, heapsort, partition-based algorithms"). The site has ~20 algorithm pages; relations should be inferred from page content, not hard-coded.

Design the embedding pipeline: which model, what gets embedded (page title, page content, both?), how the "top-3 related" gets computed, where the precomputed result gets stored under the static-export contract.

Write your answer (5+ sentences). Then verify by checking that `next.config.ts` is compatible with your design (no runtime API calls allowed; all embedding work has to be at build time).

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff from the Tradeoffs section. Answer in writing: "If I were starting the `/ai/embeddings` visualizer today, would I still use t-SNE for the 2D projection or would I switch to UMAP? Why? What does each choice cost?"

Reference the actual code:
→ Point to the precompute script's projection step (`scripts/project-tsne.py` or equivalent)
→ Point to where the JSON would land (`public/ai/embeddings/sentences.json`)

There is no right answer. The point is specificity.

### Quick check — code reference test

Without opening any files, answer:
- What's the standard metric for comparing two embeddings?
- What's the dimension count of `text-embedding-3-small`?
- What two retrieval modes compose in hybrid retrieval?

Then verify by re-reading the `## How it works` section.

✓ Pass: "cosine similarity", "1536", "dense (embeddings) and sparse (BM25)"
✗ Fail on details: that's fine — the shape is what matters. Numbers should be recoverable from the model names.
