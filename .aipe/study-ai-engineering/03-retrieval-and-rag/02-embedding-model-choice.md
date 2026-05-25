# Embedding model choice

**Industry name(s):** Embedding model selection, MTEB benchmark, dimension tradeoff, domain-specific embeddings
**Type:** Industry standard

> The decision tree for picking an embedding model — dimension count, provider, domain specificity, "good enough" benchmark — and the operational cost of getting it wrong.

**See also:** → [01-embeddings](01-embeddings.md) · → [03-chunking-strategies](03-chunking-strategies.md) · → [04-vector-databases](04-vector-databases.md) · → [09-stale-embeddings](09-stale-embeddings.md) · → [../00-overview](../00-overview.md)

---

## Why care

### Move 1 — The grounded scenario

You've decided to add embedding-based search to a small documentation site. You search "best embedding model 2026" and the first three blog posts say three different things — text-embedding-3-large, voyage-3, BGE-large. You pick text-embedding-3-large because OpenAI is the default. You ship. Six months later you measure retrieval accuracy on a held-out query set: 64% top-3 hit rate. You try voyage-3 against the same corpus with the same retrieval logic: 78% top-3 hit rate. Same code, same queries, 14 percentage points of accuracy left on the table because of a model choice made on convenience rather than measurement. The corpus is a documentation site — code-heavy, jargon-heavy — and voyage-3 happens to be trained more aggressively on that distribution.

### Move 2 — Name the question

That choice has a name — *embedding model selection*. Not the retrieval algorithm, not the chunking, not the vector store — just the question of *which embedding function turns this corpus's text into vectors*. Pick the wrong model and every downstream metric gets capped. Pick the right model and the same code gets 10–20 percentage points of free accuracy.

### Move 3 — Why answering that question matters

**Why you need to answer that question at all:** because *the embedding model is the most-leveraged decision in a RAG system*. The chunking can be re-tuned. The retrieval can be reranked. The LLM downstream can be swapped. None of those changes touch as much of the pipeline as a model swap does. The embedding model determines the geometry of meaning your corpus lives in — every other component is downstream of that decision. I have shipped RAG systems where the difference between two embedding model choices was the difference between "ship it" and "the eval set fails on every domain-specific query." The model choice is load-bearing in the literal sense: the rest of the system is bolted to it.

### Move 4 — Concrete before/after

Without explicit model selection:

- Default to whatever the first blog post recommends (often OpenAI text-embedding-3-large)
- No eval set to measure quality; the choice is "vibes"
- Discover the model's failure modes via user complaints in production
- Switching models requires re-embedding the entire corpus (one-time cost is non-trivial at scale)
- Locked in by default; switch only when forced

With explicit model selection:

- Define a held-out eval set of (query, expected-doc) pairs — 50-100 pairs for a small corpus
- Embed the corpus with 2-3 candidate models; measure top-K hit rate on the eval set
- Pick based on the measurement, not the blog post
- Document the rationale in the codebase so the next engineer knows why this model
- Re-evaluate at model-upgrade time (every 6-12 months, providers ship new models)

### Move 5 — The one-line summary

Embedding model choice is the load-bearing decision of any RAG system — the model defines the geometry of meaning, and every other component is downstream of that decision. The full mechanics are below.

---

## How it works

### Move 1 — The mental model

An embedding model is a *learned function* that maps text into a high-dimensional space. Different models learn different geometries — what counts as "similar" depends on what the model was trained on (general web text? code? legal documents? scientific papers?), what dimensions it has (384, 768, 1536, 3072), and what objective it was optimized for (general similarity? retrieval-specific? classification-friendly?). Picking a model is picking a geometry.

The strategy: build a small eval set of queries with known-correct retrievals, embed the corpus and the queries with 2-3 candidate models, measure hit@K on the eval set, pick the winner. Document the choice.

```
The decision tree for picking an embedding model

┌─ Is your domain general English text? ────────────────────────┐
│                                                               │
│   YES → Default to OpenAI text-embedding-3-small.             │
│         Measure on eval set. If accuracy is acceptable, ship. │
│                                                               │
│   NO  → ┌─ Is it code-heavy / API docs / technical? ───────┐  │
│         │   YES → Try Voyage-3 or voyage-code-3.            │
│         │   NO  → ┌─ Is it multilingual? ───────────────┐   │
│         │         │   YES → Cohere embed-multilingual.  │   │
│         │         │   NO  → Try a domain-specific model │   │
│         │         │         from MTEB top-10 in your    │   │
│         │         │         domain category.            │   │
│         │         └─────────────────────────────────────┘   │
│         └─────────────────────────────────────────────────────┘
└───────────────────────────────────────────────────────────────┘

   In all cases: measure on YOUR eval set. The MTEB leaderboard
   is a starting point, not a final answer.
```

