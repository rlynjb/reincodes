# Agents and tool use

**Industry name(s):** Agent loop, ReAct (Reasoning + Acting), tool calling, function calling.
**Type:** Industry standard · Language-agnostic

> A loop where the model emits structured `{ type: "tool", name, args }` responses, your code dispatches them, the result feeds back in, and the loop continues until a termination condition. Distinct from a single-purpose chain; defensible as a pattern only when you can name *why* a loop is needed.

**See also:** → `03-rag-pattern.md` · → `05-ai-features-in-this-app.md`

---

## Why care

You've written a discriminated-union response handler for a backend API: the server sends back `{ type: "user", data: ... }` or `{ type: "error", code: ... }` or `{ type: "redirect", url: ... }`, and your client `switch`es on `type` to decide what to do. That same pattern — typed response, switch on a discriminant, take an action, possibly issue another request — is the entire shape of an agent loop. The model is the server; your code is the client; the discriminated union is the tool-call schema.

A *chain* is a one-shot request: input → model → output → done. A *loop* is the same call wrapped in a `while`: input → model → if the response is a `tool_call`, execute the tool, feed the result back, call the model again, repeat until the response is `done`. The frontend instinct here is correct: it's `useEffect` with a request, except the request comes back asking you to fetch more things and the model decides when to stop.

The pattern is straightforward; the failure mode is not. Loops without termination conditions run forever. Loops that route through an LLM at every turn pay $0.01–0.10 per turn and can rack up real money. Loops with no observability are unfixable when they go wrong, because the bug is "the model decided to do X" and you have no replay. Agents are the most overused and worst-defended pattern in 2026 AI engineering — most "agents" are single-purpose chains in a trench coat, and many real agent use cases would be better served by a chain plus a heuristic. The reason this file matters is that *knowing when not to use an agent* is half the signal.

**Why you need to answer that question at all:** because "use an agent" is the default suggestion in every AI engineering pitch deck, and most of them are wrong. The senior interview answer separates candidates who reach for the agent abstraction reflexively from candidates who can name three project-specific reasons a loop is justified and four where it isn't.

Without the loop framing:
- "Agentic" sounds like a feature, not a pattern, and "we'll just add an agent" becomes the default plan.
- Termination conditions are an afterthought; the first production incident is an infinite loop.
- Observability is bolted on; debugging requires asking the model to apologize for choices you can't reconstruct.

With the loop framing:
- An agent is a `while` around a typed-response handler. Same primitives as any state machine.
- Termination is a first-class field of the spec, alongside the prompt and the tool set.
- Each turn is a log entry; replay is the debugger.

A tool call is a typed response with side effects. An agent is the `while` around the handler. Everything else is naming.

---

## How it works

The loop has four parts: a tool registry (the actions the model is allowed to take), a prompt that names the tools and the task, the loop itself (model → dispatch → result → model), and termination conditions.

```
                  ┌──────────────────────────────────────┐
                  │ Tool registry (typed schemas)         │
                  │  retrieve_similar(query: string)      │
                  │  get_user_history(user_id: string)    │
                  │  finalize(answer: string)             │
                  └──────────────────────────────────────┘
                                    │
                                    ▼
  Task description                                       
  + tool schemas                                         
       │                                                 
       ▼                                                 
  ┌─────────────────────┐                                
  │ Model call          │ ────▶  Thought + tool call    
  │ (round 1)           │        e.g. { type: "tool",   
  └──────────┬──────────┘             name: "retrieve", 
             │                        args: { ... } }   
             │                                          
             ▼                                          
  ┌─────────────────────┐                                
  │ Dispatcher          │ ────▶  retrieve_similar(...)  
  │ (your code)         │        runs in your runtime,  
  │                     │        returns observation    
  └──────────┬──────────┘                                
             │                                          
             ▼                                          
  ┌─────────────────────┐                                
  │ Append to context:  │                                
  │  [thought, action,  │                                
  │   observation]      │                                
  └──────────┬──────────┘                                
             │                                          
             ▼                                          
  ┌─────────────────────┐                                
  │ Model call          │ ────▶  next thought + next   
  │ (round 2)           │        tool call OR final     
  └──────────┬──────────┘        answer (terminate)     
             │                                          
             ▼                                          
       Termination check:                                
       - { type: "finalize" }?  → return answer         
       - max iterations hit?    → return partial / error
       - confidence ≥ threshold? → return current state 
```

