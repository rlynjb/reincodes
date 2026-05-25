# Agents vs chains — the architectural choice

**Industry name(s):** Chains vs agents, fixed pipeline vs agent loop, deterministic-orchestration vs LLM-orchestration
**Type:** Industry standard

> Chains are fixed pipelines where the engineer wires the steps; agents are loops where the LLM decides the next step. Picking wrong costs 5-10x in tokens and weeks in eval setup.

**See also:** → [02-tool-calling](02-tool-calling.md) · → [03-react-pattern](03-react-pattern.md) · → [05-agent-memory](05-agent-memory.md) · → [../00-overview.md](../00-overview.md) · → [../../study-prompt-engineering/05-eval-driven-iteration.md](../../study-prompt-engineering/05-eval-driven-iteration.md)

---

## Why care

### Move 1 — The grounded scenario

You've got a React form that takes a journal entry, extracts tags, classifies the entry as todo/question/vent, and writes a one-line summary. Three things to do, one user input. The first version is three sequential `fetch()` calls — `/api/tag` then `/api/classify` then `/api/summarize` — each one calling Claude with a tightly scoped prompt. It works. The PM says "great, can we make it figure out *which* operations to run? Some entries don't need tags. Some need a fourth thing — link suggestions — that doesn't exist yet but might next month." You start drafting a fourth `fetch()` call and then stop, because you realize the question being asked is no longer "run these three steps" — it's "let the model decide what to run."

### Move 2 — Name the question

That decision has a name — *chain vs agent*. Not the LLM model, not the prompt, not the tool set — just the question of *who decides the next step: the engineer at code-write time, or the LLM at run time*. A chain is the first version: the engineer wired three steps in sequence, every entry runs all three, the order is fixed in `chain.ts`. An agent is the second version: the engineer registers four tools and the LLM picks which ones to call in which order, deciding turn by turn whether it's done. Both shapes ship LLM-powered features. They have wildly different cost profiles, eval shapes, and failure modes.

### Move 3 — Why answering that question matters

**Why you need to answer that question at all:** because picking agent when chain would have done the job is the single most expensive mistake in LLM application architecture in 2026. Agents run an LLM call *per iteration of the loop*, and each iteration costs a full round-trip (full input prefix + reasoning tokens + tool-call tokens). A 3-step chain that takes 3 LLM calls becomes a 3-iteration agent that takes 6-10 LLM calls (the agent has to *decide* before each tool call, then execute, then *decide* again). The token bill rises 5-10x. The latency rises proportionally. The eval shape changes — you can no longer eval "does step 2's output look right?" because step 2 might not even run. You're stuck evaling the whole-trajectory output, which is harder to ground and slower to iterate. The reverse mistake — picking chain when the task is genuinely open-ended — costs flexibility: every new tool requires a new `fetch()` call, every conditional branch requires a code change.

### Move 4 — Concrete before/after

The journal-entry pipeline as a chain:

- Three `fetch()` calls in `processEntry.ts`, run sequentially
- Each call has its own prompt, schema, eval suite
- Every entry runs all three steps; no branching
- 3 LLM calls per entry, ~3000 input tokens total, ~$0.015 at Sonnet rates
- Adding a fourth step means adding a fourth `fetch()` call — code change, deploy

The same pipeline as an agent:

- One agent loop in `agentLoop.ts` with four registered tools
- Loop iterates: LLM emits `tool_use` → app executes → LLM gets `tool_result` → LLM decides next
- Some entries skip steps the model judges unnecessary
- 6-12 LLM calls per entry (decide + act + decide + act + ...), ~12,000 input tokens total, ~$0.06 at Sonnet rates
- Adding a fifth tool means registering a tool — no orchestration code change

### Move 5 — The one-line summary

A chain is a typed function that calls the LLM at each step in an order the engineer fixed; an agent is a `while (!done)` loop where the LLM picks the next call. The rest of the file is about when each shape earns its place.

---

## How it works

### Move 1 — The mental model

A chain is to an agent what `<form onSubmit={handle}>` is to `<form onSubmit={(e) => { while (more()) { dispatch(decideNext(e)) } }}>`. The chain is a finite, statically-typed pipeline — three steps, three signatures, the order baked into the code. The agent is a runtime loop where the next dispatch is decided by an LLM call against the current state. Both produce a final output. The chain's behavior is fully determined by the code; the agent's behavior is determined by the model's runtime decisions against the registered tool set.

