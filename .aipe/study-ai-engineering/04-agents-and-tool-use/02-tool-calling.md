# Tool calling — function-call schemas and response handling

**Industry name(s):** Tool calling, function calling, tool use
**Type:** Industry standard

> Tool calling is the LLM-side equivalent of an HTTP API: the model emits a typed request to call a named tool with typed args, the app executes the tool, and the result lands back in the conversation as a typed response. The contract lives in a schema.

**See also:** → [01-agents-vs-chains](01-agents-vs-chains.md) · → [03-react-pattern](03-react-pattern.md) · → [04-tool-routing](04-tool-routing.md) · → [06-error-recovery](06-error-recovery.md) · → [../../study-prompt-engineering/02-structured-outputs.md](../../study-prompt-engineering/02-structured-outputs.md)

---

## Why care

### Move 1 — The grounded scenario

You've built a React form that takes a journal entry and sends it through `fetch()` to a backend. The backend calls Claude and returns a structured tag list. So far so good — that's `fetch()` with an LLM in the middle. Now the PM asks "can it look up tags the user has used before so it stays consistent?" The naive move is to fetch the user's prior tags server-side and stuff them into the prompt as context. That works for one lookup. Then PM adds "and if the entry mentions a date, can it check the calendar?" Now you're stuffing two things into the prompt. By the third request — "can it look up the user's recent threads" — the prompt is 4KB of pre-injected context and you're paying token cost on data the model might not even use. The shift you need is the model *asking* for the data it needs, not you guessing what it'll need.

### Move 2 — Name the question

That shift has a name — *tool calling*. Not the prompt's structure, not the model's reasoning, not the function being called — just the question of *how the model expresses "I need to call X with args Y" in a way the app can parse, execute, and return back*. Tool calling is the LLM-side equivalent of an HTTP API: the model emits a typed request (call `getRecentTags` with `{ userId: "abc", limit: 10 }`), the app executes the request, the response goes back to the model as a typed result. The whole thing rides on a schema — the model knows what tools exist and what shape their arguments and responses take.

### Move 3 — Why answering that question matters

