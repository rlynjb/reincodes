# Vector databases

**Industry name(s):** Vector database, vector store, ANN index, approximate nearest neighbor (ANN) search
**Type:** Industry standard

> Where embeddings get stored and how nearest-neighbor search runs at scale — and when a "vector database" is the wrong tool for what's actually a 10K-row cosine-similarity problem.

**See also:** → [01-embeddings](01-embeddings.md) · → [02-embedding-model-choice](02-embedding-model-choice.md) · → [09-stale-embeddings](09-stale-embeddings.md) · → [10-incremental-indexing](10-incremental-indexing.md) · → [11-rag](11-rag.md) · → [../00-overview](../00-overview.md)

---

## Why care

### Move 1 — The grounded scenario

You've embedded 5,000 documents. Each embedding is 1536 floats. You want to find the top-3 most similar to a query embedding. The obvious approach: compute cosine similarity between the query and every stored embedding, sort, return top-3. You wire it up — `Array.prototype.map` over the stored vectors, `Array.prototype.sort` by score, slice top-3. It runs in 80ms. Ships fine. Then a colleague says "we should use Pinecone." Why? You're at 5K vectors and 80ms; that's well under any latency budget. Three months later you have 500K vectors and the same code takes 8 seconds per query. *Now* you need a vector database. The question was never "vector DB or not" — it was "at what scale does the brute force stop working."

### Move 2 — Name the question

That scale question has a name — *vector database choice*. Not the embedding model, not the chunking, not the retrieval algorithm in the abstract — just the question of *what storage layer and what index structure should hold your embeddings*. The wrong answer at 5K vectors is "spin up a Pinecone cluster" — overkill, expensive, hosted-only. The wrong answer at 5M vectors is "in-memory cosine loop" — won't scale, doesn't persist, no metadata filtering.

### Move 3 — Why answering that question matters

**Why you need to answer that question at all:** because *the choice between in-memory cosine, embedded SQLite-vec, Postgres pgvector, and managed services (Pinecone, Qdrant Cloud) is a $0-vs-$2000/month decision with operational consequences*. At small scale, paying for a managed vector DB is burning money you didn't need to spend. At medium scale, running a self-hosted Qdrant or pgvector is a real ops surface that wasn't there before. At large scale, building your own ANN index from scratch is months of engineering you could have offloaded for a few hundred dollars a month. The decision tree is *scale-dependent*, and most teams get it wrong in the same direction — they over-provision early, lock into a managed service, and discover six months later that a pgvector install in their existing Postgres would have done the job.

### Move 4 — Concrete before/after

Without thinking about scale (default to "vector DB"):

- Pick Pinecone because the docs are good
- $70-$2000/month for storage you don't yet need
- New external dependency, new auth, new SDK, new failure mode
- Brute-force cosine would have worked at your actual scale
- Switching off later is a re-indexing operation

With scale-matched choice:

- Under 10K vectors: in-memory cosine loop, JSON file, zero infrastructure
- 10K-1M vectors: SQLite with `sqlite-vec` extension, or pgvector in existing Postgres
- 1M-100M vectors: self-hosted Qdrant / Weaviate, or managed Pinecone
- 100M+ vectors: tier-1 vector DB or custom infrastructure
- Each tier matches operational complexity to actual need

### Move 5 — The one-line summary

A vector database is the same thing as a relational database with an ANN index — a place to store vectors and search them efficiently — and the right choice is *the simplest one that fits your scale*, which is usually one tier smaller than the team's instinct. The full mechanics are below.

---

## How it works

### Move 1 — The mental model

A vector database does three things: (1) stores vectors associated with IDs and metadata, (2) given a query vector, returns the K nearest neighbors by some distance metric (cosine, Euclidean, dot product), (3) supports metadata filtering ("nearest neighbors where `category = 'sorting'`"). The third capability is what distinguishes a real vector DB from a "throw vectors in a file and loop." The K-nearest-neighbor query is the load-bearing operation; everything else is plumbing.

