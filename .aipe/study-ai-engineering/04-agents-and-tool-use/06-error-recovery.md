# Error recovery in agents

**Industry name(s):** Error recovery, agent error handling, tool failure handling, retry-with-reasoning
**Type:** Industry standard

> When a tool fails inside an agent loop, three things can happen — retry, ask the user, or give up. The choice is the model's, not the app's, and the eval discipline that supports it is the load-bearing piece.

**See also:** → [01-agents-vs-chains](01-agents-vs-chains.md) · → [02-tool-calling](02-tool-calling.md) · → [03-react-pattern](03-react-pattern.md) · → [../05-evals-and-observability/01-eval-set-types.md](../05-evals-and-observability/01-eval-set-types.md) · → [../06-production-serving/05-retry-and-circuit-breaker.md](../06-production-serving/05-retry-and-circuit-breaker.md)

---

## Why care

### Move 1 — The grounded scenario

You've shipped an agent. It calls tools, it reasons between them, the ReAct trace is clean. In dev, it works on 95% of test inputs. You ship to production. The 5% that don't work in dev are now 5% of *real users*, and the failure mode is uniform: a tool fails (network timeout on `getCalendarEvents`, 500 from a third-party API, schema-violation on `getRecentTags`) and the agent... doesn't recover. It emits the next turn with no context for the failure, often hallucinating an answer that *would have* been correct if the tool had succeeded. The agent's failure mode in production isn't picking the wrong tool — it's *not knowing what to do when a tool fails*.

### Move 2 — Name the question

