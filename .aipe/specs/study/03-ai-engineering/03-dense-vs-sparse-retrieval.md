# Dense vs sparse retrieval (BM25)

**Industry name(s):** Dense retrieval (embeddings), sparse retrieval (BM25, TF-IDF, lexical search)
**Type:** Industry standard

> Two complementary ways to find relevant documents — dense matches by meaning, sparse matches by terms. Used together via RRF in production RAG. Not yet built in this codebase — slated as a reincodes RAG-pipeline visualization.

**See also:** → [02-embeddings-geometrically](./02-embeddings-geometrically.md) · → [04-reranking-cross-encoder](./04-reranking-cross-encoder.md)

---

## Why care

You build embedding-based search and a user types "ACM-12345" — exact identifier. Embeddings return semantically-related-but-wrong docs. You go back to BM25 keyword search — it returns the exact match perfectly but fails on "show me docs about doctors" → "physician" misses. The fix isn't to pick one; it's to use both.

This sits in **retrieval and RAG** — the operational core of any production search system. Hybrid retrieval (dense + sparse) is what real RAG pipelines run, not pure semantic search.

---

## How it works

Picture two librarians. One memorises which books *mention* each word and lists them when you ask. The other memorises what each book is *about* and lists semantically-similar books when you ask. Neither is wrong; they answer different questions. The smart system asks both and combines their lists.

### BM25 in one paragraph

BM25 (Best Match 25, Robertson 1994) scores a document for a query by summing: for each query term, how often it appears in the doc (TF, with diminishing returns) times how rare the term is in the corpus (IDF). The result: docs containing many rare terms from the query score highest. The "25" is the parameter-tuning generation; modern BM25 has small tunable constants (k1, b).

```
BM25(d, q) = Σ over query terms t:
  IDF(t) × (f(t, d) × (k1 + 1)) / (f(t, d) + k1 × (1 - b + b × |d| / avg_doclen))

  IDF(t) = log((N - n(t) + 0.5) / (n(t) + 0.5))
  f(t, d) = term frequency in document
  k1, b   = tuning params (typically 1.2, 0.75)
```

The key property: BM25 finds **exact term overlap**. "doctor visit" matches docs containing "doctor" AND/OR "visit." It doesn't know "physician" is related to "doctor."

### Dense retrieval recap

Embed query, compute cosine to all stored embeddings, return top-k. Finds docs with similar *meaning* regardless of overlap. See [02-embeddings-geometrically](./02-embeddings-geometrically.md).

### Side-by-side: same query, different results

```
Query: "doctor visit"
Corpus: 4 docs

doc_a: "I went to see my doctor for a checkup."          ← BM25 ✓✓, dense ✓
doc_b: "Visited the physician yesterday for symptoms."    ← BM25 ✗,  dense ✓
doc_c: "The car needs a visit to the shop for repairs."   ← BM25 ✓ (visit), dense ✗
doc_d: "Random unrelated content about cooking."          ← both ✗

BM25 top-2:    doc_a, doc_c   (overlap on "doctor", "visit")
Dense top-2:   doc_a, doc_b   (semantic similarity)

Neither alone is right. Combine:
RRF top-2:     doc_a, doc_b   (doc_a top in both, doc_b dense-only, doc_c lexical-trap)
```

### When each wins

```
BM25 wins on:
  - Exact identifiers       ("ACM-12345", "v2.3.1", proper nouns)
  - Rare technical terms    ("erythrocytosis")
  - Short keyword queries   ("doctor visit")
  - Negation                ("doctor visit not physical" — terms matter)

Dense wins on:
  - Paraphrase              ("doctor" vs "physician")
  - Cross-language          (English query, French docs)
  - Conceptual queries      ("complaints about long wait times")
  - Long natural-language queries
```

### The principle

This is what people mean by *no single retrieval method is enough*. Production RAG runs both, combines via RRF, sometimes adds a cross-encoder reranker on top. The lesson: retrieval is a layered system, not a single algorithm.

The full picture is below.

---

## Dense vs sparse — diagram

