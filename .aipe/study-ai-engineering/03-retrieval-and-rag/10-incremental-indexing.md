# Incremental indexing

**Industry name(s):** Incremental indexing, append-only indexing, dirty-row pattern, delta indexing
**Type:** Industry standard

> Don't rebuild the whole index on every change. Mark dirty rows; background worker processes the delta. Full rebuilds reserved for model upgrades or schema changes. Cost-amortizes embedding budget over time.

**See also:** → [09-stale-embeddings](09-stale-embeddings.md) · → [04-vector-databases](04-vector-databases.md) · → [02-embedding-model-choice](02-embedding-model-choice.md)

---

## Why care

### Move 1 — The grounded scenario

Your corpus grows from 1K docs to 1M docs over 18 months. The naive "rebuild the index nightly" pipeline now takes 6 hours of compute every night, costs $200, and during the rebuild the index is degraded. You're paying to re-embed 999K docs that haven't changed for the sake of the ~5K that did.

### Move 2 — Name the question

The question is *how to apply changes without rebuilding from scratch*. Incremental indexing tracks what's new/changed (the delta); processes only that. Full rebuilds are reserved for events that invalidate all embeddings (model upgrade, schema change).

### Move 3 — Why answering that question matters

**Why you need to answer that question at all:** because rebuild cost scales with corpus size while change rate stays roughly constant. At 1M docs, nightly rebuild is wasteful; at 10M, infeasible. The teams shipping search and RAG at scale use incremental indexing by default; the teams without it eventually hit the wall and refactor.

### Move 4 — Concrete before/after

Full rebuild nightly:
- 1M docs × $0.00002 (embedding cost) = $20/day = $7.3K/year
- 6 hours/night degraded index
- Engineering time on rebuild reliability

Incremental:
- ~5K edits/day × $0.00002 = $0.10/day = $36/year embedding cost
- Index live continuously
- One-time worker setup, ~recurring zero maintenance

### Move 5 — The one-line summary

Incremental indexing is `git pull` instead of `rm -rf && git clone` — apply the delta, don't restart from scratch. Mechanics below.

---

## How it works

### Move 1 — The mental model

Track changes (mark dirty rows or use a change-log); process only those. Full rebuilds are scheduled events with explicit triggers.

```
indexing modes

mode              when triggered                cost
─────             ───────────────                ────────────────
incremental       continuously (per write)      proportional to delta
full rebuild      model upgrade, schema change  proportional to corpus
```

### Move 2 — The layered walkthrough

#### Dirty-row tracking

The technical thing: `is_dirty` flag or `embedding_stale_at` timestamp per row. Bridge: like Vue's reactivity tracking or React's dirty bits. Concrete consequence: worker query is `WHERE is_dirty = true` — index by this column for fast retrieval. Concrete condition where it works: high write-to-corpus-size ratio; breaks when nearly all rows are stale most of the time (just rebuild).

#### Change-data-capture (alternative to dirty flags)

The technical thing: source DB emits change events (Postgres logical replication, MongoDB change streams); worker consumes the stream. Bridge: like Redux actions — every change is an event you can subscribe to. Concrete consequence: more decoupled, no schema changes on the source side. Concrete condition where it works: source DB supports CDC; breaks for sources that don't (CSV files, third-party APIs).

#### Full rebuild as scheduled event

The technical thing: full rebuild on triggers (model upgrade, schema change). Run alongside live index; cut over via flag. Bridge: like blue-green deployment for indices. Concrete consequence: full rebuilds are rare but expected; planned, not panicked. Concrete condition where it works: storage budget for two indices during migration.

### Move 3 — The principle

*Compute scales with change rate, not state size.* Same principle as event-sourcing, log-structured storage, or differential dataflow.

Full picture below.

---

## Incremental indexing — diagram

