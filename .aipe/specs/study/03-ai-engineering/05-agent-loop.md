# The agent loop and termination

**Industry name(s):** Agent loop, ReAct loop, agentic execution
**Type:** Industry standard

> An LLM that doesn't just answer once — it picks a tool, the tool returns, the LLM picks the next tool, and so on, until it decides it's done or hits a step limit. Not yet built in this codebase — slated as a reincodes agent-loop animation.

**See also:** → [01-tokenization](./01-tokenization.md)

---

## Why care

You've used ChatGPT to "search for X then summarise the top result." Under the hood that's an agent loop: the LLM decided to call a search tool, got results, decided to call the summarise tool. Two questions matter: how does the LLM "decide" what to do next, and how does it know when to stop?

This sits in **agents and tool use** — the layer beyond single-shot chat. Same shape as: ReAct (Reasoning + Acting), Anthropic's tool use, OpenAI's function calling, LangGraph's agent loops.

---

## How it works

Picture a research assistant given a task: "Find the latest news on X." The assistant decides "search for X," reads results, decides "this article looks relevant, summarise it," reads the summary, decides "this is enough" — and reports back. Each decision is a small LLM call; each tool produces input for the next decision. The loop is "decide, act, observe, repeat."

### The structure

```
function agent_loop(initial_prompt, tools, max_iters = 10):
  messages = [system_prompt, user(initial_prompt)]
  iter = 0

  while iter < max_iters:
    response = llm.chat(messages, tools)
    
    if response.tool_calls is empty:
      return response.content     // termination: LLM decided "done"
    
    for tool_call in response.tool_calls:
      result = execute_tool(tool_call)
      messages.append(tool_call)
      messages.append(tool_result(result))
    
    iter += 1
  
  return "max iterations exceeded"  // termination: safety cap
```

The LLM either (a) calls a tool, getting more input to make the next decision, or (b) returns a final answer with no tool calls — that's the termination signal.

### Termination conditions

```
1. LLM says it's done       (no tool_calls in response)
2. Iteration cap reached    (max_iters = 10 or whatever you set)
3. Confidence threshold     (custom: stop when confidence > 0.9)
4. Time budget exhausted    (custom: stop after 30 seconds)
5. Cost budget exhausted    (custom: stop after $X spent on this query)
```

Production agents typically use (1) + (2) as the floor; (3)–(5) as guards.

### Trace: a simple research agent

```
User: "Find the latest news on quantum computing"

Iter 0: LLM sees the task, decides: call search("quantum computing 2026")
  → tool returns: [Article 1: ..., Article 2: ..., Article 3: ...]

Iter 1: LLM sees results, decides: call summarise(Article 1)
  → tool returns: "Researchers at MIT announced..."

Iter 2: LLM has summary, decides: respond with the summary (no tool calls)
  → returns: "Here's the latest: ..."

  LOOP TERMINATES (no tool calls in response).
```

### When the LLM doesn't know when to stop

The classic failure: the LLM keeps calling tools forever. The fix is *both* a hard cap (max_iters) and explicit termination instructions in the system prompt: "When you have enough information, return the answer directly without calling tools."

### The principle

This is what people mean by *agentic systems*. The LLM isn't a one-shot Q&A; it's a planner that decides what to do step by step. The cost: more LLM calls (each iteration is an API call); the benefit: tasks the LLM can't do in one shot become tractable.

The full picture is below.

---

## Agent loop — diagram

```
┌─ User task ─────────────────────────────────────┐
│  "Find the latest news on quantum computing"    │
└─────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────┐
│              AGENT LOOP                          │
│                                                  │
│   ┌───────────────────────────┐                 │
│   │ LLM decides next action    │ ◀───────┐      │
│   └───────────────────────────┘         │      │
│            │                            │      │
│       ┌────┴────┐                       │      │
│       ▼         ▼                       │      │
│  tool_calls    no tool_calls            │      │
│       │         │                       │      │
│       ▼         ▼                       │      │
│  execute    return answer ─── EXIT      │      │
│  tool                                    │      │
│       │                                 │      │
│       ▼                                 │      │
│  tool result                            │      │
│       │                                 │      │
│       ▼                                 │      │
│  append to messages ────────────────────┘      │
│                                                  │
│   iter++ ; if iter ≥ max_iters: EXIT            │
└─────────────────────────────────────────────────┘
```