The strategy: pick the storage layer by scale. Add metadata filtering when retrieval needs it. Don't pay for capabilities you won't use.

```
Vector DB capabilities at a glance

storage         search             metadata filter
─────────       ─────────          ────────────────
in-memory       brute force        manual JS filter
+ JSON file     O(N) per query     after-query
                                   
SQLite +        HNSW index         WHERE clauses
sqlite-vec      sub-100ms                          
                                   
Postgres +      IVF or HNSW        SQL WHERE +
pgvector        sub-100ms          composite index
                                   
Pinecone /      HNSW (proprietary) Metadata filter
Qdrant /        sub-100ms          on indexed fields
Weaviate                           
```

### Move 2 — The layered walkthrough

#### In-memory cosine — the baseline

The technical thing: load all embeddings into a JS array (or Python list), compute cosine similarity between the query and every stored vector, sort, take top-K. The whole "database" is a JSON file on disk loaded at startup. Bridge from frontend: this is the `array.filter().sort().slice(0,3)` pattern — works fine for small N. Concrete consequence: this is the *right* answer for under ~10K vectors. Latency under 50ms, zero infrastructure, trivial to debug. The reason teams skip this option is that "vector database" sounds more impressive than "we loop over an array" — but at 5K vectors with 1536-dim float32 embeddings, the brute-force loop is faster than the network round-trip to a managed service.

```
in-memory brute force

function search(query, vectors, K) {
  return vectors
    .map(v => ({ id: v.id, score: cosine(query.embedding, v.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, K);
}

scale ceiling: ~10K vectors at sub-100ms p99
storage: JSON file, loaded at startup
infrastructure: zero
```

#### `sqlite-vec` and Postgres `pgvector` — the persistent middle

The technical thing: SQLite with the `sqlite-vec` extension (and Postgres with `pgvector`) embeds vector search into a database you probably already have. `sqlite-vec` ships as a loadable extension; `pgvector` as a Postgres extension installed via `CREATE EXTENSION vector`. Both expose a vector column type, indexes (HNSW or IVFFlat), and SQL syntax for K-NN queries. Bridge from frontend: this is the same shape as adding a full-text-search index to an existing Postgres table — you get the new capability inside the database you're already operating, no new service to run. Concrete consequence: this is the *right* answer for 10K-1M vectors when you also need metadata filtering or transactional consistency between vectors and other data. The chosen tier when the corpus lives in the same database as the user data.

```
pgvector usage pattern

CREATE EXTENSION vector;
CREATE TABLE docs (
  id        SERIAL PRIMARY KEY,
  content   TEXT,
  category  TEXT,
  embedding vector(1536)
);
CREATE INDEX ON docs USING hnsw (embedding vector_cosine_ops);

SELECT id, content
FROM docs
WHERE category = 'sorting'
ORDER BY embedding <=> $1   -- cosine distance
LIMIT 5;
```

#### Managed services — Pinecone, Qdrant Cloud, Weaviate Cloud

The technical thing: dedicated vector-database services. You ship vectors via REST/gRPC API; they handle storage, indexing, replication, failover. Pricing is per-vector-stored + per-query, typically $70-$2000/month for production deployments. Bridge from frontend: this is the same shape as offloading auth to Auth0 — a non-core capability handled by a specialist provider, in exchange for monthly cost and vendor lock-in. Concrete consequence: this is the right answer at 1M+ vectors, when (a) the vector workload is large enough to justify dedicated infrastructure, (b) the team doesn't want to operate a self-hosted Qdrant/Weaviate cluster, or (c) the use case needs features the managed service has invested in (hybrid search, namespace isolation, sub-second updates at scale).

```
managed-service pricing rough estimate (2026, mid-tier)

Pinecone serverless    $0.0001/query + $5/GB storage/month
Qdrant Cloud           $25/month starter, scales with shards
Weaviate Cloud         $25-200/month based on data + queries

at 10M vectors + 100K queries/day:
~$200-800/month, depending on provider tier
```

#### HNSW vs IVF — the index structures

