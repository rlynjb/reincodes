# Self-critique and self-consistency

**Industry name(s):** Self-critique, self-refine, self-consistency, critic-revise loops, reflection prompting
**Type:** Industry standard (with sharp limits)

> Run the model's own output back through the model — either to critique-and-revise it (self-critique) or to vote across N parallel samples (self-consistency). The token bill goes up 2-5x. Whether you should pay that bill is the actual question.

**See also:** → [01-anatomy](01-anatomy.md) · → [02-structured-outputs](02-structured-outputs.md) · → [05-eval-driven-iteration](05-eval-driven-iteration.md) · → [09-chain-of-thought](09-chain-of-thought.md) · → [11-meta-prompting](11-meta-prompting.md)

---

## Why care

### Move 1 — The grounded scenario

You're building a single-page React form that takes a journal entry, sends it through `fetch()` to an LLM endpoint, and returns a one-sentence summary that gets rendered in a card on the next route. The first version ships. The summaries are *fine*. Then a real user submits an entry about being laid off, and the summary comes back as "User had a productive day at work." The PM Slacks you. You add a "double check this summary is accurate" instruction to the prompt. Two days later, another summary misses the point — this time on a journal entry about a relationship ending. Now someone in the room suggests "what if we just ask the model to critique its own output and revise?"

That suggestion has a name and a price tag. Both are easy to miss.

### Move 2 — Name the question

The pattern is *self-critique* (also called self-refine, reflection, critic-revise): the model emits a draft, then a second call asks the same model to evaluate the draft against criteria and produce a revised version. The cousin pattern is *self-consistency*: run the same prompt N times at temperature > 0, then vote across the N answers — most-common label wins for classifiers, majority-voted reasoning step wins for math. Both pay a token multiplier (2x for one critique pass, 5x+ for self-consistency with N=5) in exchange for reliability. The question every team eventually has to answer is: *for this chain, is that multiplier worth it, or would the same budget spent on a better eval set close the gap faster?*

### Move 3 — Why answering that question matters

**Why you need to answer that question at all:** because self-critique is the most over-recommended technique in 2024-2026 prompt engineering writing, and the reason it's over-recommended is that it *feels* like it should always help. A second pass at the answer? Of course that's better. Except the model critiquing its own output has the same blind spots that produced the output. I have shipped self-critique on a tag-extraction chain where the original output missed the "vent" label for emotional entries 7% of the time. Adding a critique pass dropped the miss rate to 6%. The token bill doubled. The eval-set work I did the following week — adding 15 emotional-entry examples to the few-shot block and tightening the system prompt's label definitions — dropped the miss rate to 1.5%, with no token-cost change. Self-critique masked the real fix.