```
chain (deterministic order)         agent (model decides order)
─────────────────────────────       ─────────────────────────────
        │                                   ┌────────────┐
        ▼                                   │  LLM call  │ ◄────┐
    ┌────────┐                              └─────┬──────┘      │
    │ step 1 │ ── LLM call                        │             │
    └───┬────┘                                    ▼             │
        ▼                                   ┌────────────┐      │
    ┌────────┐                              │  tool? or  │      │
    │ step 2 │ ── LLM call                  │  finalize? │      │
    └───┬────┘                              └─────┬──────┘      │
        ▼                                         │             │
    ┌────────┐                                 if tool          │
    │ step 3 │ ── LLM call                        │             │
    └───┬────┘                                    ▼             │
        ▼                                   ┌────────────┐      │
    output                                  │ tool exec  │──────┘
                                            └────────────┘   loop back
                                                  │
                                                if finalize
                                                  ▼
                                               output
```

### Move 2 — The layered walkthrough

#### Chains — the engineer fixes the order

A chain is N LLM calls wired into a sequence by code. Step 1's output becomes step 2's input. The wiring lives in a TypeScript file someone wrote and reviews diff against. If you've used `Promise.then().then().then()` or written a function that calls three other functions in order, you've written a chain — except each function happens to be `claude.messages.create(...)`. Concrete consequence: every step has its own prompt file, its own schema, its own eval suite. When step 2 regresses, you eval step 2 in isolation against its golden set. The engineer carries the orchestration; the LLM carries each individual transformation.

```
chains — three named, typed, separately-evaluable functions

  // chain.ts
  const tags     = await extractTags(entry)        // LLM call 1
  const label    = await classify(entry, tags)     // LLM call 2
  const summary  = await summarize(entry, label)   // LLM call 3
  return { tags, label, summary }

  // each function has:
  //   - its own prompt file
  //   - its own zod schema
  //   - its own golden eval set
  //   - its own diff history
```

#### Agents — the model picks the next move

