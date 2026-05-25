# GraphRAG

**Industry name(s):** GraphRAG, knowledge-graph-augmented retrieval, entity-relationship retrieval, multi-hop RAG
**Type:** Industry standard (newer)

> Vector retrieval struggles with multi-hop questions ("how does X relate to Y given Z"). GraphRAG extracts entities + relationships from the corpus, builds a graph, traverses it for queries spanning multiple documents. Heavy preprocessing cost; pays off when queries are inherently relational.

**See also:** → [11-rag](11-rag.md) · → [06-hybrid-retrieval-rrf](06-hybrid-retrieval-rrf.md) · → [../05-evals-and-observability/01-eval-set-types](../05-evals-and-observability/01-eval-set-types.md)

---

## Why care

### Move 1 — The grounded scenario

A user asks "show me all the security incidents involving authentication services in the last year, and which engineers worked on each." Standard RAG retrieves docs related to security/auth/incidents — but the *relationships* (which engineers, which services, which dates) aren't surfaced by vector similarity. Each doc mentions the entities; nothing surfaces the cross-doc structure.

### Move 2 — Name the question

The question is *how to retrieve information that spans documents and depends on relationships between entities*. GraphRAG extracts entities (services, engineers, incidents) and relationships ("worked on", "occurred at") from each doc at index time, builds a knowledge graph; at query time, traverses the graph to answer relational questions.

### Move 3 — Why answering that question matters

**Why you need to answer that question at all:** because vector retrieval is fundamentally about *similarity*, not *structure*. Multi-hop questions need structure. Microsoft's GraphRAG paper (2024) showed 5-30pp lift on multi-hop questions over standard RAG. The cost is heavy preprocessing — LLM-extracted entities + relationships for every doc; storage for the graph + traditional vector index. The benefit is real but bounded; not every RAG system needs it.

### Move 4 — Concrete before/after

Standard RAG on the query above:
- Retrieves 5 top-similar docs (mostly about auth services)
- LLM has to reconstruct cross-doc relationships in the prompt
- Misses connections that aren't textually adjacent
- Hallucinates connections it can't verify

GraphRAG on the same query:
- Traverses entity graph: filter incidents by category="security", related-to entities of type="authentication-service", in time-window
- Returns precise list with cross-doc relationships intact
- LLM grounds answer in the graph traversal, not in textual snippets

### Move 5 — The one-line summary

GraphRAG is the SQL JOIN of retrieval — explicit relationship traversal across documents instead of relying on similarity to surface relational patterns. Mechanics below.

---

## How it works

### Move 1 — The mental model

Two indices: traditional vector index (for similarity) + knowledge graph (for relationships). Index time is heavier (extract entities + edges); query time routes between the two based on query type.

```
GraphRAG architecture

INDEX TIME:
  docs ──► chunker ──► chunks
            │              │
            │              └──► embedder ──► vector index
            │
            └──► entity/relation extractor (LLM)
                          │
                          ▼
                  knowledge graph
                  (nodes + edges + properties)

QUERY TIME:
  query ──► query router
              │
              ├─ similarity-shaped ──► vector retrieve
              │
              └─ relational-shaped ──► graph traverse
                                       │
                                       ▼
                              prompt with structured data
```

### Move 2 — The layered walkthrough

#### Entity + relationship extraction (the heavy preprocessing)

The technical thing: for each chunk, prompt an LLM to extract entities (typed: person, org, service, event) and relationships ("worked-on", "depends-on", "caused-by"). The bridge from frontend: this is like running NER (named entity recognition) plus relation extraction over the whole corpus. Concrete consequence: this is the load-bearing cost — every doc gets an LLM extraction pass. Concrete condition where it works: corpus has rich entity structure; breaks for homogeneous prose without clear entities.

