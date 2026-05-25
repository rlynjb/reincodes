# Agent memory — short-term context, long-term retrieval

**Industry name(s):** Agent memory, conversation memory, short-term vs long-term memory, memory architectures
**Type:** Industry standard

> An agent's "memory" is two distinct things: the conversation buffer carried in the context window each turn (short-term), and an external store the agent retrieves from (long-term). The architectural choice between them — and the hybrid — is the design call.

**See also:** → [01-agents-vs-chains](01-agents-vs-chains.md) · → [03-react-pattern](03-react-pattern.md) · → [../02-context-and-prompts/02-lost-in-the-middle.md](../02-context-and-prompts/02-lost-in-the-middle.md) · → [../03-retrieval-and-rag/](../03-retrieval-and-rag/)

---

## Why care

### Move 1 — The grounded scenario

You've shipped a ReAct agent. It works for short tasks — 3-5 iterations, the model picks tools well, the user gets the answer. Then a power user starts a 20-turn conversation. Around turn 12, things degrade: the model forgets details the user mentioned in turn 3, repeats tool calls it already made in turn 7, contradicts a constraint the user set in turn 5. You look at the conversation: it's there in the messages array, all 20 turns, sent to the model on every call. The information *is* in the context. The model just isn't using it. Past a threshold, the agent stops being a conversational partner and becomes a confused parrot.

### Move 2 — Name the question

That degradation has a name — *memory architecture*. Not the conversation array, not the system prompt, not the context window size — just the question of *what state the agent carries forward and how it does so*. An agent has two kinds of memory: *short-term* (the messages array sent on every call, fits in the context window, decays as the conversation grows) and *long-term* (an external store — a vector DB, a key-value store, a summarization buffer — that the agent retrieves from when it needs to). The architectural decision: which information lives in short-term and gets re-sent every turn, vs. which lives in long-term and gets retrieved on demand?

### Move 3 — Why answering that question matters

**Why you need to answer that question at all:** because the naive answer — "put everything in the context, models have long windows now" — breaks for two compounding reasons. First, *lost-in-the-middle*: even with 1M-token windows, the model's recall on any specific turn's content drops as the conversation grows; turn 3's mention of "I want responses in markdown" gets buried under 15 turns of tool calls and the model starts emitting JSON again. Second, *cost*: every turn re-sends the *entire* conversation as input prefix; turn 20 sends 20 turns of history, turn 50 sends 50, and the per-call token cost grows linearly while the user-visible work stays bounded. The memory architecture is what lets the agent scale beyond ~10 turns without degrading. Get it wrong and your agent caps at a small number of turns; get it right and your agent runs hour-long conversations without losing the thread.

### Move 4 — Concrete before/after

Without memory architecture (full history in context):

- Turn 20 sends 20 turns × ~500 tokens = 10KB of conversation history every call
- Lost-in-the-middle: turn 3's constraint forgotten by turn 15 ~40% of the time
- Per-call cost grows with N (turn count); at turn 50 it's 25KB and $0.10
- Hard ceiling: when conversation exceeds context window, oldest turns silently drop

With memory architecture (short-term + long-term split):

- Recent 5 turns kept verbatim (short-term, ~2.5KB), older turns summarized (~500 tokens summary, ~10x compression)
- Long-term store indexes every turn; agent retrieves relevant past turns on demand
- Per-call cost stays bounded (~5-7KB) regardless of conversation length
- Soft ceiling: limited by the long-term store's retrieval quality, not the context window

### Move 5 — The one-line summary

Agent memory is two stores stitched together — the conversation buffer in the context (short-term) plus an external indexed store (long-term) the agent retrieves from when relevant — exactly the same shape as RAG over documents, but the documents are the agent's own past turns. The rest of the file is the mechanics.

---

## How it works

### Move 1 — The mental model

An agent's memory architecture is a *cache hierarchy* applied to conversation state. Short-term memory is the L1 cache: fast, expensive, small. Every call pays the full cost to include it; only the most recent or most relevant turns earn the slot. Long-term memory is the L2 cache (or main memory): cheaper per byte, slower to access (a retrieval step), arbitrarily large. The agent's job each turn is deciding what to *retrieve* from long-term and pull into short-term, and what to *evict* from short-term back to long-term. If you've worked with caches in any system — CDN tiers, Redis in front of Postgres, in-memory + database — the architecture is the same: hot data in fast/small storage, cold data in large/slow storage, retrieval moves data between layers.