The ReAct paper formalized the "thought → action → observation" three-step per turn — explicitly asking the model to reason about what it's doing before each tool call. That extra reasoning step makes the loop debuggable (the model's thoughts are logged) and reduces some failure modes (the model can talk itself out of a bad call).

Three properties that matter:

1. **Tool calling is a discriminated-union response, not a special model feature.** Most providers expose it as native JSON-mode output ("here's a schema, return only valid JSON matching this schema"). You can build the same pattern by parsing freeform text with a regex; native tool calling is just better at staying inside the schema.

2. **The model is the router.** At each turn, the model picks which tool to call from the registry. This is the load-bearing decision — and the failure mode. If the model picks the wrong tool, the loop diverges. The mitigation is either heuristic routing (you decide the tool from the input, not the model) or constrained tool sets (only one tool is available at each stage).

3. **Termination must be explicit.** A `while (true)` loop bounded only by "the model said it's done" is a recipe for infinite loops. Real production agents have a `max_iterations` cap, a confidence-threshold short-circuit, a wall-clock timeout, *and* the model's explicit `finalize` signal — any of them ends the loop.

The agent-vs-chain distinction is the curriculum's `C1.10` — and the visualizer needs to make legible *when each fits*:

- **Single-purpose chain** — fixed sequence of LLM calls, no LLM-driven branching. Predictable, cheap, debuggable. The right call when the task has a known shape.
- **Agent loop** — LLM-driven tool calls and branching. Powerful but expensive and harder to debug. The right call when the task has *no known fixed shape* — when the next step genuinely depends on the result of the previous step in ways you can't enumerate up front.

---

## Agent loop — diagram

```
                  ReAct loop — one turn at a time
                  ────────────────────────────────

  Initial prompt: "Classify this todo. Use retrieve_similar
                   if you're below 0.7 confidence."

  ┌─ Turn 1 ─────────────────────────────────────────────────┐
  │                                                          │
  │  Thought:  "This todo mentions 'auth refactor' — I       │
  │             could classify as 'engineering' but I want   │
  │             to check similar past todos first."          │
  │                                                          │
  │  Action:   retrieve_similar(query="auth refactor")       │
  │                                                          │
  │  Observation: [3 past todos, all classified as           │
  │                "engineering"]                            │
  │                                                          │
  └──────────────────────┬───────────────────────────────────┘
                         │
                         ▼
  ┌─ Turn 2 ─────────────────────────────────────────────────┐
  │                                                          │
  │  Thought:  "Three similar past todos all 'engineering'.  │
  │             Confidence high enough to finalize."         │
  │                                                          │
  │  Action:   finalize(label="engineering", conf=0.95)      │
  │                                                          │
  └──────────────────────┬───────────────────────────────────┘
                         │
                         ▼
                    Termination
                    (finalize() called)


  Costs: 2 model calls (~$0.02) + 1 retrieval (~$0.00).
  Without the agent: 1 call (~$0.01), no retrieval signal.
  Worth it iff the agent's extra retrieval improves accuracy
  enough on the long tail to justify ~2x cost per call.
```

The thought/action/observation triple is the ReAct pattern. The two-iteration shape is typical: most real agent tasks finalize in 1–3 turns. The 10-turn-plus shapes are usually a sign that either the tools are wrong or the task should have been a chain.

---

## In this codebase

**Not yet implemented.** Deferred — reincodes is the interview-prep visualizer host per the curriculum; no AI viz built yet. The curriculum's Phase 4 is anchored in loopd / contrl-mo / aipe (depending on path chosen), not in reincodes. The reincodes role for agents is the same as for tokenization, embeddings, and RAG: ship a visualizer that animates the loop's structure against a fixed example, with editable prompts so the reader can poke at the inputs.