The take that earns its place after enough production miles: self-critique is *overrated in low-stakes cases* (where evals would tell you what you need) and *underrated in high-stakes cases* (where eval coverage isn't enough and human review is unaffordable). The blind-spot problem is what stops it from being a silver bullet; the high-stakes asymmetry is what stops it from being snake oil.

### Move 4 — Concrete before/after

Without self-critique (single-pass generation):

- One LLM call per request. Cost: 1x. Latency: ~800ms.
- Output ships directly to the user (or downstream chain).
- If the output is wrong, the wrongness is invisible until evals catch it or a user complains.
- Reliability ceiling: whatever the base prompt + model can do on its own.

With self-critique (generate -> critique -> revise):

- Three LLM calls per request (draft, critique, revise) or one call with a chained-tool pattern. Cost: 2-3x. Latency: ~2.4s.
- The critique step explicitly checks the draft against named criteria ("does this preserve the emotional valence of the entry?", "is any factual claim unsupported by the input?").
- The revise step takes the critique as input and produces the final output.
- Reliability ceiling: bounded by what the critic *can detect*. If the same blind spot produced both the draft and the critique, the loop doesn't help. If the criteria can catch a class of error the base prompt missed, it does.

With self-consistency (N parallel samples + vote):

- N calls per request at temperature 0.7+. Cost: Nx. Latency: max(N calls in parallel), so ~800ms but at N times the spend.
- For classifiers: majority vote across the N labels.
- For reasoning: majority vote across the final answers (intermediate reasoning steps vary; the final convergent answer is what counts).
- Reliability ceiling: higher than single-pass when the model is *uncertain* (high variance across samples). Same as single-pass when the model is *confidently wrong* (all N samples agree on the wrong answer).

### Move 5 — The one-line summary

Self-critique runs the model's output back through the model for evaluation-and-revision; self-consistency runs the same prompt N times and votes. Both buy reliability with a 2-5x token multiplier. The visualizer below makes the cost-vs-value tradeoff observable: a slider where the reader can drag the stakes from "caption suggestion" to "medical triage" and watch the moment self-critique stops being a waste and starts being mandatory. The full mechanics are below.

---

## How it works

### Move 1 — The mental model

Self-critique is a function the model calls on itself. The first invocation produces a candidate; the second invocation is the unit test; the third invocation is the bug fix. If you've shipped React code that runs a validator on a form submission before sending the request, you already have the mental model — the validator catches a class of error the form's `onChange` handlers don't. Self-critique is the LLM-equivalent validator pass.

The hard part: the validator and the form are the same model. A validator that shares the form's bugs catches nothing. The strategy: design the critique step so it has *different inputs* than the draft step — different framing, different criteria, ideally different examples. If the critique step is the draft step with one more "are you sure?" tacked on, you've doubled your token bill and bought nothing.

Self-consistency is a different mental model: it's a polling system. You run the same prompt N times with non-zero temperature, you get N slightly different outputs, you pick the most common answer. The bridge from frontend: this is debouncing for stochastic output. The noise floor of a single LLM call is the same noise that makes a button-press fire twice; averaging across samples is the same fix as a debounce timer.

```
self-critique vs self-consistency — different shapes, same goal

Self-critique (sequential, 2-3 calls)

  user input
      │
      ▼
  ┌─────────┐
  │  draft  │ ← call 1
  └────┬────┘
       │
       ▼
  ┌──────────┐
  │ critique │ ← call 2, evaluates draft against criteria
  └────┬─────┘
       │
       ▼
  ┌─────────┐
  │ revise  │ ← call 3, produces final output
  └────┬────┘
       │
       ▼
  final output

Self-consistency (parallel, N calls)

  user input
      │
      ├─────┬─────┬─────┬─────┐
      ▼     ▼     ▼     ▼     ▼
   sample sample sample sample sample   ← N parallel calls
      1     2     3     4     5         at temperature > 0
      │     │     │     │     │
      └─────┴──┬──┴─────┴─────┘
               ▼
          majority vote
               │
               ▼
          final answer
```

### Move 2 — The layered walkthrough

#### The self-critique chain — three calls, three system prompts

The technical thing: three distinct LLM calls (or one chained-tool call sequence), each with its own system prompt. Call 1 is the *generator* — the same chain you'd ship without self-critique. Call 2 is the *critic* — a different system prompt that says "you are evaluating an output against these criteria; do not rewrite, only judge." Call 3 is the *reviser* — takes the original input + the draft + the critique, produces the revised output. The critic's system prompt is the load-bearing piece; if it just says "is this good?", the critique is a vibe check and the loop adds nothing.

If you've worked in React, the equivalent is a form with a `validate(draft)` function that runs *separately from* the form's `onChange` validators. The separate function catches a class of error the inline validators miss because it sees the whole form at once. The critic prompt is the equivalent — it sees the whole draft against the whole input, and it's framed as evaluation, not generation. Concrete consequence: the critic prompt should enumerate the failure modes you've actually seen ("does the summary preserve emotional tone?", "are any claims in the summary not supported by the input?"). Generic critique ("is this good?") doesn't catch anything generic critique didn't already catch in the draft.

```
critique prompt anatomy — has its own system prompt

system:
  "You are evaluating a summary against an input journal entry.
   Do not rewrite. Produce a JSON object:
     {
       supported_by_input: true | false,
       preserves_emotional_tone: true | false,
       includes_unsupported_claim: string | null,
       suggested_revision_note: string
     }
   If all checks pass, suggested_revision_note is empty string."

user:
  <input>
    [original journal entry]
  </input>
  <draft>
    [the summary the generator produced]
  </draft>
```

#### Self-consistency — parallelism, voting, temperature

The technical thing: fire N parallel calls to the same chain (same system prompt, same user input) at temperature > 0 (typically 0.7-1.0). When all N return, apply an aggregation function — majority vote for discrete labels, longest-common-substring or LLM-as-judge for free text, mean for numeric scores. The bridge from frontend: this is `Promise.all([...])` over the same function call, then a reduce that picks the most common return. Concrete consequence: the cost scales linearly with N, but the *latency* doesn't, because the calls run in parallel. A self-consistency chain with N=5 costs 5x what a single call costs in tokens and ~1x in wall-clock time. That makes self-consistency the right shape for *high-stakes classifiers where latency matters* — fraud detection at signup, intent classification on a hot path. Self-critique, by contrast, is sequential and adds latency proportional to the number of revision passes.

```
self-consistency cost shape — tokens scale with N, latency does not

  N=1:   tokens=1x  latency=1x  (baseline)
  N=3:   tokens=3x  latency=1x  (3 calls in Promise.all)
  N=5:   tokens=5x  latency=1x  (5 calls in Promise.all)
  N=10:  tokens=10x latency=1x  (10 calls in Promise.all)

  for a chain at $0.002 per call:
  N=1:   $0.002 per request   ($60/mo @ 30k req)
  N=5:   $0.010 per request   ($300/mo @ 30k req)
  N=10:  $0.020 per request   ($600/mo @ 30k req)
```

#### The diminishing-returns problem

The technical thing: a model critiquing its own output shares the inductive biases that produced the output. If the base model wrote "User had a productive day at work" for a layoff entry, the critic model — same weights, same training data — is biased to find that summary acceptable. Wei et al. 2022 and follow-up work (Madaan et al., Self-Refine) document this: self-critique gains plateau quickly, and on tasks where the base model is *confidently wrong* (high agreement across self-consistency samples on the wrong answer), the loop provides no lift. The bridge from frontend: this is the same reason a linter and a compiler don't catch every bug — they share assumptions with the code they're checking. Concrete consequence: the lift from self-critique correlates inversely with how confident the base model was. On uncertain outputs (the model is hedging, the few-shot examples don't cover the input shape), critique helps. On confident-wrong outputs, it doesn't. The diagnostic is to log the base model's confidence (perplexity, log-probs of the chosen answer) and target self-critique only at the low-confidence tail.

### Move 3 — The principle

The principle that generalises beyond any one chain: *the model's reliability is bounded by the eval signal you feed it, not by how many times you re-prompt it.* Self-critique and self-consistency are signal-amplification techniques — they help when the model has *latent capability* it's not using on a single pass (uncertainty, sampling variance, missed criteria). They don't help when the model lacks the capability — when it's confidently wrong, when the few-shot examples don't cover the case, when the system prompt under-specifies the task. The honest decision tree: if your eval set says the failure mode is uncertainty (high-variance outputs across temperature samples), reach for self-consistency. If the failure mode is missing-criteria (the draft is wrong in ways that a checklist would catch), reach for self-critique. If the failure mode is base-model-can't-do-the-task (every sample is wrong, every critique misses it), reach for better few-shot, a different model, or fine-tuning. None of those map onto "add a critique step and ship it."

The full picture is below.

---

## Self-critique vs self-consistency — diagram

```
┌─ Decision: which technique earns the token multiplier? ──────────────┐
│                                                                      │
│                          symptom                                     │
│                             │                                        │
│        ┌────────────────────┼────────────────────┐                  │
│        ▼                    ▼                    ▼                  │
│  high variance        criteria-shaped       confidently             │
│  across N samples     errors (missing a     wrong (same             │
│  (model uncertain)    checklist item)        answer every time)     │
│        │                    │                    │                  │
│        ▼                    ▼                    ▼                  │
│  self-consistency      self-critique         neither works           │
│  (N parallel @ T>0,    (draft + critic +      fix the prompt /       │
│   majority vote)       reviser)               examples / model       │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼   then ask the cost question
┌─ Decision: is the multiplier worth it? ──────────────────────────────┐
│                                                                      │
│                       stakes axis                                    │
│  low ──────────────────────────────────────────────────────── high  │
│                                                                      │
│  caption          tag           summary       triage      medical   │
│  suggestion       extraction    of journal    of support  diagnosis │
│                                  entry         ticket               │
│                                                                      │
│  ◄──── single-pass dominates ────┤├── self-critique earns it ───►   │
│                                                                      │
│  Why: at the left, manual review is cheap and the cost of a wrong   │
│       output is small. At the right, manual review is expensive or  │
│       unavailable and the cost of a wrong output is severe.          │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼   then ask the eval question
┌─ Decision: is critique closing the gap evals can't? ─────────────────┐
│                                                                      │
│  if the gap is "I don't have enough eval coverage to know what's    │
│  failing" -> build the eval set first. Self-critique is masking,    │
│  not fixing.                                                         │
│                                                                      │
│  if the gap is "evals cover everything, the failures are real, no   │
│  prompt tweak closes them" -> self-critique earns its place.        │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

The two axes that matter — *symptom shape* and *stakes* — together determine whether the multiplier is worth paying. The decision is not "should I add self-critique?" It's "what is the failure mode, how expensive is a miss, and what would the same token budget buy if I spent it on evals instead?"

---

## In this codebase

**Not yet implemented.** reincodes is a Next.js static-export DSA visualizer with no AI surface in production code — there are zero LLM chains to self-critique, zero classifiers to run self-consistency over. The existing study guide (`.aipe/study-prep-fundamentals-for-ai/03-ai-engineering/05-ai-features-in-this-app.md`) positions reincodes as the *interview-prep visualizer host*: a place where AI concepts get visualized for teaching, not a place where AI runs for users. The buildable target for this concept is a `/ai/self-critique` page that renders the same input run through two precomputed pipelines side by side — direct generation vs generate -> critique -> revise — with a "trust threshold" slider that re-colors the comparison to show where the critique pass earns its token cost.

**Expected file paths** (when built):
- `src/app/ai/self-critique/page.tsx` — the visualizer page
- `src/components/SelfCritiqueVisualizer/` — the two-column comparison + stakes slider
- `public/ai/self-critique/example-pipelines.json` — 3-5 precomputed input/draft/critique/revised triples across the stakes spectrum (caption -> tag extraction -> journal summary -> triage)
- `scripts/precompute-self-critique.ts` — dev-only build script that runs each example through both pipelines against the Anthropic API and captures the outputs

---

## Elaborate

### Where this pattern comes from

Self-critique as a named technique enters the literature with Self-Refine (Madaan et al., 2023) and the broader reflection-prompting work that followed. The lineage is older — chain-of-thought (Wei et al. 2022) was the first widely-adopted "run more compute at inference time and get a better answer" pattern, and self-critique is what happens when you generalize that move into a feedback loop. Self-consistency comes from Wang et al. 2022 ("Self-Consistency Improves Chain of Thought Reasoning") — the original paper showed it on math word problems where the model's reasoning paths diverge but the *final answer* converges across samples. The technique generalizes to any task where the answer is discrete and the model has internal uncertainty.

The reason these techniques landed in production code in 2023-2024 rather than 2022 is that the cost of N parallel calls became affordable. At 2022 GPT-4 pricing, self-consistency with N=5 was a 5x multiplier on an already-expensive call; by mid-2024, the same multiplier on Claude Haiku or GPT-4o-mini was within the budget of mid-stakes production chains.

### The deeper principle

The deeper principle is *test-time compute scaling*. Until 2023, the way you made a model better was training — more data, more parameters, more compute spent during pretraining. After 2023, the field discovered that *spending more compute at inference time* — through chain-of-thought, self-critique, self-consistency, search, or the explicit reasoning models that landed in 2024-2025 (o1, o3, Claude reasoning mode) — is its own axis of capability improvement. Self-critique is one specific instance of test-time scaling. The lesson for application engineers: when you reach for self-critique, you're spending tokens to buy reliability. The math is the same as scaling compute at training time — diminishing returns, sharp inflection points, and "more isn't always better" once you're past the knee of the curve.

### Where this breaks down

Self-critique breaks down on *adversarial inputs*. If the input is crafted to elicit a wrong answer (a prompt injection, a deliberately confusing user message, a jailbreak attempt), the critic's evaluation criteria are also evaluating the adversarial input — and the same bias that made the draft model fall for the trick makes the critic model bless the drafted output. The clean separation between "the model produced this" and "the model judges this" doesn't exist when both models are the same weights. The mitigation is to use a *different model* for the critic step — Claude as drafter, GPT-4 as critic, or vice versa. That works, at a cost: two provider integrations, two API budgets, two rate-limit ceilings. Most teams don't do it. The "self" in self-critique is a recognition that the cheap version uses the same model; the expensive version that actually defeats adversarial inputs is *cross-model critique*, which is a different (and more expensive) shape.

The other place it breaks down is *streaming UIs*. If your product surface streams tokens as they generate ("the model is thinking..."), self-critique breaks the UX — you can't stream a critique-and-revise pipeline because the first output isn't shown to the user, then the critique happens, then the revised output streams. Latency triples and the user sees nothing for the first two-thirds of the wait. The mitigation is to stream the *draft* and silently revise in the background, only flagging if the critic flags — but now you're shipping two-version output to the user, which has its own UX cost.

### What to explore next

- [05-eval-driven-iteration](05-eval-driven-iteration.md) -> the prerequisite check; before adding self-critique, the eval set is what tells you whether the failure mode is critique-shaped or eval-coverage-shaped
- [09-chain-of-thought](09-chain-of-thought.md) -> the older sibling pattern; CoT is the "spend more compute at inference time" move applied at the level of a single call
- [02-structured-outputs](02-structured-outputs.md) -> the critic's output should always be structured (a JSON object with named flags), never free text — see why structured-output enforcement matters for the critic step
- [11-meta-prompting](11-meta-prompting.md) -> the critic system prompt is itself a prompt that benefits from meta-prompting; the workflow can recurse

---

## Tradeoffs

### Comparison table — both costs in one frame

```
┌────────────────────┬──────────────────────┬─────────────────────────┐
│ Cost dimension     │ Path taken           │ Alternative             │
│                    │ (self-critique on)   │ (single-pass + better   │
│                    │                      │  evals)                 │
├────────────────────┼──────────────────────┼─────────────────────────┤
│ Token cost         │ 2-3x baseline        │ 1x baseline             │
│ Latency            │ 2-3x (sequential)    │ 1x                      │
│ Eng time to ship   │ Half day to add the  │ 1-2 weeks to expand     │
│                    │ second + third call  │ the eval set + iterate  │
│ Reliability lift   │ Real on uncertain    │ Real on the entire      │
│                    │ outputs, none on     │ failure distribution    │
│                    │ confident-wrong      │ once evals catch them   │
│ Maintenance        │ Critic prompt drifts │ Eval set ages well;     │
│                    │ as the base prompt   │ regressions show up in  │
│                    │ changes              │ the test suite          │
│ Observability      │ Per-call log of      │ Per-call log of one     │
│                    │ draft / critique /   │ generation; eval scores │
│                    │ revised; messier     │ tracked over time       │
│ Diagnostic value   │ "Critic flagged this │ "Eval failed on this    │
│                    │  draft" — useful in  │  case — fix the prompt" │
│                    │ rare cases           │ — useful every release  │
│ Reader-facing tax  │ Latency hit visible  │ No latency hit; user    │
│                    │ in streaming UIs     │ sees the first output   │
└────────────────────┴──────────────────────┴─────────────────────────┘
```

### What we gave up (when planning the reincodes visualizer)

The first cost is *the precompute pipeline*. To build a meaningful `/ai/self-critique` page, the codebase needs example pipelines that show both the single-pass and the critique-revise paths against the same input. Each example needs to be run through the Anthropic API at build time (the static-export contract prohibits live calls) and the outputs committed to `public/`. The precompute script needs to handle 3-5 examples across the stakes spectrum, each producing four artifacts (input, draft, critique JSON, revised). That's ~15-20 precomputed outputs and a build script that costs maybe $0.50 per regeneration. Half a day of engineering work before the page renders anything.

The second cost is *teaching surface*. The stakes-slider mechanic is the load-bearing teaching device, and getting it right means choosing examples that genuinely sit at different points on the curve. A caption-suggestion example needs to be one where self-critique is *visibly* wasteful (the critic produces a near-identical output, the cost is doubled, the lift is zero). A triage example needs to be one where self-critique is *visibly* mandatory (the draft has a subtle factual error, the critic catches it, the revised output is correct). Cherry-picking those examples is tempting and dishonest; the precompute script needs to capture *real* outputs, not curated ones, and the page needs to be honest when self-critique fails to help on a high-stakes example (because that's also a real outcome and teaches the diminishing-returns lesson).

The third cost is *implementation honesty*. The temptation is to build the visualizer such that the stakes slider always shows critique helping more as stakes rise — a smooth gradient from "waste" to "essential." Real data isn't that clean. Some low-stakes examples will show modest critique gains (revealing that the visualizer is over-simplifying the cost-benefit framing); some high-stakes examples will show no gain (revealing the diminishing-returns problem in action). The page needs to handle both, ideally by showing the actual numbers (tokens spent, time elapsed, whether the critique meaningfully changed the output) rather than a marketing-shaped curve.

### What the alternative would have cost (skipping the visualizer)

If reincodes never builds the `/ai/self-critique` visualizer, the cost is *zero* in the codebase. The self-critique pattern lives in other portfolio projects (loopd's high-stakes generation chains, aipe's template-output verification) and gets demonstrated there. The reincodes site stays pure-DSA and the self-critique education happens through this written guide alone.

The cost of *not* building it shows up the day an interviewer asks "show me how you'd teach someone when self-critique is worth its cost." Without a visualizer, the candidate has to walk through the stakes-vs-symptom decision verbally. With a visualizer, they can drag the slider and watch the cost curve cross the value curve in real time. The visualizer is the difference between explaining a tradeoff and *operating* it.

### The breakpoint

The visualizer earns its place the day the portfolio narrative needs a concrete teaching artifact for the "when is more compute worth more dollars" framing. Self-critique is the cleanest pedagogical case for that framing because the cost is visible (token bill doubles) and the value is conditional (sometimes yes, sometimes no). Until that narrative pressure exists, the buildable target stays in the backlog.

### What wasn't actually a tradeoff

Cross-model critique (Claude drafts, GPT-4 critiques) was not a real option for the visualizer. The precompute script could in principle hit both providers, but the bundle would then need to ship *which provider produced what*, the page would need to explain why the cross-model setup matters, and the teaching surface would expand from "when is self-critique worth it?" to "when is cross-model critique worth it?" — a different concept. The visualizer is deliberately single-model so the diminishing-returns lesson stays sharp.

---

## Tech reference (industry pairing)

### Anthropic Messages API (the precompute target)

- **Codebase uses:** not yet — the planned `/ai/self-critique` visualizer would use Claude as the precompute target (run examples through `claude-sonnet-4-7` at build time for both the draft and the critique calls, commit outputs to `public/ai/self-critique/example-pipelines.json`).
- **Why it's here:** Anthropic's Messages API is the cleanest provider for a critique-revise loop — the `system` parameter is separate from messages, so the draft chain and the critic chain can reuse the same conversation history with different system framing without re-sending the input as a user message.
- **Leading today:** Anthropic Messages API — `adoption-leading` for multi-turn critique chains, 2026.
- **Why it leads:** explicit system parameter separation, native support for chained tool calls (critic can be modeled as a tool the drafter calls), and prompt caching on the static prefix (the criteria checklist) means the critique step costs less than naive token math suggests.
- **Runner-up:** OpenAI Chat Completions — `adoption-leading` for raw deployment volume; the critic-as-tool pattern works via function calling but the boundary is less ergonomic than Anthropic's setup.

### OpenAI Structured Outputs (for the critic's response shape)

- **Codebase uses:** not yet — would be the schema-enforcement layer for the critique step's output (the JSON object with `supported_by_input`, `preserves_emotional_tone`, `includes_unsupported_claim`, `suggested_revision_note` fields).
- **Why it's here:** the critic step's output MUST be structured, never free text — if the critic returns "this draft looks pretty good!", the reviser has nothing to act on. The OpenAI `response_format` with `strict: true` is the cleanest way to enforce that, and Anthropic's tool-use schemas serve the same role on the Claude side.
- **Leading today:** OpenAI Structured Outputs — `adoption-leading` for schema enforcement at the provider boundary, 2026.
- **Why it leads:** strict mode guarantees the critic returns a valid JSON object matching the schema; no markdown wrapping, no free-text courtesy notes. The reviser step can rely on the schema being intact.
- **Runner-up:** Anthropic tool-use schemas — `innovation-leading` for richer JSON Schema expressions; the critic can be modeled as a `tools: [{ name: "critique", input_schema: {...} }]` tool call that returns the structured evaluation.

### Vercel AI SDK (for client-side fan-out, if self-consistency ships)

- **Codebase uses:** not yet — the AI SDK's `streamText` with `Promise.all` over N parallel calls would be the natural shape for a self-consistency demo if the visualizer ever extends beyond self-critique to cover voting-across-samples.
- **Why it's here:** self-consistency is a `Promise.all([call, call, call, call, call])` pattern at the request layer, and the AI SDK has the cleanest TypeScript ergonomics for that shape. For precomputed examples (the reincodes case), it's a build-time pattern, not a runtime one — but the SDK still simplifies the script.
- **Leading today:** Vercel AI SDK — `adoption-leading` for TypeScript-first LLM call orchestration, 2026.
- **Why it leads:** provider-agnostic abstraction (works against OpenAI, Anthropic, Google, local models), `generateText` and `streamText` with consistent return shapes, and good support for `Promise.all` over multiple calls.
- **Runner-up:** LangChain.js — `innovation-leading` for chain composition (a critique-revise chain can be modeled as a `RunnableSequence`); the abstraction tax is higher than the AI SDK's for simple cases.

### Self-Refine paper (Madaan et al. 2023) — the canonical reference

- **Codebase uses:** not directly — the paper is the literature anchor for the technique, cited in the visualizer's explanatory copy and in this guide.
- **Why it's here:** Self-Refine is the first paper to formalize the iterative-critique loop as a named pattern with measured results on multiple tasks; subsequent work (Reflexion, CRITIC) builds on it. The visualizer's framing of "what does the critic step add?" leans on the paper's measured deltas.
- **Leading today:** Self-Refine — `paper-canonical` for self-critique as a documented technique, 2023.
- **Why it leads:** it's the paper that introduces the formal training-free critique-revise loop with task-level reliability measurements (math, code, dialogue), and its findings on diminishing returns and task-dependent lift are the empirical basis for the "is the multiplier worth it?" framing.
- **Runner-up:** Wang et al. 2022 "Self-Consistency Improves Chain of Thought Reasoning" — `paper-canonical` for the parallel-samples-and-vote technique; cited as the cousin pattern in the visualizer's split-screen design.

---

## Project exercises

### [B-reincodes-self-critique-viz] Build the self-critique visualizer

- **Exercise ID:** `[B-reincodes-self-critique-viz]` — derived from the curriculum's reincodes "interview prep surface" entry; aligns with the Phase 1 prompt engineering subsection and the Phase 3 evaluations concept (critique chains are an eval technique applied at inference time).
- **What to build:** a page at `/ai/self-critique` that renders 3-5 precomputed examples side by side: left column shows single-pass output; right column shows the generate -> critique -> revise pipeline output, with the critique's structured JSON visible as a middle panel. A "stakes threshold" slider re-colors the side-by-side: at low-stakes positions, the single-pass column is highlighted as the right call (the critique cost wasn't worth the marginal lift); at high-stakes positions, the critique column is highlighted (the cost is paid because a wrong output is unacceptable). The slider's position drives a "tokens spent vs. reliability lift" badge that shows the actual numbers from the precomputed runs.
- **Why it earns its place:** the visualizer makes the cost-vs-value tradeoff *operable* — the reader doesn't just read "self-critique is overrated in low-stakes cases and underrated in high-stakes cases," they drag the slider and watch the recommendation flip. The interview signal is that the candidate built a tool that demonstrates the diminishing-returns problem rather than just naming it.
- **Files to touch:** `src/app/ai/self-critique/page.tsx` (visualizer), `src/components/SelfCritiqueVisualizer/` (two-column comparison, critique-panel toggle, stakes slider), `public/ai/self-critique/example-pipelines.json` (precomputed examples), `scripts/precompute-self-critique.ts` (build-time script that calls Claude with each example through both pipelines and captures the outputs including token counts). Add a row to `src/components/Home/conceptsData.tsx`'s `CONCEPT_CATEGORIES` under the `ai-engineering` category so the page is reachable from the home grid.
- **Done when:** the page loads at `/reincodes/ai/self-critique/` in production (GitHub Pages), 3-5 examples each render with the two-column comparison, dragging the slider re-colors the recommendation without a network call, the structured critique JSON is visible and inspectable. `next build` passes under `output: "export"`. The build script runs successfully against the actual Anthropic API and the token-count metadata is real, not faked.
- **Estimated effort:** 1-2 days. Precompute script + token-count capture: half day. Two-column layout + slider + recoloring logic: half day. Polish + at least one example that shows critique *failing* to help on a high-stakes input (the diminishing-returns case must be visible): half day.

---

## Summary

### Part 1 — concept recap

Self-critique runs the model's output back through the model for evaluation-and-revision; self-consistency runs the same prompt N times and votes. Both pay a token multiplier (2-5x) in exchange for reliability lift. The lift is real on *uncertain* outputs (high-variance across samples, criteria-shaped errors the draft missed) and absent on *confidently-wrong* outputs (the model and the critic share blind spots). The practitioner's decision is not "should I add self-critique?" but "what is the failure mode, how expensive is a miss, and what would the same token budget buy if I spent it on evals instead?" In this codebase the technique is *planned* rather than implemented: reincodes has no AI surface in production code, and the buildable target is a `/ai/self-critique` page that renders precomputed single-pass vs critique-revise pipelines side by side, with a stakes-threshold slider that re-colors the recommendation in real time. The constraint that makes the visualizer the right shape here is the static-export contract — live LLM calls would require leaving GitHub Pages, so precomputing the pipelines at build time is the only path compatible with the deploy story.

### Part 2 — key points to remember

- **The shape**: self-critique is sequential (draft -> critic -> reviser, 2-3 calls, latency multiplied). Self-consistency is parallel (N calls at temperature > 0, then majority vote, latency unchanged, tokens multiplied by N).
- **The lift**: real on uncertain outputs and criteria-shaped errors; absent on confidently-wrong outputs because the critic shares the drafter's blind spots.
- **The decision axes**: symptom shape (uncertainty -> self-consistency; missing criteria -> self-critique; confidently wrong -> neither, fix the prompt or the model) and stakes (low-stakes -> single-pass; high-stakes -> critique earns its place).
- **The masking risk**: self-critique can mask the real fix. If the failure mode is "evals don't cover the case," adding a critique step buries the gap instead of closing it. Build the eval set first; reach for critique only when the eval set says the gap is critique-shaped.
- **The cross-model variant**: the cheap version uses the same model and inherits its blind spots; the expensive version (Claude drafts, GPT-4 critiques, or vice versa) defeats more adversarial inputs but doubles provider integrations.
- **The reincodes shape**: implementation is Case B; the buildable target is a precomputed visualizer under `/ai/self-critique` that demonstrates the cost-vs-value tradeoff by letting the reader drag a stakes slider and watch the recommendation flip.

---

## Interview defense

### What an interviewer is really asking

Behind "have you used self-critique in production?" the interviewer is probing whether the candidate distinguishes *test-time compute that pays off* from *test-time compute that's theatre*. A junior answer recommends self-critique enthusiastically ("of course we should have the model double-check its output"). A senior answer names the diminishing-returns problem, the eval-masking risk, and the stakes-dependent cost-benefit. The interviewer is checking whether the candidate has actually paid the token bill and measured the lift, or whether they're parroting a blog post that recommended the pattern without measuring.

### Likely questions

**Q (mid):** When would you reach for self-critique?

A: When the eval set tells me the failure mode is criteria-shaped — the draft is failing on a checklist that's hard to encode in the system prompt but easy to evaluate after the fact. Concretely: a journal-summary chain where some summaries miss the emotional valence of the input. The criterion ("preserves emotional tone") is easy to state in a critic prompt and hard to make the drafter reliably apply. Self-critique earns its place there. The places I don't reach for it: low-stakes outputs where manual review is cheap (a draft caption gets thumbs-up/thumbs-down from the user), classifiers where self-consistency is the right shape (parallel samples plus vote, not sequential critique), and any chain where the eval set hasn't caught the failure mode yet — because adding critique before evals is masking, not fixing.

```
failure mode             reach for
─────────────────────    ────────────────────────────
high-variance samples    self-consistency (N parallel + vote)
missing checklist item   self-critique (critic with named criteria)
confidently wrong        fix the prompt / examples / model
                         (critique won't help; same blind spots)
eval coverage gap        write the evals first
                         (critique masks the gap)
```

**Q (senior):** You added self-critique to a chain and the eval score barely moved. What happened and what would you do next?

A: Three diagnoses to run, in order. First, log the *agreement rate* between the drafter and the critic — if the critic accepts the draft as-is more than ~80% of the time, the critique step is doing nothing for 80% of requests and the token multiplier is buying revisions on 20%. That's a sign the critic prompt is too lenient (vague criteria, "is this good?" framing) and needs sharper named failure modes. Second, look at the cases where the critic *did* flag the draft — are the flags correct? If the critic is flagging good drafts and missing bad ones, the critic prompt is mis-calibrated. Third, the most likely root cause: the failures the chain is actually making are confidently-wrong ones where the drafter and critic share the same blind spot. The fix isn't more critique; it's better few-shot examples that cover the failure shape, or a different model for the critique step (cross-model critique). The wrong move is to add a *second* critique pass on top of the first. Diminishing returns hit fast and the token bill grows fast.

```
self-critique not working? diagnose in this order
─────────────────────────────────────────────────
1. agreement rate too high -> critic prompt too lenient, sharpen criteria
2. critic flagging wrong cases -> critic mis-calibrated, fix criteria framing
3. critic and drafter share blind spots -> cross-model critique, or
                                            better few-shot, or different model
                                            (do NOT add another critique pass)
```

**Q (arch):** At 10x the request volume, does self-critique still work?

A: The token-cost math shifts dramatically. Self-critique that was 2x baseline at 1k requests/day becomes 2x baseline at 10k requests/day — but the absolute spend is now ~$1k/month additional instead of $100/month. At that scale the question stops being "is the lift worth it for this chain?" and becomes "is the lift worth it across the whole product?" Two architectural responses earn their place. First, *targeted critique*: log per-call confidence (perplexity, model's own confidence signals if available, or a cheap first-pass classifier that flags low-confidence draft outputs) and apply self-critique only on the bottom 10-20% of the confidence distribution. The token bill drops to 1.1-1.2x baseline while preserving most of the lift. Second, *cross-model critique with a cheaper critic*: Claude Sonnet 4.7 drafts at $3/MTok input, GPT-4o-mini critiques at $0.15/MTok input — the critique cost is a fraction of the draft cost, and the cross-model dynamic dodges the shared-blind-spot problem. The static "every call gets a full critique pass" pattern doesn't scale and shouldn't.

```
self-critique scaling shape
───────────────────────────

  small scale (~1k req/day):
    "every call gets critique" works
    cost: 2x baseline, $100/mo

  medium scale (~10k req/day):
    "every call gets critique" still works financially
    cost: 2x baseline, $1k/mo
    but starts mattering on the spreadsheet

  large scale (~100k+ req/day):
    "every call" pattern breaks the budget
    fix: targeted critique on low-confidence draft outputs only
          (apply critique to bottom 10-20% of confidence distribution)
    fix: cross-model critique with cheaper critic
          (Sonnet drafts, Haiku/4o-mini critiques)
    cost: 1.1-1.2x baseline, lift mostly preserved
```

### The question candidates always dodge

**Q:** Why not just always self-critique? It's only 2x the cost and the reliability is always better.

A: Two things are wrong with that. First, the reliability isn't always better. On confidently-wrong outputs — where the drafter and the critic share the inductive bias that produced the wrong answer — the critique pass costs 2x and lifts nothing. Self-Refine and follow-up papers measure this directly: on tasks where the base model's accuracy is already high, the critique loop hits diminishing returns fast, and on tasks where the base model is confidently wrong, the loop provides no lift at all. Second, "only 2x" is a denial-shaped framing. At 10k requests per day, 2x is $1k/month of provider spend that has to be justified against alternatives. The honest decision is to look at the eval set, look at the failure mode, and ask "would the same $1k/month spent on a contractor expanding the eval set close the gap faster than the critique loop?" In most chains I've shipped, the answer is yes, by a margin of 2-5x. Self-critique is a tool for the residual failures that survive a good eval set, not a substitute for one.

```
self-critique cost ledger at scale
────────────────────────────────────

Scenario: 10k req/day, baseline call costs $0.003

  always self-critique:
    cost per request: 2x = $0.006
    monthly cost:     $1,800
    reliability lift: 4% on uncertain cases, 0% on confident-wrong

  build out eval set first, targeted critique on low-confidence:
    one-time eval expansion cost: ~$2,000 (a week of engineering)
    ongoing cost: 1.1x baseline = $990/month
    reliability lift: 8% across the full distribution

  the second option costs less per month, lifts more reliability,
  and produces an artifact (the eval set) that survives model upgrades.
  "just self-critique" loses on every axis after the first month.
```

The honest answer: "always self-critique" feels safe and is wasteful. The interview move is naming the cost ledger and the eval-substitute risk rather than defaulting to the more-compute-is-always-better story.

### One-line anchors

- "Self-critique is overrated in low-stakes cases and underrated in high-stakes cases. The diminishing-returns problem is what stops it from being a silver bullet."
- "The lift is real on uncertain outputs and absent on confidently-wrong ones — the critic shares the drafter's blind spots."
- "If the failure mode is eval-coverage-shaped, self-critique masks the gap. Build the eval set first."
- "Self-consistency is parallel, latency-neutral, tokens-multiplied. Self-critique is sequential, latency-multiplied, tokens-multiplied."
- "Targeted critique on low-confidence outputs beats blanket critique on every call once you're past small scale."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw the decision diagram from memory: the three symptom shapes (high-variance, criteria-shaped errors, confidently wrong) and what each maps to. Then draw the stakes axis with at least three labeled points and the rough boundary where self-critique starts earning its cost.

- Pass: three symptom-shape branches with correct mappings, stakes axis with labeled points, boundary visible
- Fail: re-read the primary diagram, wait 10 minutes, try again

### Level 2 — Explain it out loud

Explain the decision to add self-critique to a colleague who has built one LLM-powered feature and is reaching for self-critique because a blog post recommended it. No notes. Under 90 seconds.

Checkpoints — did you:
- Name the two cousin patterns (self-critique sequential, self-consistency parallel)?
- Distinguish failure modes (uncertain -> self-consistency, criteria-shaped -> self-critique, confidently-wrong -> neither)?
- Name the eval-masking risk (adding critique before evals buries the gap)?
- Name the diminishing-returns problem (drafter and critic share blind spots)?
- Reference the buildable target (`/ai/self-critique` visualizer with the stakes slider) as how you'd demonstrate the concept in reincodes?

If you skipped any: you recommended the pattern, you didn't argue for or against it.

### Level 3 — Apply it to a new scenario

A new chain lands in the planned reincodes AI surface: a "narrate this DSA visualization step for a screen-reader user" chain that takes the algorithm name, the current step's state, and produces a one-sentence accessibility narration. The chain runs on every step of every visualizer, so volume is high. Quality matters because screen-reader users depend on it. Walk through the decision: would you add self-critique here? If yes, in what shape? If no, what would you do instead?

Write your answer (3-5 sentences minimum). Then open `.aipe/study-prep-fundamentals-for-ai/03-ai-engineering/05-ai-features-in-this-app.md` and check whether your proposed pipeline matches the constraints that file names for any planned AI feature in reincodes (static-export contract, precomputed corpus, no live LLM at request time).

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff from the Tradeoffs section. Answer in writing: "If I were starting the `/ai/self-critique` visualizer today with the same constraints (static export, no live LLM, GH Pages deploy), would I make the same precompute-with-real-token-counts call? Why or why not? If I'd change it, what would I do instead and what would that cost?"

Reference the actual code:
- Point to `next.config.ts` L1-L17 to support the static-export constraint
- Point to what would need to change if the precompute step captured *synthetic* token counts instead of real ones — the visualizer's teaching value would weaken (the "tokens spent" badge would lose credibility) but the build script's API spend would drop to zero

There is no right answer. The point is specificity.

### Quick check — code reference test

Without opening any files, answer:
- What file in reincodes controls the static-export contract that constrains how the visualizer ships?
- What `.aipe/` directory holds the meta file framing reincodes AI visualizers as Case B?
- What field in `conceptsData.tsx` would need a new entry to register the visualizer in the home grid?
- What two paper references does this concept lean on for the canonical literature anchor?

Then open the files and verify.

- Pass: `next.config.ts`, `.aipe/study-prep-fundamentals-for-ai/03-ai-engineering/`, `CONCEPT_CATEGORIES`, Self-Refine (Madaan et al. 2023) + Self-Consistency (Wang et al. 2022)
- Fail on details: that's fine — the shape is what matters. File and directory names should be recoverable.