### Move 2 — The layered walkthrough

#### The dimension tradeoff

The technical thing: more dimensions = richer representation but more storage and slower nearest-neighbor search. text-embedding-3-small returns 1536 dims; text-embedding-3-large returns 3072; text-embedding-3-large with the `dimensions=512` parameter returns 512 (a learned truncation, not just slicing). Voyage-3 returns 1024. sentence-transformers' all-MiniLM-L6-v2 returns 384. Bridge from frontend: this is the same tradeoff as image resolution — higher res captures more detail but costs more to store and process. Concrete consequence: pick the lowest dimension count that holds your retrieval accuracy. Smaller dims = lower storage, faster ANN search, cheaper to re-embed at upgrade time. The OpenAI `dimensions` parameter (their "Matryoshka" embeddings) lets you pick the budget without re-training.

```
storage cost per million embeddings (float32)

dim=384    → 1M × 384 × 4   = 1.5 GB
dim=768    → 1M × 768 × 4   = 3.0 GB
dim=1024   → 1M × 1024 × 4  = 4.0 GB
dim=1536   → 1M × 1536 × 4  = 6.0 GB
dim=3072   → 1M × 3072 × 4  = 12.0 GB

at 100M embeddings, the difference is 600GB
```

#### Domain-specific vs general models

The technical thing: general-purpose embedding models are trained on broad web text; they're "okay at everything." Domain-specific models are trained or fine-tuned on a specific corpus — code (voyage-code-3, OpenAI's specialized models), legal documents (Legal-BERT), biomedical (BioBERT, SciBERT), finance (FinBERT). On their domain, domain-specific models can outperform general models by 5–15 percentage points on retrieval accuracy. Off their domain, they may underperform. Bridge from frontend: this is the same tradeoff as a Tailwind config vs a hand-tuned design system — general gets you 80% of the way for free; domain-specific is the last 15% with real engineering investment. Concrete consequence: if your corpus has strong domain signal (code, legal, medical, technical jargon), test a domain-specific model. If your corpus is mixed or general, the general model is usually fine.

```
when domain-specific embeddings earn their place

corpus type             general model OK?    try domain-specific
──────────────────      ─────────────────    ──────────────────
general blog posts       yes                 no
product descriptions     yes                 marginal
API documentation        marginal            voyage-code-3 / OpenAI code
legal contracts          marginal            Legal-BERT
biomedical research      no                  BioBERT / SciBERT
financial reports        marginal            FinBERT
code search              no                  voyage-code-3
mixed corpus             yes                 no (use general)
```

#### The MTEB leaderboard — the "good enough" benchmark

The technical thing: MTEB (Massive Text Embedding Benchmark, Muennighoff et al. 2022) is the standardized benchmark for embedding models. It evaluates models across 8 task categories (retrieval, classification, clustering, reranking, semantic similarity, etc.) on dozens of datasets. The MTEB leaderboard on HuggingFace ranks models on overall score and per-task scores. Bridge from frontend: this is the Lighthouse for embedding models — a standardized way to compare implementations on a common test suite. Concrete consequence: MTEB is your *starting point* for narrowing down candidates. The top 10 retrieval-task scores are the realistic candidate pool for a new RAG project. But MTEB is not your final answer — your *specific* corpus may behave differently from any benchmark dataset. Use MTEB to pick 2-3 candidates, then measure on your eval set.

#### The Anthropic gap

The technical thing: Anthropic does not ship an embedding model. If you want Anthropic-quality embedding alongside Claude generation, you compose: Voyage (which Anthropic partners with and recommends) for embedding, Claude for generation. Bridge from frontend: this is the same gap as "React for components, but no first-party data-fetching library — pick TanStack Query, SWR, or roll your own." The vendor leaves the gap intentionally. Concrete consequence: don't expect a single-vendor stack. The canonical 2026 split for a Claude-based RAG is Voyage embed + Claude generate. OpenAI is the all-in-one alternative (both their embeddings and their generation models). The choice has downstream effects on billing, vendor lock-in, and operational simplicity.

### Move 3 — The principle