```
Query: "doctor visit"
   │
   ├──────────────────────────────────────────────┐
   ▼                                                ▼
Dense path                                       Sparse path
embed(query)                                     tokenize(query)
  │                                                │
  ▼                                                ▼
cosine vs all stored vectors                     BM25 score vs inverted index
  │                                                │
  ▼                                                ▼
[doc_a 0.92, doc_b 0.88, doc_c 0.30]             [doc_a 8.7, doc_c 5.2, doc_b 0.0]
  │                                                │
  └──────────────┬────────────────────────────────┘
                 ▼
        RRF combine
        score(d) = Σ over methods: 1 / (k + rank_method(d))
                 │
                 ▼
        Top-k unified ranking
```

---

## In this codebase

**Not yet implemented.** No retrieval, no corpus, no BM25 index. The curriculum's `[C2.4]` "dense vs sparse" is **Case B** for reincodes — exercised by the planned **RAG pipeline visualizer** (curriculum line 524).

---

## Elaborate

### Where this pattern comes from
BM25: Robertson & Spärck Jones (1994). Probabilistic-retrieval theory. Dense retrieval: word2vec → BERT → dense passage retrieval (DPR, 2020). Hybrid via RRF: Cormack et al. (2009), revived for LLM RAG ~2023.

### The deeper principle
*Different retrieval methods see different signals.* Combining them gives signal coverage no single method achieves.

### Where this breaks down
- Per-query LLM rewriting can replace BM25's "exact term" advantage (rewrite "ACM-12345" to keep as a literal filter); not free.
- Very small corpora: BM25 needs enough IDF signal; tiny corpora (<100 docs) lose the IDF effect.

### What to explore next
- [04-reranking-cross-encoder](./04-reranking-cross-encoder.md) — the third stage of hybrid retrieval.
- Hybrid retrieval with RRF (`[C2.5]`).

---

## Tradeoffs

### Comparison table

```
┌──────────────────┬──────────────────────────┬──────────────────────────┐
│ Cost dimension   │ Dense (embeddings)       │ Sparse (BM25)            │
├──────────────────┼──────────────────────────┼──────────────────────────┤
│ Compute / query  │ Embed query + cosine     │ Inverted index lookup    │
│ Cost / query     │ $0.0001 (embed) + free   │ Free                     │
│ Index time       │ Embed all docs           │ Tokenize + index         │
│ Storage          │ 1536 floats / doc        │ Sparse posting lists     │
│ Best for         │ Semantic match           │ Exact term match         │
│ Worst for        │ Exact identifiers        │ Paraphrase, multi-lang   │
│ Cold-start cost  │ Embed-time per doc       │ Build inverted index     │
└──────────────────┴──────────────────────────┴──────────────────────────┘
```

### What we gave up

Simplicity. Hybrid = two pipelines + a combination step. More moving parts; more places to fail.

### What the alternative would have cost

Pure dense fails on identifiers and exact-term needs. Pure sparse fails on paraphrase and multi-language. Both failure modes are common enough that production systems pay the hybrid tax.

### The breakpoint

Fine when corpus size and query diversity make both methods earn their place. For tiny corpora (<100 docs), BM25 IDF doesn't work well; for exact-match-only domains (code search), dense isn't needed.

---

## Tech reference (industry pairing)

### BM25 implementations

- **Codebase would use:** `okapibm25` or `lunr.js` for browser-side BM25; for server, `tantivy` (Rust) or built into Postgres/Elasticsearch.
- **Why it'd be here:** the sparse half of hybrid retrieval.
- **Leading today:** `Elasticsearch / OpenSearch BM25` — `adoption-leading` for production sparse retrieval, 2026.
- **Why it leads:** scales to billions of docs; mature ops.
- **Runner-up:** `Tantivy` — `innovation-leading` for embedded use; `Postgres ts_vector` for "just enough" search.

### Hybrid combiners

- **Codebase would use:** Plain RRF (no library needed; ~10 lines of code).
- **Leading today:** Reciprocal Rank Fusion — `adoption-leading` for hybrid combine, 2026.
- **Why it leads:** parameter-free, robust, works across heterogeneous score scales.

---

## Project exercises

### RAG pipeline visualizer (curriculum reference: `Interview prep surface — reincodes`)