**Why you need to answer that question at all:** because the alternative is *prompt-stuffing every possible piece of context*, which scales linearly with the number of integrations and quadratically with the prompt complexity. A feature that started as "extract tags from this entry" becomes "extract tags from this entry, here are 10KB of user history, here are last week's calendar events, here's the recent thread list, here's the project list..." — and 80% of that context is unused on any given call. The token bill grows, the model's attention gets diluted (lost-in-the-middle hits harder with longer prefixes), and the *correctness* drops because the model is forced to triage 10KB of context when it really only needed 200 bytes of recent-tag history. Tool calling inverts the polarity: the model knows what's available and asks for what it needs, the app responds with exactly that. The pre-fetch-everything failure mode disappears; the new failure modes (model picks the wrong tool, tool fails, model can't recover) are the ones the rest of this sub-section covers.

### Move 4 — Concrete before/after

Without tool calling (prompt-stuffing context):

- The prompt grows by N bytes per integration, even when integrations aren't used
- 10KB prompts per call, ~$0.04 per call at Sonnet rates
- Lost-in-the-middle: model misses the recent-tag list 30% of the time when buried at position 7 of 12 context blocks
- Adding a new integration means rewriting the prompt template and re-running the eval suite

With tool calling:

- The prompt declares the tool *registry* (here's what exists), not the *data* (here's what's loaded)
- 1KB prompts per call (system + tool definitions), data fetched as needed via tool calls
- The model emits 0-3 tool calls per entry depending on what's actually relevant
- Adding a new integration means registering a new tool and adding its handler; the prompt doesn't change

### Move 5 — The one-line summary

Tool calling is the LLM-side equivalent of declaring an HTTP API surface: the model knows what endpoints exist (the tool registry), emits typed requests against them (`tool_use` blocks), and the app returns typed responses (`tool_result` blocks). The rest of this file is the mechanics.

---

## How it works

### Move 1 — The mental model

A tool call is a structured message the model emits *instead of* a final text response. Where a normal LLM response is `{ role: "assistant", content: "the answer is foo" }`, a tool-calling response is `{ role: "assistant", content: [{ type: "tool_use", name: "getRecentTags", input: { userId: "abc", limit: 10 } }] }`. The model has been told (via the request's `tools` parameter) what tools exist and what their input schemas look like. The model decides whether to call one, two, or zero tools — or to emit a final text response. The app's job is to *parse* the `tool_use` blocks, *execute* the corresponding handler, and *append* the result back to the conversation as a `tool_result` block. The next LLM call sees the result and can either call another tool or finalize.

```
the tool-call cycle (one round trip)

  app                        LLM
   │                          │
   │ messages: [user]         │
   │ tools: [tag, calendar,   │
   │         threads]         │
   ├─────────────────────────►│
   │                          │  decides: "I need recent tags"
   │                          │
   │◄─────────────────────────┤
   │   tool_use:              │
   │     name: getRecentTags  │
   │     input: { ... }       │
   │                          │
   │ executes getRecentTags   │
   │                          │
   │ messages: [user, tool_   │
   │   use, tool_result]      │
   ├─────────────────────────►│
   │                          │  decides: "I have what I need"
   │                          │
   │◄─────────────────────────┤
   │   final response         │
   │                          │
```

### Move 2 — The layered walkthrough

#### The tool definition (the schema)

A tool definition is a JSON Schema object that names the tool, describes what it does, and types its inputs. In Anthropic's API: `{ name: "getRecentTags", description: "Get the user's most recently used tags.", input_schema: { type: "object", properties: { userId: { type: "string" }, limit: { type: "integer" } }, required: ["userId"] } }`. The model never sees the *implementation* — only the name, description, and input schema. The description is the load-bearing field; it's how the model knows when to use this tool vs. another one. If two tools have similar descriptions, the model will conflate them; if a description is vague ("does stuff with tags"), the model won't reach for it confidently.

```
tool-definition anatomy

  {
    name: "getRecentTags",          ← stable identifier
    description: "Returns the      ← what the model reads to decide
      most recently used tags        when to call this
      for a user, ordered by
      last use. Use this when
      the journal entry mentions
      a topic the user might
      have tagged before.",
    input_schema: {                 ← what the model emits as args
      type: "object",
      properties: {
        userId: { type: "string" },
        limit: { type: "integer",
                 default: 10 }
      },
      required: ["userId"]
    }
  }
```

#### The tool_use block (model → app)

When the model decides to call a tool, the API response's `content` array contains a `tool_use` block instead of (or in addition to) a `text` block. The block has three fields: `id` (unique per call, used to thread the result back), `name` (matches one of the registered tools), and `input` (matches the tool's `input_schema`). The model can emit *multiple* `tool_use` blocks in one response (parallel tool calls — `getRecentTags` and `getCalendarEvents` together) when the API supports it and the tools are independent. The app's job is to iterate the blocks, dispatch each to its handler, and prepare a `tool_result` for each `id`.

```
response shape when the model calls tools

  {
    role: "assistant",
    content: [
      {
        type: "text",
        text: "I'll look up recent tags and calendar events."
      },
      {
        type: "tool_use",
        id: "toolu_abc123",
        name: "getRecentTags",
        input: { userId: "u1", limit: 10 }
      },
      {
        type: "tool_use",
        id: "toolu_def456",
        name: "getCalendarEvents",
        input: { date: "2026-05-25" }
      }
    ],
    stop_reason: "tool_use"
  }
```

#### The tool_result block (app → model)

The app executes each tool and packages the output as a `tool_result` block: `{ type: "tool_result", tool_use_id: "toolu_abc123", content: "JSON.stringify(result)" }`. Multiple results in one user-message content array, one per `tool_use` block from the previous turn. The content is a string — the app stringifies whatever the tool returned (JSON for structured data, plain text for unstructured). The model treats `tool_result` as facts grounded in the tool's execution, not as instructions. If the tool failed, the result can be an error string (`"tool_result": "ERROR: user not found"`) and the model gets to decide whether to retry, ask the user, or give up.

```
the result that closes the loop

  {
    role: "user",
    content: [
      {
        type: "tool_result",
        tool_use_id: "toolu_abc123",
        content: '["productivity", "side-project", "react"]'
      },
      {
        type: "tool_result",
        tool_use_id: "toolu_def456",
        content: '[{ "title": "1:1 with manager", "time": "14:00" }]'
      }
    ]
  }

  // model's next response sees these as grounded facts
```

#### Tool calls vs. structured outputs

The pattern looks adjacent to structured outputs (the model emitting JSON conforming to a schema), but the semantics differ. A structured output is the model's *final answer* in a typed shape — it ends the call. A tool call is the model *requesting an action* — the conversation continues after the result comes back. The same schema enforcement applies (the input must validate against `input_schema`) but the conversational role is different. A useful heuristic: if you want the model to *finish* with a typed object, use structured outputs; if you want the model to *fetch or compute something and continue*, use a tool call. Some tasks blur the line — a "single tool, single call, single result" pattern is essentially structured output dressed as tool use — but the orthogonal axis (does the model expect to keep going?) is the real distinguisher.

### Move 3 — The principle

The principle is *the LLM is a typed coordinator, not a typed function*. A typed function takes args and returns a result; an LLM with tool calling *negotiates* the args, *requests* the call, *interprets* the result, and *decides* what to do next. The schema is the type system at the LLM boundary. Treat the tool registry like an API surface — name tools clearly, write descriptions that read like docstrings the model would have to act on under time pressure, type the inputs strictly so the model can't emit malformed args. The places where tool calling goes wrong in production trace back to schema laziness: vague descriptions, overlapping tools, loose input types, results that aren't stringified consistently.

The full picture is below.

---

## Tool calling — diagram

```
┌─ Application boundary ──────────────────────────────────────────────┐
│                                                                     │
│   ┌─────────────────────────────────────┐                          │
│   │  Tool registry (declared once)      │                          │
│   │  ┌──────────────────┐               │                          │
│   │  │ getRecentTags    │  schema       │                          │
│   │  │ getCalendarEvts  │  schema       │                          │
│   │  │ getRecentThreads │  schema       │                          │
│   │  └──────────────────┘               │                          │
│   │  ┌──────────────────┐               │                          │
│   │  │ handlers (impl)  │  closures      │                         │
│   │  └──────────────────┘               │                          │
│   └──────────────────┬──────────────────┘                          │
│                      │                                              │
│                      │ tools[] sent on every messages.create        │
│                      ▼                                              │
│                                                                     │
│   ┌─────────────────────────────────────┐                          │
│   │  Conversation state (messages[])    │                          │
│   │  ┌─────────────────────────┐        │                          │
│   │  │ user: "extract tags..." │        │                          │
│   │  └─────────────────────────┘        │                          │
│   │  ┌─────────────────────────┐        │                          │
│   │  │ assistant:               │       │                          │
│   │  │   text: "let me check..." │      │                          │
│   │  │   tool_use(getRecentTags) │      │                          │
│   │  └─────────────────────────┘        │                          │
│   │  ┌─────────────────────────┐        │                          │
│   │  │ user:                    │       │                          │
│   │  │   tool_result([...])     │       │                          │
│   │  └─────────────────────────┘        │                          │
│   │  ┌─────────────────────────┐        │                          │
│   │  │ assistant:               │       │                          │
│   │  │   text: "final tags:..." │       │                          │
│   │  └─────────────────────────┘        │                          │
│   └─────────────────────────────────────┘                          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              ▲
                              │
                              ▼
                       ┌──────────────┐
                       │  LLM call    │
                       │ (Claude/GPT) │
                       └──────────────┘
```

The conversation state is the *append-only log* of the negotiation. Every turn, the full log goes to the model along with the tool registry. The model emits a tool_use; the app emits the matching tool_result; the loop continues until the model emits text without tool_use blocks.

---

## In this codebase

**Not yet implemented.** reincodes has no LLM calls, no tool registry, no `tools` parameter — nothing that calls out to a model with a typed schema. The closest existing analog in the codebase is the action-typed UI state in the visualizers: `src/components/Home/conceptsData.tsx` is a typed registry of concept entries (each with `title`, `href`, `meta`, `thumb`), which is the same *shape* as a tool registry — a typed collection of named entries the renderer dispatches against. The agent-loop analog has no existing parallel.

The buildable target is below in Project exercises — a `/ai/tool-calling` page that renders a precomputed multi-tool conversation as a timeline. Each turn expands to show the prompt, the tool definitions, the model's `tool_use` blocks, the app's `tool_result` blocks, and the model's final response. A toggle flips one tool's result to an error string to demonstrate recovery behavior.

**Expected file paths** (when built):
- `src/app/ai/tool-calling/page.tsx` — the visualizer
- `src/components/ToolCallingVisualizer/` — timeline renderer, tool-call expand panels, error toggle
- `public/ai/tool-calling/conversation.json` — precomputed multi-turn conversation with full message history
- `public/ai/tool-calling/conversation-with-error.json` — precomputed variant where one tool returns an error
- `scripts/precompute-tool-calling.ts` — build-time script that runs the conversation against Claude and captures both variants

---

## Elaborate

### Where this pattern comes from

Tool calling landed as a first-class API primitive in mid-2023, when OpenAI shipped `function_call` (later renamed to `tool_calls`) as an alternative to in-prompt JSON extraction. Before that, the same pattern existed but was implemented by *prompt convention*: the system prompt said "when you need to call a tool, output a JSON blob like `<tool>...</tool>` and the app will execute it" and parsing was best-effort regex. The shift to API-level tool calling moved the schema enforcement from convention into the protocol — the model can no longer emit malformed tool calls because the API rejects them before they reach the app. Anthropic followed in late 2023 with the `tools` parameter and `tool_use` / `tool_result` content blocks; the Anthropic shape is the cleanest version of the abstraction because the content-block model treats tool calls as first-class alongside text rather than as a side-channel field.

### The deeper principle

The deeper principle is that *function calling at the LLM boundary is the same kind of move as RPC at the network boundary*. Before HTTP/JSON, services exchanged ad-hoc bytes; before tool calling, the LLM exchanged ad-hoc strings. The shift to typed RPC at both layers exists for the same reasons: schema-driven contracts mean both sides can validate independently, the wire format becomes auditable, and the failure modes become enumerable. The history of distributed systems is one long story of pushing more rigor into the wire format — XML-RPC, SOAP, REST + JSON Schema, OpenAPI, gRPC + protobuf — and tool calling is the latest beat in that story applied to the model-to-app boundary.

### Where this breaks down

Tool calling breaks down in two places. First, *high-cardinality tool registries* — when you have 50+ tools, the model's recall drops because each tool's description has to compete for attention in the system prompt. The mitigation is tool routing (a smaller LLM picks the relevant 5 tools before the main call gets them, see `04-tool-routing`). Second, *long-running tools* — if the tool takes 30 seconds, the agent loop sits idle waiting, which breaks streaming UIs and burns budget. The mitigation is async tool execution with status polling, which is not yet standard across providers (Anthropic added async tool use in beta in 2025). The third edge case worth naming: when the tool's output is itself large (a 50KB document retrieved from a tool), the conversation grows fast — the loop has to either summarize tool outputs before re-injection or accept the cost growth.

### What to explore next

- [01-agents-vs-chains](01-agents-vs-chains.md) → the architectural choice that determines whether tool calling lives in a loop (agent) or in a fixed step (chain calling one tool then finalizing)
- [03-react-pattern](03-react-pattern.md) → the specific agent shape (Thought → Action → Observation) that became the default; "Action" is a tool call
- [04-tool-routing](04-tool-routing.md) → when the registry gets large, routing happens before the main call sees all tools
- [06-error-recovery](06-error-recovery.md) → how the model handles tool failures; the negotiation pattern is what makes recovery possible
- [../../study-prompt-engineering/02-structured-outputs.md](../../study-prompt-engineering/02-structured-outputs.md) → tool calling and structured outputs are adjacent; understand both and the choice between them gets sharper

---

## Tradeoffs

### Comparison table — both costs in one frame

```
┌────────────────────┬──────────────────────┬─────────────────────────┐
│ Cost dimension     │ Tool calling         │ Prompt-stuff context    │
├────────────────────┼──────────────────────┼─────────────────────────┤
│ Per-call prompt    │ ~1KB (tool defs)     │ ~10KB+ (all data)       │
│ Per-call token bill│ Lower (data fetched  │ Higher (all data sent)  │
│                    │ as needed)           │                         │
│ Latency            │ Higher when tools    │ Lower (one round-trip)  │
│                    │ run (multi-trip)     │                         │
│ Adding integration │ Register tool +      │ Rewrite prompt template │
│                    │ handler              │                         │
│ Failure modes      │ Tool fails, model    │ Lost-in-the-middle,     │
│                    │ picks wrong tool     │ context overflow        │
│ Recall on data     │ High (model asks)    │ Drops with prompt size  │
│ Schema enforcement │ At the API           │ In application code     │
│ Eval shape         │ Per-tool + whole     │ End-to-end only         │
│                    │ conversation         │                         │
│ Debuggability      │ Tool calls are       │ Need to inspect full    │
│                    │ explicit in trace    │ prompt to debug         │
└────────────────────┴──────────────────────┴─────────────────────────┘
```

### What we'd give up (when planning the visualizer)

The first cost is *precompute fidelity*. A useful tool-calling visualizer needs a real multi-turn conversation with at least 2-3 tool calls captured turn-by-turn. The precompute script has to register actual tools (even if their implementations are stub data — `getRecentTags` returns a fixed array, `getCalendarEvents` returns a fixed list), run the conversation against Claude, capture *every* request/response including the tool-use IDs and tool-result content, and serialize as JSON. The error-variant adds a second precompute run where one tool's result is replaced with an error string so the reader can see the model's recovery behavior. Total precompute cost: ~$1-2 of API spend and ~half a day of script wrangling.

The second cost is *bundle weight*. The conversation JSON for a realistic multi-turn trace is ~10-20KB per variant; with two variants (success + error), the route ships ~30KB of trace data plus the visualizer renderer (~15KB). Code-splitting under `/ai/` keeps it off the home page bundle but the route still ships ~50KB. The renderer can be slim because every turn is essentially the same shape rendered differently (text → tool_use → tool_result → text).

The third cost is *teaching surface clarity*. The visualizer competes with `02-structured-outputs.md` in the sibling sub-section for the reader's attention on "how the model returns structured data." The discriminating angle is *conversational continuation* — the visualizer has to make the "tool result goes back to the model and the model keeps going" beat legible, otherwise it reads as a fancy structured-output demo.

### What the alternative would have cost (skipping the visualizer)

If reincodes never builds `/ai/tool-calling`, the cost is zero in the codebase. Tool calling lives in loopd's chains (per the curriculum's Phase 1 build items B1.1 typed contracts; tool use surfaces explicitly in Phase 4's agent path). The interview answer becomes "here's how loopd's classify chain uses Claude's tool-use API to enforce typed outputs; here's how Path B's classifier upgrade would use a `retrieve_similar_todos` tool" — verbal, code-pointer-based, no visualizer.

The cost of *not* building it shows up in interview rounds focused on tool-use mechanics specifically — when an interviewer asks "walk me through the tool-call cycle end-to-end, what's in each message, what's the `tool_use_id` for." Without the visualizer, the candidate is reciting the protocol from memory; with the visualizer, the candidate is pointing at a rendered timeline.

### The breakpoint

The visualizer earns its place when the candidate is interviewing for a role where tool calling is *the* core mechanic — agent-platform roles, tool-orchestration roles, anything involving Anthropic's tool-use API or OpenAI's Assistants API as a primary surface. For roles where tool calling is one mechanism among many, the verbal answer against loopd code suffices. The visualizer is a sharp signal for narrow targets.

### What wasn't actually a tradeoff

The choice between "precompute and play back" vs. "make the visualizer call live" was not a real option. The static-export contract (`output: "export"` in `next.config.ts`) prohibits any server-side runtime at the deploy target, so any live call would require leaving GH Pages — which would mean the visualizer no longer ships alongside the rest of reincodes. Precomputing the conversation is the only path consistent with the deploy story.

---

## Tech reference (industry pairing)

### Anthropic tool-use API

- **Codebase uses:** not yet — the planned `/ai/tool-calling` visualizer would use Anthropic's tool-use shape as the precompute target. The conversation JSON is structured around `tool_use` and `tool_result` content blocks; the renderer matches those shapes directly.
- **Why it's here:** Anthropic's tool-use API is the cleanest implementation of the protocol — content blocks (`type: "tool_use"` / `type: "tool_result"`) are first-class alongside text, `tool_use_id` threads the request to its result, and `stop_reason: "tool_use"` makes the loop-or-finalize decision unambiguous.
- **Leading today:** Anthropic Messages API tool use — `adoption-leading` for the modern tool-call shape, 2026.
- **Why it leads:** content blocks (vs OpenAI's older flat `function_call` field that lived alongside `content`), explicit `tool_use_id` correlation, parallel tool calls in one response, `tool_choice` parameter for forcing or preventing tool use, and integration with prompt caching (the system + tools block can be cached as a stable prefix).
- **Runner-up:** OpenAI `tools` API — `adoption-leading` in raw deployment volume; uses a slightly different shape (`tool_calls` array on the message, `tool_call_id` for correlation) but the same protocol underneath.

### Zod (TypeScript schema library)

- **Codebase uses:** not yet — would define the tool input schemas for the visualizer's precompute script. `getRecentTagsSchema = z.object({ userId: z.string(), limit: z.number().int().default(10) })`, then `zodToJsonSchema(getRecentTagsSchema)` produces the JSON Schema for the `input_schema` field. The handler closes over the same type for runtime safety.
- **Why it's here:** the tool's input schema lives in two places — the JSON shape sent to the model and the TypeScript type the handler consumes. Zod is the only library that gives you both from one declaration (`z.infer<typeof schema>` for the type, `zodToJsonSchema(schema)` for the model-facing JSON).
- **Leading today:** Zod — `adoption-leading` for TS-first schema validation, 2026.
- **Why it leads:** `z.infer<>` derives compile-time types from runtime schemas, the ecosystem includes `zod-to-json-schema` for the LLM-boundary shape, and Anthropic / OpenAI SDKs increasingly accept Zod schemas directly via `instructor-js` and similar bridges.
- **Runner-up:** Valibot — `innovation-leading` modular schema validator with a smaller bundle footprint; relevant if the static-export bundle-size ceiling becomes load-bearing.

### Vercel AI SDK

- **Codebase uses:** not yet — would be a candidate for the precompute script's wrapper around the Anthropic SDK call if reincodes ever picks up the Vercel AI SDK for other AI visualizers. Not strictly needed; the raw `@anthropic-ai/sdk` works fine.
- **Why it's here:** Vercel AI SDK has the cleanest cross-provider abstraction for tool calling — `generateText({ tools, ... })` accepts Zod schemas natively, dispatches to handlers, and threads the conversation. If the visualizer ever needs to demonstrate tool calling against multiple providers, the SDK saves significant boilerplate.
- **Leading today:** Vercel AI SDK — `adoption-leading` for TypeScript LLM application code, 2025-2026.
- **Why it leads:** provider-agnostic interface (`@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`), Zod-native tool schemas, built-in streaming and structured outputs, integration with Next.js (the framework this codebase runs on).
- **Runner-up:** raw provider SDKs (`@anthropic-ai/sdk`, `openai`) — `adoption-leading` for codebases that pin to one provider and don't need the abstraction layer.

---

## Project exercises

### [B-reincodes-tool-calling-viz] Build the tool-calling visualizer

- **Exercise ID:** `[B-reincodes-tool-calling-viz]` — derived from the curriculum's reincodes "interview prep surface" entry and Phase 4 concept `[C4.1]` (tool/function calling mechanics).
- **What to build:** a page at `/ai/tool-calling` that renders a precomputed multi-turn conversation as a vertical timeline. Each turn is a card: user message (shown as a quoted block), assistant turns with `tool_use` blocks (each expandable to show the tool's full schema, the args the model emitted, and the result that came back), and the final assistant text response. A toggle at the top of the page flips between the success variant and an error variant where one tool returns `"ERROR: user not found"` — the toggle re-renders the timeline against `public/ai/tool-calling/conversation-with-error.json` and the reader sees the model's recovery turn (call a fallback tool, ask for clarification, or finalize with a degraded answer).
- **Why it earns its place:** the visualizer makes the tool-call cycle's *conversational continuation* legible. The reader sees that the result goes back to the model as a `tool_result` block, that the model's *next* turn is a fresh decision (call another tool, finalize, or ask for clarification), and that error recovery is *the model deciding what to do with a failed result* — not the app catching and re-routing. The interview signal is that the candidate built a tool that teaches the protocol against an actual rendered trace rather than from memory.
- **Files to touch:** `src/app/ai/tool-calling/page.tsx` (visualizer), `src/components/ToolCallingVisualizer/` (timeline, turn cards, tool-call expand, error toggle), `public/ai/tool-calling/conversation.json` (precomputed success trace — 4-6 turns with 2-3 tool calls), `public/ai/tool-calling/conversation-with-error.json` (precomputed error variant), `scripts/precompute-tool-calling.ts` (build-time script that registers ~3 stub tools with Zod schemas, runs the conversation against Claude in two modes, captures full content blocks per turn with `tool_use_id` correlation). Add a row to `CONCEPT_CATEGORIES` in `src/components/Home/conceptsData.tsx` under a new `ai-engineering` category.
- **Done when:** the page loads at `/reincodes/ai/tool-calling/` in production, the timeline renders 4-6 turns with expandable tool-call cards, the error toggle flips between the two precomputed JSON files without a network call, each tool's schema (name, description, input_schema) is visible on expand, `next build` passes under `output: "export"`. Build script validates tool args against Zod schemas before committing the JSON.
- **Estimated effort:** 1.5-2 days. Precompute script (3 tools, 2 conversation variants, full message-history capture): 1 day. Page + timeline + expand interactions + error toggle: half day. Polish (formatting JSON args, color-coding tool_use vs tool_result, the timeline arrow connectors): half day.

---

## Summary

### Part 1 — concept recap

Tool calling is the LLM-side equivalent of declaring an API surface: the model knows what tools exist via a typed registry (sent on every request as the `tools` parameter), emits typed requests via `tool_use` content blocks, and receives typed responses via `tool_result` blocks. The conversation continues turn-by-turn until the model emits text without tool_use (final answer) or a max-iteration guard fires. The shape replaces the older pattern of prompt-stuffing all possibly-relevant context into the system prompt — instead, the model asks for what it needs, which cuts prompt sizes, improves recall on the data that does land in context, and makes adding integrations a tool-registry change rather than a prompt-template rewrite. In this codebase the concept is Case B (no LLM calls anywhere); the buildable target is a `/ai/tool-calling` page that renders a precomputed multi-turn conversation as a timeline with expandable tool-call cards and a success/error toggle.

### Part 2 — key points to remember

- **The protocol**: tool definition (schema) → model emits `tool_use` → app executes → app emits `tool_result` → model emits next decision (another tool, or finalize). Conversation continues turn-by-turn.
- **The schema**: tool definition has three fields — `name`, `description`, `input_schema`. The description is the load-bearing field (it's how the model decides when to use this tool vs another).
- **The contrast**: tool calling vs structured outputs — both use schemas, but tool calling is "call this and continue," structured outputs is "finish with this shape."
- **The default**: prefer tool calling over prompt-stuffing context when the data set is large or per-call relevance varies. Prefer prompt-stuffing when the data is small and always relevant.
- **The reincodes shape**: Case B. The visualizer renders the protocol against precomputed traces with an error-toggle to show recovery behavior.

---

## Interview defense

### What an interviewer is really asking

Behind "how does tool calling work?" the interviewer is testing whether the candidate has wired up a tool registry against a real API and dealt with the failure modes (model picks the wrong tool, tool errors, schema violations). A junior answer recites the protocol from documentation ("the model emits tool_use, the app responds with tool_result"). A senior answer names a specific bug ("I shipped a tool registry with two tools whose descriptions overlapped — `getRecentTags` and `getUserTags` — and the model picked the wrong one 40% of the time; I rewrote one description to disambiguate and the picking rate jumped to 95%"). The interviewer is checking whether the candidate distinguishes *the protocol* (read from docs) from *the schema discipline* (learned by shipping).

### Likely questions

**Q (mid):** Walk me through what happens when the model decides to call a tool.

A: The model emits an assistant message whose content array contains a `tool_use` block — `{ type: "tool_use", id: "toolu_xxx", name: "getRecentTags", input: { userId: "abc", limit: 10 } }`. The API response's `stop_reason` is `tool_use`, signaling the app to execute. The app dispatches the input to the registered handler for `getRecentTags`, gets the result, packages it as a `tool_result` block with the matching `tool_use_id`, appends both the original assistant turn and the new user turn (containing the tool_result) to the messages array, and calls the API again. The model sees the result and either emits another `tool_use` (continuing) or emits a text response (finalizing).

```
the cycle

  app → API: messages=[user], tools=[...]
  API → app: assistant{tool_use(id=A)} | stop=tool_use
  app exec:  handler(A) → result
  app → API: messages=[user, assistant{tool_use}, user{tool_result(id=A)}]
  API → app: assistant{text} | stop=end_turn
  done.
```

**Q (senior):** How do you handle a tool that fails — say, the database query times out?

A: The handler catches the error and returns a tool_result with the error content as a string: `{ type: "tool_result", tool_use_id: "...", content: "ERROR: database timeout after 5s", is_error: true }`. Anthropic's API has an `is_error: true` flag on `tool_result` specifically for this. The model sees the error result and gets to decide — it might retry the same tool (if the prompt frames retries as cheap), call a fallback tool, ask the user for clarification, or finalize with a degraded answer ("I couldn't fetch recent tags but here's my best guess based on the entry alone"). The architectural decision: the *model* handles tool failures, not the app. The app's job is to faithfully report the failure; the model's job is to decide what to do about it. The eval discipline that supports this is having "tool failure" cases in your golden set so you can verify the model's recovery behavior.

```
two patterns

  app catches and re-routes        model decides
  ────────────────────────         ────────────────────
  - app picks the fallback         - tool_result is the error
  - opaque to the model            - model picks the fallback
  - hard to eval recovery          - eval includes failure cases
  - the app is the decider         - the model is the decider
```

**Q (arch):** Your tool registry has 50 tools. The model's picking accuracy drops because each tool's description has to compete for attention. What do you change?

A: Two moves. First, *tool routing* — a lightweight LLM call (or a heuristic over embeddings) picks the relevant 5-10 tools for the user's query, and only those tools are registered on the main call. The main model sees a much smaller registry where each tool's description gets full attention. Second, *tool grouping with namespacing* — tools that operate on the same domain get a single namespaced entry point with a `action` parameter (`{name: "users", input: {action: "getRecent", ...}}` instead of 5 separate `getRecentUsers`, `getActiveUsers`, etc.). Grouping cuts the registry size by 3-5x without losing capability. The third lever, when the registry is genuinely large and routing isn't enough, is *hierarchical agents*: a top-level agent picks a sub-agent based on intent, the sub-agent has a smaller registry. That's the orchestrator-workers pattern from Anthropic's "Building effective agents" essay.

```
the three levers, ordered by complexity

  1. Tool grouping       ◄── cheap, same model
     namespace + action

  2. Tool routing        ◄── pre-call routing step
     lightweight LLM picks subset

  3. Hierarchical        ◄── multi-level agent design
     orchestrator + workers
```

### The question candidates always dodge

**Q:** Why not just prompt-stuff all the data the model might need? Tool calling adds latency and complexity for what feels like a small win.

A: That argument breaks at the second integration. Prompt-stuffing scales linearly with the data set — fine for two integrations (recent-tags + calendar), painful at five, broken at ten. Three failure modes pile up: first, the prompt's token cost goes from 1KB to 20KB and the per-call bill multiplies; second, the model's recall on any specific piece of data drops as the prompt grows because attention gets diluted (lost-in-the-middle is well-documented at >10KB prompts even on long-context models); third, the eval shape gets worse because every test case now has to include the full pre-loaded context and you can't isolate which piece the model actually used. Tool calling inverts all three: prompt stays small, model only pulls what it actually needs, eval can test per-tool behavior. The "latency and complexity" argument is real but misnamed — the latency is "one extra round-trip when the tool runs" which is bounded; the complexity is "schema discipline at the model boundary" which pays for itself the first time someone adds an integration and doesn't have to rewrite the prompt template. The candidate who answers "prompt-stuff" is signaling they haven't shipped past two integrations; the right answer is "tool calling earns its place at the second integration and is non-negotiable by the fifth."

```
the breakpoint

  integration count       prompt-stuff          tool calling
  ─────────────────       ────────────          ──────────────
  1                       fine                  overkill
  2                       fine                  starts winning
  3-5                     painful               clear win
  5+                      broken                non-negotiable
```

### One-line anchors

- "Tool calling is RPC at the LLM boundary. The model emits a typed request; the app executes; the result goes back; the model decides next."
- "The description is the load-bearing field. The model decides which tool to call by reading descriptions, not signatures."
- "Tool result goes back to the model, not the user. The model gets to decide what to do with success or failure."
- "Prompt-stuff at 2 integrations. Tool-call at 5. Route or group at 50."
- "Anthropic's content-block shape is the cleanest implementation; tool_use and tool_result live alongside text as first-class."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw the tool-call cycle from memory. Label each step (app sends messages + tools → API returns tool_use → app executes → app sends tool_result → API returns final text). Annotate where `tool_use_id` threads the request to its result.

✓ Pass: the cycle drawn, all four message exchanges labeled, tool_use_id correlation noted
✗ Fail: re-read the primary diagram, wait 10 minutes, try again

### Level 2 — Explain it out loud

Explain tool calling to a colleague who has built one LLM-powered feature using prompt-stuffed context. No notes. Under 90 seconds.

Checkpoints — did you:
- Describe the schema (name, description, input_schema)?
- Walk the four-step cycle (tool_use → execute → tool_result → next decision)?
- Name the contrast with prompt-stuffing (small prompt + asks-as-needed vs. big prompt + everything-preloaded)?
- Reference the buildable target (`/ai/tool-calling`) as how you'd demonstrate the concept?

If you skipped any: you described the protocol, you didn't argue the choice.

### Level 3 — Apply it to a new scenario

A new chain lands in the planned reincodes AI surface: a "DSA concept explainer" that takes a user's question about an algorithm and answers it with grounded references to the visualizer pages, the data-structure implementations in `src/utils/data_structures/`, and the curriculum notes. Design the tool registry. What tools would you register? What does each tool's description say?

Write the registry as JSON. Then verify: are the descriptions specific enough that the model picks the right tool? Are any two descriptions ambiguous (the senior question)?

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff from the Tradeoffs section. Answer in writing: "If I were building `/ai/tool-calling` today with the same constraints, would I make the same single-conversation precompute call? Or would I precompute many conversations and let the reader pick? Why?"

Reference the actual code:
→ Point to `next.config.ts` L1-L17 for the static-export contract that bounds the data size
→ Identify what would shift if the visualizer ran live tool calls server-side (deploy target changes, API key landing point, cost ledger)

### Quick check — code reference test

Without opening any files, answer:
- What field does the model read to decide which tool to call?
- What field threads a tool_use block to its tool_result block?
- What `stop_reason` does the API return when the model wants to call a tool?

Then open Anthropic's docs and verify.

✓ Pass: `description`, `tool_use_id` / `id`, `tool_use`
✗ Fail on details: the protocol's three load-bearing fields are what matter; recover them.
