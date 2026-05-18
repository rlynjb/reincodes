# Embeddings, geometrically

**Industry name(s):** Dense vector embeddings, distributed representations, learned vector spaces.
**Type:** Industry standard · Language-agnostic

> A string becomes a fixed-length array of floats; semantic similarity becomes a cosine distance between those arrays. The whole RAG pipeline depends on this one conversion.

**See also:** → `01-tokenization.md` · → `03-rag-pattern.md`

---

## Why care

You've got a search input on a docs site. The user types `"how do I cancel my subscription"`. There's a help page in your corpus titled `"unsubscribe from billing"`. The two strings share zero words. A `string.includes()` returns false. A regex match returns false. A trigram fuzzy search returns false. Yet anyone reading the two strings agrees they mean the same thing.

The frontend instinct here is to reach for synonyms — write a dictionary, map `"cancel"` to `"unsubscribe"`, ship it. That dictionary doesn't scale past a few dozen terms, and it's brittle: `"end my plan"`, `"stop charging me"`, `"cut the recurring payment"` all need entries. The work scales linearly with the long tail of how people phrase the same intent.

Embeddings flip the problem. Instead of mapping strings to other strings, map every string to a point in a 768-dimensional (or 1536-, or 3072-) space. Strings that mean similar things land near each other. `"cancel my subscription"` and `"unsubscribe from billing"` end up ~0.15 cosine-distance apart; `"cancel my subscription"` and `"reset my password"` end up ~0.6 cosine-distance apart. Now "find me the most semantically similar document" is one `argmax` over a list of dot products, not a regex problem.