- **Exercise ID:** *[reincodes-viz: RAG pipeline visualizer]* — `aieng-curriculum.md:524`, exercises C2.1 + **C2.4** + C2.6.
- **What to build:** An end-to-end RAG pipeline visualizer where the user types a query and the page shows: (1) tokenization of query, (2) embedding vector (PCA-projected), (3) BM25 scores for ~5 demo docs side-by-side with cosine scores, (4) RRF combined ranking, (5) the final retrieved chunks. Highlight which retrieval method "found" each top result.
- **Why it earns its place:** the value proposition of hybrid retrieval is invisible from one half alone — you have to see "BM25 missed this paraphrase, dense missed this identifier, RRF rescued both." That's the senior-level insight every RAG-design interview probes.
- **Files to touch:** `src/app/concepts/ai-engineering/rag-pipeline/page.tsx` (new), `src/components/AI/RAGPipeline.tsx` (new), small embedded BM25 index, demo corpus (5–10 short docs hard-coded).
- **Done when:** A query like "doctor visit" demonstrates the dense-vs-sparse divergence (BM25 ranks one doc, dense ranks another, RRF merges) and the user can swap between top-k=1/3/5 to see the rerank effect. Hover any doc to see its raw scores.
- **Estimated effort:** `1–2 days`.

---

## Summary

### Part 1 — concept recap

Dense and sparse retrieval are complementary. BM25 (sparse) scores by term-overlap weighted by IDF; dense (embeddings) scores by cosine similarity in vector space. reincodes doesn't have either today; the curriculum slates a RAG-pipeline visualizer that shows both side-by-side combined via RRF. The constraint that justifies the viz is "the value of hybrid is invisible without seeing both halves," and the cost is the build effort plus an embedded BM25 lib + embedding API access.

### Part 2 — key points to remember

- BM25 = exact term overlap, IDF-weighted; dense = semantic similarity, cosine.
- BM25 wins on identifiers, rare terms, short queries; dense on paraphrase, multi-lang, conceptual queries.
- RRF combines: `score(d) = Σ 1 / (k + rank_method(d))`.
- Production RAG = both + reranker on top.

---

## Interview defense

### What an interviewer is really asking

When someone asks dense vs sparse, they want you to refuse the false choice. The right answer names the strengths of each, gives an example where each fails, and says "use both, combine with RRF."

### Likely questions

**Q [mid]: When does BM25 beat embeddings?**

A: Exact-term queries — "ACM-12345" should match the doc containing that string, regardless of meaning. Embeddings don't have a sharp peak for exact matches. Also rare technical terms (where IDF surges) and very short queries where there's not enough semantic signal for embeddings.

**Q [senior]: Walk me through RRF in 60 seconds.**

A: For each retrieval method, get ranked list of docs. For each doc d, its RRF score is `Σ over methods: 1/(k + rank_in_method(d))`, where k is a constant (typically 60). The doc with the highest sum wins. Top-1 in any method gets `1/61 ≈ 0.016`; top-1 in both methods gets `2 × 1/61 ≈ 0.033`. Robust to score-scale differences; parameter-free.

**Q [arch]: At 1B docs, can you still do dense + sparse + RRF?**

A: Yes, with the right substrate. Dense: ANN index (HNSW) for ~10ms top-100. Sparse: production search engine (Elasticsearch, Vespa, Lucene) for ~10ms top-100. RRF on the merged results is O(k). Total query latency: ~25–50ms. The cost is operational — two indexes to maintain, two pipelines to deploy.

### One-line anchors

- "BM25 ≠ outdated; it's a complement."
- "Dense for paraphrase; sparse for exact terms."
- "RRF combines without parameter tuning."
- "Production RAG = dense + sparse + rerank."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Draw a hybrid retrieval pipeline: query → both paths → RRF → top-k.

### Level 2 — Explain it out loud
"Why do production RAG systems use both BM25 and embeddings?"

### Level 3 — Apply it to a new scenario
"You have a customer-support knowledge base. A user types `INC-2024-555 password reset`. Which retrieval matches and which misses?"

### Level 4 — Defend the decision you'd change
"For a new RAG system at small scale (1000 docs), would you start with both or pick one?"

### Quick check
- Currently implemented? → No, Case B.
- Combination method? → RRF.
- BM25 strength? → exact term, IDF-weighted.

✓ Pass: all three.