The technical thing: ANN indexes trade exact recall for speed. *HNSW* (Hierarchical Navigable Small World, Malkov & Yashunin 2016) builds a multi-layer graph where each node has neighbor links; search walks the graph greedy-fashion. Typical recall 95-98% at 100×+ speedup over brute force. *IVF* (Inverted File Index) partitions vectors into clusters; search only checks the K nearest clusters. Lower recall than HNSW by default but lower memory footprint. Bridge from frontend: HNSW is to vector search what B-tree is to relational queries — the default index type because it works well across most distributions. Concrete consequence: HNSW is the default in 2026 (`pgvector` defaults to HNSW since v0.5; Qdrant/Weaviate/Pinecone all use HNSW or variants). Use IVF only when memory is the constraint.

### Move 3 — The principle

The principle that generalises: *vector storage is a tier decision*, and the tiers map to corpus size. Under 10K = in-memory. 10K-1M = embedded extension (sqlite-vec, pgvector). 1M-100M = self-hosted or managed. 100M+ = tier-1 managed or custom. The senior move is to pick the tier that matches actual scale (with one tier of headroom for growth) and not over-provision. Most "we need a vector database" decisions are made by teams at 5K vectors who would be better served by 30 lines of in-memory cosine. The full picture is below.

---

## Vector databases — diagram