An agent is a loop. Each iteration sends the conversation state to the LLM with a list of available tools. The LLM emits either a `tool_use` block (please call this tool) or a final message (I'm done). The app executes the tool, appends the result to the conversation, and runs the loop again. Termination conditions: model emits a "stop" signal, max iterations hit, or a confidence threshold passed. If you've used `setInterval` to poll until a condition is true, you've written something shaped like an agent loop — except the "condition" is "the LLM said I'm done" and the work inside the loop is "execute whatever the LLM just asked for." Concrete consequence: the engineer no longer carries the orchestration; the model does. The engineer carries the tool definitions, the system prompt that frames the task, and the termination guard. The eval shape is whole-trajectory rather than per-step.

```
agent loop — model holds the orchestration

  // agentLoop.ts
  const tools = [extractTagsTool, classifyTool, summarizeTool, linkTool]
  let messages = [systemPrompt, userMessage(entry)]
  let iters = 0
  while (iters++ < MAX_ITERS) {
    const reply = await claude.messages.create({ messages, tools })
    if (reply.stop_reason === "end_turn") return finalize(reply)
    if (reply.stop_reason === "tool_use") {
      const result = await executeTool(reply.tool_use)
      messages.push(reply, toolResult(result))
      continue
    }
  }
  throw new Error("max iterations exceeded")
```

#### The decision rule

The decision rule that maps a task to a shape is *structural*, not aesthetic. If the answer to "what's the next step?" is *always the same* given the input shape, you have a chain. If the answer to "what's the next step?" depends on what the previous step *returned* in a way the engineer can't enumerate at code-write time, you have an agent. Most tasks are chains in disguise: the engineer thinks they need flexibility, runs the eval, and discovers the agent picks the same three tools in the same order 95% of the time — paying 5x more tokens to do it.

```
the decision tree

  Is the order of steps always the same per input?
    │
    ├── YES ──→ Chain (engineer wires the order in code)
    │           - cheaper (1 LLM call per step)
    │           - per-step evals
    │           - new step = code change
    │
    └── NO  ──→ Is the model good enough at picking?
                  │
                  ├── YES ──→ Agent (LLM decides the order)
                  │           - 5–10x more tokens
                  │           - trajectory evals
                  │           - new tool = registry change
                  │
                  └── NO  ──→ Chain with branching
                              (engineer wires the branches)
```

### Move 3 — The principle

The principle is *deterministic-by-default*. A chain is the cheaper, more debuggable, more eval-friendly shape; reach for an agent only when the task genuinely cannot be expressed as a fixed graph of steps. Anthropic's own "Building effective agents" essay (2024) makes this argument explicitly — "find the simplest solution possible, and only increase complexity when needed." The strong default is *chain*; the agent earns its place by demonstrating that the task's branching factor is too high to wire by hand. In reincodes' planned `/ai/agents-vs-chains` visualizer, the demo is a 3-step task run *both* ways so the reader can watch the same output emerge from a 3-call chain and a 6-call agent, with the token bill side by side.

The full picture is below.

---

## Agents vs chains — diagram

```
┌─ Chain shape (typed pipeline) ──────────────────────────────────────┐
│                                                                     │
│   entry ──► [extractTags]  ──► tags                                 │
│                  │                                                  │
│                  ▼                                                  │
│             [classify]     ──► label                                │
│                  │                                                  │
│                  ▼                                                  │
│             [summarize]    ──► summary                              │
│                                                                     │
│   3 LLM calls · per-step eval · order fixed in code                 │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─ Agent shape (LLM-orchestrated loop) ───────────────────────────────┐
│                                                                     │
│        ┌────────────────────────────────────────────────┐          │
│        │  conversation state (messages array)           │          │
│        └────────────────────┬───────────────────────────┘          │
│                             │                                       │
│                             ▼                                       │
│                    ┌──────────────────┐                            │
│                    │   LLM iteration  │                            │
│                    │   (decide next)  │                            │
│                    └────────┬─────────┘                            │
│                             │                                       │
│              ┌──────────────┴──────────────┐                        │
│              │                             │                        │
│        tool_use                       end_turn                      │
│              │                             │                        │
│              ▼                             ▼                        │
│      ┌──────────────┐                ┌──────────┐                  │
│      │ exec tool +  │                │ finalize │                  │
│      │ append result│                │ + return │                  │
│      └──────┬───────┘                └──────────┘                  │
│             │                                                       │
│             └──── loop back to LLM iteration                        │
│                                                                     │
│   6–12 LLM calls · trajectory eval · order decided at runtime       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

The chain's cost is *N LLM calls* where N is the number of steps. The agent's cost is *N + K LLM calls* where N is the number of tool executions and K is the number of decision rounds — and in practice K ≈ N because the model decides before each tool call, so the cost roughly doubles before you account for prefix-token growth across the conversation.

---

## In this codebase

**Not yet implemented.** reincodes has no LLM calls anywhere — no chains, no agents, no agent loop, no tool registry. The closest analog in the current codebase is the deterministic-orchestration shape itself: `src/utils/data_structures/Graph2.ts`'s `breadth_first_search` walks a queue of states with a fixed `dequeue → expand → enqueue` rhythm, which is the same *shape* as a chain — the engineer (here, the algorithm author) fixed the order, and the loop just executes. The agent shape has no analog in the current code.

The buildable target for this concept is below in Project exercises — a `/ai/agents-vs-chains` page that renders the same task implemented both ways side by side, with the precomputed token bill for each path, so the reader can see the cost gradient with their own eyes.

**Expected file paths** (when built):
- `src/app/ai/agents-vs-chains/page.tsx` — the visualizer
- `src/components/AgentsVsChainsVisualizer/` — chain renderer, agent renderer, cost panel
- `public/ai/agents-vs-chains/runs.json` — precomputed traces (both shapes, 3-5 example inputs)
- `scripts/precompute-agents-vs-chains.ts` — build-time script that runs both shapes against Claude and captures the full trace + token counts

---

## Elaborate

### Where this distinction comes from

The chain/agent split landed as a discipline in 2023-2024, when teams started shipping the first wave of LLM-powered features and discovered that "let the model decide" was much more expensive than the demos suggested. LangChain's early framing — "chains for deterministic flows, agents for open-ended tasks" — was the first widely-adopted vocabulary, though the actual reference implementations leaned heavily on agents because that's what made for impressive demos. The correction came in Anthropic's "Building effective agents" essay (December 2024), which named the failure mode explicitly: most production AI features that called themselves agents were actually chains with a more expensive orchestrator on top, and the right move was to start with the chain shape and only add agent loops when the chain genuinely couldn't capture the task.

### The deeper principle

The deeper principle is the same one that distinguishes *static dispatch* from *dynamic dispatch* in language design. A chain is a statically-dispatched call graph — the engineer fixes the names at compile time, the runtime just executes. An agent is dynamic dispatch — the names are resolved at runtime by the LLM acting as a vtable. Dynamic dispatch is more flexible and slower; static dispatch is faster and less flexible. The history of programming languages is one long argument about when each one earns its place; the same argument is now being held inside the LLM-application community, with the same answers (static is the default, dynamic is the escape hatch when the static shape can't express the problem).

### Where this breaks down

The chain/agent split breaks down in three places. First, *human-in-the-loop* workflows that branch on user confirmation — those have a fixed structure (ask, wait, branch) but the branching factor is small enough that the chain shape with explicit branches still wins; they're not really agents. Second, *long-running planning* where the model has to decide not just the next step but the *plan* for several steps ahead — those need a planner-executor split that's a different architecture from the simple agent loop (see Anthropic's "orchestrator-workers" pattern in the same essay). Third, *multi-agent* systems where multiple LLM-driven agents coordinate — those are not single agents and have an entirely different cost profile (agent count × call count × prefix tokens per call).

### What to explore next

- [02-tool-calling](02-tool-calling.md) → the mechanics of how tools get registered and invoked, which both chains and agents lean on
- [03-react-pattern](03-react-pattern.md) → the specific agent shape (Thought → Action → Observation) that became the default
- [05-agent-memory](05-agent-memory.md) → the context-management problem that hits agents harder than chains because conversation grows turn by turn
- [../../study-prompt-engineering/05-eval-driven-iteration.md](../../study-prompt-engineering/05-eval-driven-iteration.md) → eval discipline for both shapes; agents need trajectory evals which are an order of magnitude harder to build than per-step evals

---

## Tradeoffs

### Comparison table — both costs in one frame

```
┌───────────────────┬──────────────────────┬──────────────────────────┐
│ Cost dimension    │ Chain                │ Agent                    │
├───────────────────┼──────────────────────┼──────────────────────────┤
│ Token bill        │ N LLM calls          │ 2N–3N LLM calls          │
│                   │ (1 per step)         │ (decide + execute each)  │
│ Latency           │ N serial round-trips │ 2N–3N serial round-trips │
│ Eval shape        │ Per-step golden set  │ Whole-trajectory eval    │
│ Debugging         │ Bisect by step       │ Replay the full trace    │
│ Adding a step     │ Code change          │ Tool registry change     │
│ Removing a step   │ Code change          │ Tool registry change     │
│ Branching         │ Explicit if/else     │ Implicit in LLM decision │
│ Flexibility       │ Low (order fixed)    │ High (order picked)      │
│ Predictability    │ High (same input →   │ Low (model may pick      │
│                   │ same calls)          │ different tools)         │
│ Cost ceiling      │ Bounded by step ct.  │ Bounded by max iters     │
│ Failure mode      │ One step fails       │ Loop fails to terminate  │
└───────────────────┴──────────────────────┴──────────────────────────┘
```

### What we'd give up (when planning the visualizer)

The first cost is *precompute complexity*. To make the visualizer honest, both runs have to actually happen against Claude — the chain version takes ~3 calls per example input, the agent version takes ~6-12 calls, and the agent's call count varies per input because the model picks differently each run. The precompute script has to run both shapes against 3-5 example inputs, capture *every* intermediate message (not just the final output), and serialize them as JSON with per-call token counts. That's ~half a day of script writing and ~$5 of API spend per full rebuild, which lands in `scripts/precompute-agents-vs-chains.ts`.

The second cost is *bundle weight on the route*. A useful visualizer wants the full trace JSON for both shapes plus the renderer code — realistic budget is 30-60KB on the `/ai/agents-vs-chains` route. Code-splitting under `/ai/` keeps it out of the home page bundle, but the route itself pays. The token-bill panel can be computed at render time from the trace JSON, which saves a few KB but adds renderer logic.

The third cost is *interpretive honesty*. The visualizer has to *not* lie about agents being categorically worse. Picking the example inputs is the load-bearing call: too simple and the chain wins by every metric and the page becomes anti-agent propaganda; too branchy and the agent looks essential and the page underweights the cost. The right shape is 3 examples — one where the chain is obviously right (every step always runs), one where the agent is obviously right (the steps genuinely vary by input), and one where it's a judgment call so the reader can form their own opinion.

### What the alternative would have cost (skipping the visualizer)

If reincodes never builds `/ai/agents-vs-chains`, the cost is *zero* in the codebase. The chain/agent split lives in the curriculum's Phase 4 framing (`[C4.9]` "when *not* to use an agent" is a learn-only concept anchored to loopd's classifier and contrl-mo's coaching agent). The argument gets made in interviews verbally, against the loopd codebase, not visually.

The cost of *not* building it shows up in interview rounds where the candidate is asked "show me you understand when an agent earns its place." Without the visualizer, the answer is "here's loopd's chain pattern, here's where I'd reach for an agent (Path B classifier upgrade, currently in backlog), and here's the cost ledger I'd justify it against." That's a reasonable answer but it's hand-wavy compared to "here's a visualizer that runs the same task both ways and shows you the bill."

### The breakpoint

The visualizer earns its place when the candidate is interviewing for a role where the architectural choice is the load-bearing signal — i.e. roles that involve picking, defending, or refactoring agent vs chain architectures at the team level. For an entry-level LLM eng role, "I know the difference" suffices. For a staff+ role where you're expected to push back on a teammate's proposal to build an agent for a task that could be a chain, the visualizer is the artifact that lets you point and say "here's what I'd run them through before we wire it." That's a narrow target.

### What wasn't actually a tradeoff

Showing the agent shape *only* would not have been a real option, even though "agent demos" are visually flashier. The pedagogical move is the *contrast*. Showing one shape teaches the shape; showing two side-by-side teaches the decision. The eval-discipline angle (trajectory evals are harder than per-step evals) is only legible when both shapes are visible, because the chain's per-step evals are what the agent gives up.

---

## Tech reference (industry pairing)

### Anthropic tool-use API

- **Codebase uses:** not yet — the planned `/ai/agents-vs-chains` visualizer would use Claude's tool-use API as the precompute target. The chain version registers no tools (just sequential `messages.create` calls); the agent version registers all four tools and runs the loop until `stop_reason === "end_turn"`.
- **Why it's here:** Anthropic's tool-use shape (top-level `tools` parameter, `tool_use` and `tool_result` content blocks, explicit `stop_reason` field) is the cleanest implementation of the agent-loop primitive across providers. The visualizer leans on `stop_reason` to decide when the loop terminates.
- **Leading today:** Anthropic Messages API tool use — `adoption-leading` for the modern agent-loop primitive, 2026.
- **Why it leads:** structured `tool_use` / `tool_result` content blocks (vs OpenAI's older function_call format), explicit `stop_reason` enum, and prompt-caching that's well-defined across multi-turn agent conversations (cache the system + tool definitions on every call).
- **Runner-up:** OpenAI function-calling / tool-calling — `adoption-leading` in raw deployment volume but with a less explicit stop-reason model; older code uses `function_call`, newer code uses `tools` array.

### LangChain LCEL (LangChain Expression Language)

- **Codebase uses:** not yet — would not be the primary target. LangChain is mentioned because it's the canonical chain-orchestration library and the visualizer's "chain" shape is essentially a hand-rolled LCEL pipeline.
- **Why it's here:** LCEL is the most widely-used chain-composition DSL in the field; understanding its `chain1 | chain2 | chain3` syntax is how most engineers learned the chain shape. The visualizer's chain implementation in TypeScript is the equivalent pattern in vanilla `async/await`.
- **Leading today:** LangChain LCEL — `adoption-leading` for chain composition in Python, 2024-2026.
- **Why it leads:** Runnable interface gives every chain step the same shape (invoke, batch, stream, ainvoke), composability operators (`|` for sequence, `RunnableParallel` for fan-out), built-in tracing through LangSmith.
- **Runner-up:** vanilla `async/await` in TypeScript — `adoption-leading` for portfolio-scale projects where the framework is overkill. reincodes' planned target uses this shape because there's no Python and no need for the framework's surface area.

### LangGraph

- **Codebase uses:** not yet — would be the conceptual reference for the agent-loop shape if the visualizer ever expands to show the graph-as-state-machine framing. Not needed for the current scope.
- **Why it's here:** LangGraph is the current state of the art for *structured* agent loops — agents as explicit graphs of nodes (LLM calls, tool calls, decision points) rather than ad-hoc `while` loops. The framework's framing helps name the parts of a custom agent loop even when you're not using the framework.
- **Leading today:** LangGraph — `innovation-leading` for graph-structured agents, 2025-2026.
- **Why it leads:** explicit state schema (typed state object passed between nodes), conditional edges (the LLM picks the next edge based on state), built-in checkpointing for long-running agents, and the framework's stance that "an agent is a graph, not a loop" sharpens the architectural framing.
- **Runner-up:** OpenAI Swarm / Assistants API — `innovation-leading` for vendor-managed agent state; runs the loop on the provider's side, which is convenient but cedes control over the orchestration.

---

## Project exercises

### [B-reincodes-agents-vs-chains-viz] Build the agents-vs-chains visualizer

- **Exercise ID:** `[B-reincodes-agents-vs-chains-viz]` — derived from the curriculum's reincodes "interview prep surface" entry and Phase 4 concept `[C4.9]` (when *not* to use an agent); also reinforces `[C1.10]` (single-purpose chains vs agent loops).
- **What to build:** a page at `/ai/agents-vs-chains` that runs the same 3-step task (extract tags → classify → summarize on a journal-entry input) as both a chain and an agent, rendered side-by-side. Left panel: 3 sequential boxes for the chain's three LLM calls, each expandable to show prompt + response + tokens. Right panel: the agent's iteration timeline (decide → execute → decide → execute → ... → finalize), each expandable. A cost panel at the bottom shows total tokens, total cost (Sonnet pricing), and total latency per shape. The reader picks one of 3 precomputed example inputs from a selector; the panels update against the corresponding precomputed JSON.
- **Why it earns its place:** the visualizer makes the cost gradient operable. The reader doesn't just read "agents cost 5-10x more" — they pick an input, watch both shapes execute, see the agent's token bill at 4-7x the chain's, and form their own intuition. The interview signal is that the candidate built a tool that teaches the architectural decision rather than just understanding it themselves.
- **Files to touch:** `src/app/ai/agents-vs-chains/page.tsx` (visualizer page), `src/components/AgentsVsChainsVisualizer/` (chain panel, agent panel, cost panel, input selector), `public/ai/agents-vs-chains/runs.json` (precomputed traces — 3 example inputs × 2 shapes = 6 traces, each with full message history + token counts), `scripts/precompute-agents-vs-chains.ts` (build-time script that calls Claude for both shapes, validates the chain's per-step schemas with Zod, captures the agent's full message history, writes the JSON). Add a row to `CONCEPT_CATEGORIES` in `src/components/Home/conceptsData.tsx` under a new `ai-engineering` category so the page is reachable from the home grid.
- **Done when:** the page loads at `/reincodes/ai/agents-vs-chains/` in production (GitHub Pages), 3 example inputs each render both shapes against the precomputed JSON without a network call, the cost panel reflects real token counts from the precompute step, `next build` passes under `output: "export"`. Build script runs successfully against Anthropic API locally.
- **Estimated effort:** 1.5-2 days. Precompute script (both shapes + token capture + JSON shape): 1 day. Page + side-by-side rendering + cost panel: half day. Polish (the example-input selector, the per-step expand interactions): half day.

---

## Summary

### Part 1 — concept recap

Chains and agents are two architectural shapes for LLM application code, distinguished by *who decides the next step*. A chain is a fixed pipeline — the engineer wires the steps at code-write time, each step is its own LLM call with its own prompt and eval suite, and every input runs the same sequence. An agent is a loop — the engineer registers tools, the LLM decides which tool to call next given the current conversation state, and the loop continues until the model signals it's done or a max-iteration guard fires. The cost gradient is steep: agents typically run 5-10x more tokens than equivalent chains because the model has to *decide* before each tool call, doubling the LLM call count and inflating the prefix token cost as the conversation grows. The decision rule is structural — if the order of steps is always the same per input, you have a chain; if it genuinely varies, you have an agent. In this codebase the concept is Case B (no LLM calls in reincodes today); the buildable target is a `/ai/agents-vs-chains` page that runs the same task both ways against precomputed traces and surfaces the cost ledger side by side.

### Part 2 — key points to remember

- **The shape**: chain = engineer-wired sequence (typed pipeline); agent = LLM-orchestrated loop (`while not done`). Same task can be either; the choice is architectural.
- **The cost**: agents cost 2-3x in calls (decide + execute per iteration) and more in prefix tokens (conversation grows). 5-10x total bill in practice.
- **The decision rule**: same order every input → chain. Genuinely-variable order → agent. Most "agent" tasks are actually chains in disguise.
- **The default**: Anthropic's "Building effective agents" is explicit — start with chains, reach for agents only when the chain genuinely can't capture the branching.
- **The reincodes shape**: Case B. The visualizer renders both shapes against precomputed traces with token counts side by side, so the reader can form their own intuition.

---

## Interview defense

### What an interviewer is really asking

Behind "when would you use an agent vs a chain?" the interviewer is testing whether the candidate has shipped enough LLM-powered features to have *paid the agent tax*. A junior answer describes the difference as a definitional distinction ("agents have loops, chains don't"). A senior answer names the cost gradient ("I shipped an agent for a 3-step task in 2024 and the bill came in 7x what the equivalent chain would have cost; I refactored it back to a chain with two explicit branches and got 90% of the flexibility at 15% of the cost"). The interviewer is checking whether the candidate distinguishes *the demo shape* (agents are flashier, easier to pitch) from *the production shape* (chains pay rent on most tasks).

### Likely questions

**Q (mid):** What's the difference between a chain and an agent?

A: A chain is a fixed pipeline where the engineer wires the order of LLM calls in code — every input runs the same sequence of N calls, each call has its own prompt and schema, and the chain is the engineer's orchestration layer. An agent is a loop where the LLM picks the next call at runtime — the engineer registers a set of tools, the model emits a `tool_use` block each iteration, and the loop continues until the model signals it's done or a max-iteration guard fires. The defining question is *who decides the order*: engineer at code-write time (chain) or LLM at runtime (agent).

```
chain                          agent
─────────────────              ─────────────────
engineer wires order  ◄────►   model picks order
N calls per input              2N–3N calls per input
per-step eval                  trajectory eval
new step = code change         new tool = registry change
```

**Q (senior):** I have a task that needs to extract tags, classify, and summarize. Should I build it as a chain or an agent?

A: Chain. The order is the same on every input — you always tag, classify, summarize. There's no decision the model needs to make at runtime that the engineer can't make at code-write time. Building it as an agent would cost 5-10x more in tokens (the model has to decide before each tool call), would make the eval shape harder (trajectory eval instead of per-step), and would add no flexibility you couldn't capture with an explicit `if (entryType === "todo") { ... }` branch in the chain. The agent shape earns its place when the *order* genuinely varies per input — e.g. some entries need link suggestions and others don't, and the model has to read the entry to know. Even then, the cheaper move is often a chain with an explicit early gate ("does this entry need link suggestions? → tool call → branch") rather than a full agent loop.

```
should-it-be-an-agent flowchart

  task arrives
       │
       ▼
  ┌─────────────────────────────────────┐
  │ Is the sequence of steps the same   │
  │ for every input?                    │
  └─────────────────┬───────────────────┘
                    │
            ┌───────┴────────┐
           YES              NO
            │                │
            ▼                ▼
       chain          ┌─────────────────────────┐
                      │ Can the branching be    │
                      │ captured in <=3 if/else │
                      │ branches?               │
                      └─────────┬───────────────┘
                                │
                        ┌───────┴────────┐
                       YES              NO
                        │                │
                        ▼                ▼
                chain w/ branches    agent
```

**Q (arch):** Walk me through how the cost grows for an agent vs a chain as the conversation gets longer.

A: The chain's cost grows linearly in the number of steps because each step is a fresh LLM call with bounded input. Step 1's input is the user message; step 2's input is the user message + step 1's output; step 3's input is step 2's output. The input grows but stays bounded by the chain's depth, and each call's input prefix can be prompt-cached. The agent's cost grows *quadratically* in the number of iterations because every iteration sends the *entire* conversation history (all previous tool calls and results) as the input prefix. Iteration 1's input is short; iteration 10's input is the full transcript. If the agent runs 10 iterations on a task that would have been 3 chain steps, the total input-token cost is roughly the sum of 1+2+3+...+10 token-blocks instead of 1+1+1, plus output tokens, plus the decision cost on each iteration. Prompt caching mitigates the prefix repetition but only against the *stable* portion of the prefix; the per-iteration tool-result additions break the cache for new prefix material on each turn. The practical consequence: a 3-step chain that costs $0.015 per entry becomes a 6-10 iteration agent that costs $0.08-0.15 per entry, even though the user-visible work is the same.

```
cost-growth shape

  chain                          agent
  ──────────────                 ──────────────
  step 1: ▓                      iter 1: ▓
  step 2: ▓▓                     iter 2: ▓▓▓
  step 3: ▓▓                     iter 3: ▓▓▓▓▓
                                 iter 4: ▓▓▓▓▓▓▓
                                 iter 5: ▓▓▓▓▓▓▓▓▓
  total:  ▓▓▓▓▓                  iter 6: ▓▓▓▓▓▓▓▓▓▓▓

  (linear in step count)         (quadratic in iter count
                                  because prefix grows)
```

### The question candidates always dodge

**Q:** Agents are the future though, right? Why would I bother learning chains if everything's moving toward agentic AI?

A: That argument is wrong in a way that matters in production. The marketing case for agents — "the model figures out what to do, you just describe the goal" — collapses against the reality of token bills, eval discipline, and debuggability. The places where agents are unambiguously the right shape are *open-ended tasks where the engineer genuinely can't enumerate the steps*: coding assistants exploring an unfamiliar codebase, research agents synthesizing across many sources, customer support agents triaging across a long tool tree. The places where agents are the *wrong* shape are *anywhere the work is bounded and structured*: extraction pipelines, classification chains, scoring tasks, document processing. The honest framing is that *agents and chains are both load-bearing in 2026*, and the working AI engineer is the person who can distinguish them in five seconds by asking "does the order genuinely vary per input?" The candidate who answers "agents are the future" is signaling that they've only read the marketing and haven't paid the agent tax — which an experienced interviewer will spot in two follow-up questions about token cost.

```
the honest mapping

  open-ended, exploratory       bounded, structured
  ──────────────────────────    ───────────────────────
  coding assistant              extraction pipeline
  research synthesis            classification chain
  customer triage tree          scoring task
  computer-use agent            document processing
  ▼                             ▼
  agent earns its place         chain wins
```

### One-line anchors

- "A chain is engineer-wired; an agent is LLM-orchestrated. The question is who picks the next call."
- "Agents cost 5-10x more than equivalent chains. Pick agent only when the chain genuinely can't capture the task."
- "If the same input runs the same sequence of steps every time, it's a chain — even if you called it an agent."
- "Anthropic's 'Building effective agents' has one thesis: start with the simplest solution, increase complexity only when needed."
- "The reincodes visualizer renders both shapes side-by-side against precomputed traces; the cost panel is the load-bearing element."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw the side-by-side chain-vs-agent diagram from memory. Label each LLM call in the chain (one per step) and each LLM iteration in the agent (decide → execute → decide → execute → finalize). Annotate the cost gradient (chain = N calls, agent = 2N-3N calls).

✓ Pass: both shapes drawn, LLM-call count labeled per shape, cost gradient noted
✗ Fail: re-read the primary diagram, wait 10 minutes, try again

### Level 2 — Explain it out loud

Explain the chain/agent distinction to a colleague who has built one LLM-powered feature and is considering "making it agentic." No notes. Under 90 seconds.

Checkpoints — did you:
- Name *who decides the next call* as the defining axis?
- State the cost gradient (5-10x)?
- Give the decision rule (same order every input → chain; genuinely varies → agent)?
- Reference the buildable target (`/ai/agents-vs-chains`) as how you'd demonstrate the concept in reincodes?

If you skipped any: you described the shapes, you didn't argue the decision.

### Level 3 — Apply it to a new scenario

A new feature lands in the planned reincodes AI surface: a "recommend the next visualizer to view" feature that takes the user's recent page views and emits a recommended `/sorting`, `/trees`, `/graphs`, or `/recursions` path. Should it be a chain or an agent? Justify the answer. If it's a chain, name the steps. If it's an agent, name the tools.

Write your answer (3-5 sentences). Then verify against the decision rule: does the *order* of steps genuinely vary per input, or does every input run the same sequence?

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff from the Tradeoffs section. Answer in writing: "If I were building the `/ai/agents-vs-chains` visualizer today with the same constraints (static export, no live LLM, GH Pages deploy), would I make the same precompute-both-shapes call? Why or why not? If I'd change it, what would I do instead?"

Reference the actual code:
→ Point to `next.config.ts` L1-L17 for the static-export contract
→ Identify what would shift if the precompute step moved server-side (deploy target changes, API key management appears, cost ledger lands on a monthly bill)

### Quick check — code reference test

Without opening any files, answer:
- What file in reincodes controls the static-export contract that constrains how the visualizer ships?
- What category would the visualizer's row need to be added under in `conceptsData.tsx`?
- What pattern in the existing `src/utils/data_structures/` codebase is *shaped like* a chain (deterministic step-through with no LLM)?

Then open the files and verify.

✓ Pass: `next.config.ts`, new `ai-engineering` category in `CONCEPT_CATEGORIES`, `breadth_first_search` in `Graph2.ts`
✗ Fail on details: the file names and the shape-mapping are what matter; recover them.