```
extraction example

chunk: "Engineer Alice fixed the auth service outage on 2026-03-15."

extracted:
  entities:
    - {type: person, name: "Alice"}
    - {type: service, name: "auth"}
    - {type: event, name: "outage", date: "2026-03-15"}
  relationships:
    - {subject: "Alice", predicate: "fixed", object: "outage on 2026-03-15"}
    - {subject: "outage on 2026-03-15", predicate: "affected", object: "auth service"}
```

#### Community detection (the Microsoft GraphRAG addition)

The technical thing: cluster the graph into communities of related entities; pre-summarize each community at multiple zoom levels. Bridge: like building search indexes at multiple granularities (top-level topic vs detailed sub-topic). Concrete consequence: high-level queries hit community summaries; detailed queries traverse the actual graph. Concrete condition: works for large corpora where community structure exists; overkill for small.

#### Query routing (similarity vs structure)

The technical thing: classify the query — "tell me about X" (similarity) vs "how is X related to Y" (structure) — route accordingly. Bridge: like routing API requests based on REST vs GraphQL shape. Concrete consequence: queries get the right retrieval mechanism. Concrete condition: works when queries are clearly classifiable; breaks for ambiguous queries (mitigate with hybrid: do both, fuse results).

### Move 3 — The principle

*Different query shapes need different retrieval mechanisms.* Vector for similarity; graph for structure; SQL for predicate. The senior move is composing them, not choosing one.

Full picture below.

---

## GraphRAG — diagram