That failure has a name — *error recovery*. Not the retry policy at the network layer (that's infrastructure), not the tool's internal error handling (that's the tool's job) — just the question of *what the agent does when a tool returns an error*. Three options: retry the same tool with adjusted args (if the error suggests the args were wrong), ask the user for clarification (if the error suggests the user's request was ambiguous), or finalize with a degraded answer ("I couldn't fetch X, but here's my best guess based on Y"). The decision is the *model's* to make, given the tool result that says it failed. The architectural job is making sure the model *gets* the error signal in a form it can act on.

### Move 3 — Why answering that question matters

**Why you need to answer that question at all:** because tools fail. Networks blip. Third-party APIs rate-limit. Database queries time out. Schemas drift. In production, ~5-15% of tool calls return some kind of failure depending on the tool surface — and if the agent treats all failures as if the tool succeeded with empty data, it hallucinates. The user asked "what's on my calendar" and the calendar tool 500'd; without error recovery, the agent says "nothing on your calendar today" because it interpreted the empty / error result as success. The user gets bad information. With error recovery, the agent says "I couldn't reach your calendar — should I try again, or would you like to tell me what you're looking for?" — and the user gets agency over the recovery path. The eval discipline angle: error recovery has to be in your eval set as deliberate failure cases ("tool X times out — does the agent recover?") or you'll ship to production and discover the recovery is broken on the 5% of calls that actually fail.

### Move 4 — Concrete before/after

Without error recovery (errors silent):

- Tool fails, app returns empty result or "error" string to the model
- Model treats the result as the actual answer ("the calendar is empty today")
- User gets hallucinated answer with no indication of failure
- No eval case for "tool failed, did the agent recover?"
- Production debugging: "user got a wrong answer — was it the model, the tool, or both?"

With error recovery (errors actionable):

- Tool fails, app returns structured error to the model (`{ is_error: true, content: "ERROR: timeout after 5s" }`)
- Model's next Thought reasons about the failure ("the calendar tool timed out; I should retry or ask the user")
- Model picks a recovery action: retry, fallback tool, ask user, or finalize with degraded answer
- Eval set includes failure cases; the agent's recovery behavior is testable
- Production debugging: the trace shows the model's recovery decision; failures localize

### Move 5 — The one-line summary

Error recovery in agents is letting the *model* decide what to do when a tool fails — retry, ask, fall back, or finalize with a degraded answer — by surfacing the failure as a typed tool_result the model can read and reason about. The rest of the file is the recovery shapes and the eval discipline.

---

## How it works

### Move 1 — The mental model

Error recovery is a feedback loop, the same shape as ReAct's Thought-Action-Observation loop, except the Observation is now a *failure signal* rather than a success result. The model's next Thought reasons about the failure (what went wrong, what to try next), the next Action implements that decision (retry, fall back, ask), and the loop continues. If you've used `try { ... } catch (e) { if (e.code === "RATE_LIMIT") retry(); else throw }` in regular code, you've written the conceptual shape — except the `catch` block is "the model decides" and the recovery action is whatever the model emits next. The architectural move is to make failure a *first-class observable* — not an exception that breaks the loop, not a silent empty result, but a structured signal the model can parse and act on.

```
the recovery loop (extends ReAct)

  Thought N:  "I'll call getCalendarEvents"
  Action N:   tool_use(getCalendarEvents)
  Observation N: tool_result(is_error: true, content: "TIMEOUT")
                                  ↑
                                  └── the failure signal
                                      that drives the next Thought

  Thought N+1: "the calendar timed out; let me retry once"
  Action N+1:  tool_use(getCalendarEvents)  ◄── retry
  Observation N+1: tool_result(content: "[events...]")  ◄── success

  Thought N+2: "now I have the data; finalize"
  Final:       "Here's what's on your calendar..."
```

### Move 2 — The layered walkthrough

#### Surfacing the failure as a typed result

The technical thing: when the tool's handler catches an error, it returns a tool_result block with `is_error: true` (Anthropic's API supports this flag) or a structured error content (`{ type: "error", code: "TIMEOUT", message: "..." }` for providers without the flag). The model receives the error as the Observation for that tool call. The bridge from frontend: this is like an HTTP response with a 4xx/5xx status that includes a JSON error body — the client (here, the model) can read the body to understand what happened. Concrete consequence: the error message matters. A generic "ERROR" tells the model nothing; "TIMEOUT after 5s on getCalendarEvents" tells the model enough to choose between retry (timeout might be transient) and fallback (timeout might mean the service is down).

```
tool_result block when the tool fails

  {
    type: "tool_result",
    tool_use_id: "toolu_abc",
    is_error: true,
    content: "TIMEOUT after 5s on getCalendarEvents.
              The service may be temporarily unavailable."
  }
```

#### The four recovery shapes

The technical thing: when the model sees a failure, it has four canonical next moves. *Retry*: emit the same tool_use with the same args, hoping the failure was transient. *Adjusted retry*: emit the same tool_use with different args (the error suggested the original args were wrong). *Fallback*: emit a different tool's tool_use that achieves a similar goal (calendar-fetch failed, try cached-calendar-fetch). *Ask the user*: emit a final text message asking for clarification or permission to proceed. *Degraded finalize*: emit a final text response that acknowledges the failure and provides the best answer possible without the failed tool's data. Modern models pick among these autonomously when given good error signals and reasonable prompting; older models need the recovery shapes spelled out in the system prompt.

```
the four moves (in order of how often each fires)

  1. retry (same args)         "let me try again"
     for transient failures (timeouts, rate limits)

  2. adjusted retry            "different args this time"
     for bad-input failures (schema violation,
     not-found that suggests typo)

  3. fallback to different     "try a related tool"
     tool                      for service-down failures

  4. ask the user              "I can't proceed — could you...?"
     for ambiguity that the model can't resolve

  5. degraded finalize         "I couldn't get X but here's Y"
     when retries failed and no fallback exists
```

#### The retry budget

The technical thing: retries are bounded. The agent loop's max-iteration guard implicitly caps retries (10 max iterations, each retry burns one), but explicit retry budgeting in the system prompt sharpens the behavior. "If a tool fails twice in a row, try a different tool or finalize with a degraded answer" prevents the agent from infinite-retrying a persistently-failing tool. The bridge from frontend: this is the same exponential-backoff-with-cap pattern that distributed systems use, just decided by the model instead of by code. Concrete consequence: without a retry budget, an agent can burn through max iterations on retries of one failing tool and never make progress on the original task. The fix is naming the budget in the system prompt and including retry-cap test cases in the eval set.

```
retry budget in the system prompt

  "If a tool returns an error:
   1. Reason about whether the error suggests
      transient failure (retry once) or persistent
      failure (try a different approach).
   2. Do not retry the same tool more than twice.
   3. After 2 retries, either try a different
      tool or finalize with what you have."
```

#### The eval discipline

The technical thing: error recovery is testable only if your eval set includes deliberate failure cases. The golden set covers happy paths; the *adversarial* / *regression* set covers known failure modes — tool timeout, schema violation, 500 from third party, rate limit hit, ambiguous tool response. For each failure case, the eval encodes the expected recovery: "tool X times out → agent retries once → agent succeeds." If the recovery is wrong (agent finalizes with hallucinated data, agent gives up immediately, agent infinite-retries), the eval flags it. The bridge from frontend: this is integration testing the unhappy paths, except the unhappy paths involve LLM behavior so the eval is rubric-based or LLM-as-judge rather than exact-match. Concrete consequence: without failure-case evals, you ship and discover recovery breakage from production user reports — which is too late.

```
eval set composition for error recovery

  golden set (happy path)
    - tool succeeds, agent finalizes correctly
  
  adversarial set (deliberate failure modes)
    - tool X times out → expected: agent retries
    - tool Y returns 500 → expected: fallback or degraded
    - tool Z returns ambiguous data → expected: ask user
    - tool W's schema violates → expected: retry with fix
  
  regression set (production failures replayed)
    - every production recovery failure becomes a case
```

### Move 3 — The principle

The principle is *the model is the recovery decision-maker, not the app*. The app's job is to faithfully surface the failure as a typed signal; the model's job is to decide what to do. This inversion is what makes the recovery work — the app doesn't have the context to know whether to retry or ask the user, but the model does (it knows the user's intent, the conversation state, the alternatives available). The architectural move is *don't catch and route in the app code; let the failure reach the model and trust the model with the recovery*. This generalizes: anywhere a system has a state machine over fallible operations, the question of "who decides the next step on failure" determines whether the system can adapt or just retry-or-die. Agents that delegate recovery to the model adapt; agents that hardcode recovery in app code can only do what was anticipated at code-write time.