```
the cache hierarchy applied to agent memory

  ┌────────────────────────────────────────┐
  │ short-term (L1)                        │
  │  - last N turns, verbatim              │
  │  - in the context window every call    │
  │  - bounded by ~10–20 turns             │
  │  - fast access (already in prompt)     │
  │  - expensive (re-sent each turn)       │
  └────────────────┬───────────────────────┘
                   │ summarize on eviction
                   ▼
  ┌────────────────────────────────────────┐
  │ long-term (L2)                         │
  │  - external store (vector DB, KV,      │
  │    or summarization buffer)            │
  │  - retrieved on demand via tool        │
  │  - unbounded                           │
  │  - slow (extra retrieval step)         │
  │  - cheap (not in prompt unless         │
  │    retrieved)                          │
  └────────────────────────────────────────┘
```

### Move 2 — The layered walkthrough

#### Short-term memory — the conversation buffer

The technical thing: the messages array sent on every API call. Every turn the agent emits a new message, the runtime appends it, the next call sends the full array. The buffer is bounded by the context window's effective size (not the absolute size — see lost-in-the-middle). The simplest implementation keeps every turn forever and lets the context grow; the more useful implementation keeps the *last N turns* verbatim (the "window" or "buffer" memory pattern). If you've used `Array.slice(-10)` to keep the last 10 elements of a log, you've built the conceptual shape — except the log is a conversation and the slice runs on every turn. Concrete consequence: short-term has a hard size limit. Past the limit, older turns either drop silently (broken) or get evicted with intent (summarized to long-term, see below).

```
short-term buffer (sliding window)

  turns: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
                      └──── window N=5 ────┘
                                          │
  call to LLM sends:   turns 9, 10, 11, 12, 13
  turns 1–8 are NOT in context this call
  (without summarization, they're lost)
```

#### Summarization — the eviction-with-intent pattern

The technical thing: as turns leave the short-term window, summarize them into a compact representation and inject the summary at the top of the buffer. The summary captures key constraints ("user wants markdown output"), facts ("user is working on a React project called X"), and decisions ("we chose option A over option B in turn 7"). The summary is constant in size as the conversation grows — a 500-token summary of 50 prior turns vs. 25KB of raw turns. The bridge from frontend: this is the same shape as the React reconciler running cleanup on unmounted components — the state is preserved but the live representation is discarded. Concrete consequence: summary quality is the load-bearing factor. A bad summarizer loses the constraint the user set in turn 3, and the agent forgets — same failure mode as no summarization, just with extra steps. Most production implementations use the same LLM that runs the agent (or a smaller variant) to summarize, with a system prompt focused on preservation: "summarize the conversation, preserving any constraints, facts, or decisions that future turns might depend on."

```
summarization at the buffer boundary

  ┌─ context sent to LLM ──────────────────────────┐
  │ summary of turns 1–8 (500 tokens):             │
  │   "user wants markdown. working on X project.  │
  │    decided to use Y in turn 7."                │
  │                                                │
  │ turn 9 (verbatim)                              │
  │ turn 10 (verbatim)                             │
  │ turn 11 (verbatim)                             │
  │ turn 12 (verbatim)                             │
  │ turn 13 (verbatim)                             │
  └────────────────────────────────────────────────┘
```

#### Long-term memory — retrieval over past turns

The technical thing: every turn (or every N turns) gets indexed into an external store — a vector database, a SQL table, an in-memory dict — keyed for retrieval. When the agent needs information from a past turn it doesn't have in short-term, it issues a retrieval (often via a tool call: `retrieve_past_turns(query="what was the markdown decision")`), gets back the relevant past turn(s), and uses them. If you've built RAG over documents, you've built the conceptual shape — the documents happen to be your own past turns. Concrete consequence: long-term is the *only* path to information past the short-term window's edge. The summarization keeps high-level state; the long-term retrieval handles "specifically what was said in turn 3." Most production agents use both: summary for general continuity, retrieval for specific recall.

```
long-term memory as RAG over past turns

  agent: "let me check what the user said earlier"
       │
       ▼ tool_use(retrieve_past_turns, query="markdown preference")
       │
       ▼ vector store: cosine over turn embeddings
       │
       ▼ tool_result: "turn 3: user said 'always respond in markdown'"
       │
       ▼ agent now has the constraint back in context
```

#### The hybrid — short-term + summary + long-term

The technical thing: production agents stack all three. Recent N turns kept verbatim (short-term). Older turns summarized into a rolling summary (the eviction pattern). All turns indexed in a long-term store (retrieval pattern). On each call: send the summary + last N turns; if the agent needs older specifics, it issues a `retrieve_past_turns` tool call. The architecture is essentially LangChain's `ConversationSummaryBufferMemory` pattern made explicit. Concrete consequence: this scales to arbitrary conversation length at bounded per-call cost. The complexity cost is real — three subsystems instead of one — but it's what production agents past ~20 turns need.

