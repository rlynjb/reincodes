# Query rewriting and HyDE

**Industry name(s):** HyDE (Hypothetical Document Embeddings), query expansion, multi-query rewriting, sub-question decomposition
**Type:** Industry standard

> HyDE generates a hypothetical answer to the user query, embeds *that*, and retrieves against the answer-shaped embedding. Multi-query rewriting fans out into 3-5 paraphrases. Sub-question decomposition splits multi-hop questions into atomic retrievals. Each wins on different query classes.

**See also:** → [01-embeddings](01-embeddings.md) · → [05-dense-vs-sparse-retrieval](05-dense-vs-sparse-retrieval.md) · → [11-rag](11-rag.md)

---

## Why care

### Move 1 — The grounded scenario

A user asks "what's the difference between OAuth2 and OIDC?" Dense retrieval embeds the question and looks for similar text. But the docs in your corpus don't contain the question — they contain the *answer* ("OAuth2 is an authorization framework; OIDC is an identity layer built on OAuth2..."). Query and doc are in different shapes (interrogative vs declarative), so similarity is low; relevant doc ranks 30th.

### Move 2 — Name the question

The question is *how to bridge the gap between the query's shape and the corpus's shape*. HyDE answers: ask an LLM to generate a hypothetical answer to the query, embed the answer, retrieve against that. The hypothetical answer matches the corpus's shape better than the question does. Multi-query rewriting tackles a different gap (vocabulary mismatch); sub-question decomposition tackles multi-hop reasoning.

### Move 3 — Why answering that question matters

**Why you need to answer that question at all:** because the retrieval-quality ceiling isn't just the embedding model — it's the *query-doc shape mismatch*. For QA-style chains where users ask questions but docs contain answers, HyDE often beats embedding-model upgrades. Cost is one extra LLM call per query (~$0.001-0.005); benefit is recall lift on question-shaped queries.

### Move 4 — Concrete before/after

Without HyDE:
- Query: "what's the difference between OAuth2 and OIDC?"
- Embed query directly
- Retrieve based on question-similarity
- Top-5 includes overview docs but not the spec; relevant doc at rank 30

With HyDE:
- Query: same
- LLM generates: "OAuth2 is an authorization framework that lets apps access resources; OIDC adds an identity layer on top of OAuth2..."
- Embed the hypothetical answer
- Retrieve based on answer-similarity
- Top-5 includes the OIDC spec, the OAuth2 spec, comparison docs; relevant doc at rank 1

### Move 5 — The one-line summary

HyDE is `JSON.parse(JSON.stringify(query))` for retrieval — round-trip the query through an LLM to reshape it for retrieval. Mechanics below.

---

## How it works

### Move 1 — The mental model

Three variants, each addressing a different query gap:

```
variant                      addresses                  cost
─────────────                ──────────                ─────────
HyDE                         query-shape mismatch       1 LLM call
multi-query rewriting        vocabulary mismatch        1 LLM call
sub-question decomposition   multi-hop reasoning        1 LLM call + 2-5 retrievals
```

### Move 2 — The layered walkthrough

#### HyDE (Hypothetical Document Embeddings)

The technical thing: prompt an LLM with "answer this question briefly"; embed the answer; retrieve against the answer embedding. The bridge from frontend: this is like rendering a preview to detect what shape your data is going to take. Concrete consequence: the hypothetical answer doesn't have to be correct — it just has to be in the same shape as the corpus, so cosine matching surfaces the real answer. Concrete condition where it works: question-answering RAG; breaks when the corpus is short and answer-shape is identical to query shape already.

```
HyDE flow

query: "what's the difference between OAuth2 and OIDC?"
         │
         ▼
LLM: "OAuth2 is an authorization framework; OIDC is an identity layer..."
         │
         ▼ embed the hypothetical answer
         │
         ▼
retrieve: docs similar to the hypothetical answer
         │
         ▼
top-5 includes the real answer docs
```

#### Multi-query rewriting

The technical thing: prompt the LLM to generate 3-5 paraphrases of the query; retrieve top-k for each; fuse results (RRF or de-dupe). Bridge: like A/B testing prompts but for retrieval — try multiple phrasings, take what wins. Concrete consequence: catches vocabulary mismatches (technical jargon vs natural language). Concrete condition where it works: when corpus vocabulary varies; breaks when it doesn't add new retrievable angles.

#### Sub-question decomposition

The technical thing: prompt the LLM to break a multi-hop query into 2-5 atomic questions; retrieve for each; combine. Bridge: like splitting a JOIN into multiple SELECT statements. Concrete consequence: handles "compare X and Y in context of Z" queries that single retrieval can't satisfy. Concrete condition where it works: complex multi-hop; breaks for simple queries (adds latency for nothing).

### Move 3 — The principle

The principle: *retrieval quality has multiple bottlenecks; query reshaping is one lever*. Embedding model upgrades address one class; query rewriting addresses another. Compose levers; don't expect one to fix all classes.

Full picture below.

---

## Query rewriting — diagram

