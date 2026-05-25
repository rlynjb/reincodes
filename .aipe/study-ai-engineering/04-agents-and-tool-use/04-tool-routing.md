# Tool routing — which tool, when

**Industry name(s):** Tool routing, tool selection, retrieval-augmented tool use, semantic tool selection
**Type:** Industry standard

> When the tool registry grows past ~10 tools, the model's picking accuracy drops because each tool's description has to compete for attention. Tool routing is the pre-call step that picks a subset before the main model sees them.

**See also:** → [01-agents-vs-chains](01-agents-vs-chains.md) · → [02-tool-calling](02-tool-calling.md) · → [03-react-pattern](03-react-pattern.md) · → [05-agent-memory](05-agent-memory.md) · → [../03-retrieval-and-rag](../03-retrieval-and-rag/)

---

## Why care

### Move 1 — The grounded scenario

You've built an agent with five tools — `getRecentTags`, `getCalendarEvents`, `getRecentThreads`, `getProjects`, `getActiveTodos`. The agent works well: descriptions are clear, the model picks the right tool 95% of the time. The PM asks "can it also look up archived items, snooze items, history of edits, related users, recent comments, and analytics data?" You add the tools. Now the registry has 12 tools. The model's picking accuracy drops to 75%. You add five more tools (it's a successful product). 17 tools, 60% accuracy. The descriptions haven't gotten worse; the *registry has gotten longer*, and the model is now dividing its attention across 17 candidates per call. The token cost rose linearly too — each call sends all 17 tool definitions in the system prompt, even though only 2-3 are relevant per user query.

### Move 2 — Name the question

That degradation has a name — *tool routing* (sometimes called *tool selection*). Not the picking of *which* tool the model emits — that's still tool calling — just the upstream question of *which subset of tools the model even sees on this call*. Tool routing is the pre-call filter: given a user query and the full tool registry, pick the K tools most likely to be relevant and only send those to the main model. The main model then picks from a small, focused registry. The full registry never lands in the main model's context.

### Move 3 — Why answering that question matters

**Why you need to answer that question at all:** because the alternative is *every call ships the entire registry*, which has three compounding costs. First, *token cost*: each tool definition is 100-300 tokens (name, description, input schema); 50 tools at 200 tokens each = 10KB of prompt overhead on *every* call, even calls where the user just asked "what's the weather." Second, *attention dilution*: research from Anthropic and academic groups (the "lost-in-the-middle" line of work) shows that LLM recall on any specific piece of context degrades as the context grows; with 50 tool definitions, the model's recall on any *one* tool's description is measurably worse than with 5 definitions. Third, *correctness*: at high tool counts, the model conflates similar tools and picks the wrong one — a 95% picking rate at 5 tools becomes 60% at 50. Tool routing solves all three at once by sending only the K relevant tools per call, restoring per-tool attention, cutting prompt cost, and giving the main model a smaller, less ambiguous registry to pick from.

### Move 4 — Concrete before/after

Without tool routing (full registry every call):

- 50 tool definitions × 200 tokens = 10KB system prompt overhead per call
- ~$0.04 of prompt cost per call at Sonnet rates
- Picking accuracy: 60% (model confused by overlapping descriptions)
- Adding a new tool risks regressing all existing tools (attention dilutes further)

With tool routing (pre-call filter):

- Routing step picks top-5 tools: ~$0.002 (small model or embedding lookup)
- Main call sees 5 tool definitions × 200 tokens = 1KB system prompt overhead
- ~$0.01 of total cost per call (router + main call)
- Picking accuracy: 92% (main model sees only relevant tools)
- Adding a new tool only affects routing; existing tools' picking accuracy stays stable

### Move 5 — The one-line summary

Tool routing is the pre-call filter that picks K relevant tools from a registry of N, so the main model sees a focused subset instead of the full list — analogous to retrieval before generation in a RAG pipeline, but with tools as the retrieval target. The rest of the file is the mechanics of *how* to route.

---

## How it works

### Move 1 — The mental model

Tool routing is the RAG pattern applied to tools. Where RAG retrieves *documents* before generation, tool routing retrieves *tool definitions* before the main tool-calling step. The retrieval can be embedding-based (embed the user query, embed each tool description, return top-K by cosine similarity), LLM-based (a small/fast model picks the top-K tools as a classification step), or rule-based (heuristics over keywords, intent classifiers, or user context). The main LLM call only sees the filtered subset. If you've built a search bar that filters a list of products as the user types, you've built the conceptual shape of a tool router — except the query is the user's full message and the list is the tool registry.

```
the routing layer (between user query and main LLM call)

       ┌──────────────────────┐
       │  full tool registry  │   ← N tools (e.g. 50)
       │  ┌────────────────┐  │
       │  │ tool 1 (full)  │  │
       │  │ tool 2 (full)  │  │
       │  │   ...          │  │
       │  │ tool N (full)  │  │
       │  └────────────────┘  │
       └──────────┬───────────┘
                  │
        user query│
                  ▼
       ┌──────────────────────┐
       │  router              │   ← picks top-K
       │  (embeddings or      │
       │   small LLM call)    │
       └──────────┬───────────┘
                  │
         top-K tools (e.g. 5)
                  ▼
       ┌──────────────────────┐
       │  main LLM call       │   ← sees only K
       │  (registry = K)      │     focused tools
       └──────────────────────┘
```

### Move 2 — The layered walkthrough

#### Semantic routing (embedding-based)

The technical thing: embed every tool's description into a vector (at registry-load time, cached), embed the user query at request time, return the top-K tools by cosine similarity. The bridge from frontend: this is `Array.sort((a, b) => cosineSim(query, b.embedding) - cosineSim(query, a.embedding)).slice(0, K)` — a sort by similarity to query. Concrete consequence: routing is essentially free at request time (just a sort over precomputed vectors), the embedding model is small (text-embedding-3-small at OpenAI, voyage-3-lite at Voyage), and the system can scale to thousands of tools without latency impact. The failure mode: semantic similarity is approximate. A user query "what's on my calendar today" might semantically match `getCalendarEvents` *and* `getRecentTags` (both about user activity) and the top-K might include the wrong one. Mitigation: tune K (usually 5-10) so the main model has options even if routing's top-1 is slightly off.

```
semantic routing in pseudocode

  // build time
  for tool in registry:
    tool.embedding = embed(tool.description)

  // request time
  query_emb = embed(user_query)
  ranked = sort(registry, by: cosineSim(query_emb, tool.embedding))
  top_k = ranked.slice(0, K)
  // ship top_k to main LLM
```

#### LLM-based routing (classification step)

The technical thing: a small/fast LLM (Haiku at Anthropic, GPT-4o-mini at OpenAI) takes the user query and the *names + one-line descriptions* of all N tools, and emits the top-K tool names. The main LLM then gets only those tools. The bridge from frontend: this is a `<select>` dropdown rendered server-side by a small model — the small model "selects" which options the big model sees. Concrete consequence: more accurate than semantic routing on ambiguous queries (the small LLM can reason about intent, not just similarity), but slower (an extra LLM call adds ~200-500ms) and more expensive (Haiku costs less than Sonnet but isn't free). The failure mode: the small model can hallucinate tool names that don't exist. Mitigation: validate the routing output against the registry before passing to the main call; fall back to semantic or full-registry routing if validation fails.

```
LLM routing in pseudocode

  router_prompt = "user query: {query}. tools: [name1: desc1,
                   name2: desc2, ...]. emit top-5 tool names."
  raw_response = haiku.complete(router_prompt)
  top_k_names = parseAndValidate(raw_response, registry)
  top_k = registry.filter(t => top_k_names.includes(t.name))
  // ship top_k to main LLM
```

#### Confidence-based routing

The technical thing: any router (semantic or LLM-based) emits a score per tool (cosine similarity or LLM-emitted confidence). If the top-1 score is above a high threshold (say, 0.85), the main call sees only top-1 and the model just executes. If the top-1 score is low (below 0.5), the routing is *uncertain* — the main call sees a broader set or the system asks the user for clarification ("did you mean to check your calendar or your tags?"). Concrete consequence: the confidence signal lets the system *adapt* — high-confidence queries get cheap fast routing, low-confidence queries get more options or clarification. The failure mode: thresholds need tuning per registry, and cosine scores aren't calibrated probabilities (a 0.7 cosine doesn't mean 70% likely correct). Mitigation: tune thresholds empirically against an eval set.

```
confidence routing in pseudocode

  ranked = semantic_route(query, registry)
  top_1_score = ranked[0].similarity
  if top_1_score > 0.85:
    return [ranked[0]]            // confident, single tool
  elif top_1_score > 0.5:
    return ranked.slice(0, 5)     // uncertain, give options
  else:
    return ask_user_for_clarification()  // way too uncertain
```

#### The cost-flexibility tradeoff

The technical thing: each routing approach sits on a curve of cost (latency + dollars) vs. flexibility (handles ambiguous queries). Semantic routing is the cheapest (a sort over precomputed vectors, ~10ms, ~$0) but loses on subtle intent. LLM-based routing is more flexible (the small LLM understands nuance) but costs an extra call. Confidence-based routing is adaptive — it pays the cost only when uncertainty demands it. Concrete consequence: in production, most teams converge on a *hybrid* — semantic routing as the default, LLM-based routing as a fallback when semantic confidence is low, full-registry as a last resort for the long tail of weird queries.

```
the cost-flexibility curve

  approach           cost    flexibility
  ─────────────────  ──────  ──────────────
  semantic only      $       moderate
  LLM-based only     $$$     high
  confidence-tiered  $-$$    high (adaptive)
  full registry      $$$$    high (but bad)
                              attention)
```

### Move 3 — The principle

The principle is *the registry is a search index, not a parameter list*. As soon as the tool count crosses ~10, the registry should be treated as a corpus to retrieve from, not a static parameter to ship on every call. The same retrieval discipline that applies to documents in RAG applies to tools in agents: chunk by tool, embed the descriptions, retrieve by query similarity, and only let the most relevant subset reach the main model. The deeper move: anywhere you have a *large set of options* that the model needs to *pick from*, retrieval-before-selection beats stuff-everything-into-prompt. This generalizes beyond tools to user-context retrieval, example-shot retrieval (RAG over few-shot examples), and prompt-template retrieval. The lesson the field learned with documents in 2023-2024 is being applied to every other large-set-of-options at the LLM boundary.

The full picture is below.

---

## Tool routing — diagram

```
┌─ Tool routing architecture ─────────────────────────────────────────┐
│                                                                     │
│   user query                                                        │
│       │                                                             │
│       ▼                                                             │
│   ┌──────────────────────────────────────────┐                     │
│   │  Router (one of three shapes)            │                     │
│   │                                          │                     │
│   │   ┌─────────────────────────┐            │                     │
│   │   │ semantic                │            │                     │
│   │   │  embed query            │            │                     │
│   │   │  cosine vs cached       │            │                     │
│   │   │  tool embeddings        │            │                     │
│   │   │  → top-K                │            │                     │
│   │   └─────────────────────────┘            │                     │
│   │   ┌─────────────────────────┐            │                     │
│   │   │ LLM-based               │            │                     │
│   │   │  small model picks      │            │                     │
│   │   │  top-K by name          │            │                     │
│   │   └─────────────────────────┘            │                     │
│   │   ┌─────────────────────────┐            │                     │
│   │   │ confidence-tiered       │            │                     │
│   │   │  semantic first; LLM    │            │                     │
│   │   │  fallback on low conf;  │            │                     │
│   │   │  ask user on very low   │            │                     │
│   │   └─────────────────────────┘            │                     │
│   └──────────────┬───────────────────────────┘                     │
│                  │                                                  │
│      top-K tool definitions                                         │
│                  │                                                  │
│                  ▼                                                  │
│   ┌──────────────────────────────────────────┐                     │
│   │  Main LLM call                           │                     │
│   │   registry = K (e.g. 5)                  │                     │
│   │   picks one to call                      │                     │
│   │   emits tool_use                         │                     │
│   └──────────────────────────────────────────┘                     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

Routing decision is made BEFORE the main LLM call sees any tools.
The full registry never reaches the main model in this architecture.
```

---

## In this codebase

**Not yet implemented.** reincodes has no tools, no agent loops, no routing — none of the LLM boundary that would require routing. The closest existing analog is the *filter pattern* in the home page's Concepts grid: `CONCEPT_CATEGORIES` in `src/components/Home/conceptsData.tsx` is a fixed-set categorical filter (sorting / graphs / trees / recursion), and the user "routes" themselves to a category by clicking. That's the *idea* of a fixed router (deterministic, rule-based) without the LLM. There's no semantic-similarity routing anywhere in the existing code.

The buildable target is below in Project exercises — a `/ai/tool-routing` page that shows a registry of 5 tools with one-line descriptions, takes a user input in a textfield, and shows the routing decision: which tool was picked, why, and the runner-up tools with their scores. The reader can type different queries and watch the routing change.

**Expected file paths** (when built):
- `src/app/ai/tool-routing/page.tsx` — the visualizer
- `src/components/ToolRoutingVisualizer/` — tool registry display, query input, decision panel, score bar chart
- `public/ai/tool-routing/routes.json` — precomputed router decisions for 8-12 example queries
- `public/ai/tool-routing/tool-embeddings.json` — precomputed embeddings for each tool (optional; semantic routing can run in-browser if the embedding model fits)
- `scripts/precompute-tool-routing.ts` — build-time script that embeds tool descriptions, runs the router against example queries, captures decisions

---

## Elaborate

### Where this pattern comes from

Tool routing as a named pattern landed around 2024 when production agent systems started hitting the high-tool-count failure mode. The technique is borrowed from two adjacent disciplines: RAG (retrieve documents before generation) and intent classification (a small model picks from a fixed taxonomy before downstream processing). The pattern showed up in LangChain's `MultiRetrievalQAChain` in 2023 as "tool retrieval," in OpenAI's Assistants API discussions in 2024, and in Anthropic's "Building effective agents" essay as the "orchestrator-workers" sub-pattern. The current state of the art is *hybrid retrieval* (semantic + reranking + LLM-based fallback) which mirrors the evolution of document retrieval (dense + sparse + reranking).

### The deeper principle

The deeper principle is that *context is a budget, not a buffet*. Every token in the prompt costs money, dilutes attention, and competes with every other token for the model's processing capacity. The instinct to "give the model more context so it can decide better" is wrong past a threshold — more context means worse decisions because attention spreads thinner. The retrieval discipline (in RAG, in tool routing, in any context-as-budget problem) is the inverse instinct: *aggressively prune to the smallest relevant subset, then trust the model to do well with focused context*. This generalizes to prompt engineering as a whole — the best prompts are usually shorter than instinct suggests, not longer.

### Where this breaks down

Tool routing breaks down in three places. First, *cross-tool dependencies* — when a task genuinely requires tools that span the registry, the router might pick top-K from one cluster and miss the cross-cluster tool. Mitigation: explicit "always include" tools (utility tools like `clarify_with_user` that should be in every call's K). Second, *evolving queries* — in a multi-turn agent, the relevant tools change as the conversation progresses. A query that semantically matched tools A-B-C in turn 1 might need tools D-E by turn 4. Mitigation: re-route on each turn rather than routing once at session start. Third, *adversarial inputs* — a user query crafted to semantically match the wrong tool can bypass the router. Mitigation: keep prompt-injection defenses at the main-call layer (see `../06-production-serving/03-prompt-injection.md`) rather than relying on the router to catch them.

### What to explore next

- [02-tool-calling](02-tool-calling.md) → the mechanism that runs *after* routing decides which tools to register
- [03-react-pattern](03-react-pattern.md) → ReAct's Thought block can reference the routing decision ("I see tools X, Y, Z; I'll pick X because...")
- [../03-retrieval-and-rag/](../03-retrieval-and-rag/) → tool routing is RAG applied to tools; the retrieval discipline is the same
- The "Building effective agents" essay's orchestrator-workers section for the multi-level routing pattern

---

## Tradeoffs

### Comparison table — both costs in one frame

```
┌────────────────────┬──────────────────────┬─────────────────────────┐
│ Cost dimension     │ Tool routing         │ Ship full registry      │
├────────────────────┼──────────────────────┼─────────────────────────┤
│ Per-call prompt    │ ~1–2KB (K tools)     │ ~10–20KB (N tools)      │
│ Per-call cost      │ +router cost,        │ Just main call;         │
│                    │ -main prompt cost    │ heavy main prompt       │
│ Picking accuracy   │ 90–95% (small set)   │ 60–75% (large set)      │
│ Latency            │ +20–500ms for        │ Lower (no pre-step)     │
│                    │ routing step         │                         │
│ Scale ceiling      │ Thousands of tools   │ ~10–20 tools            │
│ Adding tools       │ Re-embed/re-train    │ Edit registry; all      │
│                    │ router; existing     │ existing tools may      │
│                    │ tools' picking       │ regress                 │
│                    │ unchanged            │                         │
│ Routing failures   │ Wrong top-K picks    │ Main model fails on     │
│                    │ → main model misses  │ ambiguous queries with  │
│                    │ the relevant tool    │ all tools in context    │
│ Debugging          │ Two layers to debug  │ One layer; harder       │
│                    │ (router + main)      │ to localize failure     │
│ Adversarial input  │ Router can be        │ All tools always        │
│                    │ targeted             │ exposed; same risk      │
└────────────────────┴──────────────────────┴─────────────────────────┘
```

### What we'd give up (when planning the visualizer)

The first cost is *honest tool data*. The visualizer needs at least 5 tools with realistic descriptions that overlap *just enough* to make routing interesting. If all 5 tools are clearly distinct (`getWeather`, `getCalendar`, `getEmail`, `getStocks`, `getRecipes`), routing is trivial and the demo is boring. The 5 tools have to be plausibly-related so a user query has a non-obvious top-K. Sketching the right tool set takes ~half a day of design — the demo's persuasiveness depends on it.

The second cost is *precompute fidelity*. The visualizer either (a) runs routing in-browser against precomputed tool embeddings (requires shipping the embedding model client-side via WASM, ~5MB bundle hit; or shipping precomputed embeddings and computing cosine in JS, ~5KB and trivial cost), or (b) ships precomputed decisions for 8-12 example queries and lets the reader pick a query rather than typing freely. The right call for reincodes' static-export constraint is (b) — precompute the decisions for a curated set of queries, ship the decisions as JSON. The reader doesn't get to type arbitrary queries but does get to see the routing logic over realistic examples. Cost: ~half a day of script + ~$1 of embedding API spend.

The third cost is *teaching the *why* not just the *what**. The visualizer has to make the "ship full registry vs route" comparison legible, otherwise it's just "look, a sort by cosine similarity, neat." The right shape is probably a toggle that flips between "with routing" and "without routing" modes, and shows the same query's picking accuracy (against a precomputed ground-truth) in both modes side by side.

### What the alternative would have cost (skipping the visualizer)

If reincodes never builds `/ai/tool-routing`, the cost is zero in the codebase. Tool routing is a Phase 4 concern in the curriculum (`[C4.6]` tool routing: heuristic vs LLM-routed), not exercised by any current build. The interview answer becomes "I'd reach for routing the moment my tool count crossed 10; here's how I'd structure the routing layer in loopd if its tool registry grew that big."

The cost of *not* building it shows up in agent-platform interview rounds where the candidate is expected to *demonstrate* routing rather than describe it. Without the visualizer, the demonstration is verbal or whiteboard-only.

### The breakpoint

The visualizer earns its place when the candidate is interviewing for roles where agent scalability is the load-bearing concern — agent-platform engineering, orchestration-layer roles, anything involving registries of 20+ tools. For application-engineering roles with smaller registries, the visualizer is overkill.

### What wasn't actually a tradeoff

The choice between in-browser routing (with embeddings shipped or computed) and precomputed-decisions routing was not a real option for the static-export deploy. Embedding generation at request time requires either a server call (incompatible with `output: "export"`) or a WASM embedding model in the browser (~5MB minimum, breaks the bundle budget). Precomputed decisions for curated queries is the only path that lands inside the deploy constraints.

---

## Tech reference (industry pairing)

### text-embedding-3-small (OpenAI)

- **Codebase uses:** not yet — would be the precompute target for tool description embeddings if the visualizer ever ships with semantic routing. The script embeds each tool's description once at build time, the JSON ships as `public/ai/tool-routing/tool-embeddings.json`.
- **Why it's here:** small, fast, cheap embedding model (1536 dimensions, ~$0.02 per 1M tokens) that's well-suited for short-text retrieval like tool descriptions.
- **Leading today:** text-embedding-3-small / text-embedding-3-large — `adoption-leading` for general-purpose text embeddings, 2024-2026.
- **Why it leads:** strong retrieval performance on standard benchmarks (MTEB), small dimension count (1536) keeps storage/compute low, the family has both small (cheap) and large (accurate) variants for cost/quality tuning.
- **Runner-up:** Cohere embed-v3 / Voyage voyage-3 — `innovation-leading` for retrieval quality; Voyage's specialized variants (voyage-code, voyage-finance) outperform on domain-specific corpora.

### Anthropic Claude Haiku (small/fast LLM)

- **Codebase uses:** not yet — would be the routing-LLM target if the visualizer ever demonstrates LLM-based routing alongside semantic. Haiku takes the user query + tool name/description pairs, emits top-K tool names.
- **Why it's here:** Haiku is the cheapest/fastest Claude model — well-suited to routing tasks where the model's job is classification rather than synthesis. Cost is ~10x lower than Sonnet, latency is ~3x faster.
- **Leading today:** Anthropic Claude Haiku 4 — `adoption-leading` for low-latency LLM classification, 2026.
- **Why it leads:** strong instruction-following on small tasks, sub-second latency, prompt-caching support so the registry can be cached on the routing call.
- **Runner-up:** OpenAI GPT-4o-mini — `adoption-leading` for similar low-latency classification roles in OpenAI-centric stacks.

### LangGraph (graph-structured routing)

- **Codebase uses:** not yet — would be the framework reference if the visualizer ever shows routing as a graph (input → router node → branch to tool-specific node → finalize). Not needed for current scope.
- **Why it's here:** LangGraph's conditional-edge pattern is the canonical implementation of routing as a graph: a router node emits a "next node" decision, the graph traverses to that node, the node runs its tool subset, and the result flows back. Useful for teams building production agents with explicit routing graphs.
- **Leading today:** LangGraph — `innovation-leading` for graph-structured routing, 2025-2026.
- **Why it leads:** explicit conditional edges, typed state passed between nodes, built-in checkpointing for long routes, and the "agent is a graph" framing that makes routing a first-class architectural element.
- **Runner-up:** Inngest / Temporal — `innovation-leading` for workflow-engine-based routing where the route persists across sessions; relevant for long-running agent systems with durable routing decisions.

---

## Project exercises

### [B-reincodes-tool-routing-viz] Build the tool-routing visualizer

- **Exercise ID:** `[B-reincodes-tool-routing-viz]` — derived from the curriculum's reincodes "interview prep surface" entry and Phase 4 concept `[C4.6]` (tool routing: heuristic vs LLM-routed).
- **What to build:** a page at `/ai/tool-routing` that demonstrates semantic tool routing over a registry of 5 tools. Layout: top panel shows the 5 tools as cards (name + one-line description); middle panel has a query selector (dropdown of 8-12 precomputed example queries — "what's on my calendar?", "what have I been working on?", "anything related to react?", etc.); bottom panel shows the routing decision — the top-3 picked tools with their cosine-similarity scores rendered as horizontal bars (using the existing SVG/Tailwind primitives the codebase already has). A toggle flips between "with routing (top-3 to main model)" and "without routing (all 5 to main model)" modes; the bottom panel's pick-rate annotation updates to reflect the precomputed accuracy for each mode.
- **Why it earns its place:** the visualizer makes the routing decision *seeable*. The reader picks a query, watches the cosine scores light up, sees which tools came out on top, and can flip the "without routing" toggle to see how the full registry dilutes the picking signal. The interview signal is that the candidate built a tool that demonstrates the retrieval-before-selection pattern in the wild.
- **Files to touch:** `src/app/ai/tool-routing/page.tsx` (visualizer), `src/components/ToolRoutingVisualizer/` (tool cards, query selector, score bars, routing/no-routing toggle), `public/ai/tool-routing/routes.json` (precomputed routing decisions — 8-12 queries × 2 modes × 5 tool scores), `public/ai/tool-routing/tool-embeddings.json` (the precomputed tool description embeddings, ~5KB), `scripts/precompute-tool-routing.ts` (build-time script that embeds the 5 tools via text-embedding-3-small, embeds each example query, computes cosine scores, and writes the JSON). Add a row to `CONCEPT_CATEGORIES` in `src/components/Home/conceptsData.tsx` under a new `ai-engineering` category.
- **Done when:** the page loads at `/reincodes/ai/tool-routing/` in production, the 5 tool cards render with descriptions, the query selector lets the reader pick from 8-12 precomputed queries, the routing decision panel shows top-3 tools with cosine bar scores, the routing/no-routing toggle flips the displayed picking accuracy, `next build` passes under `output: "export"`. Build script generates real embeddings via OpenAI API.
- **Estimated effort:** 1.5-2 days. Tool registry design + precompute script: 1 day (the tool descriptions need to overlap *just enough* to make the demo interesting). Page + score bars + toggle: half day. Polish (the toggle animation, the cosine score visualization, the query-selector UX): half day.

---

## Summary

### Part 1 — concept recap

Tool routing is the pre-call filter that picks K relevant tools from a registry of N before the main LLM call sees any of them. The pattern earns its place when the tool count crosses ~10 because the model's picking accuracy drops with registry size — each tool's description has to compete for attention, and at 50 tools the picking rate can degrade from 95% to 60%. Three routing approaches matter: *semantic* (embed query + tools, return top-K by cosine, cheap and approximate), *LLM-based* (small model picks top-K by name, more accurate but adds a call), and *confidence-tiered* (semantic by default, LLM fallback when confidence is low, ask-the-user on very low confidence). The deeper principle is *the registry is a search index, not a parameter list* — the same retrieval discipline that applies to documents in RAG applies to tools in agents. In this codebase the concept is Case B (no LLM calls); the buildable target is a `/ai/tool-routing` page with a 5-tool registry, a query selector, and a decision panel that renders cosine scores with a routing-vs-no-routing toggle.

### Part 2 — key points to remember

- **The trigger**: when tool count crosses ~10. Below that, ship the full registry; above that, route.
- **The three approaches**: semantic (cosine over embeddings), LLM-based (small model picks), confidence-tiered (hybrid).
- **The principle**: context is a budget. Pruning to a focused subset beats sending the full set; the model does better with focused context.
- **The failure modes**: semantic missing intent on ambiguous queries (mitigate with larger K or LLM fallback); routing failures cascading to wrong main-call decisions (mitigate with confidence thresholds and explicit "always include" utility tools).
- **The reincodes shape**: Case B. Visualizer renders a 5-tool registry with cosine score bars and a routing/no-routing toggle so the reader can see the attention-dilution effect.

---

## Interview defense

### What an interviewer is really asking

Behind "how do you handle 50 tools in an agent?" the interviewer is testing whether the candidate has *paid the scale tax* on agent systems. A junior answer doesn't see the problem ("just ship all 50"). A senior answer names the failure mode (attention dilution at high tool counts) and reaches for the pattern (route before main call). A staff answer adds the routing-approach tradeoffs (semantic vs LLM-based vs confidence-tiered) and names the failure modes of the routing layer itself.

### Likely questions

**Q (mid):** Why not just send all tools on every call?

A: Three reasons. First, token cost grows linearly with tool count — 50 tool definitions at 200 tokens each is 10KB of prompt overhead per call, multiplied by every user request, multiplied by every retry. Second, attention dilutes as the registry grows; the model's recall on any individual tool's description drops with the total context size, which means at 50 tools the picking accuracy is measurably worse than at 5. Third, similar-description tools get conflated — the model picks `getUserActivity` when the right tool was `getUserActions` because the descriptions overlap. Routing solves all three by sending only the K relevant tools per call.

```
the cost compounds

  50 tools, no routing             50 tools, routed to 5
  ──────────────────────           ──────────────────────
  10KB system prompt               1KB system prompt
  $0.04 per main call              $0.005 router + $0.005 main
  60% picking accuracy             92% picking accuracy
  tool count 50 → 100               tool count 50 → 1000+
  breaks at 100+                   scales linearly
```

**Q (senior):** How do you choose between semantic routing and LLM-based routing?

A: Semantic is the default — it's cheap, fast (~10ms after the embedding lookup), and works well for queries where the user's intent is close to a tool's description in vector space. Reach for LLM-based routing when semantic is missing on a class of queries that an inspection reveals share an intent that *isn't* captured by description similarity. Concrete example: a query "what's blocking me this week" semantically might match `getRecentTodos` (mentions "this week") but the *intent* matches `getBlockedItems` (the user is asking about blockers, not todos). Semantic routing picks the wrong tool because the description doesn't say "blocking." An LLM router understands the intent and picks correctly. The cost is ~$0.005 + 200ms per call, which is worth it for high-stakes routing where wrong picks cascade. The hybrid pattern is what most production teams settle on: semantic first, LLM-fallback when semantic confidence is below a threshold.

```
when to upgrade from semantic to LLM

  semantic suffices                LLM-based earns its place
  ────────────────────────         ──────────────────────────
  queries match descriptions       queries reflect intent
  by surface meaning               not on description text
  ─────────────                    ─────────────
  "what's on my calendar?"         "what's blocking me?"
  → getCalendarEvents              → getBlockedItems
                                     (not getRecentTodos
                                      which mentions "this
                                      week" but wrong intent)
```

**Q (arch):** At 1000 tools, what does the routing architecture look like?

A: Hierarchical routing. A two-stage router: stage 1 categorizes the query into a tool *cluster* (e.g. "user data," "external integrations," "computational tools") using a small LLM or coarse embedding; stage 2 picks the top-K from within that cluster using semantic routing. The clusters are 50-100 tools each rather than 1000. The first stage's job is intent classification; the second stage's job is fine-grained retrieval. The architectural inspiration is hierarchical search in IR (the way large-scale search engines split into shards and route queries to the right shard before fine-grained retrieval). For 10,000+ tools, three-stage routing applies the same logic recursively. The complexity cost is real — each stage adds latency and a potential failure point — and the breakpoint where the next stage earns its place is typically the moment the previous stage's picking accuracy drops below 80% on the eval set.

```
hierarchical routing at scale

  user query
      │
      ▼
  ┌──────────────────────────┐
  │ stage 1: cluster router  │  ← LLM or coarse embed
  │  picks 1 cluster of N    │     classification
  └──────────┬───────────────┘
             │
             ▼
  ┌──────────────────────────┐
  │ stage 2: tool router     │  ← semantic within cluster
  │  picks K from cluster    │
  └──────────┬───────────────┘
             │
             ▼
  ┌──────────────────────────┐
  │ main LLM call (K tools)  │
  └──────────────────────────┘
```

### The question candidates always dodge

**Q:** Why not just use a single very-long-context model that can handle 50 tools without routing? Anthropic's 1M context window is plenty.

A: That argument is wrong in a way that matters in production. The 1M context window solves the *capacity* problem (the tools fit) but not the *attention dilution* problem (the model's recall drops with context size, regardless of whether it technically fits). Empirical results from Anthropic's own research and academic groups consistently show that for any LLM, *recall on any specific piece of context degrades as context length grows*, even far below the technical limit. A model that can handle 1M tokens of input can also *miss* a specific tool's description when it's competing with 49 others for attention. The 1M context window also costs proportionally more — sending 200KB of tool definitions on every call is $0.50+ per call at Sonnet rates, regardless of how few tokens the model actually uses. The right framing isn't "use a longer-context model"; it's "shape your context to what the model actually needs, regardless of how long it can technically be." Long-context models change the *ceiling* on what's possible, but the cost/quality tradeoff at any given task size still favors aggressive pruning. The candidate who answers "longer context solves it" is signaling they've read marketing material; the right answer is "longer context doesn't fix attention dilution; routing does."

```
the wrong intuition vs the right intuition

  wrong: bigger window = no routing       right: bigger window ≠ better
  ─────────────────────────────────       ─────────────────────────────
  - tools fit, so ship them all           - they fit but attention thins
  - 1M tokens, no scaling problem         - per-tool recall still drops
  - cheap per token (long ctx is fine)    - $$ on tokens you don't need
  - one less moving part                  - quality regresses silently
```

### One-line anchors

- "Route when tool count crosses 10. Below that, ship the registry; above, retrieve before selection."
- "Context is a budget. The instinct to ship more is wrong past a threshold; the move is aggressive pruning."
- "Semantic routing is the default. LLM-based routing earns its place when intent doesn't match description text."
- "Tool routing is RAG applied to tools. The retrieval discipline transfers wholesale."
- "Long-context windows don't fix attention dilution. They change the ceiling, not the gradient."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw the tool-routing architecture from memory: user query → router (one of three shapes) → top-K tools → main LLM call. Label the three routing approaches (semantic, LLM-based, confidence-tiered) and at least one tradeoff per approach.

✓ Pass: full pipeline drawn, three approaches labeled, tradeoff annotation per approach
✗ Fail: re-read the primary diagram and the walkthrough, wait 10 minutes, try again

### Level 2 — Explain it out loud

Explain tool routing to a colleague who has built an agent with 5 tools and is wondering why their agent regresses when they add the 11th tool. No notes. Under 90 seconds.

Checkpoints — did you:
- Name the attention-dilution failure mode at high tool counts?
- Describe at least one routing approach (semantic, LLM-based, or confidence-tiered)?
- Give the breakpoint (~10 tools) where routing earns its place?
- Reference the buildable target (`/ai/tool-routing`) as how you'd demonstrate the concept?

If you skipped any: you described the technique, you didn't argue the threshold.

### Level 3 — Apply it to a new scenario

A new feature lands in the planned reincodes AI surface: a "find a visualizer for X" agent that takes a user's natural-language question ("show me how merge sort works") and routes to one of the 14 existing visualizer pages. Design the routing layer. Which approach (semantic, LLM-based, confidence-tiered) fits best? What are the tool descriptions?

Write the registry of 14 "tools" (one per visualizer page) and pick the routing approach. Then verify: would your descriptions disambiguate well under semantic routing? Where would semantic miss intent?

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff from the Tradeoffs section. Answer in writing: "If I were building `/ai/tool-routing` today with the same constraints, would I precompute decisions for a curated query set, or would I ship the embedding model in the browser via WASM and let the reader type freely?"

Reference the actual code:
→ Point to `next.config.ts` for the static-export constraint
→ Identify what would shift if the WASM embedding model lands in the bundle (size hit, load-time impact, model-update story)

### Quick check — code reference test

Without opening any files, answer:
- At what tool count does routing earn its place?
- What's the cheapest routing approach (latency + dollars)?
- What's an `always include` tool? (Hint: from the "where this breaks down" section.)

Then verify against the file.

✓ Pass: ~10 tools, semantic routing, utility tools that should be in every call's K regardless of query
✗ Fail on details: the threshold and the routing-approach distinction are what matter; recover them.