```
the hybrid stack

  ┌─ context sent to LLM (bounded) ────────────────┐
  │ system prompt + tool registry                  │
  │ summary of turns 1–N-K (rolling)               │
  │ last K turns (verbatim)                        │
  │ current user turn                              │
  │ optionally: retrieved past turns from L2       │
  └────────────────────────────────────────────────┘
              │
              │ runtime maintains:
              ▼
  ┌─ memory subsystems ────────────────────────────┐
  │ short-term buffer (verbatim, last K)           │
  │ summarizer (LLM that compresses older turns)   │
  │ long-term store (vector DB indexed by turn)    │
  │ retrieval tool (registered on every call)      │
  └────────────────────────────────────────────────┘
```

### Move 3 — The principle

The principle is *bounded context, unbounded history*. The context window is finite no matter how large the model claims; the conversation can be arbitrarily long. The architectural move is to *decouple* the two — keep the per-call context bounded (recent turns + summary + retrieved-on-demand), and let the history grow without bound (long-term store indexed by turn). This is the same principle as bounded log buffers in distributed systems: the system's *log* is unbounded (all events persist), but the *working set* in memory is bounded (only recent or relevant events stay hot). Anywhere you have a stream that grows without bound feeding a process with bounded working memory, the right architecture is buffer-plus-store, and agent memory is just the LLM-shaped version of that.

The full picture is below.

---

## Agent memory — diagram

```
┌─ Agent memory architecture (full stack) ────────────────────────────┐
│                                                                     │
│   incoming user turn                                                │
│        │                                                            │
│        ▼                                                            │
│   ┌────────────────────────────────────────────┐                   │
│   │  short-term buffer (sliding window, N=5)   │                   │
│   │   ┌──────────────────────────────────┐     │                   │
│   │   │ turn N-4 │ turn N-3 │ ... │ turn N │   │                   │
│   │   └──────────────────────────────────┘     │                   │
│   └─────────────────┬──────────────────────────┘                   │
│                     │                                               │
│                     │  evicted turn (e.g. turn N-5)                 │
│                     ▼                                               │
│   ┌────────────────────────────────────────────┐                   │
│   │  summarizer LLM                            │                   │
│   │   compresses evicted turn into             │                   │
│   │   rolling summary                          │                   │
│   └─────────────────┬──────────────────────────┘                   │
│                     │                                               │
│                     ▼                                               │
│   ┌────────────────────────────────────────────┐                   │
│   │  rolling summary (constant size)           │                   │
│   │   "user wants markdown. project X.         │                   │
│   │    decided Y in turn 7. ..."               │                   │
│   └────────────────────────────────────────────┘                   │
│                                                                     │
│   ┌────────────────────────────────────────────┐                   │
│   │  long-term store (vector DB)               │                   │
│   │   indexed by turn, embedded by content     │                   │
│   │   retrieved via retrieve_past_turns tool   │                   │
│   └─────────────────┬──────────────────────────┘                   │
│                     │  on retrieval                                 │
│                     ▼                                               │
│   ┌────────────────────────────────────────────┐                   │
│   │  context sent to main LLM call              │                  │
│   │   = system + tools + summary +              │                  │
│   │     last N turns + retrieved (if any) +     │                  │
│   │     current user turn                       │                  │
│   └────────────────────────────────────────────┘                   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

Buffer size N tuned to keep context under ~3K tokens of conversation;
summary capped at ~500 tokens; long-term unbounded.
```

---

## In this codebase

**Not yet implemented.** reincodes has no conversation, no agent, no buffer, no long-term store — nothing that requires memory architecture. The closest analog in the existing codebase is the *visualizer state pattern*: each algorithm page uses `useState` to maintain a current step (bars, highlights, scan index) and updates step-by-step via `await delayLoop(speed)`. That's a *bounded working state* in the same sense as short-term memory — the visualizer keeps the current state in React, not a full history. The long-term-store analog has no parallel in the current code (visualizers don't persist anything between sessions).

The buildable target is below in Project exercises — a `/ai/agent-memory` page that renders a precomputed 20-turn conversation in two modes: "full history in context" (showing the context window growing turn by turn until it gets unwieldy) and "summarized + retrieved" (showing the short-term buffer, rolling summary, and long-term retrievals as separate panels). A turn slider lets the reader walk through the conversation and see context-window utilization per turn.