The full picture is below.

---

## Error recovery — diagram

```
┌─ Error recovery loop ───────────────────────────────────────────────┐
│                                                                     │
│   tool call                                                         │
│        │                                                            │
│        ▼                                                            │
│   ┌──────────────────────────┐                                     │
│   │  handler executes        │                                     │
│   └────────┬─────────────────┘                                     │
│            │                                                        │
│   ┌────────┴────────┐                                              │
│   │                 │                                               │
│  success         failure                                            │
│   │                 │                                               │
│   ▼                 ▼                                               │
│ tool_result   ┌──────────────────────────┐                          │
│ (success)     │  app packages failure as │                          │
│   │           │  typed tool_result block │                          │
│   │           │  is_error: true          │                          │
│   │           │  content: "TIMEOUT..."   │                          │
│   │           └────────┬─────────────────┘                         │
│   │                    │                                            │
│   └──────────┬─────────┘                                            │
│              │                                                      │
│              ▼                                                      │
│   ┌──────────────────────────┐                                     │
│   │  model's next turn       │                                     │
│   │   Thought reasons about  │                                     │
│   │   what to do next        │                                     │
│   └────────┬─────────────────┘                                     │
│            │                                                        │
│            ▼                                                        │
│   ┌──────────────────────────────────────┐                         │
│   │  one of five recovery moves          │                         │
│   │                                      │                         │
│   │   1. retry (same args)               │                         │
│   │   2. adjusted retry (new args)       │                         │
│   │   3. fallback (different tool)       │                         │
│   │   4. ask user (text message)         │                         │
│   │   5. degraded finalize               │                         │
│   │                                      │                         │
│   │  bounded by retry budget +           │                         │
│   │  max iterations                      │                         │
│   └──────────────────────────────────────┘                         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**Not yet implemented.** reincodes has no LLM calls, no tools, no agent loops, and therefore no error recovery surface. The closest existing analog is the *graceful-degradation pattern* in the visualizers: pages handle WIP states (e.g. `binary-heap` flagged `wip: true` in `conceptsData.tsx`) by rendering a placeholder rather than crashing. That's the *idea* of degraded finalization — show something useful when the full feature isn't available — but there's no model involved and no recovery decision to make.

The buildable target is below in Project exercises — a `/ai/error-recovery` page that renders a 5-step agent trace where step 3 fails. Three precomputed recovery paths (retry / clarify / give-up) render as three columns; the reader compares the outcomes side by side. A toggle switches between the three paths to see how each plays out from the same failure point.

**Expected file paths** (when built):
- `src/app/ai/error-recovery/page.tsx` — the visualizer
- `src/components/ErrorRecoveryVisualizer/` — trace columns, path toggle, outcome panel, comparison row
- `public/ai/error-recovery/recovery-paths.json` — precomputed: shared steps 1-2, the failure at step 3, then three divergent traces (retry, clarify, give-up)
- `scripts/precompute-error-recovery.ts` — build-time script that runs the agent with deliberate tool-failure injection in three modes and captures the traces

---

## Elaborate

### Where this pattern comes from

Error recovery in agents emerged as a discipline alongside the ReAct pattern in 2023-2024. Early agent implementations (LangChain's first generation) treated tool errors as exceptions that broke the loop — the agent crashed, the app handled it with a generic "something went wrong" response. The shift came when teams started shipping agents to production and realized that 5-15% of tool calls fail in the wild, and "crash on failure" was a much worse UX than "let the model recover." Anthropic's "Building effective agents" essay (December 2024) made the explicit recommendation: surface failures as typed signals, trust the model to decide recovery. The `is_error: true` flag on Anthropic's `tool_result` block landed in the API specifically to support this pattern. By 2025, every modern agent framework (LangGraph, Mastra, AutoGen) had built-in support for error-as-typed-result with the model-as-decision-maker shape.

### The deeper principle

The deeper principle is *delegate decisions to the actor with the most context*. In an agent loop, the model has the most context — the user's intent, the conversation history, the available tools, the prior reasoning. The app has the *least* context — it knows the tool failed but has no signal about what would be best given what the user actually wants. Hardcoding recovery in app code is delegating the decision to the actor with the *least* context, which means the recovery can only handle the failure modes the engineer anticipated at code-write time. Letting the model decide means the recovery can handle failure modes that emerge in production, as long as the failure signal is honest. This generalizes to any system with a fallible action layer and a higher-context decision-maker — give the decision-maker the failure signal in a useful form, and let them decide.

### Where this breaks down

Model-driven error recovery breaks down in three places. First, *unfaithful error messages*. If the app catches a database deadlock and reports it as "TIMEOUT," the model reasons about timeout-shaped recovery (retry) when the real recovery is different (back off the database load). The app has to surface errors honestly. Second, *non-actionable failures*. If the tool fails because of a credential rotation that requires admin intervention, the model can't recover — there's no recovery action available to it. The app needs to detect terminal failures and route them differently. Third, *cost runaway*. A model that picks retry-too-aggressively can burn through max iterations on a persistently-failing tool. Mitigation: retry budget in the system prompt, hard caps on iteration count, and circuit-breaker patterns at the tool layer (see `../06-production-serving/05-retry-and-circuit-breaker.md`).

### What to explore next

- [02-tool-calling](02-tool-calling.md) → tool calling is the substrate; error recovery extends the protocol with `is_error` and typed failure messages
- [03-react-pattern](03-react-pattern.md) → ReAct's Thought-between-Actions is what makes recovery work; the model's reasoning about the failure happens in the Thought
- [../05-evals-and-observability/01-eval-set-types.md](../05-evals-and-observability/01-eval-set-types.md) → adversarial / regression eval sets cover failure recovery; without them the recovery is untested
- [../06-production-serving/05-retry-and-circuit-breaker.md](../06-production-serving/05-retry-and-circuit-breaker.md) → infrastructure-layer retry/backoff/circuit-breaker complements the model-driven recovery at the tool layer

---

## Tradeoffs

### Comparison table — both costs in one frame

```
┌────────────────────┬──────────────────────┬─────────────────────────┐
│ Cost dimension     │ Model-driven         │ App-driven recovery     │
│                    │ recovery             │ (hardcoded in code)     │
├────────────────────┼──────────────────────┼─────────────────────────┤
│ Recovery quality   │ High (model has      │ Bounded by code paths   │
│                    │ user/conv. context)  │ anticipated at write    │
│ Adapts to new      │ Yes (any failure     │ No (needs code change)  │
│ failure modes      │ shape works)         │                         │
│ Latency on         │ +1 iteration         │ Fast (in-code retry)    │
│ recovery           │ (~500ms–1s)          │                         │
│ Tokens on          │ +500–2K per          │ 0 (no extra LLM call)   │
│ recovery           │ recovery iteration   │                         │
│ Implementation     │ Surface error as     │ Try/catch around every  │
│ complexity         │ typed result;        │ tool call; decide       │
│                    │ trust the model      │ recovery per error type │
│ Eval shape         │ Failure cases as     │ Unit tests per error    │
│                    │ rubric / trajectory  │ type                    │
│ Production         │ Trace shows model's  │ Logs show app's         │
│ debugging          │ recovery reasoning   │ exception path          │
│ Failure modes      │ Unfaithful error     │ Unanticipated failure   │
│                    │ messages; cost       │ types not handled       │
│                    │ runaway on retry     │                         │
└────────────────────┴──────────────────────┴─────────────────────────┘
```

### What we'd give up (when planning the visualizer)

The first cost is *constructing the failure scenario*. The visualizer shows three divergent recovery paths from the same failure, which means the precompute has to actually *run* three variants of the agent against the same failure point. The script needs to inject a deterministic tool failure at step 3 in all three runs, then use three different system-prompt variants (retry-eager, clarify-eager, give-up-eager) to elicit different recovery behaviors. ~1 day of script + prompt engineering to get genuinely distinct paths.

The second cost is *displaying divergent traces compactly*. Three columns side-by-side with full Thought-Action-Observation traces gets crowded on smaller screens. The visualizer needs a compact representation — maybe collapsed Thoughts that expand on hover, color-coding by recovery move (red for failure, blue for retry, yellow for clarify) — and a clean comparison row that summarizes the outcome (tokens used, iterations to resolution, whether the agent succeeded). ~half a day of layout work.

The third cost is *making "give up" look honest*. The visualizer has to show that *giving up* is sometimes the right answer — "I couldn't reach the calendar, here's my best guess based on your recent activity" can be more useful than another retry. The pedagogical move is showing the trade-off legibly: retrying succeeds eventually but burns tokens; clarifying gets the user a better answer but adds a turn; giving up is fastest but ships a degraded answer. The comparison row needs to surface this without picking a winner.

### What the alternative would have cost (skipping the visualizer)

If reincodes never builds `/ai/error-recovery`, the cost is zero in the codebase. Error recovery lives in loopd's Phase 4 build items as a concern within each agent path (`[B4A.5]` / `[B4B.5]` / `[B4C.5]` all reference failure mode documentation). Interview answer: "here's how loopd's Path C coaching agent handles tool failures — the agent's system prompt has explicit recovery instructions and the eval set has 5 failure cases."

The cost of *not* building it shows up in interview rounds focused on production agent reliability — when an interviewer asks "show me how your agent handles when a tool fails." Without the visualizer, the candidate is reading the loopd code; with the visualizer, the candidate is pointing at rendered traces and the comparison row.

### The breakpoint

The visualizer earns its place when the candidate is interviewing for roles where production agent reliability is the load-bearing concern — agent platform engineering, customer support agents, anything with 24/7 uptime requirements. For typical LLM-application roles, the verbal answer suffices.

### What wasn't actually a tradeoff

Showing only one recovery path was not a real option. The pedagogical value of the visualizer is the *comparison* — without three paths side-by-side, the visualizer teaches that recovery exists, not how to *pick* among recovery options. The single-path version would be redundant with the ReAct visualizer's trace; the three-path version is what makes this visualizer earn its place separately.

---

## Tech reference (industry pairing)

### Anthropic tool-use with is_error flag

- **Codebase uses:** not yet — the planned `/ai/error-recovery` visualizer would use Anthropic's `is_error: true` flag on `tool_result` blocks as the precompute target. The script's failure-injection layer returns `{ is_error: true, content: "TIMEOUT..." }` for the failing tool call; the model's next turn reasons about the failure.
- **Why it's here:** Anthropic's `is_error` flag is the cleanest API support for the model-driven recovery pattern. The flag tells the model "this result represents a failure, not the actual answer," which is exactly the signal the recovery loop needs.
- **Leading today:** Anthropic Messages API with is_error — `adoption-leading` for production error recovery in agents, 2026.
- **Why it leads:** explicit failure signal at the API level (no need to encode "this is an error" in the result content via convention), works with prompt caching (errored tool calls don't break the cache for the prefix), and the model's instruction-tuning is calibrated to handle is_error=true results well.
- **Runner-up:** OpenAI `tool_call_results` with error content — `adoption-leading` in OpenAI-centric stacks; less explicit (the error has to be conveyed in the result content text) but supports the same pattern via convention.

### LangGraph error edges

- **Codebase uses:** not yet — would be the framework reference if the visualizer ever shows recovery as a state machine. Not needed for the current scope.
- **Why it's here:** LangGraph's graph-structured agents support *error edges* — conditional edges that fire when a node's execution fails — letting the graph route to a recovery node explicitly. The pattern is the structured equivalent of the model-driven recovery: the graph has explicit recovery paths, but the choice between them can still be the model's via a conditional edge that reads the model's last Thought.
- **Leading today:** LangGraph — `innovation-leading` for graph-structured error recovery in agents, 2025-2026.
- **Why it leads:** explicit error-edge concept, retry policies at the node level (with backoff and budget), interruption handling (resume after human intervention).
- **Runner-up:** Inngest / Temporal — `innovation-leading` for workflow-engine-based agent recovery where the recovery persists across sessions and supports human-in-the-loop intervention.

### Promise.allSettled (parallel tool calls + per-tool failure)

- **Codebase uses:** not yet — would be the JavaScript primitive in the visualizer's precompute script when the agent emits multiple parallel tool calls and one fails while others succeed.
- **Why it's here:** when the model emits multiple `tool_use` blocks in one turn (parallel tool calls), the runtime needs to execute all of them and report per-tool success/failure. `Promise.allSettled` returns the result for each promise regardless of which ones rejected, which maps to "execute every tool, report per-tool result with is_error flags as appropriate."
- **Leading today:** `Promise.allSettled` — `adoption-leading` for parallel-with-individual-failure in JavaScript, available since 2020.
- **Why it leads:** the only built-in primitive for "wait for all to settle, report success/failure per item"; `Promise.all` rejects on first failure which would lose per-tool results.
- **Runner-up:** `p-settle` / custom implementations with `try/catch` per promise — `adoption-leading` in older codebases or when more control over the result shape is needed.

---

## Project exercises

### [B-reincodes-error-recovery-viz] Build the error-recovery visualizer

- **Exercise ID:** `[B-reincodes-error-recovery-viz]` — derived from the curriculum's reincodes "interview prep surface" entry and Phase 4 concept `[C4.7]` (error recovery).
- **What to build:** a page at `/ai/error-recovery` that renders a 5-step agent trace where step 3 fails (tool returns `is_error: true` with a TIMEOUT message). The page has three columns side-by-side, each showing the same first two successful steps (shared prefix), then the failure at step 3, then divergent recovery paths: column 1 (retry — model retries the same tool, succeeds, finalizes); column 2 (clarify — model asks the user for permission to try alternative; precomputed user response, agent uses fallback tool); column 3 (give up — model finalizes with degraded answer using only steps 1-2's data). Below the columns, a comparison row shows each path's total tokens, iterations to resolution, and whether the final answer was correct/degraded. A path-highlight toggle lets the reader focus on one column at a time when the side-by-side gets crowded.
- **Why it earns its place:** the visualizer makes the recovery *decision* operable. The reader sees the same failure produce three different traces, compares outcomes (cost, latency, answer quality), and forms intuition about when each recovery shape earns its place. The interview signal is that the candidate built a tool that teaches the model-driven-recovery architectural pattern — not just that recovery exists.
- **Files to touch:** `src/app/ai/error-recovery/page.tsx` (visualizer), `src/components/ErrorRecoveryVisualizer/` (column layout, trace renderer, path toggle, comparison row), `public/ai/error-recovery/recovery-paths.json` (precomputed: shared 2-step prefix, failure at step 3, three divergent recovery traces), `scripts/precompute-error-recovery.ts` (build-time script that runs the agent in three modes with deliberate failure injection at step 3, captures all three traces with token counts). Add a row to `CONCEPT_CATEGORIES` in `src/components/Home/conceptsData.tsx` under a new `ai-engineering` category.
- **Done when:** the page loads at `/reincodes/ai/error-recovery/` in production, three columns render with the shared prefix and divergent paths, the comparison row shows real token counts and outcomes for each path, the path-highlight toggle focuses one column at a time, `next build` passes under `output: "export"`. Build script runs three agent variants against Anthropic API with deterministic failure injection.
- **Estimated effort:** 1.5-2 days. Precompute script (failure injection, three system-prompt variants, trace capture): 1 day. Page + three-column layout + comparison row + toggle: half day. Polish (the trace formatting, the color-coding of retry/clarify/give-up moves, the comparison row's visual weight): half day.

---

## Summary

### Part 1 — concept recap

Error recovery in agents is the model's job, not the app's. When a tool fails, the app surfaces the failure as a typed `tool_result` with `is_error: true` and an informative error message; the model's next Thought reasons about what to do; the model picks one of four recovery moves — retry (same args, transient failure), adjusted retry (new args, bad-input failure), fallback to a different tool (service-down failure), or ask the user / finalize with degraded answer (ambiguous or unrecoverable failure). The architectural payoff is that recovery can adapt to failure modes the engineer didn't anticipate, because the model has the most context for the decision. The cost is per-recovery-iteration tokens (+500-2K per recovery turn) and the discipline of including failure cases in the eval set so the recovery is testable. In this codebase the concept is Case B (no agents in reincodes today); the buildable target is a `/ai/error-recovery` page that shows the same failure producing three divergent recovery paths (retry / clarify / give-up) with a comparison row surfacing token cost, iterations, and outcome quality per path.

### Part 2 — key points to remember

- **The architectural move**: surface the failure as a typed result (`is_error: true`); let the model decide the recovery. Don't catch-and-route in app code.
- **The four moves**: retry, adjusted retry, fallback to different tool, ask the user / degraded finalize.
- **The retry budget**: name it in the system prompt ("max 2 retries before fallback or finalize") to prevent cost runaway.
- **The eval discipline**: adversarial / regression sets cover failure cases. Without them, recovery is untested and ships broken.
- **The reincodes shape**: Case B. Visualizer renders three divergent recovery paths from the same failure point with a comparison row for cost/iterations/outcome.

---

## Interview defense

### What an interviewer is really asking

Behind "how do you handle tool failures in an agent?" the interviewer is testing whether the candidate has shipped an agent to production and discovered the 5-15% failure rate the hard way. A junior answer says "try/catch around the tool call." A senior answer names the model-driven recovery pattern and the typed-error-result mechanism. A staff answer adds the eval discipline (failure cases in the eval set), the retry budget, and the cost-runaway failure mode of unchecked recovery.

### Likely questions

**Q (mid):** What happens when a tool fails inside an agent loop?

A: The app catches the failure in the tool's handler and returns a tool_result block with `is_error: true` and an error message describing what went wrong. The model sees this on its next turn — the Observation is a failure signal rather than a success result. The model's next Thought reasons about the failure (transient or persistent, ambiguous or specific), and its next Action implements a recovery move: retry the same tool, retry with adjusted args, fall back to a different tool, ask the user, or finalize with a degraded answer. The decision is the model's; the app's job is surfacing the failure faithfully.

```
the cycle on failure

  tool fails
        │
        ▼ app packages: tool_result(is_error: true, content: "...")
        │
        ▼ model's next Thought reasons
        │
        ▼ one of: retry / adjusted retry / fallback / ask / finalize
