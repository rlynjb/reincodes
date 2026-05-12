# Embeddings (geometrically)

**Industry name(s):** Embeddings, dense vectors, semantic representations
**Type:** Industry standard

> Map each piece of text to a fixed-length numeric vector such that similar meaning ⇒ similar geometry; the foundation of semantic search and RAG. Not yet built in this codebase — slated as a reincodes visualization.

**See also:** → [01-tokenization](./01-tokenization.md) · → [03-dense-vs-sparse-retrieval](./03-dense-vs-sparse-retrieval.md) · → [04-reranking-cross-encoder](./04-reranking-cross-encoder.md)

---

## Why care

You want to find documents similar to a query, but "similar" can't mean "shares keywords" — "doctor visit" and "appointment with physician" share zero keywords but mean the same thing. Embeddings solve this: each piece of text becomes a point in a high-dimensional space (typically 768–3072 dimensions) where *semantic distance* maps to *geometric distance*.

This sits in **retrieval and RAG** — the layer that powers every modern search system. Same idea behind word2vec (Mikolov, 2013), BERT embeddings (2018), and OpenAI's text-embedding-3 (2024).

---

## How it works

Picture a map of a city where neighbourhoods are themed: every restaurant clusters in one area, every park in another, every museum in a third. Two restaurants are close even if their names share no letters — geography reflects meaning. Embeddings build that map for text: every sentence becomes a coordinate, and meaning determines geometry.

### What an embedding is

A function `embed: string → vector[d]`. For OpenAI's `text-embedding-3-small`, `d = 1536` (you get a 1536-dimensional vector for any input string). The vector is *dense* — most components are non-zero — in contrast to sparse representations like bag-of-words.

```
embed("doctor visit")             → [0.123, -0.045, 0.221, ..., 0.087]   (1536 dims)
embed("appointment with doctor")  → [0.119, -0.041, 0.215, ..., 0.091]   (close!)
embed("favourite pizza topping")  → [0.421, 0.234, -0.067, ..., -0.111]  (far!)
```

### Cosine similarity

To measure "closeness," use cosine similarity: dot product of the two vectors divided by their magnitudes. Result is in `[-1, 1]`; 1 means identical direction, 0 means orthogonal, -1 means opposite.

```
cosine(a, b) = (a · b) / (|a| * |b|)

For unit-length embeddings (which most production embeddings are normalised to):
cosine(a, b) = a · b
```

### Trace: 3 example vectors in 2D (toy version)

```
"cat"     → [0.9, 0.1]   ← unit-length
"kitten"  → [0.85, 0.5]
"car"     → [0.1, 0.9]

cosine("cat", "kitten") = 0.9*0.85 + 0.1*0.5 = 0.765 + 0.05 = 0.815  (close)
cosine("cat", "car")     = 0.9*0.1  + 0.1*0.9 = 0.09  + 0.09 = 0.18   (far)
```

### The geometry intuition

```
                    [cat]
                     ▲
                     │
                     │  small angle = high cosine
                     │
                    [kitten]
                  /
                /  large angle = low cosine
              /
          [car]──────────────▶
```

In 2D you can draw it. In 1536D you can't — but the math is the same. Similar meaning = small angle between vectors.

### The principle

This is what people mean by *semantic search*. Lexical search (BM25, TF-IDF) finds documents sharing keywords; semantic search finds documents with similar *meaning* by comparing positions in embedding space. The conceptual leap: meaning becomes geometry.

The full picture is below.

---

## Embeddings — diagram

```
Text inputs                Embedding model                  Vectors

"doctor visit"      ──┐
"physician appt."   ──┼──▶  text-embedding-3-small  ──▶  [v1, v2, v3, ...]
"pizza topping"     ──┘                                  (1536 dims each)

                                                                  │
                                                                  ▼
                                              Stored in a vector DB (pgvector,
                                              sqlite-vec, Pinecone, …)

User query
   │
   ▼
"appointment with doctor"   ──▶  embed   ──▶  q[1536]
                                                  │
                                                  ▼
                                    cosine(q, all stored vectors)
                                                  │
                                                  ▼
                                    top-k by similarity
                                                  │
                                                  ▼
                                    Return matching documents
```

---

## In this codebase