**Expected file paths** (when built):
- `src/app/ai/agent-memory/page.tsx` — the visualizer
- `src/components/AgentMemoryVisualizer/` — turn timeline, context panel, buffer/summary/store panels, mode toggle, utilization gauge
- `public/ai/agent-memory/conversation-full.json` — 20-turn precomputed conversation, full-history-in-context variant
- `public/ai/agent-memory/conversation-tiered.json` — same conversation with buffer/summary/store states captured per turn
- `scripts/precompute-agent-memory.ts` — build-time script that runs a 20-turn conversation against Claude in both modes

---

## Elaborate

### Where this pattern comes from

The short-term/long-term memory split landed as a discipline in 2023 when production agents started running longer conversations and engineers hit the lost-in-the-middle wall. LangChain's `ConversationSummaryMemory` and `ConversationBufferWindowMemory` patterns from early 2023 codified the buffer-plus-summary shape; later that year, vector-based memory (LlamaIndex's chat memory, LangChain's `VectorStoreRetrieverMemory`) added the retrieval layer. By 2024 the hybrid (buffer + summary + retrieval) was the de facto shape for any agent expected to run beyond ~10 turns. The 2025 framework consolidation (LangGraph, Vercel AI SDK, Mastra) baked the pattern into their state-management abstractions rather than leaving it to convention.

### The deeper principle

The deeper principle is that *attention is the scarce resource, not bytes*. Model providers spent 2024-2025 racing context window sizes — from 100K to 1M to (rumored) 10M tokens. The marketing implied that long-context models would obviate memory architectures: "just put everything in the context." The empirical reality is the opposite: long-context models exposed the lost-in-the-middle effect more starkly. A 1M-token context window doesn't help if the model's recall on turn 3 drops to 40% by turn 50 — and benchmarks consistently show this happens across providers. The memory architecture remains load-bearing because it controls *what gets attended to*, not just *what fits*. The deeper move generalizes: anywhere a model is asked to process more than ~10KB of context, the relevant question is "what does the model need to be paying attention to right now?" not "what can fit in the buffer?"

### Where this breaks down

The hybrid memory architecture breaks down in three places. First, *summary drift* — as the rolling summary compounds across many turns, the summarizer's interpretation can drift; small misreadings compound. Mitigation: periodic full-history re-summarization from the original turns (expensive but corrects drift). Second, *retrieval misses* — if the long-term store's retrieval isn't precise enough, the agent thinks information is gone when it's actually indexed. Mitigation: tune the retrieval (chunking strategy, embedding model, top-K) against the same eval discipline as RAG retrieval (hit@k, MRR). Third, *cross-session memory* — true long-term memory across sessions (the user comes back two weeks later) needs durable storage and identity tying; ephemeral session-scoped memory is much simpler but doesn't survive a browser refresh. Cross-session memory is its own architectural decision (auth, user IDs, storage compliance) beyond what most agents need.

### What to explore next

- [01-agents-vs-chains](01-agents-vs-chains.md) → memory matters more for agents than chains; chains carry no conversation state across calls
- [03-react-pattern](03-react-pattern.md) → the Thought/Action/Observation trace grows with every iteration; ReAct agents hit memory problems first
- [../02-context-and-prompts/02-lost-in-the-middle.md](../02-context-and-prompts/02-lost-in-the-middle.md) → the empirical phenomenon that makes "just use a long-context model" fail
- [../03-retrieval-and-rag/](../03-retrieval-and-rag/) → long-term memory is RAG applied to past turns; the retrieval discipline transfers
- LangChain's memory modules documentation for the canonical reference implementations of buffer / summary / vector memory patterns

---

## Tradeoffs

### Comparison table — both costs in one frame

```
┌────────────────────┬──────────────────────┬─────────────────────────┐
│ Cost dimension     │ Hybrid memory        │ Full history in context │
├────────────────────┼──────────────────────┼─────────────────────────┤
│ Per-call tokens    │ Bounded (~3–5K)      │ Linear in turns         │
│ Per-call cost      │ Bounded              │ Grows with conversation │
│ Conversation       │ Unbounded            │ Capped at window size   │
│ length ceiling     │                      │                         │
│ Recall on early    │ Strong (retrieved)   │ Drops with turn count   │
│ turns              │                      │ (lost-in-the-middle)    │
│ Recency bias       │ Last N verbatim,     │ All turns in context,   │
│                    │ rest summarized      │ but model favors recent │
│ Implementation     │ 3 subsystems         │ 1 (just append messages)│
│ complexity         │ (buffer, summary,    │                         │
│                    │ store)               │                         │
│ Latency            │ +50–200ms for        │ Lower (no extra step)   │
│                    │ retrieval/summary    │                         │
│ Eval shape         │ Per-subsystem        │ End-to-end only         │
│                    │ (summary quality,    │                         │
│                    │ retrieval hit rate)  │                         │
│ Failure modes      │ Summary drift,       │ Window exhaustion,      │
│                    │ retrieval miss       │ lost-in-the-middle      │
│ Cost ceiling       │ Bounded              │ Grows linearly per turn │
└────────────────────┴──────────────────────┴─────────────────────────┘
```