```
┌─ Query ───────────────────────────────────────────────────────────┐
│  "compare OAuth2 vs OIDC for SPAs"                                │
└───────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─ Rewriting layer ─────────────────────────────────────────────────┐
│                                                                   │
│  HyDE: LLM generates hypothetical answer                          │
│         "For SPAs, OAuth2 with PKCE is preferred over             │
│          implicit flow; OIDC adds id_token..."                    │
│                                                                   │
│  multi-query: LLM generates paraphrases                           │
│    - "OAuth2 versus OIDC in single-page apps"                     │
│    - "PKCE vs implicit flow for browsers"                         │
│    - "identity token vs access token usage"                       │
│                                                                   │
│  sub-question: LLM decomposes                                     │
│    - "what is OAuth2 for SPAs?"                                   │
│    - "what is OIDC for SPAs?"                                     │
│    - "comparison of OAuth2 vs OIDC?"                              │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
        │
        ▼
embed each rewritten query; retrieve; fuse
```

---

## In this codebase

**Not yet implemented.** No retrieval, no rewriting. The buildable target is below — a `/ai/query-rewriting` visualizer showing original + HyDE'd + multi-query rewrites side-by-side with their respective retrieval results.

**Expected file paths:**
- `src/app/ai/query-rewriting/page.tsx`
- `src/components/QueryRewritingVisualizer/`
- `public/ai/query-rewriting/scenarios.json`

---

## Elaborate

### Where this pattern comes from

HyDE was named in Gao et al. 2022 ("Precise Zero-Shot Dense Retrieval without Relevance Labels"). The query-rewriting family is older (query expansion in IR predates LLMs by decades); LLM-powered rewriting just makes it cheap to implement.

### The deeper principle

*The boundary between query and corpus shape is a retrieval gap. LLMs can bridge gaps.*

### Where this breaks down

Adds latency + cost. For low-volume or simple queries, not worth it.

### What to explore next

- [11-rag](11-rag.md) — query rewriting fits naturally before retrieval in RAG
- [06-hybrid-retrieval-rrf](06-hybrid-retrieval-rrf.md) — fuse multi-query results via RRF

---

## Tradeoffs

```
┌──────────────────┬───────────────┬─────────────────────────┐
│ Cost dimension   │ With rewriting│ Direct query            │
├──────────────────┼───────────────┼─────────────────────────┤
│ Per-query cost   │ +$0.001-0.005 │ Baseline                │
│ Per-query latency│ +500-1500ms   │ Baseline                │
│ Recall lift      │ 5-20pp on     │ —                       │
│                  │ specific query                          │
│                  │ classes                                  │
│ Setup            │ Rewriting     │ None                    │
│                  │ prompts +     │                         │
│                  │ eval          │                         │
└──────────────────┴───────────────┴─────────────────────────┘
```

### What we gave up

LLM call before every retrieval. Latency budget hit (~1s). Cost per query.

### Breakpoint

Earn place on question-answering RAG; skip on simple keyword/exact-match.

---

## Tech reference

### LangChain / LlamaIndex rewriting modules

- **Codebase uses:** not yet.
- **Why it's here:** both ship query-rewriting primitives.
- **Leading today:** LlamaIndex — `adoption-leading` for RAG-specific tooling, 2026.

### Direct LLM (Anthropic / OpenAI)

- **Codebase uses:** not yet.
- **Why it's here:** can roll your own with one prompt.

---

## Project exercises

### [B-reincodes-query-rewriting-viz] Build the query-rewriting visualizer

- **Exercise ID:** `[B-reincodes-query-rewriting-viz]`
- **What to build:** page rendering original + HyDE'd + multi-query rewrites; retrieval results per variant.
- **Why it earns its place:** demonstrates query-doc shape gap visually.
- **Estimated effort:** 1 day.

---

## Summary

### Part 1 — concept recap

Query rewriting reshapes the query before retrieval. HyDE generates a hypothetical answer to bridge query-doc shape gap; multi-query rewriting catches vocabulary mismatches; sub-question decomposition handles multi-hop. Cost is one LLM call; lift is 5-20pp on relevant query classes. In reincodes Case B; visualizer demonstrates the variants.

### Part 2 — key points

- HyDE: hypothetical answer → embed answer.
- Multi-query: 3-5 paraphrases → fuse results.
- Sub-question: decompose multi-hop → multiple retrievals.
- Cost: +1 LLM call per query.
- Earn place: question-answering RAG.

---

## Interview defense

### Likely questions

**Q (mid):** What's HyDE?

A: Hypothetical Document Embeddings. Generate a fake answer to the user's question via LLM; embed the answer; retrieve against the answer-embedding instead of the question-embedding. Works because answers and corpus docs share shape; questions don't.

**Q (senior):** When NOT to use HyDE?

A: Short corpus where docs are already in question-shape (FAQs). Simple keyword queries. Latency-sensitive UX (HyDE adds ~1s).

**Q (arch):** At 10x scale?

A: HyDE cost compounds (~$1K/day at 100K queries × $0.001). Mitigation: cache hypothetical answers for popular queries; skip HyDE for short queries.

### One-line anchors

- "HyDE: embed the answer, not the question."
- "Multi-query: paraphrase fans."
- "Sub-question: split multi-hop."
- "Cost: +1 LLM call. Lift: 5-20pp."
- "Earn place on question-answering RAG."

---

## Validate

### Level 1
Draw the HyDE flow.

### Level 2
Explain HyDE under 90s.

### Level 3
A query asks "compare X, Y, Z in context of W." Which rewriting variant fits?

### Level 4
Tradeoff: ship HyDE or invest in better embedding model?

### Quick check
- Static-export file? Visualizer registration? JSON file?