```
┌─ Writes ──────────────────────────────────────────────────────────┐
│   doc.update() → mark dirty                                       │
│                  emit change event                                │
└──────────────────────────────│────────────────────────────────────┘
                               │
                               ▼
┌─ Delta processing ────────────────────────────────────────────────┐
│   worker: SELECT * FROM docs WHERE is_dirty = true LIMIT N        │
│           (or: consume change-stream)                             │
│           re-embed                                                │
│           UPDATE doc SET embedding = ..., is_dirty = false        │
└──────────────────────────────│────────────────────────────────────┘
                               │
                               ▼
┌─ Vector index ────────────────────────────────────────────────────┐
│   continuously updated; no downtime                               │
└───────────────────────────────────────────────────────────────────┘

┌─ Full rebuild (scheduled, rare) ──────────────────────────────────┐
│   triggered by:                                                   │
│     - embedding model upgrade                                     │
│     - schema change (chunk size, metadata)                        │
│   blue-green: new index built alongside; cutover via flag         │
└───────────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**Not yet implemented.** No corpus, no index. The buildable target is a `/ai/incremental-indexing` visualizer simulating a stream of edits; render dirty-rows queue draining; toggle worker frequency to see queue depth.

**Expected file paths:**
- `src/app/ai/incremental-indexing/page.tsx`
- `src/components/IncrementalIndexingVisualizer/`
- `public/ai/incremental-indexing/scenarios.json`

---

## Elaborate

### Where this pattern comes from

Database query systems have always supported incremental indexing (B-tree updates, posting list deltas). Vector index incremental support is newer; HNSW (the canonical ANN index) supports incremental inserts natively but full deletions require rebuild.

### The deeper principle

*Process the delta, not the state.* Event sourcing, log-structured storage, CDC pipelines, and now vector indexes all converge on this.

### Where this breaks down

When the delete rate is high and the index doesn't support efficient deletes (HNSW). Mitigation: tombstone marking + periodic compaction.

### What to explore next

- [09-stale-embeddings](09-stale-embeddings.md) — the trigger for incremental work
- [04-vector-databases](04-vector-databases.md) — different DBs have different incremental capabilities

---

## Tradeoffs

```
┌──────────────────┬────────────────────┬─────────────────────────┐
│ Cost dimension   │ Incremental        │ Full rebuild nightly    │
├──────────────────┼────────────────────┼─────────────────────────┤
│ Compute cost     │ ~delta × $/embed   │ Corpus × $/embed        │
│ Index downtime   │ None               │ Rebuild window          │
│ Setup            │ Dirty tracking +   │ Cron job                │
│                  │ worker             │                         │
│ Latency          │ ~5 min from edit   │ ≤ 24h from edit         │
│ Failure mode     │ Worker falls       │ Rebuild fails → stale   │
│                  │ behind             │ index until next        │
└──────────────────┴────────────────────┴─────────────────────────┘
```

### What we gave up

Worker process to maintain. Dirty-row tracking schema. Some delete-handling complexity.

### What the alternative would have cost

Bigger corpora make full-rebuild infeasible eventually. Better to start incremental from the beginning.

### Breakpoint

Mandatory for corpora > 100K docs OR change rate > 1K edits/day. Optional below.

---

## Tech reference

### Postgres + pgvector + Inngest workers

- **Codebase uses:** not yet.
- **Leading today:** Inngest — `innovation-leading` for background work, 2026.

### Pinecone / Qdrant incremental APIs

- **Codebase uses:** not yet.
- **Why it's here:** managed vector DBs ship incremental upsert primitives.
- **Leading today:** Qdrant — `adoption-leading` for OSS vector DB with strong incremental support.

---

## Project exercises

### [B-reincodes-incremental-indexing-viz] Build the visualizer

- **Exercise ID:** `[B-reincodes-incremental-indexing-viz]`
- **What to build:** simulate edit stream; render dirty-row queue depth over time; tune worker frequency.
- **Why it earns its place:** queue depth is the operational metric; visualizer makes it concrete.
- **Estimated effort:** 1 day.

---

## Summary

### Part 1 — concept recap

Incremental indexing processes the change delta, not the full state. Dirty-row flags or CDC streams drive workers that re-embed only what changed. Full rebuilds reserved for model upgrades. Cost scales with edit rate, not corpus size. In reincodes Case B; visualizer demonstrates queue dynamics.

### Part 2 — key points

- Dirty tracking + worker.
- CDC as alternative.
- Full rebuild on model upgrade.
- Queue depth = freshness metric.
- Mandatory > 100K docs OR 1K edits/day.

---

## Interview defense

### Likely questions

**Q (mid):** What's incremental indexing?

A: Apply only the changed rows to the index instead of rebuilding from scratch. Track dirty rows (timestamp or flag) or consume a change-data-capture stream. Cost-amortizes embedding budget.

**Q (senior):** When do you rebuild fully?

A: Three events. Embedding model upgrade (all rows now invalid against new model). Schema change (chunk size, metadata fields). Periodic compaction if your index has soft-deletes/tombstones.

**Q (arch):** At 10M docs + 100K edits/day, design the worker.

A: Need ~100K embeddings/day = 1.16/sec. One worker handles 5-10/sec with provider concurrency. So one worker is enough but you want 2-3 for redundancy. Queue depth alert > 10K (fall-behind). Provider batch API for the embedding calls (cheaper).

### One-line anchors

- "Process the delta, not the state."
- "Compute scales with change rate, not corpus size."
- "Dirty flag or CDC — pick one."
- "Full rebuild = scheduled event (model upgrade)."
- "Queue depth = operational health metric."

---

## Validate

### Level 1
Draw the delta-processing flow.

### Level 2
Explain under 90s.

### Level 3
Design worker capacity for a 1M-doc corpus with 5K edits/day.

### Level 4
Tradeoff: CDC vs dirty-flag tracking?

### Quick check
- Static-export file? Visualizer registration? JSON file?