### What we'd give up (when planning the visualizer)

The first cost is *generating a believable 20-turn conversation*. The visualizer's value proposition is showing how memory matters at long-conversation scale, which requires actually running a 20-turn conversation against Claude. The script needs to generate realistic user turns (probably hard-coded or scripted), feed them through the agent, and capture the full state per turn — both modes (full history + hybrid). The token spend per full rebuild is ~$2-5, and the script's complexity is moderate (~1.5 days of work) because the hybrid mode requires implementing buffer + summary + retrieval and capturing each subsystem's state on each turn.

The second cost is *making memory architecture *visible* in the UI*. Memory is conceptual — the buffer is just a slice of the messages array, the summary is text, the store is rows in a DB. Surfacing all three so the reader can see what's happening per turn requires three labeled panels (buffer, summary, retrieved-this-turn) plus a context-utilization gauge. Implementation: ~1 day for the layout + transitions + gauge animation.

The third cost is *turn-slider UX*. The visualizer's natural interaction is "scrub through the conversation turn by turn." That's a slider with 20 stops; each stop re-renders the four panels (turns, buffer, summary, store retrievals). Smooth animation between stops is nice-to-have but not essential.

### What the alternative would have cost (skipping the visualizer)

If reincodes never builds `/ai/agent-memory`, the cost is zero in the codebase. Memory architecture lives in loopd's Phase 4 Path B/C (the classifier/coaching agent's memory of past sessions), with the curriculum's `[C4.5]` concept covered there. Interview answer: "here's how loopd manages conversation state in chains (none — chains are stateless across calls) vs how Path C's coaching agent would maintain a session memory across reps."

The cost of *not* building it surfaces in interview rounds focused specifically on long-conversation agents — voice agents, customer-support agents, anything that runs 30+ turns per session. For those roles, the visualizer is a sharp signal; for typical LLM-application roles, the verbal answer suffices.

### The breakpoint

The visualizer earns its place when the candidate is interviewing for long-conversation agent roles (voice agents, customer support, AI tutors). The narrow target makes the build less universally valuable but very sharp where it lands.

### What wasn't actually a tradeoff

The choice between "show one mode" and "show both modes side-by-side" was not a real option. The pedagogical contribution of the visualizer is the *comparison* — context-window utilization in full-history mode vs. hybrid mode is what makes the memory-architecture argument visceral. A single-mode demo would teach the implementation but not the *decision*.

---

## Tech reference (industry pairing)

### LangChain memory modules (canonical reference)

- **Codebase uses:** not yet — would be the conceptual reference for the visualizer's hybrid implementation. The shape is identical to LangChain's `ConversationSummaryBufferMemory` (sliding window + rolling summary + vector retrieval).
- **Why it's here:** LangChain shipped the first widely-used memory abstractions in 2023; the patterns it codified (`ConversationBufferMemory`, `ConversationBufferWindowMemory`, `ConversationSummaryMemory`, `ConversationSummaryBufferMemory`, `VectorStoreRetrieverMemory`) are the vocabulary the field uses to discuss memory architectures.
- **Leading today:** LangChain memory modules — `adoption-leading` for vocabulary and reference implementations, 2023-2026.
- **Why it leads:** sets the canonical shape (buffer, window, summary, vector) and the field's pattern language. Even teams that don't use LangChain reach for the same patterns under the same names.
- **Runner-up:** LlamaIndex chat memory — `innovation-leading` for retrieval-heavy memory architectures; tighter integration with the LlamaIndex retrieval stack.

### Anthropic Claude Haiku (summarization)

- **Codebase uses:** not yet — would be the summarization LLM in the visualizer's hybrid mode. Haiku compresses evicted turns into the rolling summary; cheap enough to run on every turn that triggers a summary update.
- **Why it's here:** summarization is a low-stakes high-volume task — every turn that crosses the buffer boundary triggers a summary update. Haiku's cost (~10x cheaper than Sonnet) and latency (~3x faster) make it the right model for the summarizer role.
- **Leading today:** Anthropic Claude Haiku 4 — `adoption-leading` for summarization in agent memory pipelines, 2026.
- **Why it leads:** strong instruction-following at low latency, prompt-caching support so the summarization-instruction prefix can be cached across summary updates, and consistent behavior across many short tasks.
- **Runner-up:** GPT-4o-mini — `adoption-leading` for similar summarization roles in OpenAI-centric stacks.