```

**Q (senior):** Why let the model decide the recovery? The app already knows the error type — couldn't we hardcode the retry logic in code?

A: Two reasons. First, the model has more context than the app. The app knows "tool X failed with TIMEOUT" — that's it. The model knows the user's intent, the conversation history, the alternatives available, and what a degraded-but-useful answer might look like. Hardcoding recovery in app code delegates the decision to the actor with the least context, which means the recovery can only handle failure modes the engineer anticipated at code-write time. Second, recovery quality. A hardcoded "retry once on TIMEOUT" gets you 60% of the way there for simple cases. The model can choose between retry / fallback / ask / degraded-finalize based on what would actually be most useful for *this specific user's request*. The cost is real (~500-2K tokens per recovery iteration) but the recovery quality is much higher. The honest framing: hardcode the cheap defensive cases (rate limit → backoff, network timeout → 1 retry); let the model handle the cases that require context.

```
who decides what

  hardcoded in app                model decides
  ──────────────────              ──────────────────
  network blip → retry            tool result is wrong
  rate limit → backoff            shape → adjusted retry
  schema invalid → reject         user intent ambiguous
                                  → ask the user
                                  
                                  service down →
                                  fallback or degraded
                                  finalize
```

**Q (arch):** Your agent is retrying a failing tool forever and burning through max iterations. How do you fix it?

A: Three levers, in order of urgency. First, *retry budget in the system prompt* — name a hard cap explicitly ("if a tool fails twice in a row, try a different tool or finalize"). Most modern models follow this instruction reliably once it's in the system prompt. Second, *circuit breaker at the tool layer* — after N consecutive failures, the tool's handler returns a "this tool is unavailable" error instead of attempting the call; the model sees the unavailability and routes elsewhere. This is the same circuit-breaker pattern as distributed systems, applied to the tool boundary. Third, *retry-loop detection in the runtime* — the agent runtime tracks "same tool called more than N times consecutively" and short-circuits the loop with a "stuck in retry" termination, surfacing the issue back to the user. The third lever is the safety net; the first two are the load-bearing fixes.

```
the three layers

  layer 1: system prompt budget    "max 2 retries"
  layer 2: tool-layer circuit       "tool unavailable after
            breaker                  N failures"
  layer 3: runtime detection        "same call N times →
                                     terminate with stuck-
                                     in-retry status"
