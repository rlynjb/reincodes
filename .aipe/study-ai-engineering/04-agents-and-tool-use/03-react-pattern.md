# ReAct pattern — reason + act loops

**Industry name(s):** ReAct, Reasoning + Acting, reason-act loop, thought-action-observation loop
**Type:** Industry standard

> ReAct is the canonical agent shape: the model alternates between a *Thought* (free-text reasoning), an *Action* (tool call), and an *Observation* (tool result), looping until the task is done. The pattern is from Yao et al. 2022 and it's the default agent loop everyone runs.

**See also:** → [01-agents-vs-chains](01-agents-vs-chains.md) · → [02-tool-calling](02-tool-calling.md) · → [05-agent-memory](05-agent-memory.md) · → [06-error-recovery](06-error-recovery.md) · → [../../study-prompt-engineering/06-chain-of-thought.md](../../study-prompt-engineering/06-chain-of-thought.md)

---

## Why care

### Move 1 — The grounded scenario

You've registered tool calling on a chain — the model can call `getRecentTags`, `getCalendarEvents`, `getRecentThreads`. You ship it and it works most of the time. But on the 10% of inputs that need *two* tools called sequentially (look up recent tags, then look up calendar events filtered by those tags), the model sometimes calls only one and finalizes. You can't tell *why* — you see the assistant turn, the single tool_use, the result, the final response. The model's reasoning between "I should look up tags" and "I'm done now" is invisible. There's no field in the response that says "here's what I'm thinking before I emit this tool call." So you add an instruction to the system prompt: "before each tool call, write out your reasoning." Now the assistant turn has a text block ("I need to check recent tags first to know what to filter the calendar by") followed by the tool_use block. The tool runs, the result comes back, the next assistant turn starts with another text block ("now I have the tags, let me check the calendar"). You can read the model's reasoning. You can debug. You can eval per-step.

### Move 2 — Name the question

That pattern has a name — *ReAct*. Not the agent loop in general, not tool calling, not chain-of-thought — just the specific structure where every agent turn produces a *Thought* (free-text reasoning), an *Action* (tool call), and the next turn starts with the *Observation* (tool result). ReAct is *the* default agent shape in production LLM applications in 2026. It's what makes the agent's internal reasoning legible to the engineer reading the trace, and it's what makes per-iteration evals possible.

### Move 3 — Why answering that question matters

**Why you need to answer that question at all:** because an agent loop without explicit Thoughts is a black box. The model decides to call tool X instead of tool Y and you have no signal for *why* — was it confused, was the description ambiguous, did it misread the user's intent? Without Thoughts, debugging an agent that picks the wrong tool 30% of the time is reading the trace and guessing. With Thoughts, the trace has the model's reasoning interleaved with its actions, and the debug move is "find the Thought that's misreading the input." The eval discipline that becomes possible with Thoughts: per-step rubric eval ("does the model's Thought correctly identify what it needs?"), thought-action consistency eval ("does the Action match what the Thought says it'll do?"), and trajectory eval ("does the chain of Thoughts converge on the right answer?"). Without Thoughts, the only eval you can run is end-to-end and the failure modes pile up uncategorized.

### Move 4 — Concrete before/after

Without ReAct (tool calling without Thoughts):

- Assistant turn 1: `tool_use(getRecentTags)` — no reasoning visible
- Assistant turn 2: `tool_use(getCalendarEvents)` — why this tool, why now?
- Assistant turn 3: text — final answer
- Debug: read the input + 3 tool calls + final, infer reasoning, guess
- Eval: end-to-end only

With ReAct (Thoughts interleaved):

- Assistant turn 1: text "I need recent tags first to filter the calendar by topic" + `tool_use(getRecentTags)`
- Assistant turn 2: text "the tags are productivity, side-project — let me filter calendar events by those" + `tool_use(getCalendarEvents)`
- Assistant turn 3: text "I have what I need" + final answer
- Debug: read the Thoughts, see the reasoning chain, spot the broken step
- Eval: per-step Thought rubric, Thought-Action consistency, trajectory convergence

### Move 5 — The one-line summary