```
┌─ INDEX TIME ──────────────────────────────────────────────────────┐
│                                                                   │
│   docs                                                            │
│     │                                                             │
│     ├──► chunker ──► embedder ──► vector index                    │
│     │                                                             │
│     └──► LLM entity/rel extractor                                 │
│                  │                                                │
│                  ▼                                                │
│           graph DB (Neo4j, Memgraph, ...)                         │
│                  │                                                │
│                  ▼                                                │
│           community detection + multi-level summaries             │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘

┌─ QUERY TIME ──────────────────────────────────────────────────────┐
│                                                                   │
│   query ──► classifier                                            │
│              │                                                    │
│       ┌──────┴──────┐                                             │
│       ▼             ▼                                             │
│   similarity    relational                                        │
│   query         query                                             │
│       │             │                                             │
│       ▼             ▼                                             │
│   vector       graph traversal                                    │
│   retrieve     (Cypher / GQL)                                     │
│       │             │                                             │
│       └──────┬──────┘                                             │
│              ▼                                                    │
│   structured context for LLM                                      │
│              │                                                    │
│              ▼                                                    │
│           generate                                                │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**Not yet implemented.** The buildable target is a `/ai/graph-rag` visualizer rendering a small precomputed entity-relationship graph from 10 source docs; show a multi-hop query traversing the graph vs the same query via standard vector retrieval; side-by-side accuracy.

**Expected file paths:**
- `src/app/ai/graph-rag/page.tsx`
- `src/components/GraphRagVisualizer/`
- `public/ai/graph-rag/scenarios.json`

---

## Elaborate

### Where this pattern comes from

Microsoft Research's GraphRAG paper (2024) crystallized the pattern. Knowledge graphs predate LLMs by decades; the LLM-era contribution is *automated extraction* of entities + relationships from unstructured text.

### The deeper principle

*Structure is queryable; similarity is fuzzy. Both have their place.*

### Where this breaks down

For domains without entity structure (creative writing, opinion pieces, conversational text). Extraction returns noise; graph adds no signal.

### What to explore next

- [11-rag](11-rag.md) — standard RAG is the base; GraphRAG is the variant
- Microsoft's GraphRAG repo — canonical implementation

---

## Tradeoffs

```
┌──────────────────┬───────────────────┬─────────────────────────┐
│ Cost dimension   │ GraphRAG          │ Standard RAG            │
├──────────────────┼───────────────────┼─────────────────────────┤
│ Index cost       │ Heavy (LLM per    │ Light (embedding per    │
│                  │ chunk for         │ chunk)                  │
│                  │ extraction)       │                         │
│ Index size       │ Vector + graph    │ Vector only             │
│ Query latency    │ Traversal ~50ms   │ ~50-100ms ANN           │
│ Multi-hop recall │ +5-30pp           │ Baseline (often poor)   │
│ Setup            │ Two indices +     │ One index               │
│                  │ router            │                         │
│ Maintenance      │ Re-extract on     │ Re-embed on update      │
│                  │ update (LLM cost) │                         │
└──────────────────┴───────────────────┴─────────────────────────┘
```

### Breakpoint

GraphRAG earns place when queries are demonstrably multi-hop (eval set shows standard RAG misses them) AND corpus has rich entity structure. Don't reach for it preemptively.

---

## Tech reference

### Microsoft GraphRAG (reference implementation)

- **Codebase uses:** not yet.
- **Why it's here:** the canonical OSS implementation.
- **Leading today:** Microsoft GraphRAG — `innovation-leading` for entity-graph-augmented retrieval, 2026.

### Neo4j / Memgraph (graph DB)

- **Codebase uses:** not yet.
- **Leading today:** Neo4j — `adoption-leading` for graph DBs, 2026.

### LLM-as-extractor (Anthropic / OpenAI)

- **Codebase uses:** not yet.
- **Why it's here:** the extraction step is an LLM call per chunk.

---

## Project exercises

### [B-reincodes-graph-rag-viz] Build the visualizer

- **Exercise ID:** `[B-reincodes-graph-rag-viz]`
- **What to build:** render a small precomputed graph from 10 source docs; show a multi-hop query traversing the graph vs the same query via vector retrieval; accuracy side-by-side.
- **Why it earns its place:** the multi-hop gap of standard RAG is hard to see without a graph comparison.
- **Estimated effort:** 1-2 days.

---

## Summary

### Part 1 — concept recap

GraphRAG extracts entities + relationships from the corpus, builds a knowledge graph, traverses it for multi-hop queries. Heavy preprocessing (LLM per chunk); pays off when queries span documents via relational structure. In reincodes Case B; visualizer demonstrates the multi-hop gap.

### Part 2 — key points

- Two indices: vector + graph.
- Heavy index cost (LLM extraction).
- Multi-hop recall +5-30pp.
- Query router classifies similarity vs relational.
- Earn place: rich entity corpus + multi-hop queries.

---

## Interview defense

### Likely questions

**Q (mid):** What is GraphRAG?

A: Standard RAG + knowledge graph. Extract entities and relationships from each doc at index time; build a graph; for relational queries, traverse the graph instead of (or in addition to) vector retrieval. Microsoft's GraphRAG paper named the pattern in 2024.

**Q (senior):** When NOT to use GraphRAG?

A: Corpora without entity structure (creative writing, conversational text). Cost-sensitive deployments (LLM-per-chunk extraction is expensive). Use cases dominated by similarity queries.

**Q (arch):** At 10M docs, can GraphRAG scale?

A: Extraction cost is the bottleneck (10M chunks × LLM call = $10K-100K depending on tier). Mitigations: cheaper extractor model (Haiku or fine-tuned BGE), batch API (50% off), extract incrementally (community detection at multiple zoom levels means you don't need full extraction on every doc).

### One-line anchors

- "Vector for similarity; graph for structure."
- "Extract entities + relationships at index time."
- "Multi-hop questions are GraphRAG's home."
- "Heavy preprocessing; pays off on relational queries."
- "Don't reach for it preemptively."

---

## Validate

### Level 1
Draw the two-index architecture.

### Level 2
Explain GraphRAG under 90s.

### Level 3
A query: "list all bugs assigned to engineer X that affected service Y last quarter." Vector or graph? Why?

### Level 4
Tradeoff: ship GraphRAG or invest in better embeddings + hybrid retrieval?

### Quick check
- Static-export file? Visualizer registration? JSON file?