```

### The question candidates always dodge

**Q:** Couldn't we just retry once at the network layer and call it a day? Most tool failures are transient anyway.

A: That argument breaks at the second failure type. Network-layer retry handles *infrastructure* failures (TCP timeout, 503 from upstream, transient rate limit) and that's it. Real agents fail at multiple layers: the network *and* the schema *and* the semantic correctness of the result *and* the ambiguity of the user's request. A schema-violation failure (tool returned valid HTTP 200 but with malformed JSON) won't be fixed by network retry. A semantic-correctness failure (tool returned data but the data doesn't answer the question) won't be fixed by network retry. An ambiguous-intent failure (the user's request can be answered two ways, the tool picked the wrong one) won't be fixed by network retry. The model-driven recovery pattern handles all four because the recovery decision can adapt to the *kind* of failure, not just retry-and-pray. Network-layer retry is a *complement*, not a *replacement*: handle the cheap infrastructure cases at the network layer (cheap, fast, in-code), and let the model handle the cases that need context. The candidate who answers "just retry once" is signaling they've only encountered infrastructure failures; the right answer names the failure taxonomy and gives each layer its lever.

```
the failure taxonomy

  failure type        network retry?    model recovery?
  ─────────────────   ─────────────     ────────────────
  network blip        yes (cheap)       no (overkill)
  rate limit          yes (with         yes (if persistent)
                      backoff)
  schema violation    no                yes (adjusted retry)
  semantic wrong      no                yes (clarify or
  answer                                fallback)
  ambiguous intent    no                yes (ask user)