```
┌─ The scale-tier decision tree ──────────────────────────────────────────┐
│                                                                         │
│   corpus size      latency budget     storage choice                    │
│   ───────────      ───────────────    ──────────────                    │
│                                                                         │
│   < 10K vectors    < 100ms            in-memory cosine                  │
│                                       JSON file on disk                 │
│                                       zero infrastructure               │
│                                                                         │
│   10K-1M vectors   < 100ms            sqlite-vec OR pgvector            │
│                                       in existing DB                    │
│                                       HNSW or IVF index                 │
│                                                                         │
│   1M-100M vectors  < 100ms            self-hosted Qdrant /              │
│                                       Weaviate / Milvus                 │
│                                       OR managed (Pinecone)             │
│                                                                         │
│   100M+ vectors    < 100ms            managed at scale (Pinecone        │
│                                       Pod, Vertex Vector,               │
│                                       Qdrant Enterprise)                │
│                                       OR custom infrastructure          │
│                                                                         │
│   The default mistake:                                                  │
│   "we should use Pinecone" at any scale → ends up paying $70-$2000/mo   │
│   for capabilities the team doesn't need; brute-force would have worked │
│                                                                         │
│   ───────────────────────────────────────────────────────────────       │
│                                                                         │
│   HNSW vs IVF (index structure)                                         │
│                                                                         │
│   HNSW                                IVF                               │
│   ┌──────────────────────────┐        ┌──────────────────────────┐     │
│   │ multi-layer graph        │        │ inverted file partitions │     │
│   │ 95-98% recall            │        │ 85-95% recall (default)  │     │
│   │ higher memory            │        │ lower memory             │     │
│   │ default in 2026          │        │ used when memory matters │     │
│   └──────────────────────────┘        └──────────────────────────┘     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

The diagram makes the scale-tier mapping explicit. Most teams should be one tier lower than their instinct.

---

## In this codebase

**Not yet implemented.** reincodes is a Next.js static-export DSA visualizer with zero AI surface in production code — no vector storage, no ANN index, no retrieval. The buildable target is below in Project exercises — a `/ai/vector-databases` page that renders the same query against three precomputed vector indices (in-memory cosine, sqlite-vec, pgvector) showing latency + recall side-by-side.

**Expected file paths** (when built):
- `src/app/ai/vector-databases/page.tsx` — the visualizer page
- `src/components/VectorDatabasesVisualizer/` — three-tier comparison panels, latency graph, recall graph, query input
- `public/ai/vector-databases/index-comparison.json` — precomputed queries with results from each tier, latency measurements, recall scores
- `scripts/precompute-vector-databases.ts` — build-time pipeline that runs the same query set against each storage tier and records results

---

## Elaborate

### Where this pattern comes from

Vector databases as a category emerged around 2019-2020 with Pinecone, Weaviate, and Milvus. Before that, ANN libraries existed (FAISS from Meta 2017, Annoy from Spotify 2015) but you ran them as libraries, not as services. The LLM-RAG wave from 2022 made vector search a workload most teams needed but few wanted to operate themselves, which created the managed-service market. `pgvector` (2021) was the response from the existing-Postgres camp: "you already have Postgres; why run a separate service?" `sqlite-vec` (2024) extended the same logic to embedded databases. The current state (2026) is a layered stack — managed services at the top for large-scale, pgvector/sqlite-vec in the middle for embedded vector workloads, in-memory at the bottom for small corpora.

### The deeper principle

The deeper principle is that *vector search is just an indexed query*, and the question of "do I need a special database for it?" is the same question as "do I need a special database for full-text search?" Sometimes the answer is yes (large scale, specialized features); sometimes the answer is "use the extension in the database I already have." The over-provisioning instinct comes from treating vector search as exotic when it's just one more index type. The same engineer who would never spin up a dedicated full-text search cluster for 5K documents (Postgres' `tsvector` is fine) will reach for Pinecone for 5K vectors. The discipline is to treat both decisions with the same scale-matched judgment.

### Where this breaks down

The tier framing breaks down for *hybrid workloads* where vector search composes with other operations. If the corpus needs *transactional updates* (insert a document and its embedding atomically), the embedded-extension option (pgvector) wins because it's part of the same transaction boundary as the rest of the data. If the corpus needs *real-time ingestion at scale* (millions of new vectors per hour), the managed-service option wins because they've solved the streaming-ingest problem. If the corpus needs *multi-tenant isolation* (each customer's vectors in their own namespace), managed services like Pinecone offer this as a feature; embedding it into pgvector requires more work. The tier-by-size heuristic is the starting point, not the final answer.

### What to explore next

- [01-embeddings](01-embeddings.md) → what gets stored in the vector DB
- [02-embedding-model-choice](02-embedding-model-choice.md) → dimension count interacts with storage cost
- [09-stale-embeddings](09-stale-embeddings.md) → operational concern that surfaces once vectors are persisted
- [10-incremental-indexing](10-incremental-indexing.md) → operational pattern for keeping the index fresh
- [11-rag](11-rag.md) → the pipeline the vector DB slots into

---

## Tradeoffs

### Comparison table — both costs in one frame

```
┌──────────────────┬──────────────────────┬─────────────────────────┐
│ Cost dimension   │ Path taken           │ Alternative             │
│                  │ (scale-matched tier) │ (default to managed)    │
├──────────────────┼──────────────────────┼─────────────────────────┤
│ Monthly cost     │ $0 at small scale    │ $70-2000/mo from day 1  │
│                  │ scales with usage    │                         │
│ Infrastructure   │ Use existing DB      │ New service, new auth,  │
│ surface          │ where possible       │ new failure mode        │
│ Setup time       │ Minutes (in-memory)  │ Hours (managed) + days  │
│                  │ to hours (pgvector)  │ to integrate            │
│ Lock-in          │ Portable             │ Proprietary index, hard │
│                  │ (standard SQL)       │ to migrate              │
│ Scaling cost     │ Tier-by-tier upgrade │ Vendor pricing curve    │
│                  │ as needed            │                         │
│ Operational      │ Familiar (Postgres   │ New runbook, new on-    │
│ runbook          │ ops if pgvector)     │ call rotation           │
│ Sub-100ms        │ Achievable at all    │ Achievable but $$$      │
│ latency at scale │ tiers with right     │                         │
│                  │ index                │                         │
│ Metadata filter  │ SQL WHERE clauses    │ Provider-specific       │
│ expressiveness   │ (very expressive)    │ filter language         │
└──────────────────┴──────────────────────┴─────────────────────────┘
```

### What we gave up (when planning the reincodes visualizer)

The first cost is *the three-tier setup for precompute*. The visualizer needs to actually run the query set against three different storage layers — in-memory JS cosine, sqlite-vec, pgvector — and capture real latency + recall numbers. That means the precompute script has to (a) wire up sqlite-vec as a loadable extension, (b) spin up a temporary Postgres with pgvector for the duration of the build, (c) run the same 20-query set against all three. Maybe one full day of pipeline engineering before the visualizer renders anything.

The second cost is *the static-export constraint forcing precomputed latency*. Real latency varies with hardware and network; precomputed numbers are *typical* not *guaranteed*. The visualizer has to either disclose that the latencies were measured on a specific environment (and link to the methodology) or risk misleading the reader. A small footnote on the page handles this.

The third cost is *bundle-size growth*. Three tiers × 20 queries × top-5 results × per-tier latency = manageable but non-trivial JSON. Route bundle gets to ~100KB.

### What the alternative would have cost (skipping the visualizer)

If reincodes never builds `/ai/vector-databases`, the cost is zero in the codebase. The concept lives in this guide; production use lives at other portfolio projects. reincodes stays pure-DSA.

The cost of *not* building it shows up at the moment an interviewer asks "how do you choose between Pinecone, pgvector, and in-memory?" Without a visualizer, the candidate describes the tier-matching verbally. That's fine but weaker than "here's the visualizer — same query, three tiers, here are the latencies and recall numbers; here's the tradeoff curve."

### The breakpoint

The visualizer earns its place when preparing for an AI/RAG-focused interview where vector-store choice is likely to come up. The tier-matching question is a common senior-level probe because it's where most teams overspend in their first RAG project. The breakpoint is event-shaped.

### What wasn't actually a tradeoff

Running the precompute against a managed service (Pinecone, Qdrant Cloud) was not a real option for the visualizer's economics — managed services charge per query and per stored vector, and even modest precompute runs cost real money. The three-tier comparison is bounded to free or locally-runnable tiers (in-memory, sqlite-vec, pgvector). The managed-service comparison is described textually with reference latencies but not measured.

---

## Tech reference (industry pairing)

### `pgvector` (Postgres extension)

- **Codebase uses:** not yet — would be one of the three storage tiers in the planned `/ai/vector-databases` precompute. Spin up a temporary Postgres at build time, `CREATE EXTENSION vector`, run the query set against it.
- **Why it's here:** pgvector is the de facto default for "vector search inside the database you already have" in 2026. The most-deployed vector-search solution in production.
- **Leading today:** pgvector — `adoption-leading` for embedded vector search, 2026.
- **Why it leads:** zero new infrastructure if you're on Postgres, HNSW index since v0.5, native SQL integration for metadata filtering, and the entire Postgres ecosystem (replication, backups, observability) applies for free.
- **Runner-up:** sqlite-vec — `innovation-leading` for embedded/local vector search; relevant for desktop apps, edge deployments, and prototypes where Postgres is too heavy.

### Pinecone (managed vector DB)

- **Codebase uses:** not yet — would be the reference latency/cost in the visualizer's "managed tier" comparison column, sourced from public documentation.
- **Why it's here:** Pinecone is the most-deployed managed vector DB in 2026 — the canonical choice when the team doesn't want to operate vector infrastructure.
- **Leading today:** Pinecone — `adoption-leading` for managed vector DBs, 2026.
- **Why it leads:** the simplest API among managed services, serverless tier for small workloads, hybrid search (dense + sparse) integrated, and the strongest enterprise feature set (replication, namespaces, multi-region).
- **Runner-up:** Qdrant Cloud — `innovation-leading` for managed vector DBs with strong self-hosted parity; the open-source-compatible alternative; lower cost at scale; gaining adoption among cost-sensitive teams.

### HNSW algorithm (Malkov & Yashunin 2016)

- **Codebase uses:** not yet — would be the ANN algorithm referenced in the visualizer's "how does this scale?" panel. pgvector's HNSW index would do the actual work in the middle tier.
- **Why it's here:** HNSW is the dominant ANN index in 2026. Every major vector DB uses HNSW or a variant.
- **Leading today:** HNSW — `adoption-leading` for ANN indexing, 2026.
- **Why it leads:** ~95-98% recall at 100×+ speedup over brute force, sub-100ms p99 at 100M-vector scale on commodity hardware, well-understood tuning parameters (m, ef_construction, ef_search).
- **Runner-up:** ScaNN (Google's quantization-based ANN) — `innovation-leading` for extreme-scale vector search; used internally at Google for billion-scale workloads; available as an open-source library but less ecosystem support than HNSW.

---

## Project exercises

### [B-reincodes-vector-databases-viz] Build the vector-database tier-comparison visualizer

- **Exercise ID:** `[B-reincodes-vector-databases-viz]` — derived from the curriculum's reincodes "interview prep surface" entry; aligns with Phase 2 concept `[C2.7]` (vector databases — pgvector, sqlite-vec, in-memory).
- **What to build:** a page at `/ai/vector-databases` with three side-by-side panels representing storage tiers: in-memory cosine, sqlite-vec, pgvector. Each panel shows the same query running through the tier, with latency and recall@5 displayed. A scale slider at the top lets the reader pick 1K, 10K, 100K, 1M vectors (precomputed indices for each scale point). The reader sees the in-memory tier degrade past 10K, the sqlite-vec tier stay strong through 1M, and the pgvector tier behave similarly. A "managed tier" panel on the side shows reference Pinecone numbers (annotated as "reference, not measured locally").
- **Why it earns its place:** the visualizer makes the tier-matching decision *empirical* — the reader sees in-memory degrade and the embedded extensions hold up, and forms intuition about when each tier earns its place. The interview signal is that the candidate didn't default to "use a vector DB" but ran the experiment to know when each tier wins.
- **Files to touch:** `src/app/ai/vector-databases/page.tsx` (visualizer page), `src/components/VectorDatabasesVisualizer/` (three-panel comparison + scale slider + latency chart), `public/ai/vector-databases/index-comparison.json` (precomputed query results at 4 scale points × 3 tiers + recall scores + latency), `scripts/precompute-vector-databases.ts` (build-time pipeline: generate synthetic corpus, embed, run queries against in-memory + sqlite-vec + pgvector, record). Add a row to `src/components/Home/conceptsData.tsx` under `ai-engineering`.
- **Done when:** the page loads at `/reincodes/ai/vector-databases/` in production, three storage tiers compare side-by-side with latency and recall numbers, the scale slider switches between precomputed scale points, the managed-tier reference panel is clearly annotated. `next build` passes under `output: "export"`.
- **Estimated effort:** 2-3 days. Synthetic corpus generation + embedding (one model, varying scale): half day. Three-tier precompute pipeline (in-memory + sqlite-vec install + pgvector container): one day. Visualizer page + three-panel layout: one day. Polish + cross-browser: half day.

---

## Summary

### Part 1 — concept recap

A vector database stores embeddings and runs nearest-neighbor search efficiently. The right choice is *scale-matched*: under 10K vectors use in-memory brute-force cosine; 10K-1M vectors use an embedded extension (sqlite-vec or pgvector); 1M-100M use self-hosted Qdrant/Weaviate or managed Pinecone; 100M+ use tier-1 managed services or custom infrastructure. HNSW is the dominant ANN index in 2026, used by every major provider; IVF is the memory-conservative alternative. The classic over-provisioning mistake is reaching for managed services at small scale when brute-force or pgvector would have worked. In reincodes the concept is *planned*; the buildable target is `/ai/vector-databases` — a three-tier side-by-side comparison with latency and recall numbers at varying scale, with managed services shown as reference annotations. The static-export contract forces precomputed measurements rather than live queries; the tier-matching framing is the pedagogical payload.

### Part 2 — key points to remember

- **The four tiers**: in-memory (< 10K), sqlite-vec/pgvector (10K-1M), self-hosted/managed (1M-100M), tier-1 managed (100M+).
- **The default mistake**: reaching for Pinecone at 5K vectors. Brute-force would have worked. Match the tier to scale.
- **HNSW is the default index** in 2026. Use IVF only when memory matters.
- **Metadata filtering is the second-most-important capability** after K-NN search. SQL WHERE clauses (pgvector) are the most expressive; vendor-specific filter languages are typically less so.
- **The hybrid-workload exception**: transactional updates → pgvector wins; real-time large ingestion → managed wins; multi-tenant → managed often wins.
- **The reincodes shape**: implementation is Case B; buildable target is `/ai/vector-databases` — three-tier comparison with scale slider and precomputed latency/recall at multiple scale points.

---

## Interview defense

### What an interviewer is really asking

Behind "what vector database do you use?" the interviewer is probing whether the candidate has *operated* a vector workload at scale or just *picked a service*. A junior answer names a specific product ("Pinecone"). A senior answer describes the *scale-matching process*: "at small scale, in-memory cosine; once we crossed ~50K vectors and needed metadata filtering, we moved to pgvector in our existing Postgres; we'd reach for Pinecone or self-hosted Qdrant past 1M vectors or if the workload needed features Postgres doesn't have." The interviewer is checking whether the candidate over-provisions or right-sizes.

### Likely questions

**Q (mid):** When do you need a dedicated vector database?

A: When the corpus exceeds the scale of cheaper alternatives or when you need capabilities that cheaper options don't have. The tiers I think in: under 10K vectors, in-memory brute-force cosine works at sub-100ms with zero infrastructure; 10K-1M vectors, an embedded extension like `pgvector` or `sqlite-vec` keeps the workload in a database you already operate; 1M-100M vectors, you're picking between self-hosted Qdrant/Weaviate and managed services like Pinecone; 100M+, managed services or custom infrastructure. Most teams should be one tier lower than their instinct — the "we need a vector DB" decision is often made at scales where pgvector or even brute-force would have worked.

**Q (senior):** HNSW vs IVF — when do you pick each?

A: HNSW is the 2026 default because it gives 95-98% recall at 100×+ speedup over brute force with good tuning, and the parameters (`m`, `ef_construction`, `ef_search`) are well-understood. IVF earns its place when memory is the bottleneck — IVF's footprint is meaningfully smaller because it's a partition index, not a graph index. The other consideration is *index build time*: HNSW indexes take longer to build than IVF on the same corpus, which matters at large scale where a full reindex can take hours. For most production RAG, HNSW; for memory-constrained or high-throughput-ingestion workloads, consider IVF. pgvector defaults to HNSW since v0.5; that's a good signal of where the field landed.

```
HNSW                                  IVF
─────────                             ─────────
+ 95-98% recall at default tuning     - 85-95% recall, more sensitive
+ sub-100ms p99 at 100M               + lower memory footprint
- larger memory                       - more sensitive to data
- slower index build                    distribution
+ default in pgvector, Qdrant,        - slower nearest-cluster selection
  Pinecone, Weaviate                  + faster index build