ReAct is tool calling with chain-of-thought stitched in: every agent turn produces a Thought (text reasoning), an Action (tool call), and the next turn opens with an Observation (the tool's result). The rest of this file is the mechanics and the paper history.

---

## How it works

### Move 1 — The mental model

A ReAct loop is a state machine over three event types: Thought, Action, Observation. Every turn, the model emits a Thought followed by an Action. The runtime executes the Action (tool call) and prepends the Observation (result) to the next turn's input. The loop terminates when the model emits a Thought followed by a *finalize* signal (no Action, just the final text response). If you've used `Array.reduce` to walk a list of events and accumulate state, the ReAct loop is the same shape — the accumulator is the conversation transcript, the reducer is `step(transcript) → newTranscript + maybe(terminate)`, and the terminate condition is "model said it's done."

```
the three event types, interleaved

  Thought  ┄┄  "I need X because Y"      ← free-text reasoning
  Action   ┄┄  tool_use(name, input)     ← tool call
  Observation ┄ tool_result(content)     ← result back from app

  one full turn = Thought + Action,
  followed by Observation prepended to the next turn's input
```

### Move 2 — The layered walkthrough

#### The Thought block

A Thought is a text content block in the assistant message — `{ type: "text", text: "I need to check the recent tags first because the user asked about activity over the last week." }`. It precedes the Action in the same assistant turn. The Thought is the model's reasoning made explicit: what it's about to do, why, and what it expects to find. The system prompt elicits Thoughts by including instructions like "Before each tool call, briefly explain your reasoning in 1-2 sentences" or via few-shot examples that demonstrate the Thought-Action shape. Modern models (Claude 4.7, GPT-5) handle this convention natively when prompted; older models (GPT-3.5 era) needed heavier framing ("you must follow the format: Thought: ... Action: ... Observation: ...").

```
Thought block — what the model is about to do, and why

  {
    type: "text",
    text: "The user asked what they've been working on this
           week. I need recent tags to identify the topics,
           then calendar events to ground the activity.
           Starting with tags."
  }
```

#### The Action block

The Action is the tool_use content block — `{ type: "tool_use", id: "...", name: "getRecentTags", input: { ... } }`. It comes right after the Thought in the same assistant turn. The model is committing to the call it just reasoned about. The schema discipline from `02-tool-calling.md` applies — the input must validate against `input_schema`, the name must match a registered tool. The Thought-Action pairing is the load-bearing structure: a Thought without an Action is a finalize turn, and an Action without a Thought is undisciplined ReAct that loses the reasoning signal.

```
Action block — the model commits to the call

  {
    type: "tool_use",
    id: "toolu_abc",
    name: "getRecentTags",
    input: { userId: "u1", limit: 10 }
  }
```

#### The Observation block

The Observation is the tool_result content block in the *next* turn's user message — `{ type: "tool_result", tool_use_id: "toolu_abc", content: '["productivity", "react"]' }`. The model sees this as grounded data on its next turn. The naming convention "Observation" comes from the ReAct paper — the model is *observing* the world's response to its Action. Some implementations include a brief textual framing before the result content ("Observation: ..."); modern Anthropic / OpenAI APIs handle this via the structured tool_result block without extra framing.

#### The termination move

The loop terminates when the model emits a Thought *without* an Action — the assistant message has a text block ("I have what I need to answer") and no tool_use blocks. The API's `stop_reason` is `end_turn` instead of `tool_use`. The runtime detects the end_turn signal and exits the loop, returning the final text as the agent's output. The other termination paths: max iterations exceeded (the runtime's hard guard), confidence threshold passed (the model's Thought includes "I'm 95% confident, finalizing"), or external interruption (user cancels).

```
terminator shapes

  end_turn  ◄── model says "I'm done" (the default exit)
  max_iter  ◄── runtime's safety net (avoid infinite loops)
  confidence ─ model's Thought says it's confident enough
  external  ◄── user/parent cancels
```

#### The full loop

Putting it together: a 3-iteration ReAct trace looks like Thought-Action-Observation-Thought-Action-Observation-Thought-Final, with three tool calls and four assistant turns. The conversation grows by one assistant turn (Thought + Action) and one user turn (Observation) per iteration. The final turn is Thought + Final, no tool call.

```
a 3-iteration ReAct trace

  user:      "what have I been working on this week?"
  ─────────────────────────────────────────────────────
  assistant: Thought: "need recent tags to identify topics"
             Action:  tool_use(getRecentTags)
  user:      Observation: tool_result(["productivity",
                                       "side-project"])
  ─────────────────────────────────────────────────────
  assistant: Thought: "tags identified, fetch calendar
                       events filtered by these topics"
             Action:  tool_use(getCalendarEvents)
  user:      Observation: tool_result([{event1}, {event2}])
  ─────────────────────────────────────────────────────
  assistant: Thought: "have tags + events, can answer now"
             Final:   "You've been focused on productivity
                       and your side-project this week..."
```

### Move 3 — The principle

The principle is *make the model's reasoning legible to the engineer reading the trace*. ReAct is chain-of-thought stitched into tool calling so the agent's decision-making is observable. The architectural payoff isn't that the model reasons *better* (modern models reason well with or without explicit Thoughts) — it's that the engineer can *audit* the reasoning. Production agents need traces; traces need reasoning to be parseable; ReAct is the shape that makes them parseable. Anthropic's official agent guides, OpenAI's Assistants API documentation, and every modern agent framework (LangGraph, AutoGen, CrewAI) default to ReAct-shaped traces because they're what the field converged on between 2022 (the original Yao et al. paper) and 2024 (when production agents stabilized).

The full picture is below.

---

## ReAct loop — diagram

```
┌─ ReAct iteration (one cycle through Thought-Action-Observation) ────┐
│                                                                     │
│   ┌──────────────────────────────────────────┐                     │
│   │  conversation state (accumulating)       │                     │
│   │                                          │                     │
│   │  [user message]                          │                     │
│   │  [Thought + Action] × N                  │                     │
│   │  [Observation] × N                       │                     │
│   └─────────────────────┬────────────────────┘                     │
│                         │                                           │
│                         ▼                                           │
│                ┌─────────────────┐                                  │
│                │   LLM call      │                                  │
│                └────────┬────────┘                                  │
│                         │                                           │
│           ┌─────────────┴─────────────┐                            │
│           │                           │                             │
│      stop=tool_use              stop=end_turn                       │
│           │                           │                             │
│           ▼                           ▼                             │
│   ┌──────────────────┐         ┌──────────────┐                    │
│   │  Thought + Action │        │  Thought +   │                    │
│   │                   │        │  Final text  │                    │
│   │  (text + tool_use)│        │              │                    │
│   └────────┬──────────┘        └──────┬───────┘                    │
│            │                          │                             │
│            ▼                          ▼                             │
│   ┌────────────────┐              return final                      │
│   │ execute Action │              (exit loop)                       │
│   └────────┬───────┘                                                │
│            │                                                        │
│            ▼                                                        │
│   ┌────────────────┐                                                │
│   │  Observation   │                                                │
│   │  (tool_result) │                                                │
│   └────────┬───────┘                                                │
│            │                                                        │
│            └─── append + loop back to LLM call                      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

Loop guards:
  - max iterations (e.g. 10) ← hard exit, treat as failure
  - confidence threshold     ← exit if Thought says model is sure
  - timeout                  ← per-iteration wall-clock budget
```

---

## In this codebase

**Not yet implemented.** reincodes has no agent loops anywhere — no LLM calls, no ReAct traces, no Thought-Action-Observation shape in production code. The closest analog in the existing codebase is the *step-through animation pattern* in the visualizers: every algorithm page mutates state, calls `await delayLoop(speed)`, then mutates again, so each step is observable to the user. That's the same *shape* as ReAct from the engineer's perspective — make the intermediate state legible by surfacing it between steps. The animation is what `delayLoop` does for visualizers; the Thought block is what ReAct does for agents.

The buildable target is below in Project exercises — a `/ai/react-loop` page that animates a precomputed ReAct trace turn-by-turn. Thoughts render in one color, Actions in another, Observations in a third. Step / play controls let the reader walk the trace at their own pace.

**Expected file paths** (when built):
- `src/app/ai/react-loop/page.tsx` — the visualizer
- `src/components/ReActLoopVisualizer/` — turn renderer, step/play controls, color-coded blocks
- `public/ai/react-loop/trace.json` — precomputed multi-iteration ReAct trace
- `scripts/precompute-react-loop.ts` — build-time script that runs an agent against Claude with the system prompt eliciting Thoughts, captures the full trace

---

## Elaborate

### Where this pattern comes from

ReAct is from Yao et al. 2022, "ReAct: Synergizing Reasoning and Acting in Language Models" — the paper that demonstrated interleaving reasoning (chain-of-thought) with action (tool calls) produced more reliable agents than either alone. Before ReAct, the two were separate: chain-of-thought was a single-pass "explain your thinking" technique, and tool calling was a black-box "call this function" mechanism. The paper's contribution was showing that *combining* them — letting the model think out loud *before* each action and use the action's result to update its thinking — produced agents that were more accurate, more debuggable, and more capable of recovering from errors. The original paper used HotpotQA and ALFWorld as test environments; the technique generalized rapidly to production LLM applications between 2023 and 2024, becoming the de-facto default by 2025.

The interface evolution matters: early ReAct implementations used a *parsed prompt convention* (the model emitted "Thought: ... Action: ... Observation: ..." as raw text, the runtime parsed it with regex). Modern ReAct uses *structured content blocks* (text blocks for Thoughts, tool_use blocks for Actions, tool_result blocks for Observations) — no parsing, no regex, just iterate the content array. The structural shift mirrored the broader move from string-based LLM interfaces to typed content blocks.

### The deeper principle

The deeper principle is the *interpretability-action-correction triangle*. An agent that acts without interpretable reasoning is a black box (debug-impossible). An agent that interprets without acting is a chatbot (useful but bounded). An agent that interprets *between* actions and uses the results to correct its interpretation is a feedback loop — it can recover from wrong tool choices, ambiguous inputs, and tool failures because each Observation feeds the next Thought. The deeper move ReAct embodies: don't separate *reasoning* from *acting* in time; interleave them so reasoning has access to the world's response and acting has the structure of explicit reasoning.

### Where this breaks down

ReAct breaks down in three places. First, *very long traces* — at 20+ iterations, the conversation grows to a point where the early Thoughts get attention-discounted (lost-in-the-middle), and the model starts contradicting its earlier reasoning. Mitigation: summarize older turns or use a planner-executor split (the planner does ReAct at high level, the executor runs specific tasks without Thoughts). Second, *trivial tasks* — if the task is "look up one thing and return it," the Thought is overhead that adds latency and tokens for no value. The right pattern there is *direct* tool use (one Action, no Thought) which is closer to a chain. Third, *deterministic-output tasks* — if the agent is supposed to produce structured output (JSON), Thoughts get conflated with the output and the model sometimes wraps the JSON in the Thought text. The fix is to enforce structured output in the final turn separately from the Thoughts in earlier turns.

### What to explore next

- [01-agents-vs-chains](01-agents-vs-chains.md) → ReAct is the *agent* shape; understanding when an agent is the right architecture is upstream of the ReAct decision
- [02-tool-calling](02-tool-calling.md) → ReAct sits on top of tool calling; the Action is literally a tool_use block
- [05-agent-memory](05-agent-memory.md) → long ReAct traces hit memory problems; what to do when the trace gets long
- [06-error-recovery](06-error-recovery.md) → ReAct's Thought-between-Actions structure is what makes recovery possible; the next file covers the recovery mechanics
- [../../study-prompt-engineering/06-chain-of-thought.md](../../study-prompt-engineering/06-chain-of-thought.md) → the chain-of-thought half of ReAct; the reasoning move on its own without the action loop
- The Yao et al. 2022 paper itself — required reading; it's short and the technique is grounded in the experiments

---

## Tradeoffs

### Comparison table — both costs in one frame

```
┌────────────────────┬──────────────────────┬─────────────────────────┐
│ Cost dimension     │ ReAct (with Thoughts)│ Direct tool use (no T)  │
├────────────────────┼──────────────────────┼─────────────────────────┤
│ Per-turn tokens    │ +50–150 token        │ Baseline                │
│                    │ Thought overhead     │                         │
│ Iterations per     │ Similar (~3–6)       │ Similar (~3–6)          │
│ task               │                      │                         │
│ Total token cost   │ +20–40% per task     │ Baseline                │
│ Latency            │ +50–100ms per turn   │ Baseline                │
│                    │ (Thoughts generate)  │                         │
│ Debuggability      │ High (Thoughts       │ Low (only Actions       │
│                    │ visible in trace)    │ visible)                │
│ Eval shape         │ Per-step Thought     │ End-to-end only         │
│                    │ rubric possible      │                         │
│ Recovery from      │ Strong (next         │ Weak (no signal for     │
│ errors             │ Thought adapts)      │ what to try next)       │
│ Recall on long     │ Drops at 20+ iters   │ Similar                 │
│ traces             │ (Thoughts dilute)    │                         │
│ Best for           │ Multi-step tasks,    │ Single-tool, single-    │
│                    │ ambiguous inputs     │ result tasks            │
└────────────────────┴──────────────────────┴─────────────────────────┘
```

### What we'd give up (when planning the visualizer)

The first cost is *precompute trace richness*. A useful ReAct visualizer needs a multi-iteration trace with diverse Thoughts — a trace where every Thought is "I'll call X" produces a boring animation. The precompute script needs to either find a real task that naturally produces varied reasoning (a research question requiring multiple lookups) or hand-construct the input space to elicit different reasoning paths. ~half a day of script + prompt engineering.

The second cost is *animation pacing*. The visualizer's value proposition is making the loop watchable — each turn renders as a card sliding in, the Thought reads first, the Action highlights, the Observation answers. Pacing matters: too fast and the reader can't read the Thought; too slow and the visualizer feels like watching paint dry. The reincodes `delayLoop` pattern from the existing visualizers is the conceptual model — each step waits for user input or a configurable speed setting. Implementation cost: ~half a day of timing tuning across browser sizes.

The third cost is *competing with the existing study-prompt-engineering's chain-of-thought file*. Both files cover reasoning made explicit; this file's distinguishing angle is the *Action-Observation loop* on top of the Thought. The visualizer has to make that beat legible (the Observation feeds the next Thought) so it reads as a feedback loop rather than as "chain-of-thought with tool calls bolted on."

### What the alternative would have cost (skipping the visualizer)

If reincodes never builds `/ai/react-loop`, the cost is zero in the codebase. ReAct lives in loopd's Phase 4 Path C (the coaching agent) per the curriculum; the interview answer becomes "here's the ReAct trace from a contrl-mo coaching session, watch the Thought between each tool call." That's a strong code-anchored answer but requires the interviewer to read code rather than a rendered timeline.

The cost of *not* building it shows up in interviews where the role specifically asks about agent loop debugging — when an interviewer says "show me how you'd debug an agent that picks the wrong tool 30% of the time." Without the visualizer, the answer is verbal ("I'd add Thoughts to the system prompt, eyeball the failing traces, find which Thoughts misread the input"). With the visualizer, the answer is "here's a rendered trace; if I were debugging, I'd be reading these Thought blocks; here's what a broken Thought would look like" — pointer over speech.

### The breakpoint

The visualizer earns its place when the candidate is interviewing for an agent-platform role or an LLM-application role where debugging agent loops is daily work. For an application-engineer role where agents are one mechanism, the verbal answer suffices. The visualizer's narrow target is "agent debugging" specifically — not generic "I know what ReAct is."

### What wasn't actually a tradeoff

The choice between using Anthropic's structured content blocks (text + tool_use) vs. the older "Thought: ... Action: ..." parsed-string convention was not a real option. Modern providers' typed content blocks are strictly better than parsed strings — the parsing overhead disappears, the schema enforcement comes for free, and the trace format is portable across visualizer renderings. Using parsed strings would be writing 2022 ReAct in 2026, which would be deliberately worse for no gain.

---

## Tech reference (industry pairing)

### Anthropic Messages API (with structured Thoughts)

- **Codebase uses:** not yet — the planned `/ai/react-loop` visualizer would use Anthropic's content blocks (text + tool_use in the same assistant turn) as the precompute target. The system prompt elicits Thoughts by example ("for each step, briefly state your reasoning before calling the tool").
- **Why it's here:** Anthropic's content-block model is the cleanest fit for ReAct — text and tool_use sit side-by-side in the assistant turn's content array, so the Thought-Action pairing is structural rather than parsed.
- **Leading today:** Anthropic Messages API — `adoption-leading` for production ReAct agents, 2026.
- **Why it leads:** typed content blocks (text + tool_use as peers), Claude's natural disposition to emit Thoughts when prompted, extended thinking mode (`thinking` field for Sonnet/Opus 4+ that makes reasoning visible at the API level rather than only as in-turn text).
- **Runner-up:** OpenAI Chat Completions / Responses API — `adoption-leading` for volume; supports the same pattern but with a slightly different content shape (the assistant turn has separate `content` and `tool_calls` fields rather than a unified content array).

### LangGraph (graph-structured agent runtime)

- **Codebase uses:** not yet — would be the conceptual reference if the visualizer ever expands to show ReAct as a state-machine graph rather than a linear trace. Not needed for the current scope.
- **Why it's here:** LangGraph is the current state of the art for *structured* ReAct loops — each Thought-Action-Observation triple is a graph node, the runtime is a state machine, and the framework handles the boilerplate (loop guards, max iterations, conditional edges based on Thought content).
- **Leading today:** LangGraph — `innovation-leading` for graph-structured agents, 2025-2026.
- **Why it leads:** explicit state schema (typed state object passed between nodes), conditional edges (the LLM picks the next edge based on state), checkpointing for long-running agents, the "agent is a graph not a loop" framing that sharpens the architectural understanding.
- **Runner-up:** AutoGen / CrewAI — `innovation-leading` for multi-agent ReAct; relevant when the next architectural step is multiple ReAct-shaped agents coordinating.

### Anthropic extended thinking (interleaved reasoning)

- **Codebase uses:** not yet — would be the experimental target for a future variant of the visualizer that shows the *internal* reasoning the model does before emitting the Thought. Distinct from the in-turn Thought because extended thinking is a separate API field that surfaces the model's hidden chain-of-thought.
- **Why it's here:** extended thinking (Claude Sonnet 4+, Opus 4+) is the modern evolution of ReAct's Thought block — instead of (or in addition to) the Thought being a text block in the assistant message, the model emits a separate `thinking` field that contains its full reasoning chain. The visualizer could expand to show both layers: the public Thought + the private thinking trace.
- **Leading today:** Anthropic extended thinking — `innovation-leading` for surfaced reasoning, 2026.
- **Why it leads:** the `thinking` field is generated separately from the visible response and provides much richer reasoning traces than in-turn Thoughts; the model can reason for hundreds of tokens before committing to an Action.
- **Runner-up:** OpenAI o-series reasoning models — `innovation-leading` for similar surfaced reasoning; the o1/o3/o5 family makes reasoning the primary output, with Action selection downstream.

---

## Project exercises

### [B-reincodes-react-loop-viz] Build the ReAct loop visualizer

- **Exercise ID:** `[B-reincodes-react-loop-viz]` — derived from the curriculum's reincodes "interview prep surface" entry and Phase 4 concept `[C4.3]` (ReAct paper) + `[C4.2]` (agent loop, termination conditions).
- **What to build:** a page at `/ai/react-loop` that animates a precomputed ReAct trace turn-by-turn. Layout: vertical timeline with cards for each turn. Each card has three sections in the ReAct order — a Thought box (rendered with a distinct background color, e.g. light blue), an Action box (different color, e.g. green, showing the tool name + args), and an Observation box (third color, e.g. amber, showing the tool result). The final turn has a Thought + Final box instead of Thought + Action. Controls at the top: play / pause / step-forward / step-back / speed selector (reusing the existing `BSelect` from `src/components/ui/`). The animation reveals turns one at a time at the selected speed, mirroring the `delayLoop` pattern in the existing visualizers. The reader can pause, scroll, and step back through the trace.
- **Why it earns its place:** the visualizer makes the agent's reasoning *watchable*. The reader sees the model think (Thought), commit to a call (Action), observe the result (Observation), then think again — and the cycle is the load-bearing pedagogical beat. The animation pacing turns a static trace into a story. The interview signal is that the candidate built a tool that teaches agent debugging — when an interviewer asks "show me how you'd debug a misbehaving agent," the candidate points at this page and says "I'd be looking at the Thoughts."
- **Files to touch:** `src/app/ai/react-loop/page.tsx` (visualizer), `src/components/ReActLoopVisualizer/` (timeline, turn card, play/pause controls, speed selector wired to existing `BSelect`), `public/ai/react-loop/trace.json` (precomputed 4-6 iteration ReAct trace with diverse Thoughts), `scripts/precompute-react-loop.ts` (build-time script that runs a multi-step task against Claude with a system prompt eliciting Thoughts, captures the full assistant turns with text + tool_use blocks and the user turns with tool_result blocks). Add a row to `CONCEPT_CATEGORIES` in `src/components/Home/conceptsData.tsx` under a new `ai-engineering` category.
- **Done when:** the page loads at `/reincodes/ai/react-loop/` in production, the timeline animates 4-6 turns with Thought/Action/Observation color-coded blocks, the play/pause/step controls work and integrate with the existing `BSelect` for speed, the trace is read from `public/ai/react-loop/trace.json` (no network call), `next build` passes under `output: "export"`. The precompute script captures real Thoughts (not stub data) from a Claude run.
- **Estimated effort:** 1.5-2 days. Precompute script + prompt-engineering for diverse Thoughts: 1 day. Page + timeline + animation + controls: half day. Polish (color palette matching reincodes' existing scheme, the step-back behavior, the speed dropdown wiring): half day.

---

## Summary

### Part 1 — concept recap

ReAct is the canonical agent loop shape: every iteration produces a Thought (free-text reasoning), an Action (tool call), and the next iteration opens with an Observation (the tool's result). The loop terminates when the model emits a Thought without an Action — the model signaling it has what it needs. The pattern is from Yao et al. 2022 and it's the default in 2026 because it makes agent reasoning *legible* — the engineer reading a trace can see the model's reasoning between Actions, debug picking-the-wrong-tool failures by finding the broken Thought, and run per-step rubric evals on the reasoning quality. Modern implementations use structured content blocks (text + tool_use in the same assistant turn) rather than the original parsed-string convention. In this codebase the concept is Case B (no LLM calls in reincodes today); the buildable target is a `/ai/react-loop` page that animates a precomputed ReAct trace with color-coded Thought/Action/Observation blocks and play/step controls.

### Part 2 — key points to remember

- **The structure**: every agent turn = Thought (text) + Action (tool_use); every following turn opens with Observation (tool_result). Loop until model emits Thought without Action (finalize).
- **The payoff**: legibility. Without Thoughts, the agent is a black box. With Thoughts, the trace is readable and per-step evals become possible.
- **The paper**: Yao et al. 2022, "ReAct: Synergizing Reasoning and Acting in Language Models" — required reading. Combined chain-of-thought with tool calling; the technique generalized to production by 2024.
- **The cost**: +20-40% tokens for the Thought overhead. Worth it for multi-step tasks, overkill for single-tool single-result calls.
- **The reincodes shape**: Case B. The visualizer animates a precomputed trace with color-coded blocks and step controls so the reader can watch the loop unfold.

---

## Interview defense

### What an interviewer is really asking

Behind "explain ReAct" the interviewer is testing whether the candidate has read (or can act like they've read) the Yao et al. 2022 paper and shipped an agent loop in production. A junior answer recites the acronym ("reasoning + acting"). A senior answer names the paper, the technique's contribution (interleaving CoT with tool calling), and the production payoff (debuggability + per-step eval). A staff answer adds the *failure modes* of ReAct (long-trace dilution, Thought overhead on trivial tasks) and names when the pattern doesn't earn its place. The interviewer is checking whether the candidate has the paper-citation depth + the production-engineering depth.

### Likely questions

**Q (mid):** What's a Thought in ReAct?

A: A Thought is the model's reasoning made explicit before each Action. In the API response, it's a text content block in the assistant message that precedes the tool_use block — `[{ type: "text", text: "I need to check recent tags first because..." }, { type: "tool_use", name: "getRecentTags", ... }]`. The system prompt elicits Thoughts by example or instruction ("for each step, briefly state your reasoning before calling the tool"). The Thought is what makes the agent's decision-making legible to anyone reading the trace.

```
the Thought slot

  assistant turn:
    ┌──────────────────────────┐
    │ text block (Thought)     │
    │   "reasoning before this │
    │   action"                │
    └──────────────────────────┘
    ┌──────────────────────────┐
    │ tool_use block (Action)  │
    │   { name, input }        │
    └──────────────────────────┘
```

**Q (senior):** Why include Thoughts at all? Modern models are good enough to pick the right tool without explaining themselves.

A: Two reasons. First, *debuggability*. The model is good *most of the time*, not all of the time. When the agent picks the wrong tool — and at production scale, that's 5-20% of calls depending on the task — the engineer needs to know *why*. Without Thoughts, the trace shows the wrong tool got called, and the debug move is guessing what the model misread. With Thoughts, the trace shows the model's reasoning, and the debug move is "find the broken Thought." Second, *eval discipline*. Per-step rubric evals require something to score; the Thought is the only step-level signal the model exposes. Without Thoughts, evals are end-to-end ("did the agent produce the right final answer?"), which catches failures but doesn't categorize them. The "model is good enough" argument is true for the success cases; Thoughts pay rent on the failure cases.

```
the why

  with Thoughts                 without Thoughts
  ─────────────────             ─────────────────
  + debug by reading            - debug by guessing
  + per-step rubric eval        - end-to-end eval only
  + recovery on errors          - recovery is opaque
  + +20–40% tokens              - baseline tokens
```

**Q (arch):** Walk me through a ReAct trace where the agent calls the wrong tool and recovers. Where does the recovery happen?

A: The recovery happens in the *next Thought*. The model called the wrong tool — say, `getCalendarEvents` when it should have called `getRecentTags`. The Observation comes back with calendar events but nothing tag-shaped. The model's next turn opens with a Thought: "the calendar events don't have tag information; I should have called getRecentTags first." Then the Action is `getRecentTags`. The model self-corrected because the Observation gave it the signal that its previous Thought was wrong. This is the load-bearing feedback loop in ReAct — Observation feeds Thought feeds Action — and it's what makes the pattern robust to wrong tool picks. The pattern fails if the model can't *detect* the wrong call from the Observation (e.g. the tool succeeded but returned irrelevant data without an obvious signal); then the agent might finalize with a bad answer. Mitigation: design tool results to include "is this what you expected?" framing where ambiguity exists.

```
the recovery turn

  turn N:  Thought: "I'll get calendar events"
           Action:  getCalendarEvents     ← wrong tool
  turn N+1: Observation: [events but no tags]
           Thought: "this isn't tag data, I need
                     getRecentTags instead"
           Action:  getRecentTags         ← recovery
  turn N+2: Observation: [tag list]
           Thought: "now I have what I need"
           Final:   ...
```

### The question candidates always dodge

**Q:** Isn't ReAct just chain-of-thought with tool calls bolted on? Why does it need its own name?

A: The naming is load-bearing because the *interleaving* is the contribution, not the sum of the parts. Pure chain-of-thought is a single-pass technique — the model reasons once and produces a final answer. Pure tool calling is a black box — the model calls tools without exposing its reasoning. ReAct interleaves them so reasoning has access to the world's response *between* steps: after each Action, the model gets the Observation and *updates* its reasoning before the next Action. The feedback loop is the difference. Chain-of-thought without action can't gather new information. Tool calling without reasoning can't self-correct when a tool returns something unexpected. ReAct is the *combination as a feedback loop* — and the loop is what makes it robust to errors, ambiguous inputs, and dynamic environments. The paper's experimental contribution was demonstrating this empirically: ReAct outperformed both pure-CoT and pure-action baselines on tasks requiring multiple lookups (HotpotQA) and tasks requiring environmental adaptation (ALFWorld). The right framing isn't "CoT + tools" — it's "a feedback loop where reasoning and acting alternate, and each informs the other."

```
why the name earns its place

  CoT alone        single pass, no world feedback
  tools alone      world feedback, no reasoning
  ─────────────────────────────────────────────
  ReAct            reasoning + world feedback,
                   alternating, each informing
                   the other  ◄── the loop is the
                                  contribution
```

### One-line anchors

- "ReAct = Thought-Action-Observation, looped. Yao et al. 2022. Default agent shape in 2026."
- "The Thought is what makes the agent debuggable. Without it, the trace is a black box."
- "Recovery happens in the *next* Thought — Observation feeds reasoning feeds the corrected Action."
- "ReAct's contribution is the interleaving as a feedback loop, not the sum of CoT + tool calling."
- "Modern implementations use structured content blocks (text + tool_use). The parsed-string convention from the original paper is obsolete."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw a 3-iteration ReAct trace from memory: user message at top, three iterations of (assistant turn with Thought + Action) and (user turn with Observation), and a final assistant turn with Thought + Final. Label each block.

✓ Pass: 3 iterations drawn, all three event types labeled per turn, termination shown
✗ Fail: re-read the primary diagram and the Move 2 walkthrough, wait 10 minutes, try again

### Level 2 — Explain it out loud

Explain ReAct to a colleague who has implemented tool calling but hasn't added Thoughts. No notes. Under 90 seconds.

Checkpoints — did you:
- Name the three event types (Thought, Action, Observation)?
- State the loop structure (Thought + Action this turn, Observation next turn, loop until Thought + Final)?
- Name the payoff (debuggability + per-step eval + recovery)?
- Cite the paper (Yao et al. 2022)?

If you skipped any: you described the structure, you didn't argue why it earns its place.

### Level 3 — Apply it to a new scenario

A new feature lands in the planned reincodes AI surface: a "guided tour" feature that takes a user's interest ("I want to understand graph algorithms") and walks them through 3-5 relevant visualizer pages with a summary of each. Design the ReAct trace. What would the Thoughts say at each step? What tools would the model call?

Write the trace (4-6 turns). Then verify: does each Thought *update* based on the previous Observation? If a Thought doesn't reference the prior Observation, the loop has lost its feedback shape.

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff from the Tradeoffs section. Answer in writing: "If I were building `/ai/react-loop` today with the same constraints, would I precompute a single trace or precompute multiple traces and let the reader pick one? Why?"

Reference the actual code:
→ Point to the existing `delayLoop` pattern in the visualizers as the timing inspiration
→ Identify where the `BSelect` component lives (`src/components/ui/`) and how it would wire into the speed control

### Quick check — code reference test

Without opening any files, answer:
- What is the `stop_reason` returned by the API when the model emits a Thought but no Action (finalize)?
- What 2022 paper introduced ReAct?
- What existing reincodes pattern (in the visualizer pages) is shaped like a ReAct loop animation?

Then open the files and verify.

✓ Pass: `end_turn`, Yao et al. 2022, the `delayLoop` step-through pattern
✗ Fail on details: the three load-bearing facts (terminator name, paper citation, codebase analog) are what matter; recover them.