### sqlite-vec / pgvector (long-term store)

- **Codebase uses:** not yet — would be the vector store backing the long-term memory layer in a server-side variant of the visualizer. Not applicable to the static-export reincodes deploy directly; the visualizer would precompute embeddings and ship them as JSON.
- **Why it's here:** the long-term memory layer is RAG over past turns; the same vector store choices as RAG apply. sqlite-vec is the lightweight option for local-first agents (loopd's actual choice in the curriculum's `[B2A.1]` build item); pgvector is the production-scale option for server-hosted agents.
- **Leading today:** pgvector — `adoption-leading` for production RAG / agent memory backends, 2025-2026.
- **Why it leads:** Postgres ubiquity, mature ecosystem (existing tooling, monitoring, backup), HNSW indexes for fast approximate-nearest-neighbor search.
- **Runner-up:** sqlite-vec — `innovation-leading` for local-first / on-device agent memory; relevant for desktop apps, mobile, or static-export sites where server infra isn't available.

---

## Project exercises

### [B-reincodes-agent-memory-viz] Build the agent-memory visualizer

- **Exercise ID:** `[B-reincodes-agent-memory-viz]` — derived from the curriculum's reincodes "interview prep surface" entry and Phase 4 concept `[C4.5]` (memory: short-term context + long-term retrieval).
- **What to build:** a page at `/ai/agent-memory` that renders a precomputed 20-turn conversation in two modes via a top-level toggle. Mode 1 ("full history in context"): a single panel shows the conversation context growing turn by turn; a context-utilization gauge at top shows tokens used / context window, growing from ~3% to ~30% by turn 20. Mode 2 ("summarized + retrieved"): four panels — the last-5 turns buffer (top), the rolling summary (middle), the long-term store with retrieval highlights (bottom-left), and the actual context being sent to the LLM each turn (bottom-right). A turn slider (turns 1-20) at the bottom drives the entire display; scrubbing through reveals how each panel evolves. The reader can directly compare context-window utilization across the two modes and see the hybrid mode stay bounded while the full-history mode grows linearly.
- **Why it earns its place:** the visualizer makes memory architecture *visible*. The reader watches the full-history context grow toward unwieldiness, flips to hybrid mode, and sees the context stay bounded while the conversation continues. The decision becomes operable — not "memory architecture is good," but "look, here's what bounded looks like vs. unbounded." The interview signal is that the candidate built a tool that demonstrates the architectural decision visually.
- **Files to touch:** `src/app/ai/agent-memory/page.tsx` (visualizer), `src/components/AgentMemoryVisualizer/` (turn slider, panel layout, utilization gauge, mode toggle), `public/ai/agent-memory/conversation-full.json` (20-turn conversation, full-history variant captured per turn), `public/ai/agent-memory/conversation-tiered.json` (same conversation in hybrid mode — buffer state, summary state, store retrievals per turn), `scripts/precompute-agent-memory.ts` (build-time script that runs the conversation against Claude in both modes, captures per-turn state for buffer/summary/store, uses Haiku for the summarizer and Claude for the agent). Add a row to `CONCEPT_CATEGORIES` in `src/components/Home/conceptsData.tsx` under a new `ai-engineering` category.
- **Done when:** the page loads at `/reincodes/ai/agent-memory/` in production, the mode toggle flips between full-history and hybrid views, the turn slider scrubs through all 20 turns with the panels updating in real time against precomputed JSON, the utilization gauge correctly reflects per-turn token counts, `next build` passes under `output: "export"`. Build script runs the conversation end-to-end against Anthropic API.
- **Estimated effort:** 2-2.5 days. Precompute script (both modes, summarization layer, vector-store indexing, per-turn state capture): 1-1.5 days. Page + four panels + slider + mode toggle: 1 day. Polish (smooth panel transitions, gauge animation, the turn-slider scrubbing): half day.

---

## Summary

### Part 1 — concept recap

Agent memory is two distinct stores stitched together: *short-term* (the conversation buffer carried in context each turn, bounded by ~10 turns of working window) and *long-term* (an external store the agent retrieves from when it needs information past the buffer's edge). Production agents usually stack three subsystems: a sliding window of recent turns kept verbatim, a rolling summary of older turns that survives indefinitely at constant size, and a vector store indexing every turn for on-demand retrieval. The architectural payoff is *bounded context, unbounded history* — per-call token cost stays flat as the conversation grows arbitrarily long, while past information is recoverable via retrieval. The pattern transferred wholesale from RAG over documents (the documents are the agent's own past turns). The deeper principle is that *attention is the scarce resource, not bytes* — long-context windows don't fix the lost-in-the-middle effect, so memory architectures remain load-bearing even on 1M-token models. In this codebase the concept is Case B; the buildable target is a `/ai/agent-memory` page rendering a 20-turn conversation in both full-history and hybrid modes with a turn slider and a context-utilization gauge.