The principle that generalises: *the embedding model is a versioned dependency*, not a hyperparameter. Treating it as a hyperparameter ("we'll just try a few") underestimates the cost of switching — re-embedding a 10M-document corpus is a real operation with real cost. Treating it as a dependency means you version it, you measure it, you document why you picked it, and you plan for upgrades. Every embedding model upgrade is a corpus-wide re-embed; budget for that operation from day one. The full picture is below.

---

## Embedding model choice — diagram

```
┌─ The decision flow ─────────────────────────────────────────────────────┐
│                                                                         │
│   Step 1: Define a held-out eval set                                    │
│   ────────────────────────────────────                                  │
│   ┌───────────────────────────────────────────────────────────────┐    │
│   │ 50-100 pairs of (query, expected_doc_id)                      │    │
│   │ from real or representative user queries                      │    │
│   │ NEVER overlap with training data                              │    │
│   └───────────────────────────────────────────────────────────────┘    │
│                              │                                          │
│                              ▼                                          │
│   Step 2: Pick 2-3 candidate models from MTEB top-10                    │
│   ─────────────────────────────────────────────────                    │
│   ┌──────────────────┬──────────────────┬──────────────────┐           │
│   │ candidate A      │ candidate B      │ candidate C      │           │
│   │ text-embedding-3 │ voyage-3         │ BGE-large        │           │
│   │ -small (1536)    │ (1024)           │ (1024)           │           │
│   └──────────────────┴──────────────────┴──────────────────┘           │
│                              │                                          │
│                              ▼                                          │
│   Step 3: Embed corpus + eval queries with each                         │
│   ──────────────────────────────────────────────                       │
│   ┌───────────────────────────────────────────────────────────────┐    │
│   │ One-time cost: corpus_size × per-1M-token cost × 3            │    │
│   │ Approximate: 10M tokens × $0.02 × 3 = $0.60 of spend          │    │
│   └───────────────────────────────────────────────────────────────┘    │
│                              │                                          │
│                              ▼                                          │
│   Step 4: Measure hit@K on the eval set                                 │
│   ──────────────────────────────────────                               │
│   ┌──────────────────┬──────────────────┬──────────────────┐           │
│   │ candidate A      │ candidate B      │ candidate C      │           │
│   │ hit@3: 64%       │ hit@3: 78%       │ hit@3: 72%       │           │
│   │ hit@10: 81%      │ hit@10: 89%      │ hit@10: 85%      │           │
│   │ latency: 45ms    │ latency: 38ms    │ latency: 200ms   │           │
│   │ cost/1M: $0.02   │ cost/1M: $0.12   │ cost/1M: self    │           │
│   └──────────────────┴──────────────────┴──────────────────┘           │
│                              │                                          │
│                              ▼                                          │
│   Step 5: Pick based on measurement + operational fit                   │
│   ──────────────────────────────────────────────────                   │
│   ┌───────────────────────────────────────────────────────────────┐    │
│   │ If accuracy difference < 3pp: pick on cost / latency / vendor │    │
│   │ If accuracy difference ≥ 5pp: pick the higher-accuracy model  │    │
│   │ Document the choice + rationale                               │    │
│   │ Schedule a re-evaluation in 6-12 months                       │    │
│   └───────────────────────────────────────────────────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

The diagram makes the *decision process* explicit — every embedding model choice should be the output of a measurement, not a recommendation. The cost of the measurement is tiny relative to the cost of getting the choice wrong.

---

## In this codebase

**Not yet implemented.** reincodes is a Next.js static-export DSA visualizer with zero AI surface in production code — no embeddings, no retrieval, no model choices to make. The buildable target for this concept is below in Project exercises — a `/ai/embedding-model-choice` page that renders the same corpus embedded by 3 different models, projected to 2D side-by-side, with a held-out query set scored against each.

**Expected file paths** (when built):
- `src/app/ai/embedding-model-choice/page.tsx` — the visualizer page
- `src/components/EmbeddingModelChoiceVisualizer/` — three-panel layout, side-by-side 2D projections, model selector, accuracy comparison panel
- `public/ai/embedding-model-choice/comparison.json` — precomputed embeddings + 2D projections + hit@K metrics from 3 models against the same corpus
- `scripts/precompute-embedding-comparison.ts` + helper Python script — build-time pipeline that calls each provider's API, projects via t-SNE, computes hit@K on the eval set

---

## Elaborate

### Where this pattern comes from

The "pick the right embedding model" problem became operational around 2022 when OpenAI released `text-embedding-ada-002` and it suddenly mattered which embedding API you called. Before then, most retrieval used BM25 or hand-trained Word2Vec/GloVe; the "model choice" was less a per-project decision than a per-team-standard. The MTEB benchmark (2022) was the field's response to "we now have 50 production embedding APIs; how do we compare them?" Voyage AI emerged in 2023 as a retrieval-specialized embedding provider; Cohere repositioned around `input_type`-aware embeddings; the open-source ecosystem (sentence-transformers, BGE, mxbai) matured into a real alternative to commercial APIs. The decision tree is the practitioner's response to all of this — narrow the candidate pool, measure on your data, document the choice.

### The deeper principle

The deeper principle is that *the embedding function is the most-leveraged-but-least-flexible component* of a RAG system. Most other components can be swapped behind a clean interface — chunking strategy can be changed and the corpus re-chunked, retrieval can be reranked, the LLM can be replaced. The embedding model, once you've embedded a 10M-document corpus, becomes effectively load-bearing — re-embedding costs real money and real time, and the embeddings can't be partially re-embedded (you can't mix vectors from two different models in the same nearest-neighbor search because they live in different geometries). The "choose wisely" framing matters because the *cost of changing your mind later* is asymmetrically large.

### Where this breaks down

The decision-tree approach breaks down for *very small corpora* (< 1000 docs) where the cost of re-embedding is trivial — just try every model and re-run. It breaks down for *mixed corpora* (general English plus some domain-specific subsets) where neither a general nor a domain-specific model is clearly right — the operational answer is sometimes to embed different sub-corpora with different models and route queries based on a classifier. It also breaks down for *fine-tuning paths* where the right answer is "start with a base model and fine-tune it on your domain" rather than "pick a pre-trained model" — fine-tuning embeddings has gotten easier in 2024-2026 (sentence-transformers supports it natively, OpenAI offers it for some tiers) and changes the cost calculus.

### What to explore next

- [01-embeddings](01-embeddings.md) → the parent concept — what an embedding is geometrically
- [03-chunking-strategies](03-chunking-strategies.md) → the downstream decision — embeddings sit on top of chunks, chunk size affects which model performs best
- [04-vector-databases](04-vector-databases.md) → the storage decision — vector DB choice depends partly on what dimensions you've committed to
- [09-stale-embeddings](09-stale-embeddings.md) → the upgrade problem — embeddings drift when the model upgrades; this concept is forced once you have one
- [11-rag](11-rag.md) → the pipeline the model choice slots into

---

## Tradeoffs

### Comparison table — both costs in one frame

```
┌──────────────────┬──────────────────────┬─────────────────────────┐
│ Cost dimension   │ Path taken           │ Alternative             │
│                  │ (measured selection) │ (default to first blog  │
│                  │                      │  post recommendation)   │
├──────────────────┼──────────────────────┼─────────────────────────┤
│ Setup cost       │ Build eval set,      │ Zero — pick and ship    │
│                  │ embed 3 candidates,  │                         │
│                  │ measure              │                         │
│ Per-1M-token cost│ Variable per model   │ Locked in to first      │
│                  │ ($0.02–$0.13)        │ choice                  │
│ Switching cost   │ Documented eval set  │ Re-discover the eval    │
│ later            │ → re-measure → swap  │ set from scratch        │
│ Retrieval        │ Optimized per corpus │ ~5-15pp left on table   │
│ accuracy         │                      │                         │
│ Vendor lock-in   │ Measured tradeoff    │ Whatever the first      │
│                  │ vs accuracy          │ choice was              │
│ Storage cost     │ Pick lowest dim that │ Default dim, often      │
│                  │ holds accuracy       │ over-spec               │
│ Operational      │ Re-evaluate every    │ Stay on initial choice  │
│ overhead         │ 6-12 months          │ until forced to upgrade │
│ Debuggability    │ "Model X scores Y on │ "Search isn't great;    │
│                  │ our eval set"        │ should we try another?" │
└──────────────────┴──────────────────────┴─────────────────────────┘
```

### What we gave up (when planning the reincodes visualizer)

The first cost is *three API integrations*. The visualizer needs to embed the same corpus with 3 different providers (OpenAI, Voyage, Cohere or BGE local) to produce the side-by-side comparison. Each provider has its own SDK, its own auth, its own quirks. The precompute script becomes 3x more complex than a single-provider script. Roughly one full day of integration work plus debugging.

The second cost is *the eval set design*. To make the hit@K comparison meaningful, the visualizer needs a held-out query set with known-correct answers. For a reincodes-themed visualizer, that means 20-30 (query, expected_doc_id) pairs across DSA topics — "explain quicksort's average complexity" → expected to retrieve the quicksort visualizer page; "the algorithm with the pivot" → same expected; "how does Dijkstra work" → expected to retrieve the shortest-path page. Designing these pairs carefully is a half-day of work and changes the visualizer's pedagogical value.

The third cost is *the same static-export bundle constraint*. 3 models × 20 sentences × 1024-3072 dim embeddings × 2D projection per model = ~200-500KB of route-bundle data. Code-splitting under `/ai/embedding-model-choice` keeps it off the home page bundle, but the route is heavier than a single-model visualizer.

### What the alternative would have cost (skipping the visualizer)

If reincodes never builds `/ai/embedding-model-choice`, the cost is zero in the codebase. The concept lives in this written guide; production use lives at other portfolio projects (loopd's RAG, planned features). reincodes stays pure-DSA.

The cost of *not* building it shows up at the moment an interviewer asks "how do you choose between OpenAI and Voyage for embeddings?" Without a visualizer, the candidate describes the MTEB process verbally. That's perfectly fine but weaker than "here's the visualizer — same corpus, three models, hit@3 of 64% vs 78% vs 72% on the held-out queries, with a side-by-side 2D projection showing where the clusters differ."

### The breakpoint

The visualizer earns its place the day the candidate is preparing for a Senior+ AI engineering round where retrieval comparisons are likely to come up. The model-choice question is a recurring senior-level interview probe. The breakpoint is event-shaped: the moment an AI-focused recruiter wants empirical evidence the candidate can compare models methodically.

### What wasn't actually a tradeoff

Picking just one model and skipping the comparison was not a real option for *this* visualizer's pedagogical value. The whole point is the *measurement-driven choice* — single-model isn't a comparison, it's just an embedding visualizer (which is already covered by [01-embeddings](01-embeddings.md)). The 3-model comparison is the new pedagogical payload; skipping it collapses the visualizer back into the sibling.

---

## Tech reference (industry pairing)

### OpenAI `text-embedding-3-small` / `-large`

- **Codebase uses:** not yet — would be the first candidate in the planned `/ai/embedding-model-choice` visualizer. Embed the 20-30 reincodes-themed sentences via `openai.embeddings.create({ model: "text-embedding-3-small" })` at build time and commit to JSON.
- **Why it's here:** OpenAI's text-embedding-3 family is the de facto default in 2026 — the first model most teams try, broad ecosystem support, the cheapest per-1M-token among commercial providers.
- **Leading today:** OpenAI text-embedding-3 — `adoption-leading` for general-purpose embeddings, 2026.
- **Why it leads:** consistent quality across general English text, the `dimensions` parameter (Matryoshka embeddings — request fewer dimensions to save storage without re-training), and the largest existing tooling ecosystem.
- **Runner-up:** Voyage AI `voyage-3` — `innovation-leading` for retrieval-specialized embeddings; consistently leads the MTEB retrieval task scores in 2026.

### Voyage AI `voyage-3` and `voyage-code-3`

- **Codebase uses:** not yet — would be the second candidate, especially for the "code-heavy corpus" comparison. Embed via Voyage's REST API at build time.
- **Why it's here:** Voyage is the canonical retrieval-specialized provider; Anthropic recommends Voyage for Claude-based RAG (Anthropic doesn't ship an embedding model). voyage-code-3 specifically outperforms general models on code search by 10–20 percentage points.
- **Leading today:** Voyage voyage-3 — `innovation-leading` for retrieval-specific quality, 2026.
- **Why it leads:** retrieval-optimized training objective (not general similarity), strong performance on MTEB retrieval tasks, separate models for code (voyage-code-3) and legal/finance domains.
- **Runner-up:** Cohere embed-v3 — `adoption-leading` for typed-input embeddings; the `input_type` parameter ("search_query" vs "search_document") gives an asymmetric-retrieval edge in some configurations.

### MTEB benchmark (HuggingFace leaderboard)

- **Codebase uses:** not yet — would be the candidate-selection tool, referenced in the visualizer's "where these models come from" panel. Read the leaderboard, pick top-3 in the retrieval task category, plug into the comparison.
- **Why it's here:** MTEB is the field's standard benchmark for embedding model quality across 8 task categories. The leaderboard updates as new models ship; using it as a candidate-narrowing tool is the documented best practice in 2026.
- **Leading today:** MTEB — `adoption-leading` for embedding model evaluation, 2026.
- **Why it leads:** standardized task suite, public leaderboard updated continuously, broad coverage (English + multilingual), trusted by every embedding-model paper since 2022.
- **Runner-up:** BEIR (Benchmarking-IR) — `innovation-leading` for retrieval-only benchmarks; narrower than MTEB but deeper on retrieval-specific tasks; still cited as the IR-focused complement to MTEB.

---

## Project exercises

### [B-reincodes-embedding-model-choice-viz] Build the embedding-model comparison visualizer

- **Exercise ID:** `[B-reincodes-embedding-model-choice-viz]` — derived from the curriculum's reincodes "interview prep surface" entry; aligns with Phase 2 concept `[C2.2]` (embedding models — when to pick each).
- **What to build:** a page at `/ai/embedding-model-choice` that renders three side-by-side panels, one per embedding model (OpenAI text-embedding-3-small, Voyage voyage-3, BGE-large or sentence-transformers all-mpnet-base-v2). Each panel shows the same 20-30 reincodes-themed sentences as a 2D t-SNE projection. A query input at the top lets the reader type or pick a query; the closest top-3 sentences in each panel get highlighted with lines drawn to them. A scoreboard at the bottom shows hit@3 and hit@10 on a precomputed 20-pair eval set per model. Hover any model panel to see "what this model is best at" — e.g., "Voyage voyage-3: retrieval-specialized, strong on code/technical text" — pulled from the precomputed comparison metadata.
- **Why it earns its place:** the visualizer makes the *measurement-driven choice* visible — same corpus, three models, three different geometries, three different accuracy scores. The interview signal is that the candidate distinguishes "default to OpenAI" (junior) from "measure on the eval set, then choose" (senior) and has built a teaching artifact for the distinction.
- **Files to touch:** `src/app/ai/embedding-model-choice/page.tsx` (visualizer page), `src/components/EmbeddingModelChoiceVisualizer/` (three-panel layout, D3 2D scatter per panel, query input, scoreboard, model-info hover), `public/ai/embedding-model-choice/comparison.json` (per-model embeddings, 2D projections, eval-set hit@K), `scripts/precompute-embedding-comparison.ts` + Python helper `scripts/project-tsne-3way.py` (build-time pipeline). Add a row to `src/components/Home/conceptsData.tsx`'s `CONCEPT_CATEGORIES` under the `ai-engineering` category.
- **Done when:** the page loads at `/reincodes/ai/embedding-model-choice/` in production, three panels render with their model's 2D projection, the query input updates the top-3 highlight in all three panels, the scoreboard shows hit@K per model from the precomputed JSON. `next build` passes under `output: "export"`. Precompute script runs against 3 providers' APIs (locally, total cost under $0.50).
- **Estimated effort:** 2-3 days. Three API integrations + auth handling: half day. Eval set design (20-30 query/doc pairs): half day. Precompute pipeline (3 models × projection + hit@K): half day. Visualizer page + three-panel layout: one day. Polish + cross-browser: half day.

---

## Summary

### Part 1 — concept recap

Embedding model selection is the load-bearing decision of any RAG system — the model defines the geometry of meaning, and every other component is downstream of that decision. The right answer is *measurement-driven*: build a held-out eval set of (query, expected-doc) pairs, embed the corpus with 2-3 candidate models from the MTEB leaderboard top-10, measure hit@K on the eval set, pick the winner, document the choice. The three axes of comparison are *accuracy* (hit@K), *cost* (per-1M-tokens), and *operational fit* (dimension count, vendor relationship, fine-tuning support). The Anthropic gap means Claude-based RAG typically composes Voyage embed + Claude generate; the OpenAI all-in-one stack is the most common alternative. In reincodes the concept is *planned*; the buildable target is `/ai/embedding-model-choice` — a three-panel side-by-side comparison of the same corpus embedded by 3 different models, with hit@K scores precomputed at build time.

### Part 2 — key points to remember

- **The decision is load-bearing**: the model determines the geometry; everything else is downstream. Switching costs are asymmetrically large at scale (re-embed the whole corpus).
- **The process**: build eval set → narrow candidates via MTEB → measure on eval set → pick the winner → document. Never pick on vibes.
- **The dimensions tradeoff**: lower dims = cheaper storage and faster search; higher dims = potentially better quality. Pick the lowest dim that holds your accuracy. Use the `dimensions` parameter when available.
- **Domain matters**: general models for general text; domain-specific models (voyage-code-3, Legal-BERT, BioBERT) for strong-domain corpora.
- **The Anthropic gap**: Claude-based RAG composes Voyage embed + Claude generate. The single-vendor option is OpenAI.
- **The reincodes shape**: implementation is Case B; buildable target is `/ai/embedding-model-choice` — three side-by-side 2D projections + hit@K scoreboard from a 20-30 query eval set.

---

## Interview defense

### What an interviewer is really asking

Behind "how do you pick an embedding model?" the interviewer is probing whether the candidate has *shipped retrieval at scale* and felt the cost of getting the choice wrong. A junior answer recommends a specific model ("text-embedding-3-large is the best"). A senior answer describes the *process*: "I build a small held-out eval set, narrow candidates via MTEB top-10, embed and measure hit@K on my data, pick on a measured tradeoff between accuracy and cost, document the choice in the codebase so the next engineer knows why." The interviewer is checking whether the candidate distinguishes "I read a blog post" from "I ran the comparison."

### Likely questions

**Q (mid):** Which embedding model should I use for my RAG system?

A: There's no universal answer — it depends on your corpus and your latency/cost budget. The senior process is to (1) build a small eval set of 50-100 (query, expected-doc) pairs from real or representative queries, (2) pick 2-3 candidates from the MTEB retrieval-task top-10 (in 2026 that's usually some mix of OpenAI text-embedding-3, Voyage voyage-3, and a domain-specific or open-source model), (3) embed your corpus with each and measure hit@3 and hit@10 on the eval set, (4) pick the one that wins on a measured tradeoff between accuracy, latency, and cost. Default to text-embedding-3-small if the corpus is general English text and you want broad ecosystem support. Try voyage-3 if retrieval quality is the priority and you're already on Claude. Try voyage-code-3 if the corpus is code-heavy. Try sentence-transformers + open-source if you need self-hosted.

**Q (senior):** When do you reach for a domain-specific embedding model over a general one?

A: When the corpus has strong domain signal — code, legal contracts, biomedical text, finance — and the domain has a well-known specialized model (voyage-code-3, Legal-BERT, BioBERT, FinBERT). The threshold I use: if hit@K on the eval set with a general model is below ~70% and I see specific failure cases tied to domain vocabulary the model isn't handling, that's the signal to try the domain-specific variant. The general → domain-specific lift is typically 5–15 percentage points on domain-heavy corpora; on general corpora, domain-specific models can actually *underperform* the general model (they overfit to their training distribution). The mistake is reaching for domain-specific by default; the right move is reaching for it when the measurement says general isn't enough.

```
when general OK         when domain-specific earns place
─────────────────       ────────────────────────────────
general blog text       code search corpora
mixed corpora           legal contracts
e-commerce reviews      biomedical research
product descriptions    finance / SEC filings
support tickets         specialized scientific
                        technical API docs (sometimes)

