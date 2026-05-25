# Stale embeddings

**Industry name(s):** Index staleness, embedding drift, embedding_stale_at, re-indexing
**Type:** Industry standard

> Source doc edited but embedding not re-indexed → retrieval surfaces the old version. `embedding_stale_at` per row is the operational primitive; background re-indexer drains the dirty set; full reindex on embedding-model upgrade. Without this discipline, retrieval quality decays silently.

**See also:** → [10-incremental-indexing](10-incremental-indexing.md) · → [04-vector-databases](04-vector-databases.md) · → [02-embedding-model-choice](02-embedding-model-choice.md)

---

## Why care

### Move 1 — The grounded scenario

A docs-team writer updates the OAuth flow guide on Monday. By Wednesday a user searches "OAuth refresh token" and gets the *old* guide — the one without the new refresh-token rotation section. The doc has been updated in the source; the embedding hasn't been recomputed. Retrieval returns what's in the index, not what's in the source.

### Move 2 — Name the question

The question is *what's the freshness contract between source and index*. Naively, "we'll re-index when we have time" — predictably broken. Operationally, every source-edit marks the doc as `embedding_stale_at = now()`; a background worker picks up stale rows and re-embeds them on schedule. Add embedding-model upgrades as a full-corpus reindex trigger.

### Move 3 — Why answering that question matters

**Why you need to answer that question at all:** because retrieval quality silently decays as sources drift from indices. Users don't see "stale" in the UI; they see "the answer was outdated" and conclude the system is broken. The teams shipping RAG with staleness discipline have higher CSAT than the teams without it, by a meaningful margin.

### Move 4 — Concrete before/after

Without staleness discipline:
- Source doc edited 2 weeks ago
- Embedding still reflects the old version
- Retrieval surfaces old version
- User sees outdated content; reports issue; engineer manually reindexes
- Repeat for every doc edit

With `embedding_stale_at` + background reindex:
- Source doc edited → `embedding_stale_at = now()`
- Background worker (every 5 min) picks up stale rows
- Re-embeds + updates index
- Retrieval reflects current version within 5-10 min of edit
- No user reports; no manual intervention

### Move 5 — The one-line summary

`embedding_stale_at` is the LLM-shaped version of a database table's `updated_at` field with a worker draining staleness — same pattern as background email queues or job processing. Mechanics below.

---

## How it works

### Move 1 — The mental model

Two states per doc: fresh (embedding matches source) or stale (source edited; embedding lags). A field tracks state; a worker resolves it.

```
state per doc

doc {
  id: string,
  content: string,
  content_updated_at: timestamp,
  embedding: vector,
  embedding_updated_at: timestamp,
  embedding_model_version: string
}

fresh: embedding_updated_at >= content_updated_at
       AND embedding_model_version === current_model
stale: otherwise
```

### Move 2 — The layered walkthrough

#### Mark-on-write (source edit triggers staleness)

The technical thing: every write to the source updates `content_updated_at`. The bridge from frontend: this is `updated_at` plus a trigger. Concrete consequence: every edit is visible to the indexer. Concrete condition where it works: source has timestamps; breaks when the source is a third-party API without change notifications (then you poll periodically).

#### Background re-indexer (worker pattern)

The technical thing: a worker queries `WHERE embedding_updated_at < content_updated_at OR embedding_model_version != $current` LIMIT N, processes the batch, updates. The bridge: this is a job queue worker. Concrete consequence: dirt level visible (queue depth); freshness lag visible (oldest stale-since timestamp). Concrete condition where it works: tunable interval per traffic load; breaks when re-embed rate doesn't keep up with edit rate (queue grows unbounded — scale workers).

```
worker loop

every 5min:
  rows = SELECT * FROM docs
         WHERE embedding_updated_at < content_updated_at
            OR embedding_model_version != $current
         LIMIT 100
         ORDER BY content_updated_at ASC
  
  for row in rows:
    new_embedding = embed(row.content)
    UPDATE docs SET 
      embedding = new_embedding,
      embedding_updated_at = now(),
      embedding_model_version = $current
    WHERE id = row.id
```

#### Embedding-model upgrade (full corpus reindex)

The technical thing: when the embedding model upgrades, every embedding is "stale" in a different sense (wrong model). Mark all rows; the worker drains gradually. Bridge: like a schema migration applied to embeddings. Concrete consequence: model upgrades trigger weeks of background processing; size + plan accordingly. Concrete condition where it works: gradual rollout with both indices live (old + new); breaks when the upgrade is rushed and the new index isn't done.

### Move 3 — The principle

The principle: *staleness is invisible without instrumentation*. The same applies to caches, materialized views, search indices, ETL pipelines. Make freshness a metric.

Full picture below.

---

## Stale embeddings — diagram

```
┌─ Source writes ───────────────────────────────────────────────────┐
│  POST /docs/{id}  ──► docs.content_updated_at = now()             │
└───────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─ Doc table ───────────────────────────────────────────────────────┐
│  id  content  content_upd_at   embedding  embedding_upd_at  model │
│  ─── ──────── ───────────────  ─────────  ────────────────  ──── │
│  1   text...  2026-05-24       vec...     2026-05-24        m_v3 │ ← fresh
│  2   text...  2026-05-25       vec...     2026-05-23        m_v3 │ ← stale (content drift)
│  3   text...  2026-05-22       vec...     2026-05-22        m_v2 │ ← stale (model drift)
└───────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─ Worker (every 5min) ─────────────────────────────────────────────┐
│  SELECT rows WHERE stale → re-embed → UPDATE                       │
│  metric: queue_depth (rows 2 and 3 above)                          │
│  metric: oldest_stale_since (earliest stale timestamp)             │
└───────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─ Index ───────────────────────────────────────────────────────────┐
│  vector index re-built from updated embeddings                    │
│  retrieval reflects current source within ~5 min                  │
└───────────────────────────────────────────────────────────────────┘
```