```

**Q (arch):** Your corpus grows from 50K to 50M vectors over 18 months. How does your infrastructure choice evolve?

A: It evolves in tiers. At 50K, pgvector in the existing Postgres works fine — HNSW index, sub-100ms p99, metadata filtering via SQL WHERE. At ~500K, monitor query latency and memory pressure on Postgres; this is when the index size becomes a meaningful share of Postgres' working memory. At 1M-5M, decide whether to (a) scale Postgres up (bigger box, more memory for the HNSW index) or (b) move vectors out to a dedicated store. The decision turns on whether other Postgres workloads compete with the vector workload for resources. At 10M+, the operational case for a dedicated vector store (Qdrant self-hosted or Pinecone managed) usually wins — vector workloads have different access patterns from transactional Postgres queries, and isolating them buys headroom for both. At 50M, you're firmly in dedicated-store territory. The migration cost between tiers is real but bounded — re-export embeddings, re-index in the new store, swap the retrieval layer's storage adapter. Plan for it from day one but don't over-provision before you need to.

### The question candidates always dodge

**Q:** Why not just use Pinecone from day one? The cost is small and it scales forever.

A: That argument hides three real costs. First, *operational*: Pinecone is a new external dependency with its own SDK, auth model, failure modes, and runbook. At small scale, the operational surface of "loop over a JS array" is much smaller than the surface of "Pinecone client, auth, rate limits, network round-trip, monitoring." Second, *cost*: at 5K vectors, Pinecone serverless costs ~$30-70/month minimum; brute-force in JS costs $0. Over a year, that's $400-800 for a capability you don't need. Third, *lock-in*: once vectors are in Pinecone, migrating off requires re-indexing (no `pg_dump` for vectors), which is months of operational work at large scale. The cost ledger:

```
"just use Pinecone from day one"        "scale-match the tier"
────────────────────────────────        ───────────────────────
+ no migration needed later             - migration between tiers
+ uniform API across scales               (real but bounded cost)
- $400-2000/year at small scale         + $0 at small scale
  for unused capacity                   + scales with usage