```

### One-line anchors

- "Surface the failure as a typed result. Let the model decide the recovery. The app's job is honest signaling."
- "Five recovery moves: retry, adjusted retry, fallback, ask the user, degraded finalize. The model picks based on the error shape."
- "Retry budgets in the system prompt prevent cost runaway. Circuit breakers at the tool layer prevent infinite retry."
- "Error recovery is untested unless your eval set has failure cases. Adversarial + regression suites cover this."
- "Network retry is a complement, not a replacement. Cheap infrastructure cases hardcoded; context-needing cases delegated to the model."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw the error-recovery loop from memory: tool call → success/failure split → app packages failure as typed result → model's next Thought → one of five recovery moves. Annotate each move with when it fires.

✓ Pass: loop drawn, five recovery moves labeled, retry-budget mention
✗ Fail: re-read the primary diagram and the walkthrough, wait 10 minutes, try again

### Level 2 — Explain it out loud

Explain error recovery to a colleague who has shipped an agent that crashes on tool failures. No notes. Under 90 seconds.

Checkpoints — did you:
- Name the model-driven recovery pattern (not app-driven)?
- List the four/five recovery moves?
- Mention the eval discipline (failure cases in adversarial/regression sets)?
- Reference the buildable target (`/ai/error-recovery`) as how you'd demonstrate the concept?

If you skipped any: you described error handling, you didn't argue the architecture.

### Level 3 — Apply it to a new scenario

A new feature lands in the planned reincodes AI surface: a "DSA tutor" agent that calls a `getConceptDefinition`, `getRelatedVisualizers`, and `getCodeExample` tool to answer user questions. The `getCodeExample` tool occasionally fails because it depends on a third-party syntax-highlighter API. Design the recovery for this failure. What's in the system prompt? What's the expected recovery move? What's in the eval set?

Write the recovery design (3-5 paragraphs). Then verify: does your system prompt name a retry budget? Does your eval set include the specific failure case for `getCodeExample` timeout? Does the recovery have a fallback (e.g. plain-text code) for terminal failures?

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff from the Tradeoffs section. Answer in writing: "If I were building `/ai/error-recovery` today with the same constraints, would I precompute three recovery paths (retry/clarify/give-up) or four (adding adjusted-retry)? Why?"

Reference the actual code:
→ Point to `next.config.ts` for the static-export constraint that bounds the JSON ship size
→ Identify what would shift if the fourth path landed (~33% more JSON, ~33% more API spend, fourth column squeeze on small screens)

### Quick check — code reference test

Without opening any files, answer:
- What Anthropic API flag marks a tool result as a failure?
- What's the typical retry-budget cap in production agent system prompts?
- What pattern in the existing reincodes visualizers is conceptually shaped like graceful degradation (showing something useful when the full feature isn't available)?

Then open the files and verify.

✓ Pass: `is_error: true`, ~2 retries, the WIP-state placeholders (e.g. `binary-heap` flagged `wip: true` in `conceptsData.tsx`)
✗ Fail on details: the API flag and the retry-budget number are what matter; recover them.