### Part 2 — key points to remember

- **The two stores**: short-term (buffer in context, bounded), long-term (external store, unbounded). Most production agents add a third subsystem — a rolling summary.
- **The principle**: bounded context, unbounded history. Decouple the two so per-call cost stays flat as conversations grow.
- **The contrast**: long-context models don't obviate memory architectures. Lost-in-the-middle persists; recall on turn 3 still drops by turn 50 even at 1M tokens.
- **The implementation**: sliding window of last N + rolling summary of older + vector store for retrieval. Three subsystems, each with its own eval discipline.
- **The reincodes shape**: Case B. Visualizer renders a 20-turn conversation in both modes with a turn slider so the reader watches context utilization stay bounded in hybrid mode and grow linearly in full-history mode.

---

## Interview defense

### What an interviewer is really asking

Behind "how do you handle long conversations?" the interviewer is testing whether the candidate has shipped an agent past the ~10-turn mark and hit the failure modes. A junior answer says "use a long-context model." A senior answer names the memory architecture (buffer + summary + retrieval) and explains why each layer earns its place. A staff answer adds the per-layer failure modes (summary drift, retrieval miss, buffer-size tuning).

### Likely questions

**Q (mid):** What's the difference between short-term and long-term memory in an agent?

A: Short-term is the conversation buffer carried in the context on every API call — typically the last N turns kept verbatim. Long-term is an external store (vector DB, KV store, summarization buffer) the agent retrieves from when it needs information past the short-term window. The distinction matters because short-term is paid on every call (re-sent each turn), while long-term is paid only when retrieval fires. The architectural decision is what lives in each.

```
the split

  short-term                       long-term
  ───────────────────              ───────────────────
  in context every call            retrieved on demand
  bounded by window                unbounded
  per-call cost                    storage cost
  last N turns verbatim            all turns indexed
  ~3KB sent per call               ~0 sent per call
                                   (until retrieval)
```

**Q (senior):** What goes in the rolling summary vs what stays verbatim in the buffer?

A: The buffer holds the last N turns verbatim because *recency* is the dominant signal — the model needs the exact text of recent turns to maintain coherence (Pronouns refer to recent entities; clarifications reference recent statements; tool calls build on recent results). The summary holds *invariants*: facts, decisions, constraints, user preferences. Anything that "should be true throughout the conversation" lives in the summary. A turn that says "I want all responses in markdown" goes into the summary as a constraint; a turn that says "what's the weather?" stays in the buffer (and falls off when it ages out). The tuning question: N (buffer size) is usually 5-10 turns; the summary's content quality is shaped by the summarizer's system prompt ("preserve constraints, decisions, and facts that future turns might depend on; drop conversational filler").

```
what lives where

  buffer (last N, verbatim)        summary (compressed)
  ──────────────────────────       ──────────────────────
  recent tool calls + results      constraints set in any turn
  recent user clarifications       decisions reached
  the in-progress reasoning        facts about the user
  conversational coherence         the project context
```

**Q (arch):** Walk me through what happens when the model needs information from turn 3 of a 50-turn conversation.

A: Three paths, in order of cost. First, *summary path*: if the relevant fact from turn 3 is in the rolling summary (e.g. "user wants markdown output," set in turn 3, preserved through summary updates), the model has it already — no retrieval needed. Second, *retrieval path*: if the specific text of turn 3 is needed (the user asked a specific question the model is now revisiting), the agent issues a `retrieve_past_turns` tool call with a query that should match turn 3's content; the vector store returns it; the model uses it. Third, *re-summarization path*: if the summary has lost the fact through drift (the summarizer compressed it out over time), the agent might trigger a full-history re-summarization — expensive, runs against the whole conversation, regenerates a fresh summary. The first path is the cheapest and the default; the second is the fallback; the third is rare but necessary when summary quality has degraded over many compressions.

```
the recovery paths

  turn 3 fact needed
        │
        ▼
  ┌─ in summary? ─┐
  │ yes           │── use it (free)
  │ no            │
  └───┬───────────┘
      ▼
  ┌─ retrieve? ──────────┐
  │ relevant turn found  │── pull into context
  │ retrieval miss       │   ($0.001, +200ms)
  └───┬──────────────────┘
      ▼
  ┌─ full re-summarize? ─┐
  │ regenerate summary   │── expensive, rare
  │ from raw history     │   ($0.05, +5s)
  └──────────────────────┘
```