general model lift over domain on mixed corpora: 2-5pp
domain model lift over general on its domain: 5-15pp
```

**Q (arch):** At 10× scale — say, a 100M document corpus — does the model choice still matter, or does the noise wash out?

A: It matters more, not less. At 100M docs, the *operational cost of changing your mind* is the dominant consideration. Re-embedding 100M docs costs ~$2000 with text-embedding-3-small at current prices, takes 12-24 hours of throttled API time, and forces a coordinated index rebuild. Picking the wrong model means committing to it for at least 6-12 months because the switching cost is real. The eval set discipline becomes load-bearing: you can't re-evaluate by trial-and-error at that scale; you need a holdout set with a confidence interval that makes the choice statistically defensible. The MTEB-as-narrowing-tool process scales — the decision tree stays the same — but the cost of skipping the measurement step compounds. At 10x scale, the math says you'd need a 1% accuracy improvement to justify a re-embedding cycle, and you can't determine that without an eval set.

```
small corpus (1K docs)            large corpus (100M docs)
─────────────────────             ─────────────────────────
+ swap models freely              - swap cost: $2K + 24h
+ eval set optional               + eval set required
+ MTEB top-3 ≈ all fine           + measured choice essential
+ switching cost trivial          + commit for 6-12 months
                                  + accuracy difference of
                                    < 1pp not worth swap cost