---

## In this codebase

**Not yet implemented.** Curriculum's `[C4.2]` "Agent loop, termination conditions" is **Case B** for reincodes — slated as the **Agent loop animation** (curriculum line 525).

---

## Elaborate

### Where this pattern comes from
ReAct (Yao et al., 2022) crystallised the "reason + act + observe" loop. Anthropic's tool use, OpenAI's function calling, and LangChain's agent classes all implement this pattern. Predates LLMs in classical AI planning.

### The deeper principle
*An agent is a planner with tool access.* Single-shot LLMs do reasoning; agentic LLMs do reasoning AND execution AND observation. Adding tool access turns a passive responder into an actor.

### Where this breaks down
- Step explosion: pathological tasks loop hundreds of times.
- Tool errors: malformed responses confuse the LLM into hallucinated retries.
- Cost: each iteration is an API call; budgets balloon.

### What to explore next
- ReAct paper.
- Anthropic's "Building effective agents" essay.
- Tool routing strategies (heuristic vs LLM-routed).

---

## Tradeoffs

### Comparison table

```
┌──────────────────┬──────────────────────────┬──────────────────────────┐
│ Cost dimension   │ Single-shot LLM          │ Agent loop                │
├──────────────────┼──────────────────────────┼──────────────────────────┤
│ Latency          │ ~1 LLM call (~1s)        │ N LLM calls (~N×1s)       │
│ Cost             │ ~1 query                 │ ~N queries                │
│ Capability       │ Limited to context       │ Can use tools / search    │
│ Termination      │ Always 1 turn            │ Need explicit cap         │
│ Failure modes    │ Wrong answer             │ Loop forever, runaway cost│
│ Determinism      │ Same input → same answer │ Path varies               │
│ Use cases        │ Q&A, generation          │ Research, multi-step task │
└──────────────────┴──────────────────────────┴──────────────────────────┘
```

### What we gave up

Determinism and predictable cost. Agent runs vary in length; cost per task is a distribution, not a number. Mitigation: per-task budget caps and monitoring.

### What the alternative would have cost

Without agents, every multi-step task has to be hard-coded as a chain — "do A then B then C, in this exact order." Adds rigidity; loses adaptive planning. For genuinely unknown task paths, agents are the right shape.

### The breakpoint

Use single-shot when the task fits in one prompt. Use chain (fixed steps) when you know the steps. Use agent only when the LLM needs to decide the steps based on observations.

---

## Tech reference (industry pairing)

### Agent frameworks

- **Codebase would use:** Anthropic Claude SDK directly with tool definitions (no framework needed for simple loops).
- **Why it'd be here when built:** the standard implementation; the loop is ~30 lines.
- **Leading today:** Claude Code SDK / Anthropic tool use — `innovation-leading` for agent SDKs in 2026.
- **Why it leads:** mature tool definition schema; explicit thinking mode; built-in iteration patterns.
- **Runner-up:** OpenAI function calling — `adoption-leading` historically; OpenAI Assistants API; LangGraph for explicit state machines.

---

## Project exercises

### Agent loop animation (curriculum reference: `Interview prep surface — reincodes`)

- **Exercise ID:** *[reincodes-viz: Agent loop animation]* — `aieng-curriculum.md:525`, exercises C4.2.
- **What to build:** A page that animates an agent loop step by step. Pre-canned demo task ("Find the weather in Tokyo and summarise the news"). Each iteration shows: (1) the LLM's decision (call tool X with args Y), (2) the tool's response, (3) the messages-so-far history, (4) the iteration counter. Pause/play controls. Demonstrate termination via the LLM saying "done" *and* via hitting the iteration cap.
- **Why it earns its place:** the abstract concept "agent loop" becomes concrete when the user can watch a real loop play out, see "the LLM picked search because the user asked for news," and notice the termination signal. Foundational interview material.
- **Files to touch:** `src/app/concepts/ai-engineering/agent-loop/page.tsx` (new), `src/components/AI/AgentLoop.tsx` (new), pre-canned tool-call trace JSON (or live Claude API call if env has a key).
- **Done when:** The animation cleanly walks through a 3–5-iteration agent run, terminates correctly via the "LLM said done" path, and the iteration-cap path can be triggered with a "loop forever" demo task. Step-by-step controls work.
- **Estimated effort:** `1–2 days`.