**Not yet implemented.** reincodes has no AI surface. Curriculum slot `[C2.1]` "What an embedding is geometrically" is **Case B** for reincodes — slated as the **Cosine similarity playground** in the curriculum's reincodes section (line 523).

Expected location: `src/app/concepts/ai-engineering/cosine-similarity/page.tsx` — likely with a 2D visualization (since 1536D doesn't render) showing how distance shifts as the user edits text.

---

## Elaborate

### Where this pattern comes from
Word embeddings: word2vec (Mikolov et al., 2013) showed `king - man + woman ≈ queen` in vector space. Sentence embeddings: BERT (2018), Sentence-BERT (2019). API-grade embeddings: OpenAI's first embedding model in 2022, then text-embedding-3 series in 2024.

### The deeper principle
*If you can map symbols to a space where geometry encodes meaning, you can solve search by geometry.* The same idea powers image embeddings (CLIP), audio (Whisper), and multi-modal (Flamingo) — same mechanism, different modality.

### Where this breaks down
- Long documents: a single embedding can't capture multi-topic content; chunk first.
- Embeddings drift over model versions — re-embed when you change models.
- Embedding ≠ understanding — for QA you need an LLM in the loop, not just retrieval.

### What to explore next
- [03-dense-vs-sparse-retrieval](./03-dense-vs-sparse-retrieval.md) — dense (this) vs sparse (BM25).
- [04-reranking-cross-encoder](./04-reranking-cross-encoder.md) — reorder top-k with a model that reads pairs.
- Hybrid retrieval with RRF (`[C2.5]`).

---

## Tradeoffs

### Comparison table

```
┌──────────────────┬──────────────────────────┬──────────────────────────┐
│ Cost dimension   │ Dense embeddings         │ Sparse (BM25 keyword)    │
├──────────────────┼──────────────────────────┼──────────────────────────┤
│ Captures         │ Semantic similarity      │ Exact term overlap       │
│ Cost/query       │ ~$0.0001 (embedding API) │ Free (lib computation)   │
│ Cost/storage     │ 1536 × 4B = 6KB/doc      │ Sparse vectors, small    │
│ Cold-start       │ Pre-embed everything     │ Build inverted index     │
│ Multi-language   │ Same model handles       │ Needs separate index     │
│ Best for         │ "Find similar meaning"   │ "Find this exact term"   │
│ Worst for        │ Negation, exact match    │ Synonym, paraphrase      │
└──────────────────┴──────────────────────────┴──────────────────────────┘
```

### What we gave up

Determinism. The same model returns slightly different embeddings across versions; the vectors are floating-point and small noise propagates into similarity scores. Production systems pin model versions and re-embed on upgrades.

### What the alternative would have cost

BM25 alone misses paraphrase. For "doctor appointment" matching "physician visit," BM25 returns nothing useful. The hybrid approach (BM25 + embeddings + RRF) is the production sweet spot.

### The breakpoint

Fine when "meaning matters." Switch to / add BM25 when "exact term matters" (proper names, identifiers, codes).

---

## Tech reference (industry pairing)

### Embedding models

- **Codebase would use:** Probably `text-embedding-3-small` via OpenAI API (cheap, 1536 dims) or a local `sentence-transformers` model for offline.
- **Why it's here when built:** the vector source for similarity comparison.
- **Leading today:** OpenAI `text-embedding-3-small` / `-large` — `adoption-leading` for hosted embedding, 2026.
- **Why it leads:** competitive quality, low price ($0.02 / 1M tokens), well-documented.
- **Runner-up:** Cohere Embed v3, Voyage AI — `innovation-leading` on certain benchmarks (multilingual, code).

### Vector storage

- **Codebase would use:** sqlite-vec (lightweight, in the same browser-storage shape this site already has) or in-memory typed arrays.
- **Leading today:** Postgres + pgvector — `adoption-leading` for managed vector storage, 2026.
- **Runner-up:** sqlite-vec — `innovation-leading` for local-first apps.

---

## Project exercises

### Cosine similarity playground (curriculum reference: `Interview prep surface — reincodes`)

- **Exercise ID:** *[reincodes-viz: Cosine similarity playground]* — `aieng-curriculum.md:523`, no formal `[Bx.y]`.
- **What to build:** A page where the user types text into multiple text boxes (or selects from preset pairs like "doctor / physician / pizza"), embeddings are computed via OpenAI API (or a local CDN model), and the result is rendered as a 2D PCA projection of the vectors so the geometric relationship is visible. Cosine similarity numbers shown on hover/click between any two points.
- **Why it earns its place:** the abstract math (vectors in 1536D) becomes concrete (two dots close together in 2D). The PCA projection lossy-collapses to 2D and the user sees "doctor and physician are near; pizza is far." That intuition is the foundation of every RAG-design conversation.
- **Files to touch:** `src/app/concepts/ai-engineering/cosine-similarity/page.tsx` (new), `src/components/AI/VectorPlot.tsx` (new, uses d3 like NetworkDiagram), env var or browser-side WASM model for embeddings.
- **Done when:** Pasting "doctor visit" and "appointment with physician" yields cosine ≥ 0.85; "doctor visit" and "pizza topping" yields cosine ≤ 0.3. PCA plot shows them clustered or apart.
- **Estimated effort:** `1–2 days`.

---

## Summary

### Part 1 — concept recap

Embeddings map text to fixed-length vectors so semantic distance becomes geometric distance — the foundation of semantic search and RAG. reincodes does not yet implement this; the curriculum slates a `cosine-similarity` playground showing the relationship in 2D PCA. The constraint is "abstract math becomes concrete visually," and the cost is an embedding API call per text input.

### Part 2 — key points to remember

- Embedding = a fixed-length dense vector (e.g., 1536 dims for text-embedding-3-small).
- Cosine similarity measures angle, in `[-1, 1]`.
- Same model = comparable; different models = incomparable.
- Pre-embed your corpus; embed query at runtime; top-k by similarity.
- Foundation of semantic search and RAG.

---

## Interview defense

### What an interviewer is really asking

When someone asks about embeddings, they want to hear "vector, cosine, geometry of meaning" and an example of when this beats keyword search. Naming a model (text-embedding-3) and a vector DB (pgvector) shows production literacy.

### Likely questions

**Q [mid]: How does "find similar documents" work with embeddings?**

A: Pre-embed every document, store the vectors. At query time, embed the query, compute cosine similarity to every stored vector (or use approximate nearest neighbour for scale), return top-k.

**Q [senior]: When does embedding-based search fail and what do you do?**

A: It fails on (1) exact-term matching (proper nouns, codes — "ACM12345" should match exactly, not by meaning), (2) negation ("not heart disease" might embed near "heart disease"), (3) very short queries (less semantic signal). Mitigations: hybrid retrieval (BM25 + embeddings, combined via RRF), explicit boolean filters layered on top, query rewriting via LLM to surface intent.

```
┌── Embeddings win ─────────┐    ┌── BM25 wins ──────────────┐
│  Paraphrase               │    │  Exact identifiers        │
│  Cross-language           │    │  Negation                 │
│  Long queries              │   │  Short keyword queries    │
└───────────────────────────┘    └───────────────────────────┘
                ─── Hybrid (both, combined with RRF) for production ───
```

**Q [arch]: At 10M documents, can you still do brute-force cosine?**

A: No — 10M × 1536-dim dot products per query is ~15G operations per query, too slow. Use approximate nearest neighbour: HNSW (Hierarchical Navigable Small World, the standard for production ANN) gives ~10ms queries at 10M docs with 90%+ recall. Tradeoff: not exact top-k, requires index build + memory.

### One-line anchors

- "Vectors in high-dimensional space where geometry = meaning."
- "Cosine = the standard similarity measure."
- "Same model required across corpus and query."
- "Hybrid (BM25 + embeddings) beats either alone."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Draw a 2D embedding plane with three points: "cat," "kitten," "car." Label each axis as "abstract direction." Show the angles.

### Level 2 — Explain it out loud
"Why does 'physician' match 'doctor' but not 'pizza' in embedding space?"

### Level 3 — Apply it to a new scenario
"You have 100K product descriptions. A user searches 'comfortable running shoes.' Walk through the embedding-based retrieval."

### Level 4 — Defend the decision you'd change
"Would you use brute-force cosine or HNSW at 1M documents?"

### Quick check
- Currently implemented? → No, Case B.
- Cosine range? → `[-1, 1]`.
- Vector dim for text-embedding-3-small? → 1536.

✓ Pass: all three.