### The question candidates always dodge

**Q:** Long-context models have 1M-token windows now. Doesn't that make all of this memory architecture unnecessary?

A: That argument is wrong in a way that matters in production. The 1M-token window solves the *capacity* problem (the conversation fits) but not the *attention dilution* problem (the model's recall on any specific turn drops as context grows). Anthropic's own research and academic benchmarks (the "lost-in-the-middle" line of work, Liu et al. 2023, plus follow-on studies on 100K+ context models) consistently show that recall on middle-positioned context is much worse than recall on context-window ends. At 50 turns × 500 tokens each = 25K tokens, well within 1M, the model still misses the constraint set in turn 3 ~40% of the time. The 1M window also costs proportionally more — sending 25K of conversation history on every call is real money — without improving correctness past a point. The honest framing: long-context windows raise the *ceiling* on what's possible (you can do a 100-turn conversation at all, not just 10) but don't change the *gradient* — memory architectures still earn their place because they control *what the model attends to*, not just *what fits*. The candidate who answers "long-context obviates memory" is signaling they've read marketing material; the right answer names the lost-in-the-middle effect explicitly.

```
two failure modes long context doesn't fix

  capacity (fits)        attention (recalled)
  ───────────────        ───────────────────
  ✓ 1M solves            ✗ lost-in-the-middle
                           persists
  ─────                  ─────
  conversation goes      model still forgets
  longer                 turn 3 at turn 50
```

### One-line anchors

- "Short-term is bounded and re-sent every call. Long-term is unbounded and retrieved on demand. Most production agents stack both with a rolling summary in between."
- "Bounded context, unbounded history. The decoupling is what lets agents run arbitrarily long without per-call cost growth."
- "The buffer holds recency; the summary holds invariants. Constraints, decisions, and facts go into the summary; tool calls and clarifications stay verbatim."
- "Long-context windows don't fix lost-in-the-middle. The memory architecture is load-bearing even at 1M tokens."
- "Long-term memory is RAG applied to past turns. The retrieval discipline transfers wholesale."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw the hybrid memory architecture from memory: short-term buffer (sliding window), rolling summary, long-term store, and the assembled context sent to the LLM. Label which subsystem each piece comes from in the final context.

✓ Pass: three subsystems drawn, the eviction-with-summarization arrow shown, retrieval arrow from long-term shown, final assembled context labeled
✗ Fail: re-read the primary diagram and the walkthrough, wait 10 minutes, try again

### Level 2 — Explain it out loud

Explain memory architecture to a colleague who built an agent that's regressed at turn 15. No notes. Under 90 seconds.

Checkpoints — did you:
- Name the two stores (short-term, long-term)?
- Add the third subsystem (rolling summary)?
- State the failure mode that triggered the upgrade (lost-in-the-middle, cost growth)?
- Reference the buildable target (`/ai/agent-memory`) as how you'd demonstrate the architecture?

If you skipped any: you described the components, you didn't argue the decoupling principle.

### Level 3 — Apply it to a new scenario

A new feature lands in the planned reincodes AI surface: an "AI tutor for DSA concepts" that runs a Socratic-style conversation with the user, asking questions, offering hints, and adapting to the user's gaps. Conversations might run 30-60 turns. Design the memory architecture. What goes in the buffer? What goes in the summary? What gets indexed for retrieval?

Write the architecture (3-5 paragraphs). Then verify: does your summary capture *constraints* (the user's level, their gaps, their preferences) vs. *transient* state (the current question)? Does your retrieval cover edge cases where the user circles back to a topic from 20 turns ago?

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff from the Tradeoffs section. Answer in writing: "If I were building `/ai/agent-memory` today with the same constraints, would I precompute a 20-turn conversation or a 50-turn conversation? Why? What would change?"

Reference the actual code:
→ Point to `next.config.ts` for the static-export constraint that bounds the JSON ship size
→ Identify what would shift if the precompute went 50 turns (~5x JSON size, ~5x API spend, ~2x panel-state-capture complexity)

### Quick check — code reference test

Without opening any files, answer:
- What's the name of LangChain's hybrid memory pattern (sliding window + summary + retrieval)?
- What canonical paper / paper-thread is the empirical basis for "long-context doesn't fix attention dilution"?
- What pattern in the existing reincodes visualizers is conceptually shaped like a bounded working state (no long-term, just current)?

Then open the files / docs and verify.

✓ Pass: `ConversationSummaryBufferMemory`, the "lost-in-the-middle" line (Liu et al. 2023 and follow-ons), the visualizer pages' `useState` step-through pattern
✗ Fail on details: the LangChain class name and the lost-in-the-middle citation are what matter; recover them.