```

### The question candidates always dodge

**Q:** Why not just fine-tune your own embedding model on your data? Wouldn't that always win?

A: It would win on accuracy, by 5-15pp on the fine-tuning target, but the operational cost is rarely justified. Fine-tuning embeddings requires (1) labeled training data — typically thousands of (query, positive_doc, negative_docs) triples — which costs real engineering and labeling time; (2) compute to train (GPU time, modest but not free); (3) inference infrastructure to host the fine-tuned model (self-hosted or managed); (4) ongoing eval and retraining as the corpus drifts. The cost ledger:

```
pre-trained model (off-the-shelf)         fine-tuned model (custom)
─────────────────────────────────         ─────────────────────────
+ zero setup beyond API auth              - data labeling: ~$5-20K
+ vendor handles inference                  for thousands of triples
+ no compute infrastructure               - fine-tuning compute: $500-2K
+ accuracy: 65-80% hit@K                  - hosting: $200-1K/mo if
+ provider upgrades for free                self-hosted
                                          - retraining cadence:
- can't adapt to your domain                quarterly or more
- locked to general performance           + accuracy: 75-90% hit@K
                                          + adapted to your domain
                                          + IP captured in your model

breakeven: > 10M queries/year AND
           > 5pp accuracy improvement
```

The honest answer: fine-tuning is the *senior endgame*, not the *senior default*. The senior default is "measure pre-trained candidates; switch to fine-tuning when the eval set says off-the-shelf has hit a ceiling and the volume justifies the operational cost." The interview move is naming the breakeven explicitly rather than recommending fine-tuning universally.

### One-line anchors

- "Embedding model choice is the most-leveraged decision in a RAG system. Other components are downstream of this one."
- "Process: eval set → MTEB top-10 → embed + measure hit@K → pick on measured tradeoff → document."
- "Domain-specific models win 5-15pp on their domain. Pick them when the eval set says general isn't enough."
- "The Anthropic gap is real. Claude RAG composes Voyage embed + Claude generate; the single-vendor alternative is OpenAI."
- "Fine-tuning is the senior endgame, not the default. Breakeven needs both > 10M queries/year and > 5pp accuracy lift."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw the 5-step decision flow from memory: eval set → candidates from MTEB → embed + measure → comparison → choose + document. For each step, label what the input is and what the output is.

✓ Pass: 5 steps drawn in order, inputs and outputs labeled per step
✗ Fail: re-read the primary diagram, wait 10 minutes, try again

### Level 2 — Explain it out loud

Explain the embedding model choice process to a colleague who has just been asked to add RAG to their product and is wondering which model to use. No notes. Under 90 seconds.

Checkpoints — did you:
- Name the eval set as the load-bearing step?
- Reference MTEB as the candidate-narrowing tool?
- Mention the dimension tradeoff (storage vs accuracy)?
- Distinguish general vs domain-specific?
- Reference the buildable target (`/ai/embedding-model-choice` visualizer)?

If you skipped any: you described a list of models, you didn't argue for the process.

### Level 3 — Apply it to a new scenario

A planned reincodes feature: semantic search across all 20+ algorithm visualizer pages plus the README and notes files (DSA pseudo-code, time-complexity discussions). The corpus is small (~50 documents, ~5K tokens each).

Walk through the model-choice process for this corpus. Which models would you put on the candidate list? What would your eval set look like (10 example queries)? How would you measure?

Write your answer (10+ sentences including the eval queries). Then verify against the `## How it works` section's decision tree.

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff from the Tradeoffs section. Answer in writing: "If I were starting the `/ai/embedding-model-choice` visualizer today with a $5 build-time API budget, would I still embed with 3 different providers, or would I cut to 2 and lean on the literature for the third? Why? What does each choice cost?"

Reference the actual code:
→ Point to where the precompute script lives (`scripts/precompute-embedding-comparison.ts`)
→ Point to `next.config.ts` for the static-export contract that forces precompute-at-build-time

There is no right answer. The point is specificity.

### Quick check — code reference test

Without opening any files, answer:
- What benchmark is the standard tool for narrowing embedding-model candidates in 2026?
- What is the dimension count of `text-embedding-3-large`?
- What's the typical accuracy lift from switching from a general model to a domain-specific one on its domain?

Then verify by re-reading the `## How it works` section.

✓ Pass: "MTEB", "3072", "5-15 percentage points"
✗ Fail on details: that's fine — the shape is what matters. Numbers should be recoverable from the comparison logic.