---

## Summary

### Part 1 — concept recap

The agent loop is the pattern where an LLM repeatedly decides which tool to call, observes the result, and decides the next action until it either signals completion (no more tool calls) or hits a safety cap. reincodes doesn't have one today; the curriculum slates a step-by-step agent loop animation. The constraint is "watching the loop reveals what tool routing and termination mean in practice," and the cost is the build effort plus Claude API access (or a pre-canned trace).

### Part 2 — key points to remember

- One loop iteration: LLM decides → tool runs → result appended → repeat.
- Termination: (a) LLM emits no tool calls, (b) max iterations hit.
- Safety: always cap iterations; agents can otherwise loop forever.
- Cost: each iteration = one API call.
- Determinism: low (path varies per run).

---

## Interview defense

### What an interviewer is really asking

When someone asks about agent loops, they want to hear "termination conditions" *and* "failure modes." The interview red flag is not knowing what happens when the LLM never decides to stop.

### Likely questions

**Q [mid]: How does the agent know when to stop?**

A: Two signals. (1) The LLM emits a response with no tool calls — that's "I'm done, here's my answer." (2) The hard iteration cap (e.g., max_iters = 10) — that's the safety net. Production agents need both because (a) the LLM sometimes fails to terminate cleanly, and (b) tool errors can confuse the LLM into infinite retries.

**Q [senior]: When does an agent loop go wrong?**

A: Three common failure modes. (1) The LLM keeps calling tools forever — fix with iteration cap. (2) Tool returns malformed output, LLM retries with same call — fix with retry counter per tool. (3) The LLM hallucinates a tool name not in the schema — fix with schema validation before dispatch and a friendly error fed back to the LLM. The first two are the most common in production.

```
┌── Healthy loop ───────────┐    ┌── Pathological loop ──────┐
│  1. LLM decides           │    │  1. LLM decides           │
│  2. tool runs OK          │    │  2. tool errors           │
│  3. LLM uses result       │    │  3. LLM retries same call │
│  4. eventually says done  │    │  4. LLM never converges   │
│  Cost: 3-5 iters          │    │  Cost: 10 iters = cap     │
└───────────────────────────┘    └───────────────────────────┘
```

**Q [arch]: At 1000 concurrent agent sessions, what breaks first?**

A: Cost. Each session does 5–10 LLM calls × $0.01 per call = $0.10/session. 1000 concurrent = $100/minute = $144k/day if all sessions run continuously. The architecture pivot at scale: (a) heuristic routing (skip the LLM for obvious cases), (b) cached tool results (same query → cached agent output), (c) per-user budget caps.

### The question candidates always dodge

**Q: Aren't agents just chains with extra steps and worse latency?**

A: Often, yes. Anthropic's "Building effective agents" essay (2024) explicitly says: prefer the simplest design that works. Chains (fixed-sequence tool calls) win when the steps are known; agents win when the steps must be decided based on observations. The mistake is using agents for tasks chains would handle — paying agent overhead without earning agent benefits. The interview test: name a task that chains *can't* do — typically anything where the next step depends on inspecting the previous output.

```
┌── Chain (when steps known) ─┐  ┌── Agent (when not) ──────┐
│  search → summarise → tag    │ │  ? → ? → ? (LLM decides) │
│  Deterministic               │ │  Adaptive                │
│  Easy to test                │ │  Hard to test            │
│  Fast                        │ │  Slow                    │
│  Cheap                       │ │  Expensive               │
└───────────────────────────┘    └───────────────────────────┘
```

### One-line anchors

- "Decide → act → observe → repeat → terminate."
- "Two termination signals: LLM done OR iteration cap."
- "Production agents need both."
- "Use chains when steps are known; agents when they're not."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Draw the loop with two exit branches: "LLM says done" and "iter cap hit."

### Level 2 — Explain it out loud
"What's the difference between an agent and a chain?"

### Level 3 — Apply it to a new scenario
"Design an agent that books a flight given 'fly me to Tokyo next Friday.' What tools? What termination?"

### Level 4 — Defend the decision you'd change
"For loopd's classifier task, would you use an agent or a chain? Why?"

### Quick check
- Currently implemented? → No, Case B.
- Termination signals? → no tool calls + iteration cap.
- Risk? → infinite loop without a cap.

✓ Pass: all three.