Two metrics make freshness operable: queue depth (how much is stale) and oldest-stale-since (how long is the freshest stale doc).

---

## In this codebase

**Not yet implemented.** No source, no index. The buildable target is below — a `/ai/stale-embeddings` visualizer simulating edits to a small corpus, showing freshness lag; toggle "re-index on edit" vs "lazy re-index" to see retrieval result drift.

**Expected file paths:**
- `src/app/ai/stale-embeddings/page.tsx`
- `src/components/StaleEmbeddingsVisualizer/`
- `public/ai/stale-embeddings/scenarios.json`

---

## Elaborate

### Where this pattern comes from

Index staleness is older than search engines (database `updated_at` columns predate this). The LLM-specific addition is the embedding-model-upgrade case — model versions invalidate not just one row but the entire corpus.

### The deeper principle

*Freshness is a metric, not a hope.* Same as cache hit rate, ETL lag, materialized view age.

### Where this breaks down

When edit rate exceeds re-embed rate — workers fall behind, staleness compounds. Mitigation: more workers, batch larger, async embedding API.

### What to explore next

- [10-incremental-indexing](10-incremental-indexing.md) — the broader pattern this is part of
- [02-embedding-model-choice](02-embedding-model-choice.md) — model upgrades trigger full reindex

---

## Tradeoffs

```
┌──────────────────┬─────────────────────┬─────────────────────────┐
│ Cost dimension   │ With staleness mgmt │ "Reindex when we can"   │
├──────────────────┼─────────────────────┼─────────────────────────┤
│ Setup            │ Fields + worker     │ None                    │
│ Compute cost     │ Embedding ~$0.0001  │ Bursty (manual catch-up)│
│                  │ × edits/day         │                         │
│ Freshness lag    │ ~5 min              │ Hours to weeks          │
│ Engineer time    │ One-time setup      │ Recurring manual work   │
│ UX impact        │ Invisible           │ Stale results to users  │
└──────────────────┴─────────────────────┴─────────────────────────┘
```

### What we gave up

Two timestamp fields, a worker process, a couple of metrics. Setup ~1 day per project.

### What the alternative would have cost

Hours of engineer time per "the answer is outdated" report. Plus the user trust damage.

### Breakpoint

Mandatory for any RAG system with mutable source corpora. Optional only for static corpora that never change.

---

## Tech reference

### Postgres + pg_cron / Inngest / BullMQ

- **Codebase uses:** not yet.
- **Why it's here:** the worker is a standard background-job pattern.
- **Leading today:** Inngest — `innovation-leading` for serverless background jobs, 2026.

### Anthropic / OpenAI embedding API

- **Codebase uses:** not yet.
- **Why it's here:** workers call embedding APIs.
- **Leading today:** OpenAI text-embedding-3 — `adoption-leading`, 2026.

---

## Project exercises

### [B-reincodes-stale-embeddings-viz] Build the visualizer

- **Exercise ID:** `[B-reincodes-stale-embeddings-viz]`
- **What to build:** simulate edits to a corpus; show freshness lag; toggle re-index policies.
- **Why it earns its place:** makes the invisible staleness visible.
- **Estimated effort:** 1 day.

---

## Summary

### Part 1 — concept recap

`embedding_stale_at` field plus background worker keep index synced with source. Two staleness causes: content drift and model drift. Workers drain the dirty set; metrics (queue depth, oldest-stale-since) make freshness operable. In reincodes Case B; visualizer demonstrates the drift.

### Part 2 — key points

- Mark on write (`updated_at`).
- Worker drains stale rows.
- Model upgrade = full reindex.
- Metrics: queue depth + oldest-stale-since.
- Mandatory for mutable corpora.

---

## Interview defense

### Likely questions

**Q (mid):** What is index staleness?

A: Source content has been updated but the embedding/index hasn't been recomputed. Retrieval returns the old version. Mitigated by mark-on-write + background re-indexer.

**Q (senior):** How do you detect staleness in prod?

A: Two metrics. Queue depth = rows pending re-embedding. Oldest-stale-since = earliest stale-since timestamp. Both go on the dashboard; alert when either breaches thresholds.

**Q (arch):** Embedding model upgrade strategy?

A: Run both indices in parallel during migration; switch reads once new index drains; remove old. Use a feature flag for the cutover.

### One-line anchors

- "Mark on write; worker drains."
- "Queue depth + oldest-stale-since = freshness metrics."
- "Model upgrade = full reindex."
- "Stale retrieval is silent UX damage."
- "Embedding cost scales with edit rate, not corpus size."

---

## Validate

### Level 1
Draw the staleness flow.

### Level 2
Explain under 90s.

### Level 3
A corpus has 100K edits/day. Design the re-index worker capacity.

### Level 4
Tradeoff: re-embed on every write (live) vs batch every 5 min?

### Quick check
- Static-export file? Visualizer registration? JSON file?