**Why you need to answer that question at all:** because every retrieval system that isn't keyword-only depends on embeddings being roughly accurate. RAG, semantic search, recommendation systems, deduplication, clustering — they all run on the assumption that "similar meaning" maps to "small vector distance." If you don't know what the vector space looks like (what dimensions it has, what "near" means, why it doesn't always work), you can't debug a RAG system that returns the wrong chunk. You stare at the chunks, they "look similar" in your head, and the model picked the wrong one. The answer is in the geometry — which you can't see unless you visualize it.

Without thinking about embeddings as geometry:
- You think of embeddings as a black box: text in, "the right answer" out.
- You can't explain why a query retrieves a wrong chunk that "obviously should be far away."
- You can't compare embedding models — they're all just vectors to you.

With the geometric framing:
- A retrieval miss is a `nearest()` over the wrong corner of the space — you can debug it by inspecting the 5 nearest neighbors of the query and the gold doc.
- t-SNE / UMAP let you project the high-dimensional space to 2D and *see* the clusters.
- You can pick embedding models by their geometry: text-embedding-3-large vs BGE-small are different spaces, with different separations between intent classes.

An embedding is just a `.map(string => [number, number, ..., number])` where the array has a fixed length and the numbers were learned to make similar strings near each other. That's it. The geometry is what makes the function useful.

---

## How it works

The pipeline is two layers. The first is the same tokenizer from `01-tokenization.md`. The second is the embedding model itself — a small transformer trained specifically so that "semantically similar strings produce similar vectors."

```
String
  │
  ▼
┌──────────────────┐
│ Tokenizer        │
│ (string → IDs)   │
└────────┬─────────┘
         │  list of token IDs
         ▼
┌──────────────────────────────────────┐
│ Embedding model                      │
│  (e.g. text-embedding-3-small)       │
│                                      │
│  Token IDs → transformer layers →    │
│  pool → fixed-length vector          │
└────────────────────┬─────────────────┘
                     │  1536 floats
                     ▼
        [0.123, -0.044, 0.876, ..., 0.021]
                     │
                     ▼
              optionally L2-normalize
                     │
                     ▼
              unit vector in R^1536
```

The training objective behind that model is the load-bearing part. It was trained on pairs (and triplets) of strings: positive pairs that mean similar things, negative pairs that don't. The loss function pushed the vectors of positive pairs together and the vectors of negative pairs apart. Repeat over billions of pairs and the space organizes itself: similar meanings cluster, dissimilar meanings separate.

**Similarity** is then a single arithmetic step:

```
cosine_similarity(a, b)  =  (a · b) / (||a|| * ||b||)
                            ────────────────────────
                            range: -1 (opposite) to +1 (identical)
```

If both vectors are pre-normalized to unit length (a one-time operation), `||a|| * ||b||` is just 1 and cosine similarity collapses to a plain dot product — a single loop, one multiply per dimension. That's why vector databases pre-normalize: search becomes a matrix multiply instead of a per-pair division.

For a 1536-dimensional space, the `forEach` you'd write to compute a cosine similarity is ~1536 multiplies and 1535 adds — single-digit microseconds in JS. The slow part is not the math; it's the number of comparisons. With 10k documents, you do 10k similarity calculations per query. With 10M documents, you need an approximate-nearest-neighbor index (HNSW, IVF) or you're not finishing the query.

Three properties of the geometry that matter:

1. **Dimensions are not interpretable.** You cannot say "dimension 47 means `politeness`." The space was learned, not designed. Individual axes are meaningless; relative positions are meaningful.
2. **Cosine, not Euclidean, is usually the right metric.** Cosine measures the angle between vectors; Euclidean measures distance. Two vectors can be Euclidean-far but cosine-close if one is a "longer" version of the other. For text embeddings, the direction (meaning) matters more than the magnitude (length).
3. **The geometry is model-specific.** A vector from text-embedding-3-small is meaningless in BGE-small's space. You cannot mix embeddings from different models in the same index.

---

## Embeddings — diagram

```
                  2D projection (via t-SNE) of a 1536-D space:

            "cancel my subscription"   ●
               "unsubscribe"           ●            "reset my password"    ●
                                                                              
                  "stop billing me"   ●                "forgot password"   ●
                                                                              
                                                                              
   "merge sort steps"   ●                                                     
                                              "what hours is support open" ●
   "implement quicksort"   ●                                                  
                                                                              
                                                                              
     ──────────── cluster: cancellation intents ──────────────                
     ──────────── cluster: password resets        ──────────────              
     ──────────── cluster: DSA help               ──────────────              
                                                                              
   Nearest neighbors to "cancel my subscription" by cosine:                  
     1.  "unsubscribe"                  0.91                                  
     2.  "stop billing me"              0.88                                  
     3.  "end my plan"                  0.83                                  
     4.  "merge sort steps"             0.21                                  
     5.  "what hours is support open"   0.15                                  
```

The clusters are the point. The high-dimensional space organizes meaning; t-SNE just makes it visible to you. Cosine similarity is what the retrieval system uses; the 2D projection is what the human uses to debug.

---

## In this codebase

**Not yet implemented.** Deferred — reincodes is the interview-prep visualizer host per the curriculum; no AI viz built yet. The existing visualizers all run on hand-built data structures in `src/utils/data_structures/` (BST, BinaryHeap, Graph2) and the static-export contract rules out any server-side embedding generation. The path forward is precomputed: ship a fixed JSON file of ~20 sentences with their pre-computed embeddings, render them via t-SNE in the browser.

The slot in `CONCEPT_CATEGORIES` in `src/components/Home/conceptsData.tsx` is the same proposed `"ai-engineering"` category from the tokenization file — these vizzes ship together.

---

## Elaborate

### Where this pattern comes from

Distributed representations trace to word2vec (Mikolov et al., 2013), which showed that single-word embeddings learned from co-occurrence statistics could capture meaningful relationships — the famous `king - man + woman ≈ queen` analogy. The neural reranking and retrieval work that followed (InferSent, USE, Sentence-BERT) extended the idea to sentences and paragraphs by training transformers with contrastive objectives. Modern embedding models (OpenAI's text-embedding-3, Cohere's Embed v3, BGE) are descendants of Sentence-BERT trained on much larger paired data.

### The deeper principle

Geometric encoding of meaning. The principle is that you can represent any discrete categorical object (a word, a sentence, a user, a product, an image) as a point in a continuous high-dimensional space such that *similarity in the categorical sense becomes proximity in the geometric sense*. Once you have that mapping, every downstream operation — search, clustering, classification, recommendation — reduces to geometry. The mapping function is what each new model paper improves.

```
┌────────────────────────────────────────────────────────┐
│  Discrete world             Continuous world           │
│  ───────────────            ────────────────           │
│  "cancel sub"               [0.12, -0.04, 0.87, ...]   │
│                                                        │
│  semantic similarity   ──▶  cosine similarity          │
│  (subjective)               (arithmetic)               │
│                                                        │
│  search, cluster, rank ──▶  argmax/argmin over         │
│  (algorithmic)              vector operations          │
└────────────────────────────────────────────────────────┘
```

### Where this breaks down

When the model's training distribution doesn't match your domain. A model trained on general web text will struggle with legal-contract language or pharmaceutical jargon — the geometry was never asked to separate those domains. When the queries and the documents are in different "shapes" (queries are short questions; documents are long descriptions). The vector for `"how do I cancel"` may not be close to the vector for a 1000-word policy document that explains cancellation, even though the document is the right answer. This is the asymmetric-encoder problem and the reason hybrid retrieval (dense + sparse) exists.

### What to explore next

- RAG pattern → puts embeddings in their primary application context: index documents, embed queries, retrieve, generate.
- Chunking strategies → because you can only embed strings that fit in the model's context. Long docs must be split, and where you split changes what gets retrieved.
- Reranking with a cross-encoder → because cosine over a bi-encoder is a fast first cut, not a final answer. A reranker reads query and doc together and produces a better score on a smaller candidate set.

---

## Tradeoffs

### Comparison table — both costs in one frame

┌──────────────────┬──────────────────────┬─────────────────────────┐
│ Cost dimension   │ Precompute + ship    │ Compute embeddings live │
├──────────────────┼──────────────────────┼─────────────────────────┤
│ Build time       │ One Node script run  │ Browser embedding model │
│ Bundle size      │ +50KB JSON (20 docs) │ +30MB ONNX model        │
│ Latency          │ <1ms (lookup)        │ ~200ms first inference  │
│ Per-doc flex     │ Locked at build time │ Any input on the fly    │
│ Static-export OK │ Yes                  │ Yes (browser inference) │
└──────────────────┴──────────────────────┴─────────────────────────┘

### Sub-block 1 — what precomputed embeddings cost

A build step (`scripts/embed-corpus.ts`) that runs once, hits an embedding API, writes the result to `public/embeddings/corpus.json`. The script needs an API key, which means it can't run in CI without a secret — or it runs locally and the JSON is committed. The JSON is ~50KB for 20 sentences at 1536 dimensions (compressed; more without). New sentences require re-running the script and committing the new JSON.

The interview surface — "what happens if I type my own query" — is gone, because the page can only show similarity between the 20 precomputed points. You can fake the query by precomputing the embeddings for ~50 likely query strings, but the page is then a lookup table, not a model.

### Sub-block 2 — what live in-browser embeddings would cost

A ~30MB ONNX or quantized embedding model loaded into the browser via Transformers.js or ONNX Runtime Web. That's a one-time download (cacheable), but it dominates the initial load. The first inference takes 200–500ms because the WASM runtime warms up. Subsequent inferences are 50–100ms.

The static-export contract still holds — Transformers.js runs entirely in the browser. The cost is real bytes, and a 30MB download is hostile to mobile users on cellular. Route-chunking the model so it loads only on `/ai/embeddings` is mandatory; the home page must not pay for it.

### Sub-block 3 — the breakpoint

Precompute is fine while the visualizer is illustrative — its job is to show what cosine similarity looks like, not to be a general-purpose embedding playground. The breakpoint is "user wants to type their own query." If interview-prep usage shifts to "let me play with my own strings," ship the in-browser model. Until then, precomputed is the right call because the page already makes the geometric point with 20 fixed sentences.

---

## Tech reference (industry pairing)

### text-embedding-3-small (or similar embedding API)

- **Codebase uses:** not imported in source. Would be hit by a one-time `scripts/embed-corpus.ts` node script at build time to produce the precomputed JSON. The script is dev-only, never bundled.
- **Why it's here:** the actual model that turns 20 sentences into 20 vectors. The visualization is its output, not its replacement.
- **Leading today:** OpenAI `text-embedding-3-small` — adoption-leading for general-purpose embeddings, 2026.
- **Why it leads:** broad training, well-documented, dimension-flexible (can truncate to 256/512/1536 dims via Matryoshka), cheap. Default pick for production RAG.
- **Runner-up:** BGE-large or Cohere Embed v3 — innovation-leading on retrieval benchmarks; sentence-transformers/all-MiniLM-L6-v2 is the open-source workhorse.

### t-SNE (via `@kazuhide/tsne-js` or similar JS port)

- **Codebase uses:** not yet — would be the projection layer in `src/components/EmbeddingsPlot/`. Existing visualizers use d3-force (`src/components/NetworkDiagram/`) which is a similar primitive: high-dim positions reduced to 2D.
- **Why it's here:** to project the 1536-D space down to 2D so the human can see the clusters. The retrieval system never needs this; only the visualizer does.
- **Leading today:** UMAP — innovation-leading, 2026.
- **Why it leads:** preserves global structure better than t-SNE, faster, has a stable JS implementation (`umap-js`). t-SNE is older but more widely taught; UMAP is what production teams reach for now.
- **Runner-up:** PCA — adoption-leading for "I just want a linear projection." Fastest, deterministic, but doesn't preserve clusters as well for non-linear data like embeddings.

### d3 (already in the project)

- **Codebase uses:** `d3` 7 + `d3-force` are imported by `src/components/NetworkDiagram/` for the existing network visualizer. Already in the bundle.
- **Why it's here:** would handle the actual 2D scatter rendering of the projected embeddings (axes, hover, point selection). Reuse what's already shipped instead of adding a charting library.
- **Leading today:** d3 — adoption-leading for custom data viz, 2026.
- **Why it leads:** lowest-level control, no chart-type lock-in, every interactive viz tutorial uses it. Already familiar to anyone who's built a custom chart.
- **Runner-up:** Visx — innovation-leading React-native d3 wrapper; Observable Plot for declarative shapes.

---

## Project exercises

### [B-reincodes-embeddings] Cosine similarity playground

- **Exercise ID:** Curriculum reference: `[C2.1]` (what an embedding is geometrically) + curriculum's interview-prep entry `Cosine similarity playground [exercises C2.1]`. Adjacent: `[C2.9]` (embedding visualization — t-SNE vs PCA, learn-only).
- **What to build:** A page at `/ai/embeddings` that loads `public/embeddings/corpus.json` (20 precomputed sentence-embedding pairs, generated by a `scripts/embed-corpus.ts` build script). Render the 20 points in 2D via t-SNE (or UMAP). Clicking a point highlights its 3 nearest neighbors by cosine similarity, draws lines to them, and shows the cosine-similarity scores in a side panel. Optionally: a toggle to switch projection method (t-SNE / UMAP / PCA) and a toggle for cosine vs Euclidean.
- **Why it earns its place:** the moment a candidate clicks a point and watches three lines fan out to its nearest neighbors — by *meaning*, not by *string match* — the abstract concept "high-dimensional vector space" becomes a concrete thing they can sketch on a whiteboard. It's also the foundation for the RAG visualizer, which is the same primitive plus a generation step.
- **Files to touch:**
  - `scripts/embed-corpus.ts` (new — dev-only build script, hits an embedding API once)
  - `public/embeddings/corpus.json` (new — output of the script)
  - `src/app/ai/embeddings/page.tsx` (new — the `"use client"` page)
  - `src/components/EmbeddingsPlot/EmbeddingsPlot.tsx` (new — d3-based scatter with hover/click)
  - `src/utils/cosine.ts` (new — `cosineSimilarity(a: number[], b: number[]): number`)
  - `src/components/Home/conceptsData.tsx` (add the tile in the `"ai-engineering"` category)
- **Done when:** the page loads under 1MB total, all 20 points render, clicking any point shows the 3 nearest by cosine, the scores match what `cosineSimilarity()` returns when called directly. Build passes `next build` under `output: "export"`.
- **Estimated effort:** 1–2 days.

---

## Interview defense

### What an interviewer is really asking

When an interviewer asks "what's an embedding," they're not asking for the textbook definition. They're asking: do you treat embeddings as a black box, or do you have an intuition for the geometry? The intuition is what lets you debug a RAG system that retrieves the wrong chunk, pick between two embedding models, or explain why hybrid retrieval works. Candidates who treat embeddings as black boxes can't reason about retrieval failures; candidates who think geometrically can.

### Likely questions

[mid] Q: Why cosine similarity instead of Euclidean distance?

A: Cosine measures the angle between two vectors; Euclidean measures the absolute distance. For text embeddings, the direction encodes meaning — `"cancel my subscription"` and `"please cancel my subscription please"` point in roughly the same direction even if the second has more magnitude. Cosine treats them as similar; Euclidean would penalize the magnitude difference. Most embedding models are also trained with cosine similarity as the loss, so the geometry of the space is calibrated for cosine, not Euclidean.

Diagram:
```
Two vectors with similar meaning but different lengths:

      a ──────────────▶
       ╲
        ╲ θ (small)
         ╲
          b ────▶

   cosine_sim:  cos(θ) — close to 1  (similar)
   euclid_dist: large gap            (not similar)

   Cosine ignores length; Euclidean doesn't.
```

[senior] Q: You're getting bad retrieval results — the right document is in the corpus but it's not coming back in the top 5. How do you debug?

A: First, embed the gold doc and the query separately, compute their cosine similarity, and check the actual number. If it's low (say <0.4), the embedding model isn't bridging the query phrasing to the doc phrasing — this is the asymmetric-encoder problem, and the fix is either hybrid retrieval (add BM25 to catch keyword overlap) or HyDE-style query rewriting (have the LLM hallucinate an answer first, then embed that). If the similarity is high but the doc still isn't in the top 5, the issue is corpus density — other docs are *also* close to the query, and a reranker over the top 20 candidates will fix the ranking without changing recall.

Diagram:
```
Two failure modes, two fixes:

┌─ Failure A: low query↔doc similarity ──────────┐
│                                                │
│   query  ●        ●  gold doc                  │
│           ╲      ╱                             │
│            ╲    ╱  (far apart in space)        │
│                                                │
│   Fix: hybrid retrieval (BM25 + dense)         │
│        or HyDE query rewriting                 │
└────────────────────────────────────────────────┘

┌─ Failure B: high sim but crowded neighborhood ─┐
│                                                │
│      ●●● other docs                            │
│        ●●●                                     │
│      ● gold doc                                │
│      query ●                                   │
│                                                │
│   Fix: reranker over top-20 (cross-encoder)    │
└────────────────────────────────────────────────┘
```

[arch] Q: Your RAG corpus grows from 10k to 10M docs. What breaks first?

A: The flat-index cosine search. At 10k docs and 1536 dims, computing every query's similarities is ~15M multiplications — single-digit ms in any language. At 10M docs, it's 15B multiplications per query, which is hundreds of ms even on a server. The fix is an approximate-nearest-neighbor index (HNSW, IVF) that gives up some recall for huge speedups. Past 100M docs, the index itself stops fitting in single-node RAM and you shard by doc ID, query all shards in parallel, merge top-k. Embedding model choice also matters more at scale: 3072-D vectors mean 2x the index size of 1536-D, so Matryoshka-truncating to 512 dims (with small recall loss) buys you 6x the docs per node.

Diagram:
```
       10k docs              10M docs               100M+ docs
       ────────              ────────               ──────────
       Flat cosine           HNSW / IVF             Sharded HNSW
       O(N) per query        O(log N) per query     query all shards
                                                    in parallel
       ~5ms                  ~10ms                  ~50ms (network-bound)
                                                    
       Dim budget:           Dim budget:            Dim budget:
       any                   matters                Matryoshka-
                             (RAM)                  truncate to fit
```

### The question candidates always dodge

Q: If embedding similarity is "close enough" for retrieval, why does anyone still use BM25 / sparse retrieval at all?

A: Because dense embeddings have a real weakness — they over-generalize on exact-match queries. A user searches for the product code `SKU-X42-RED`. The embedding model has never seen that exact string and produces a vector that's similar to *many* product codes, none of them an exact match. BM25, which scores documents by literal term overlap, returns the one product page that contains `SKU-X42-RED`. Hybrid retrieval (RRF-fused dense + sparse) wins both: BM25 catches the exact-match queries, dense catches the paraphrased ones. The candidates who don't know this defend dense-only retrieval as universal; the candidates who do know it design for the failure mode up front.

Diagram:
```
Query: "SKU-X42-RED"     (exact-match intent)
                                      
┌─ Dense-only retrieval ─────────────┐
│                                    │
│  ●● ● ● other SKUs (all similar)   │
│                                    │
│  ↑ no clear winner; all close      │
└────────────────────────────────────┘

┌─ BM25 (sparse) ────────────────────┐
│                                    │
│  Term match: "SKU-X42-RED"         │
│  Doc 247: 1 occurrence  →  score 8 │
│  Doc 12:  0 occurrences →  score 0 │
│  Doc 18:  0 occurrences →  score 0 │
│                                    │
│  ↑ clear winner                    │
└────────────────────────────────────┘

Hybrid: dense for paraphrases, sparse for exact-match.
        RRF combines both rankings.
```

### One-line anchors

- "An embedding is a `.map(string => fixed-length number array)` where the array was learned to put similar meanings near each other."
- "Cosine, not Euclidean, because the angle encodes meaning and the length doesn't."
- "Dimensions are not interpretable individually; relative positions are."
- "The hardest retrieval failure is the one where the gold doc embedding is *actually* far from the query — and the fix is hybrid retrieval, not a better embedding model."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw the pipeline from string to vector to cosine similarity from memory. Label what's a string, what's a list of integers, what's a list of floats, and what cosine similarity returns.

Open the file. Compare.

- Did you show the tokenizer step before the embedding step?
- Did you show that cosine ranges from -1 to +1?
- Did you show that the 2D projection is for the human, not the retrieval system?

### Level 2 — Explain it out loud

Explain embeddings to a frontend colleague who just asked "how does semantic search work?" No notes. Under 90 seconds.

Checkpoints — did you:
- Open with the `"cancel"` / `"unsubscribe"` example (or one like it)?
- Mention that similar meaning → close vectors → high cosine similarity?
- Mention that you can't mix vectors from different embedding models?
- Reference the planned `/ai/embeddings` page?

### Level 3 — Apply it to a new scenario

Answer this without looking at the file:

"You have a RAG system. The user's query `'how do I get a refund'` returns 5 chunks. Chunks 1, 2, and 3 are all variations of the refund policy. Chunk 4 is about subscription cancellation. Chunk 5 is the page footer. The model uses chunk 5 to answer and gives a useless response. What went wrong, geometrically, and what would you change?"

Write your answer. 3–5 sentences minimum.

### Level 4 — Defend the decision you'd change

The Project exercise above precomputes 20 embeddings and ships them as a JSON file. Answer in writing:

"If you were building this visualizer today, would you ship precomputed embeddings or run the embedding model in the browser via Transformers.js? Why? What would change at 100 sentences vs 20?"

Reference the actual constraints:
- Point to `next.config.ts` (`output: "export"`).
- Point to where the corpus JSON would live in `public/`.

### Quick check — code reference test

Without opening any files, answer:
- What's the cosine similarity function signature you'd write in `src/utils/cosine.ts`?
- What category in `conceptsData.tsx` would the tile go into?
- What existing component in `src/components/` already does 2D scatter / force layout that you'd model off?

Then open the files and verify.

- Pass: `cosineSimilarity(a: number[], b: number[]): number`.
- Pass: `"ai-engineering"`.
- Pass: `src/components/NetworkDiagram/` (uses d3-force).

---

## Summary

An embedding is a learned mapping from a string to a fixed-length vector such that semantic similarity becomes cosine similarity. The geometry is the load-bearing part: clusters of meaning, nearest-neighbor lookups, and the failure modes of retrieval are all geometric. For reincodes, the planned `/ai/embeddings` page is the visualizer that makes the geometry visible — 20 precomputed sentences projected to 2D, with nearest-neighbor highlighting on click.