- new SDK, new auth, new failure        + uses existing DB skills
  modes                                 + portable SQL queries
- vendor lock-in                        - migration plan needed
- network round-trip latency              when crossing tiers
  on every query
```

The honest answer: "just use Pinecone" is the easy default that costs $1K+/year for capabilities you may never need. The senior move is matching the tier to scale and accepting one migration when crossing tiers as the cost of right-sizing. The interview move is naming the operational + cost + lock-in costs rather than treating "managed service" as the safe default.

### One-line anchors

- "Vector storage is a tier decision: in-memory, pgvector/sqlite-vec, self-hosted/managed, tier-1 managed."
- "Most teams over-provision. Pick one tier lower than your instinct; brute force works at 5K vectors."
- "HNSW is the 2026 default index. ~95-98% recall at 100×+ speedup. Use IVF only when memory matters."
- "pgvector is the canonical 'vectors in the DB you already have' choice. Earns its place at 10K-1M vectors."
- "Migration between tiers is real but bounded. Don't over-provision to avoid it; plan for it instead."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw the four-tier scale decision tree from memory: each tier with its scale range, storage choice, and one operational characteristic.

✓ Pass: 4 tiers named, scale ranges correct, storage choice per tier identified
✗ Fail: re-read the primary diagram, wait 10 minutes, try again

### Level 2 — Explain it out loud

Explain the vector database tier-matching to a colleague who is setting up RAG for a new product and has read that "everyone uses Pinecone." No notes. Under 90 seconds.

Checkpoints — did you:
- Name the 4 tiers in order?
- Identify the over-provisioning instinct?
- Distinguish HNSW from IVF?
- Mention metadata filtering as a real capability difference?
- Reference the buildable target (`/ai/vector-databases`)?

If you skipped any: you described the tiers, you didn't argue for the matching.

### Level 3 — Apply it to a new scenario

A planned reincodes feature: a "search across DSA notes and code" feature indexing ~500 documents. The site is static-exported to GitHub Pages with no backend.

Pick the storage tier. What works under the static-export constraint? What index structure? Where does the index live? How does the user's browser actually run the query?

Write your answer (5+ sentences). Then verify against `next.config.ts`'s static-export constraints — note that even in-memory cosine requires the embeddings to ship in the route bundle.

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff from the Tradeoffs section. Answer in writing: "If I were starting the `/ai/vector-databases` visualizer today, would I include a managed-tier panel with reference numbers, or would I cut to three locally-measurable tiers (in-memory, sqlite-vec, pgvector)? Why? What does each choice cost?"

Reference the actual code:
→ Point to where the precompute script lives
→ Point to `next.config.ts` for the static-export constraint

There is no right answer. The point is specificity.

### Quick check — code reference test

Without opening any files, answer:
- At what scale does in-memory brute-force cosine stop being sufficient?
- What's the dominant ANN index in 2026?
- What's the canonical "vectors in the DB you already have" option?

Then verify by re-reading the `## How it works` section.

✓ Pass: "~10K vectors", "HNSW", "pgvector"
✗ Fail on details: that's fine — names should be recoverable from the tier structure.