The page slot is `/ai/agent-loop` under the existing App Router, with the tile added to `CONCEPT_CATEGORIES` in `src/components/Home/conceptsData.tsx` under the proposed `"ai-engineering"` category. The visualizer parallels the existing `CallstackVisualizer` (`src/components/CallstackVisualizer/`) — that component already animates a stack of frames pushed and popped, which is structurally the same shape as an agent loop with thought/action/observation frames.

---

## Elaborate

### Where this pattern comes from

The ReAct paper (Yao et al., 2022, "ReAct: Synergizing Reasoning and Acting in Language Models") introduced the explicit thought/action/observation triple. The "tool calling" interface (OpenAI's function calling, Anthropic's tool use) emerged in 2023 as the productized version: rather than parsing freeform model output to identify tool calls, the model emits structured JSON matching a provided schema. The loop pattern itself is older — it generalizes from earlier work on neuro-symbolic systems and inference-time planning — but the LLM-driven version is what shipped at scale.

### The deeper principle

LLM-as-router for state machines whose transitions can't be enumerated. A traditional state machine has a fixed transition table: state X + event Y → state Z. An agent loop has a *learned* transition function: state X + tool-call result Y → state Z (decided by the model). The principle is the same — bounded states, defined transitions — but the transition table is replaced by an LLM call. The cost is determinism and predictability; the benefit is handling tasks whose state graphs are too large or too open-ended to enumerate.

```
┌──────────────────────────────────────────────────────────┐
│  Traditional state machine                               │
│                                                          │
│   state  ──── event ─────▶ state' (lookup in table)      │
│   deterministic. ~µs latency. ~0 cost. predictable.      │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  Agent loop (LLM-routed)                                 │
│                                                          │
│   state  ── observation ──▶ state' (decided by LLM call) │
│   non-deterministic. ~1s latency. $0.01 per transition.  │
│   handles state spaces too open-ended to enumerate.      │
└──────────────────────────────────────────────────────────┘
```

### Where this breaks down

When the task *can* be enumerated. A chain with three or four explicit steps is faster, cheaper, more reliable, and easier to debug than an agent loop with the same steps. The "use an agent" reflex breaks down when applied to tasks that already have a known sequence — you've added latency and cost for no decision-making the LLM needed to do. Also breaks down when the cost of a wrong tool call is high relative to the cost of being slow: an agent that can hit a "send email" or "execute trade" tool needs human-in-the-loop confirmation, which mostly defeats the autonomy that made the agent attractive.

### What to explore next

- When *not* to use an agent → the explicit "chains are usually right" framing from Phase 4 of the curriculum.
- Tool routing: heuristic vs LLM-routed → the routing decision is the failure mode; constraining it is the mitigation.
- Memory: short-term (context) vs long-term (retrieval) → agents that need to remember across turns are doing retrieval; the loop is RAG with extra steps.
- Multi-agent orchestration → multiple LLM-routed loops talking to each other. The interview-defense answer is "you almost never need this; the question is what makes you think you do."

---

## Tradeoffs

### Comparison table — both costs in one frame

┌──────────────────┬─────────────────────────┬─────────────────────────┐
│ Cost dimension   │ Agent loop              │ Single-purpose chain    │
├──────────────────┼─────────────────────────┼─────────────────────────┤
│ Latency          │ N × LLM call (per turn) │ 1 × LLM call            │
│ Token cost       │ N × cost + tool results │ 1 × cost                │
│ Determinism      │ Model picks the route   │ Code picks the route    │
│ Debuggability    │ Replay-by-trace         │ Step-through code       │
│ Failure shape    │ Infinite loop, wrong    │ Wrong output            │
│                  │ tool, broken termination│                         │
│ Worth when       │ Task shape unknown      │ Task shape known        │
│ Eval complexity  │ Per-turn + end-to-end   │ End-to-end only         │
└──────────────────┴─────────────────────────┴─────────────────────────┘

### Sub-block 1 — what running an agent costs

Each turn is one full LLM call. A two-turn agent doubles the latency and cost of a chain; a five-turn agent is 5x. Token cost compounds because each turn's context includes all prior thoughts/actions/observations — turn 5 reads 4 turns of history, so the input bill grows quadratically in the number of turns if context isn't trimmed.

Operationally, an agent adds two failure modes that chains don't have: *infinite loops* (model keeps calling tools and never finalizes) and *wrong-tool selection* (model picks `retrieve_similar` when it should have picked `get_user_history`, because the prompt didn't disambiguate well). Both need explicit guards: a `max_iterations` cap and constrained tool sets per stage. Both add code and tests.

Debuggability requires replay infrastructure — a per-turn log of `{thought, action, observation, model_response}` in the same shape as an HTTP request log. Without it, a misbehaving agent is unfixable; you can't reproduce the wrong turn because the model's reasoning at that turn is gone.

### Sub-block 2 — what a chain would cost

A chain is faster, cheaper, and more predictable — but it can't handle tasks where the next step genuinely depends on the result of the previous step in a way you couldn't enumerate. If the task is "search the docs, then if you found a relevant doc, summarize it; if not, ask a clarifying question," a chain with a hand-coded `if` statement handles it. If the task is "answer the user's question, calling whatever tools you need in whatever order," only an agent works.

For the reincodes visualizer specifically, a chain wouldn't show what makes an agent an agent — the LLM-routed branching is the entire interview point. The visualizer has to be an agent because the *concept being visualized* is the loop, not a fixed sequence.

### Sub-block 3 — the breakpoint

Agents are right when (a) the next step genuinely depends on the previous step's result in ways you can't enumerate, (b) the cost of N model calls per task is acceptable for the value produced, and (c) the failure modes (wrong tool, infinite loop) have explicit guards. Chains are right everywhere else — which is most places. The breakpoint to revisit "should this be an agent" is "I'm writing a third `if/else` branch on tool-call results in my chain code" — at three branches, the branching logic is becoming the program, and an LLM-routed version may genuinely be simpler than maintaining the branching by hand.

### Sub-block 4 — what wasn't actually a tradeoff

"Multi-agent orchestration" wasn't a real alternative for any of the curriculum's anchor projects. Multiple LLM-routed loops talking to each other adds another layer of non-determinism and another set of failure modes (deadlock, message-routing bugs, conflicting tool calls) without solving a problem a single agent doesn't already address. Most "multi-agent" architectures in 2026 are single-agent loops with named sub-prompts, dressed up. The curriculum lists multi-agent as `learn-only — interview defense` for exactly this reason.

---

## Tech reference (industry pairing)

### Tool-calling SDK — Anthropic SDK or OpenAI SDK

- **Codebase uses:** not yet — the reincodes visualizer would simulate the loop with precomputed turn responses rather than calling an LLM live, because static-export sites can't hold API keys.
- **Why it's here:** the tool-calling interface is how the model emits the typed responses your dispatcher switches on. Without it you're parsing freeform model output, which is brittle.
- **Leading today:** Anthropic SDK (Claude tool use) and OpenAI SDK (function calling) — both adoption-leading, 2026.
- **Why it leads:** native JSON-schema-shaped output, guaranteed-valid-schema responses, dramatic reduction in parse-failure rate vs prompt-engineered tool calling.
- **Runner-up:** LangChain / LlamaIndex — innovation-leading "agent framework" abstractions, but they add a heavy abstraction layer; most production agents in 2026 use the provider SDK directly because the abstraction tax exceeds the savings.

### Trace/log storage — a per-turn log table

- **Codebase uses:** not yet — would be precomputed JSON in the visualizer (`public/agent-loop/example.json` with the example trace baked in). For a real agent, this is a database table (loopd has an `ai_call_log` per the curriculum's `[B1.2]`).
- **Why it's here:** without a per-turn trace, an agent failure is unfixable. The trace is the debugger.
- **Leading today:** Langfuse (self-hosted or cloud) — innovation-leading for LLM agent observability, 2026.
- **Why it leads:** purpose-built for trace + span data shaped like agent turns, integrates with most SDKs via a single decorator, replay UI lets you re-run a turn with a different prompt.
- **Runner-up:** LangSmith (LangChain's hosted observability), Phoenix/Arize (open-source); a hand-rolled SQLite table is the right call when the budget is "small project, no extra service."

### React state — for the visualizer itself

- **Codebase uses:** the existing `useState` + `delayLoop` pattern in `src/utils/delayLoop.ts`. Every algorithm page uses it.
- **Why it's here:** the agent-loop visualizer is structurally the same as the existing recursion / call-stack visualizers — pushes and pops of frames, animated with `await delayLoop()` between steps. Reusing the pattern keeps the page consistent with the rest of reincodes.
- **Leading today:** React 19 (already in `package.json`) — adoption-leading, 2026.
- **Why it leads:** existing rendering primitives in reincodes, no new dependencies. The agent-loop frame-by-frame animation maps directly onto the same `useState` + async loop pattern that drives sorting, BFS, and Dijkstra pages.
- **Runner-up:** none — there is no reason to import a state library for this page.

---

## Project exercises

### [B-reincodes-agent-loop] Agent loop animation

- **Exercise ID:** Curriculum reference: interview-prep entry `Agent loop animation [exercises C4.2]`. Concepts: `[C4.1]` (tool/function calling mechanics), `[C4.2]` (the agent loop, termination conditions), `[C4.3]` (ReAct), `[C1.10]` (single-purpose chains vs agent loops).
- **What to build:** A page at `/ai/agent-loop` that animates a single ReAct loop — thought, action, observation, thought, action, observation, finalize — against a precomputed example trace. The example is a "classify this todo with retrieval fallback" task (mirrors loopd's `[B4B.1]`): the model classifies, retrieves similar past todos if confidence is low, re-classifies. The page renders each turn as a card stack (parallel to `CallstackVisualizer`), with a "step" / "play" control. An editable prompt field at the top swaps between three presets (clear case, ambiguous case, off-distribution case) and shows the precomputed trace for each. A side panel shows the termination conditions and which one fired.
- **Why it earns its place:** most agent-tutorial content shows the diagram and the prompt. Almost none show *one turn at a time, with the model's thought visible*, which is what makes ReAct legible. Building it forces the engineer to model the loop as a state machine, name the termination conditions explicitly, and treat the trace as a first-class artifact — all three are exactly what the senior interview question probes for.
- **Files to touch:**
  - `public/agent-loop/example-clear.json` (new — precomputed trace for the clear case)
  - `public/agent-loop/example-ambiguous.json` (new — trace for the ambiguous case)
  - `public/agent-loop/example-off-distribution.json` (new — trace for the failure case)
  - `src/app/ai/agent-loop/page.tsx` (new — the `"use client"` page)
  - `src/components/AgentLoopVisualizer/AgentLoopVisualizer.tsx` (new — animates the turn-by-turn loop using the same `delayLoop` pattern as `CallstackVisualizer`)
  - `src/components/AgentLoopVisualizer/TurnCard.tsx` (new — renders one {thought, action, observation} card)
  - `src/components/Home/conceptsData.tsx` (add the tile)
- **Done when:** the page loads, all three preset traces play through correctly, the "step" control advances one turn at a time, the termination condition that fires is named in the UI, and the page passes `next build` under `output: "export"`.
- **Estimated effort:** 1–2 days.

---

## Interview defense

### What an interviewer is really asking

When an interviewer asks about agents, they're not asking you to define ReAct. They're asking: do you reach for agents reflexively, or do you have an opinion about when *not* to use one? The senior+ candidate names three reasons their codebase doesn't use an agent (single-purpose tasks, latency budget, debuggability) and one reason it does (the task has no known fixed shape). The junior candidate calls everything an agent because they read a blog post that called everything an agent.

### Likely questions

[mid] Q: What's the difference between a chain and an agent?

A: A chain is a fixed sequence of LLM calls — the code decides the next step. An agent is a `while` loop around an LLM call where *the model* decides the next step (and which tool to call) at each turn. The key difference is who's routing: a chain has hand-coded routing, an agent has LLM-routed routing. Chains are cheaper, faster, and more deterministic; agents handle tasks whose step sequences can't be enumerated up front. Most production "AI features" are chains; the term "agent" is wildly overused.

Diagram:
```
Chain                              Agent
─────                              ─────
input                              input
  │                                  │
  ▼                                  ▼
call_1 ──▶ output_1                call ──▶ tool_call?
  │           │                       │       │
  ▼           ▼                       │       ▼
call_2 ──▶ output_2                   │   dispatch
  │           │                       │       │
  ▼           ▼                       │       ▼
call_3 ──▶ output_3                   └── observation
                                          │
                                          ▼
                                       (loop until terminate)
```

[senior] Q: You're tempted to add an agent loop to a feature. What's your decision tree for whether you should?

A: I check three things. First: can I write down the sequence of steps the feature performs as fixed code (with `if/else` for the branches I know about)? If yes, it's a chain. Second: is the cost of N model calls per request acceptable for this feature? An agent that takes 3–5 turns at $0.02/call won't fit a free-tier product. Third: do I have an eval set and a trace store ready? Agents without per-turn observability are unfixable. If any answer is no, I default to a chain plus a heuristic — most "agentic" features I've seen would have been better as a chain plus a `switch`.

Diagram:
```
Decision tree for "should this be an agent?"

   Can I enumerate the steps?
       │
       ├── YES ──▶ Chain. Done.
       │
       └── NO ──▶ Can I afford N × $ per call?
                    │
                    ├── NO ──▶ Hand-code the routing.
                    │          Maybe a chain with branches.
                    │
                    └── YES ─▶ Do I have eval + trace?
                                │
                                ├── NO ──▶ Build them first.
                                │
                                └── YES ─▶ Agent (with explicit
                                            termination conditions).
```

[arch] Q: You build an agent that works in dev but produces infinite loops in production. What changes?

A: The bug is almost always one of: termination condition missing, tool result that the model misinterprets and re-calls the same tool, or model degradation (provider routes to a smaller model under load). The mitigations layer: `max_iterations` hard cap (forces termination), per-tool idempotency check (refuse a second call with the same args within the same loop), wall-clock timeout (fail-loud after N seconds), and explicit `finalize` tool that the model has to call to exit cleanly. At scale you also need rate limiting per agent run, circuit breakers around tool calls, and replay tooling so you can re-run any failed turn with a different model or prompt.

Diagram:
```
Production agent — layered guards

  ┌─ max_iterations ──── hard cap, e.g. 10 turns ────┐
  │  ┌─ wall_clock ───── fail-loud after 30s ────┐   │
  │  │  ┌─ same_args check (no-op re-calls) ─┐   │   │
  │  │  │  ┌─ explicit finalize() required ─┐│   │   │
  │  │  │  │                                ││   │   │
  │  │  │  │   model + tool dispatch        ││   │   │
  │  │  │  │                                ││   │   │
  │  │  │  └────────────────────────────────┘│   │   │
  │  │  └─────────────────────────────────────┘   │   │
  │  └─────────────────────────────────────────────┘   │
  └─────────────────────────────────────────────────────┘

  Any layer firing ends the loop. None alone is enough.
```

### The question candidates always dodge

Q: "Multi-agent systems" — when would you build one?

A: Almost never. The candidates who get excited about multi-agent systems usually haven't shipped a single one to production and don't know how the failure modes compound. Two LLM-routed loops talking to each other introduce all the failure modes of a single agent (wrong tool, infinite loop, bad termination) *plus* coordination failure modes (deadlock, message routing, conflicting tool calls on shared state). The cases where a multi-agent setup is genuinely needed — say, an adversarial debate to surface arguments on both sides of a question — are narrow and almost always better served by a single agent that uses a "consider the opposing view" prompt internally. The interview answer is "I've never needed one in production; here's the kind of problem where I'd consider it" — and then naming a narrow real case (adversarial review, parallel sub-agents over independent subtasks with no shared state). Pretending multi-agent is a default move signals inexperience.

Diagram:
```
What we picked (single agent)    vs   Multi-agent fantasy
─────────────────────────             ──────────────────
1 loop, N turns                       2+ loops, N×M turns
1 termination condition               2+ termination conditions
1 trace                                2+ traces to correlate
1 set of guards                       guards + coordination logic

Single-agent failure modes:           Multi-agent failure modes:
- wrong tool                           - wrong tool (per agent)
- infinite loop                        - infinite loop (per agent)
- bad termination                      - bad termination (per agent)
                                       PLUS:
                                       - deadlock between agents
                                       - conflicting writes
                                       - message-routing bugs
                                       - cost compounds multiplicatively
```

### One-line anchors

- "An agent is a `while` around a typed-response handler; everything else is naming."
- "The model is the router; the failure mode is the routing."
- "Termination conditions are a first-class field of the spec, not an afterthought."
- "Most production 'agents' would have been better as a chain plus a heuristic."
- "Multi-agent is almost never the right answer; the interview move is to know that."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw the ReAct loop from memory — show one turn (thought, action, observation) feeding into the next, with the termination check between turns. Label every box.

Open the file. Compare.

- Did you show the model emitting a *typed* tool call?
- Did you show the dispatcher in your code running the tool?
- Did you show that the next turn's input includes all prior thoughts/actions/observations?
- Did you show at least two termination conditions (max_iterations, explicit finalize)?

### Level 2 — Explain it out loud

Explain agent loops to a frontend colleague who just asked "what's an agent and why is everyone talking about them?" No notes. Under 90 seconds.

Checkpoints — did you:
- Anchor on the discriminated-union response handler shape?
- Distinguish chain (you route) vs agent (LLM routes)?
- Name at least one failure mode (infinite loop, wrong tool, bad termination)?
- Say when *not* to use an agent?

### Level 3 — Apply it to a new scenario

Answer this without looking at the file:

"A teammate proposes building an agent to handle customer support tickets — the agent has tools to query the knowledge base, look up the customer's account history, and respond. They say it'll be more 'autonomous' than the current chain-based bot. Walk through your decision tree. Would you build it as an agent? What would you ask first?"

Write your answer. 3–5 sentences minimum.

### Level 4 — Defend the decision you'd change

The Project exercise above precomputes traces rather than calling an LLM live. Answer in writing:

"If you were building the agent-loop visualizer today, would you precompute traces or run a real model? Why? What would the static-export constraint force you to do either way? What teaching value is lost when traces are precomputed?"

Reference the actual constraints:
- Point to `next.config.ts` (`output: "export"` — no server-side LLM calls).
- Point to where the precomputed JSON would live in `public/`.

### Quick check — code reference test

Without opening any files, answer:
- What existing reincodes component animates a stack of frames in a way that maps onto the agent-loop visualization?
- What's the file path of the new visualizer component you'd add?
- What three preset cases would the example traces cover?

Then open the files and verify.

- Pass: `src/components/CallstackVisualizer/` (recursion call-stack viz uses the same shape).
- Pass: `src/components/AgentLoopVisualizer/AgentLoopVisualizer.tsx`.
- Pass: clear case, ambiguous case (triggers retrieval), off-distribution case (hits a termination condition without finalizing).

---

## Summary

An agent loop is a `while` around a typed-response handler — the model emits structured tool calls, your code dispatches them, the result feeds back in, and the loop continues until a termination condition. ReAct adds the explicit thought/action/observation triple. The hardest part isn't building one; it's knowing when *not* to. For reincodes, the planned `/ai/agent-loop` page animates a ReAct loop turn-by-turn against precomputed example traces, parallel to the existing `CallstackVisualizer` shape.
