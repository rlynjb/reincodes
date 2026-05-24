# Chain-of-thought (CoT)

**Industry name(s):** Chain-of-thought prompting, CoT, step-by-step reasoning, "thinking field" pattern
**Type:** Industry standard

> Ask the model to reason step-by-step before answering, and on multi-step problems it does better. In 2026 the load-bearing variant isn't "let's think step by step" — it's a structured `thinking` field in the output schema, because frontier models already do CoT internally and free-form CoT mixes badly with structured output.

**See also:** → [02-structured-outputs](02-structured-outputs.md) · → [04-token-budgeting](04-token-budgeting.md) · → [06-single-purpose-chains](06-single-purpose-chains.md) · → [10-self-critique](10-self-critique.md)

---

## Why care

### Move 1 — The grounded scenario

You're building a chain that classifies user-submitted journal entries into action items: `{ type: "todo" | "question" | "vent" | "memory", priority: "low" | "med" | "high" }`. It works on clean inputs ("buy milk" → `{type: "todo", priority: "low"}`). Then a user submits "I really need to remember to call the doctor tomorrow about that thing we discussed, it's important." The model returns `{type: "memory", priority: "low"}`. Wrong on both fields — it's a high-priority todo. You stare at the failure for a while. The input is multi-clause; the model picked the first signal it saw ("remember") and locked in. Adding more system-prompt instructions doesn't help — the model isn't *reading the instructions wrong*, it's *jumping to a conclusion before processing the full input*.

### Move 2 — Name the question

That premature-conclusion failure has a name — *missing chain-of-thought*. Not whether the model knows the right answer, not whether the prompt has enough instructions, not whether the schema is correct — just whether the model gets *space to reason* before committing to an output. Chain-of-thought is the technique of giving the model that space explicitly, by asking it to think through the problem step-by-step before returning the final answer. The pattern is one of the oldest in prompt engineering and one of the most misapplied in 2026, because the canonical "Let's think step by step" framing belongs to an era where models didn't do this automatically.

### Move 3 — Why answering that question matters

**Why you need to answer that question at all:** because on multi-step problems — anything that requires processing several signals, weighing them, or applying conditional logic — the difference between zero-CoT and CoT can be the difference between 60% accuracy and 90%. The classic 2022 result from Wei et al. on grade-school math (~57% → ~90% accuracy on GSM8K with CoT) is the canonical citation. But here's the 2026 nuance most teams miss: frontier models (Sonnet 4, GPT-5, Gemini 2.5 Pro) now do CoT *internally* as part of their training. Asking them "let's think step by step" in the prompt is no longer adding much. Where CoT still helps cheaper models, and where it still helps frontier models, is *structured CoT* — putting a `thinking` field inside the structured output schema so the model fills it before filling the answer fields. That structured variant interacts with prompt anatomy and output schemas in ways free-form CoT does not, and getting it wrong (free-form CoT mixed with JSON parsing) is how you ship a chain that wraps its reasoning in markdown, breaks the parser, and silently fails.

### Move 4 — Concrete before/after

Without CoT (zero-shot, no reasoning space):

- Input: "I really need to remember to call the doctor tomorrow about that thing we discussed, it's important."
- Model jumps to first signal ("remember") → returns `{type: "memory", priority: "low"}`
- Wrong on both fields
- No trace of why the model decided this — debugging is "the model just picked wrong"

With structured CoT (reasoning field in the schema):

- Input: same
- Output schema includes a `thinking: string` field before `type` and `priority`
- Model fills `thinking: "Input mentions 'remember to call', which suggests action. The phrase 'tomorrow' indicates a deadline. 'It's important' signals high priority. Action item with a deadline = todo, not memory."`
- Then fills `type: "todo", priority: "high"`
- Correct on both fields, and the `thinking` field is observable in logs so the next engineer can see how the model decided

### Move 5 — The one-line summary

Chain-of-thought is rendering a list of components with their intermediate state visible — the model's `useState` is its own reasoning, and forcing it to commit that state before the answer is what makes the answer better and the failure debuggable. The mechanics are below.

---

## How it works

### Move 1 — The mental model

Free-form CoT is asking the model to "show its work" before answering — the prompt says "think step-by-step, then give the answer." Structured CoT is the modern variant: the model's output schema has a `thinking` field that comes before the answer fields, and the model is forced by the structured-output enforcement to fill the reasoning slot before committing to the answer. Both share the same insight: the model performs better when it has tokens to reason in, before it commits to a structurally-required output. The strategy: give the model an explicit place to think, and that place becomes both the source of higher accuracy and the source of debuggability.

```
Two variants of CoT — the schema is the difference

Free-form CoT (legacy, 2022-2023):           Structured CoT (modern, 2024+):
  Prompt: "Think step by step, then answer."   Output schema:
                                                 { thinking: string,
  Model output:                                    answer: enum }
    "Step 1: ... Step 2: ... Answer: X"       Model output:
                                                 { thinking: "Step 1...",
  → Parser has to extract "Answer: X"            answer: "X" }
    from prose. Fragile.                       → Parser reads field. Clean.
```

### Move 2 — The layered walkthrough

#### The free-form variant (legacy)

The technical thing: prompting the model with "let's think step by step" or similar, and letting the model emit reasoning followed by an answer as free prose. The bridge from frontend: this is like a textarea that captures both the user's notes and their final decision in one blob, then trying to extract the decision with regex. Works for demos. Concrete consequence: in production, you have to parse the model's output to extract the answer ("Answer: X" or "Final answer: X" or whatever pattern you trained the model on with examples). That parsing is fragile — the model might phrase it slightly differently, embed the answer in a sentence, or skip the answer marker entirely. Concrete condition where it breaks: the moment another chain needs to consume this chain's output programmatically, the prose-extraction step becomes the failure point.

```
free-form CoT — parsing pain

Model: "Step 1: Input mentions 'remember' which suggests memory.
        Step 2: But 'tomorrow' is a deadline marker.
        Step 3: So this is actually a todo with a deadline.
        Final answer: todo"

Parser: regex to find "Final answer: " then take the rest
         of the line until newline → "todo"

Failure mode: model writes "Therefore, the answer is todo." instead
              of "Final answer: todo" → regex misses → parser
              falls through to default → wrong label
```

#### The structured variant (modern)

The technical thing: putting `thinking: string` (or `reasoning: string`, or `scratchpad: string`) into the output schema as a required field that comes *before* the answer fields. The model is forced by the structured-output enforcement (OpenAI's strict mode, Anthropic's tool calling) to fill the reasoning slot before committing to the answer fields. The bridge from frontend: this is like a controlled form where one field has to be filled before another field becomes editable — the schema enforces an order, and that order is the reasoning-before-answer order. Concrete consequence: the reasoning lives in a typed slot, parses cleanly, logs cleanly, and is observable in production telemetry. The model's reasoning isn't extracted from prose — it's read from a field. Concrete condition where it works: when the chain is already using structured outputs (which all production chains in 2026 should be). Concrete condition where it breaks: if the schema doesn't constrain field order, some providers fill fields in the order most convenient to them, which can defeat the "reason first" intent.

```
structured CoT — schema enforces the reasoning-first order

Output schema:
  {
    thinking: string,              ← MUST be filled before answer
    type: "todo" | "question" | "vent" | "memory",
    priority: "low" | "med" | "high"
  }

Model output (one JSON object):
  {
    "thinking": "Input mentions 'remember' suggesting memory, but
                 'tomorrow' indicates a deadline. Action + deadline
                 = todo. 'It's important' = high priority.",
    "type": "todo",
    "priority": "high"
  }

Parser: response.thinking, response.type, response.priority
Logging: full thinking field captured in the trace
```

#### When CoT helps vs when it wastes tokens

The technical thing: CoT adds 100-500 tokens to the response (the reasoning takes space). The accuracy gain has to justify the token cost. The bridge from frontend: this is like asking whether to memoize a render — the optimization is only worth it when the work is genuinely expensive. Concrete consequence: CoT helps on multi-step problems (math, logic puzzles, classification with multiple signals, code generation, debugging tasks). CoT wastes tokens on single-lookup problems ("what's the capital of France?" → just return "Paris", no thinking needed) and on structured classifiers where few-shot examples already constrain the output reliably. The rule of thumb: if you can solve it with a small model and few-shot examples, CoT isn't earning its place; if you need a frontier model and the problem has multiple signals to weigh, CoT is the lever that gets you the accuracy.

```
CoT cost/benefit by problem type

Problem type               Without CoT   With CoT   Token cost   Worth it?
─────────────────────────  ────────────  ─────────  ───────────  ─────────
Simple lookup              99%           99%        +200 wasted  No
Format-sensitive classify  85%           87%        +200         Borderline
Multi-signal classify      72%           91%        +250         Yes
Multi-step reasoning       55%           88%        +400         Yes
Code generation w/ ctx     65%           82%        +500         Yes
Creative writing           N/A           N/A        +300         N/A (no
                                                                  ground truth)
```

#### The "thinking field" pattern in detail

The technical thing: the field name matters less than its position in the schema. `thinking`, `reasoning`, `scratchpad`, `analysis`, `working` — any of these work, as long as the field is required and appears first in the schema. The bridge from frontend: this is the same shape as a `loading` state in a `fetch()` hook — the framework forces a check before the final state lands. Concrete consequence: providers that respect field order (OpenAI strict mode, Anthropic tool calling with ordered schemas) will generate the reasoning before the answer because that's the schema's contract. Providers that don't (or schemas that aren't ordered) may fill the answer first and back-fill the reasoning, which defeats the purpose. Concrete condition where it works: ordered structured outputs with strict mode. Concrete condition where it breaks: JSON mode without strict ordering — the model is free to fill fields in any order.

#### The interaction with output validation

The technical thing: if the answer field is typed (an enum, a number, a structured object), the reasoning field is the place where the model talks itself into the answer. The bridge from frontend: this is like a controlled form where the user has to explain their answer before submitting — the explanation field gets a free-form textarea, the answer field gets a constrained select. Concrete consequence: you can ship a chain with reasoning + typed answer, and the typed-answer constraint catches schema violations even if the reasoning goes off the rails. The reasoning is for humans (debuggability) and for the model (accuracy); the typed answer is what downstream consumers depend on. Concrete condition where the pattern shines: any chain whose output is consumed by another chain — the downstream chain reads the typed answer field; the engineer debugging a regression reads the reasoning field.

### Move 3 — The principle

The principle that generalises beyond any one chain: *give the model space to compute and a structured place to commit*. Free-form CoT gave space without structure; structured CoT gives space *and* structure. The shift from one to the other tracks the broader shift in LLM application engineering from "the model is the API and we parse its prose" to "the model is one component in a typed pipeline." Every framework that has shipped useful prompt tooling in 2024-2026 has converged on supporting structured CoT (Instructor in Python, OpenAI's structured outputs with reasoning fields, Anthropic's extended thinking tokens). Free-form CoT is the demo version; structured CoT is the production version. The reader who learns one without learning the other is one model upgrade away from a regression they can't explain.

The full picture is below.

---

## Chain-of-thought — diagram

```
┌─ Without CoT — single-pass generation ─────────────────────────────┐
│                                                                    │
│   Input ─────► Model ─────► Output                                 │
│                              "{type: ..., priority: ...}"          │
│                              ↑                                     │
│                              Model jumped to conclusion;           │
│                              no reasoning visible                  │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘

┌─ With free-form CoT (legacy, 2022-2023) ───────────────────────────┐
│                                                                    │
│   Input ─────► Model ─────► Output                                 │
│                              "Step 1: ...                          │
│                               Step 2: ...                          │
│                               Final answer: ..."                   │
│                              ↑                                     │
│                              Reasoning + answer in prose;          │
│                              parser has to extract the answer      │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘

┌─ With structured CoT (modern, 2024+) ──────────────────────────────┐
│                                                                    │
│   Output schema (ordered, strict):                                 │
│     ┌──────────────────────────────────────────┐                   │
│     │ thinking: string         ← filled first  │                   │
│     │ type:     enum           ← filled after  │                   │
│     │ priority: enum           ← filled last   │                   │
│     └──────────────────────────────────────────┘                   │
│                                                                    │
│   Input ─────► Model ─────► Output                                 │
│                              {                                     │
│                                "thinking": "...",  ← debuggable    │
│                                "type": "todo",     ← typed         │
│                                "priority": "high"  ← typed         │
│                              }                                     │
│                              ↑                                     │
│                              Reasoning lives in a field;           │
│                              answer fields parse cleanly           │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

The boundary between free-form and structured CoT is the difference between "prose the parser has to chew through" and "fields the parser reads." That boundary is what makes structured CoT the load-bearing variant for 2026 production work.

---

## In this codebase

**Not yet implemented.** reincodes is a Next.js static-export DSA visualizer with no AI surface in production code — there are no chains, no schemas, no CoT to demonstrate. The buildable target for this concept is below in Project exercises — a `/ai/cot` page that lets the reader run the same multi-signal classification input through two precomputed pipelines (direct prompt vs structured-CoT prompt), render the thinking-field steps as a vertical timeline, and toggle between three model tiers (Haiku / Sonnet / Opus) to show how the CoT benefit diminishes on stronger models. The pedagogical payoff: the reader sees, in one interaction, why structured CoT survives model upgrades while free-form CoT degrades.

**Expected file paths** (when built):
- `src/app/ai/cot/page.tsx` — the visualizer page
- `src/components/CoTVisualizer/` — input panel, pipeline-switch toggle, thinking-timeline component, model-tier toggle
- `public/ai/cot/example-inputs.json` — 3-5 multi-signal classification inputs (mix of clear cases and edge cases)
- `public/ai/cot/outputs-haiku.json`, `outputs-sonnet.json`, `outputs-opus.json` — precomputed outputs for each input × each pipeline (direct / CoT) × each model tier

---

## Elaborate

### Where this pattern comes from

CoT prompting was named by Wei et al. in 2022 ("Chain-of-Thought Prompting Elicits Reasoning in Large Language Models") with a striking result: GPT-3 went from ~17% on GSM8K (grade-school math) to ~57% with CoT prompting, and PaLM 540B went from ~57% to ~90%. The headline number — "step-by-step reasoning improves multi-step accuracy" — was the result that made CoT a default technique for the next two years. The pattern shifted shape in 2024 as frontier models started doing CoT internally as part of training; the structured-output variant emerged as the practical replacement for the free-form "let's think step by step" framing.

### The deeper principle

The deeper principle is *computation needs a substrate*. A model that's asked to commit to an answer in one forward pass has less computation budget than a model that's asked to commit to an answer after generating 300 reasoning tokens. CoT works because it converts more inference budget into more reasoning depth. The structured variant adds the second insight: the substrate should be observable. Reasoning that lives in a typed field is debuggable, loggable, evaluable; reasoning that lives in prose is none of those things. The shift from free-form to structured CoT is the same shift as moving from `console.log` debugging to structured tracing — same data, vastly more useful when it's typed.

### Where this breaks down

CoT breaks down in two cases. First, on simple lookups where the model already knows the answer with high confidence; the reasoning tokens are pure waste and may actually introduce drift (the model talks itself out of the right answer). Second, on creative-writing tasks where there's no ground-truth answer to reason toward; CoT just produces meandering prose that doesn't make the output better. The honest answer for both: CoT is for multi-step problems with ground truth, not for everything. The trap is making CoT the default for every chain; the right move is making structured-output-with-thinking-field the default and dropping the thinking field for chains that genuinely don't benefit.

### What to explore next

- [02-structured-outputs](02-structured-outputs.md) → the schema discipline that enables structured CoT
- [04-token-budgeting](04-token-budgeting.md) → CoT adds 100-500 tokens per response; budget accordingly
- [10-self-critique](10-self-critique.md) → CoT extended one step further; the model critiques its own reasoning
- Anthropic's "extended thinking" feature → the platform-level version of structured CoT, where the model gets a separate budget for reasoning that doesn't count against the response tokens

---

## Tradeoffs

### Comparison table — both costs in one frame

```
┌──────────────────┬──────────────────────┬─────────────────────────┐
│ Cost dimension   │ Path taken           │ Alternative             │
│                  │ (structured CoT)     │ (no CoT / free-form CoT)│
├──────────────────┼──────────────────────┼─────────────────────────┤
│ Tokens per call  │ +200-500 (reasoning) │ Baseline                │
│ Latency          │ +0.5-2.0s            │ Baseline                │
│ Cost per call    │ +$0.001-0.005        │ Baseline                │
│ Accuracy on      │ +20-30 points        │ Baseline                │
│   multi-step                                                      │
│ Accuracy on      │ +0-2 points (waste)  │ Baseline                │
│   simple lookups                                                  │
│ Debuggability    │ Reasoning in a typed │ Black box; debugging is │
│                  │ field, logged per    │ "the model just picked  │
│                  │ call                 │ wrong"                  │
│ Parser fragility │ None (typed field)   │ High (regex extraction  │
│   (vs free-form) │                      │ of "Final answer: X")   │
│ Schema effort    │ One field added to   │ Zero                    │
│                  │ each chain's schema  │                         │
│ Survives model   │ Yes — schema is the  │ Free-form: model        │
│   upgrades       │ contract, model      │ phrasing may shift;     │
│                  │ adapts to it         │ regex breaks            │
└──────────────────┴──────────────────────┴─────────────────────────┘
```

### What we gave up (planning the visualizer)

The first cost is *9 precomputed-output JSON files* — 3 inputs × 2 pipelines × 3 model tiers. Each output has to be generated by calling the actual provider at build time, which means writing a precompute script that handles Anthropic + multi-model orchestration and committing the JSON to `public/ai/cot/`. That's ~half a day of work, including handling the rate limits across three model tiers.

The second cost is *engineering the inputs to show the CoT benefit diminishing*. The visualizer's pedagogical payoff is "watch how CoT helps Haiku a lot, helps Sonnet a little, helps Opus almost nothing." Choosing inputs that exhibit this gradient cleanly is harder than it sounds — too easy and Haiku gets them right without CoT; too hard and Opus gets them wrong even with CoT. The calibration takes another half day of iterating on which test inputs land the lesson.

The third cost is *the thinking-timeline component*. The page renders the model's `thinking` field as a vertical timeline of reasoning steps, which means parsing the prose inside the thinking field into discrete steps and rendering them with connecting lines. The component itself is ~half a day of CSS + small parsing logic.

### What the alternative would have cost (skipping the visualizer)

If reincodes never builds `/ai/cot`, the cost is zero in the codebase. The CoT discipline still gets taught — by this written file, by Anthropic's prompt guide, by the canonical Wei et al. paper, by experimentation in other portfolio projects. The reincodes site stays pure-DSA.

The cost of not building it shows up in the portfolio story: when an interviewer asks "show me when CoT helps and when it doesn't," there's no concrete visualizer to point at. The model-tier gradient (Haiku benefits → Opus doesn't) is hard to convey without showing it. The visualizer earns its place when the interview pressure makes "show me, don't tell me" mandatory.

### The breakpoint

The visualizer earns its place the day the candidate is asked, in an interview, to explain "when does CoT help in 2026 and when is it a waste?" Until that question is pending, the buildable target stays in the backlog. The breakpoint is event-shaped: the candidate has a specific upcoming interview where structured-CoT-vs-free-form is the kind of distinction that separates senior from mid candidates.

### What wasn't actually a tradeoff

Asking the model to reason for the visualizer at request time (live API call from the visualizer to Anthropic) was not a real option. Static-export contract forbids server runtime. Precomputed outputs are the only path. The "live demo" alternative would require leaving GH Pages, which kills the deploy story.

---

## Tech reference (industry pairing)

### Anthropic Messages API + extended thinking

- **Codebase uses:** not yet — the visualizer's precompute script would call the Messages API for the "Sonnet with CoT" and "Opus with CoT" variants, and optionally use the `thinking` parameter (Anthropic's first-class CoT feature) for the strongest variant.
- **Why it's here:** Anthropic added explicit "extended thinking" support in 2024-2025, where the model can spend reasoning tokens in a separate budget that doesn't count against the response. It's the platform-level version of the structured-CoT pattern.
- **Leading today:** Anthropic Messages API with `thinking` parameter — `innovation-leading` for first-class CoT support, 2026.
- **Why it leads:** extended thinking is platform-supported (no schema gymnastics needed); the reasoning is returned in a separate field so it doesn't interfere with structured-output parsing.
- **Runner-up:** OpenAI o1-series / o3-series — `innovation-leading` reasoning models where CoT is the *only* mode (the model always reasons before answering, no opt-out). Different design philosophy; same underlying insight.

### OpenAI Structured Outputs

- **Codebase uses:** not yet — would be the secondary precompute target for cross-provider variant demonstration in the visualizer.
- **Why it's here:** strict structured outputs guarantee the model fills schema fields in the declared order, which is what makes structured CoT (`thinking: string` first, answer fields after) reliable.
- **Leading today:** OpenAI Structured Outputs with strict mode — `adoption-leading` for ordered schema enforcement, 2026.
- **Why it leads:** `strict: true` plus an ordered schema means the model can't skip the thinking field or fill it after the answer — the schema enforces the reasoning-first contract.
- **Runner-up:** Anthropic tool-use schemas — `adoption-leading` for schema-defined outputs; less explicit about field order but ordered-tool-input-schemas have similar effect.

### Wei et al. 2022 ("Chain-of-Thought Prompting Elicits Reasoning in Large Language Models")

- **Codebase uses:** not yet — would be cited in the visualizer's `## What this teaches` panel as the foundational reference.
- **Why it's here:** every modern CoT discussion descends from this paper. The +33 point accuracy gain on GSM8K is the canonical evidence that started the field.
- **Leading today:** Wei et al. 2022 — `adoption-leading` foundational citation, still cited in 2026.
- **Why it leads:** clean experimental design (zero-shot vs few-shot vs CoT vs CoT+few-shot, across multiple model sizes), reproducible results, the result that established CoT as a default technique.
- **Runner-up:** Kojima et al. 2022 ("Large Language Models are Zero-Shot Reasoners") — `adoption-leading` for the "let's think step by step" framing that became the prompt-engineering shorthand for CoT.

### Instructor (Python) / Zod (TypeScript)

- **Codebase uses:** not yet — Zod would define the structured-CoT output schema for any chain that ships in reincodes (`{ thinking: z.string(), type: z.enum([...]), priority: z.enum([...]) }`).
- **Why it's here:** the schema is the contract that enforces structured CoT. Without a typed schema, the reasoning-first ordering is a convention rather than an enforcement.
- **Leading today:** Zod — `adoption-leading` for TS schema work, 2026.
- **Why it leads:** type inference, integration with OpenAI's structured outputs and Anthropic's tool-use schemas, ecosystem maturity.
- **Runner-up:** Instructor (Python) — `adoption-leading` for Python LLM apps; the canonical library for structured CoT in the Python ecosystem.

---

## Project exercises

### [B-reincodes-cot-viz] Build the chain-of-thought visualizer

- **Exercise ID:** `[B-reincodes-cot-viz]` — aligns with Phase 1 curriculum concept on prompt engineering as a discipline + Phase 1 concept on sampling parameters (CoT interacts with temperature).
- **What to build:** a page at `/ai/cot` that takes a small set of precomputed multi-signal classification inputs (3-5 inputs ranging from clear to ambiguous) and lets the reader run each input through two precomputed pipelines side by side: direct prompt (no CoT, output is just `{type, priority}`) and structured-CoT prompt (output is `{thinking, type, priority}`). The thinking-field content is rendered as a vertical timeline of reasoning steps on the CoT side. A model-tier toggle (Haiku / Sonnet / Opus) swaps the precomputed outputs to show how the CoT benefit diminishes on stronger models — Haiku gets ambiguous inputs wrong without CoT and right with it; Opus gets them right either way. The pedagogical payoff: the reader sees, in one interaction, that CoT isn't always worth its tokens, and learns to choose by problem complexity × model tier.
- **Why it earns its place:** the visualizer makes the *model-tier gradient* visible — the most under-discussed nuance of CoT in 2026. Most online discussion still treats CoT as universally beneficial; the visualizer demonstrates it's not. The interview signal: the candidate built a tool that teaches a nuance senior engineers know and junior engineers don't.
- **Files to touch:** `src/app/ai/cot/page.tsx` (visualizer page), `src/components/CoTVisualizer/` (input panel, pipeline-switch toggle, thinking-timeline component, model-tier toggle), `public/ai/cot/example-inputs.json` (3-5 multi-signal inputs), `public/ai/cot/outputs-haiku.json` + `outputs-sonnet.json` + `outputs-opus.json` (precomputed outputs for each input × each pipeline × each model tier — 3 × 2 × 3 = 18 outputs total), `scripts/precompute-cot.ts` (build-time script that calls each Anthropic model with each pipeline against each input and commits the results). Register the page in `src/components/Home/conceptsData.tsx` under the `ai-engineering` category alongside the other planned `/ai/*` visualizers.
- **Done when:** the page loads at `/reincodes/ai/cot/` in production (GH Pages), all 3-5 inputs render in both pipelines side by side with the model-tier toggle working, the thinking-timeline component renders the CoT reasoning as discrete steps with connecting lines, switching from Haiku → Sonnet → Opus visibly closes the accuracy gap on ambiguous inputs. `next build` passes under `output: "export"`. Precompute script runs successfully against the Anthropic API (locally during precompute) and produces deterministic JSON output.
- **Estimated effort:** 1-2 days. Input calibration (designing 3-5 inputs that show the model-tier gradient cleanly): half day. Precompute script + 18 outputs: half day. Page + thinking-timeline component + toggles: half day. Polish + cross-browser testing: half day.

---

## Summary

### Part 1 — concept recap

Chain-of-thought is the technique of giving the model space to reason step-by-step before committing to a final answer, which improves accuracy on multi-step problems by 20-30 points in the original Wei et al. 2022 result. In 2026 the load-bearing variant isn't the free-form "let's think step by step" framing — it's a structured `thinking` field in the output schema that the model fills before the answer fields, because frontier models already do CoT internally and free-form CoT mixes badly with structured output parsing. In reincodes this is Case B — no chains exist — but the buildable target is a `/ai/cot` visualizer that runs precomputed multi-signal inputs through direct-prompt and structured-CoT pipelines side by side, with a model-tier toggle (Haiku / Sonnet / Opus) that shows the CoT benefit diminishing on stronger models. The cost being paid is precompute infrastructure for 18 outputs (3 inputs × 2 pipelines × 3 tiers) plus the calibration work to choose inputs that exhibit the model-tier gradient cleanly.

### Part 2 — key points to remember

- **The two variants**: free-form CoT (legacy, requires prose parsing) and structured CoT (modern, uses a typed `thinking` field in the output schema). Use structured.
- **The field order rule**: the `thinking` field MUST come before the answer fields in the schema, and the schema MUST be strict/ordered (OpenAI strict mode, Anthropic tool-use with ordered schemas). Otherwise the model fills the answer first and back-fills the reasoning.
- **The cost ledger**: +200-500 tokens, +0.5-2.0s latency, +$0.001-0.005 per call, in exchange for +20-30 points accuracy on multi-step problems. Worth it for multi-signal classification, code generation, debugging tasks. Wasted on simple lookups.
- **The model-tier gradient**: frontier models (Sonnet 4, GPT-5, Gemini 2.5 Pro) do CoT internally and benefit less from explicit prompting. CoT helps cheaper models more than expensive ones.
- **The reincodes shape**: implementation is Case B; the buildable target is a precomputed visualizer that demonstrates the model-tier gradient by toggling between Haiku / Sonnet / Opus outputs.

---

## Interview defense

### What an interviewer is really asking

Behind "when do you use chain-of-thought?" the interviewer is checking whether the candidate has internalised the 2026 nuance — that CoT isn't universally beneficial, that frontier models already do it internally, that the structured-field variant has replaced the free-form prompt variant for production work. Junior answer: "always use CoT, it helps the model think." Mid answer: "use CoT for multi-step problems." Senior answer: "use the `thinking` field in the output schema for chains that need reasoning, skip it for simple classifiers, and recognize that on frontier models the marginal benefit is small because the model is doing CoT internally anyway." The interviewer is filtering for engineers who track the field's evolution past the 2022 Wei et al. result.

### Likely questions

**Q (mid):** What does CoT actually do?

A: CoT is the technique of asking the model to generate intermediate reasoning steps before committing to a final answer, by including a "think step by step" instruction in the prompt or by adding a `thinking` field to the output schema. The mechanism is that the model gets more inference budget to reason through the problem — instead of one forward pass to the answer, it gets the full reasoning sequence to compute over. On multi-step problems like grade-school math, the original Wei et al. 2022 paper showed +33 points accuracy. The modern variant uses a structured `thinking` field in the output schema rather than free-form prose, because structured outputs parse cleanly and free-form prose doesn't.

```
CoT mechanism

Input → Model → Answer                 (no CoT — one-pass)
Input → Model → Reasoning → Answer    (CoT — multi-token reasoning
                                                   feeds back into answer
                                                   generation)
```

**Q (senior):** When do you NOT use CoT, and why does that question matter more in 2026 than it did in 2022?

A: I don't use CoT for simple lookups (waste of tokens), for structured classifiers where few-shot examples already constrain output reliably (the examples do the work CoT would do), or for creative-writing tasks (no ground truth to reason toward). It matters more in 2026 because frontier models (Sonnet 4, GPT-5, Gemini 2.5) do CoT internally as part of their training — the explicit "let's think step by step" prompt was a 2022 hack that fixed something that's mostly fixed now at the model level. What still matters in 2026 is the *structured* `thinking` field: it's the place where the model's internal reasoning becomes observable to the engineer for debugging and to the eval framework for scoring. So the senior move is to stop adding "let's think step by step" to every prompt and start adding a `thinking` field to schemas where the chain's reasoning needs to be observable.

```
what helped in 2022          vs    what helps in 2026
─────────────────────────          ─────────────────────────
"Let's think step by step"         A `thinking: string` field
in the prompt text                 in the output schema

Affects: weak models               Affects: all models, mostly
mostly                              for debuggability + cheap-
                                    model accuracy boost
```

**Q (arch):** At 10× — say, a pipeline of 20 chains, half of which need CoT — how do you avoid the cost compounding into a latency budget that kills the user experience?

A: At 20 chains × ~half with CoT × +0.5-2s per CoT = +5-20 seconds added latency in the worst case. Three things have to change. First, you don't run all 20 chains sequentially — you parallelise the chains that don't have data dependencies on each other (most classification chains don't depend on each other), which collapses 20 sequential calls to ~4 parallel waves. Second, you only use CoT on the chains where it actually helps; skipping CoT on the 10 chains where it doesn't earn its place saves ~5-20s on its own. Third, you use Anthropic's extended-thinking feature (or OpenAI's o-series reasoning models) where the reasoning happens in a separate budget that doesn't count against the response — this trades off cost (reasoning tokens still cost money) for latency (the reasoning step is internal to the model and doesn't block downstream parsing). The architecture shifts from "every chain reasons" to "the right chains reason, in parallel where possible, with platform-supported reasoning where available."

```
at 10x scale, the bottleneck moves from accuracy to latency

20 chains, all sequential, all CoT     20 chains, parallel + selective CoT
────────────────────────────────       ─────────────────────────────────
1s base per chain × 20 = 20s            ~4 parallel waves × 2s = 8s base
+ 1.5s CoT per chain × 20 = 30s         + 1.5s CoT × 10 chains  = ~3.5s
Total: 50s response time                Total: ~11.5s response time

User experience: unusable               User experience: barely acceptable

Further win: extended thinking mode      ↓
moves reasoning off the response         Total: ~8-10s response time
latency path entirely
```

### The question candidates always dodge

**Q:** "Let's think step by step" is one of the most-cited prompt-engineering tips. Why are you so dismissive of it for 2026 production work?

A: I'm not dismissive of the *insight* — giving the model space to reason was a real result and CoT is a real technique. I'm dismissive of the *implementation* for 2026 production work, because it's free-form prose in a world where production prompts return structured outputs. The "let's think step by step" framing belongs to 2022-2023, when production LLM features were mostly "send a prompt, parse the response." In 2026, production LLM features are mostly "send a prompt, get a typed object back, feed the object to the next chain." Free-form CoT in that pipeline means the model writes prose that the parser has to extract the answer from with regex, and the regex breaks the first time the model phrases the answer slightly differently. Every team I've shipped with has migrated from free-form CoT to structured-thinking-field as soon as their chain count crossed ~3. The "let's think step by step" advice still works as a teaching device — it captures the underlying insight — but if you deploy it as written in 2026, you've shipped a 2022 pattern that has a 2026 replacement.

```
"let's think step by step" vs structured thinking field — full cost ledger

What was picked                 What "let's think step by step" would cost
(structured thinking field)     (free-form CoT in prose)
─────────────────────────       ─────────────────────────────────────
+ Typed reasoning field         + Familiar to anyone who's read a
+ Clean parser                    prompt-engineering blog post
+ Logged + observable           + Lower setup cost (no schema work)
+ Survives model upgrades       - Prose parsing is fragile
+ Composes with downstream      - Model phrasing shifts break regex
  chains that consume the       - Free-form output mixes badly with
  typed answer                    JSON-expecting downstream chains
+ Per-field eval is trivial     - Eval has to do prose extraction
                                  before scoring
                                - One model upgrade can degrade the
                                  output format silently
```

The interview move: name the era gradient. "The advice was great for 2022. It's a pattern with a 2026 replacement."

### One-line anchors

- "Free-form CoT was 2022. Structured `thinking` field is 2026."
- "CoT helps cheaper models a lot; frontier models do CoT internally."
- "Reasoning belongs in a typed field, not in prose your parser has to chew through."
- "Wei et al. 2022 is the paper; the field has moved past the framing but kept the insight."
- "If you can solve it with few-shot examples on a small model, CoT isn't earning its tokens."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw the three CoT variants from memory: without CoT (single-pass), with free-form CoT (prose answer extraction), with structured CoT (typed thinking field first, answer fields after). Label which variant is the 2026 default.

✓ Pass: three variants distinguished, structured-CoT identified as the default, field-order arrow visible
✗ Fail: re-read the primary diagram, wait 10 minutes, try again.

### Level 2 — Explain it out loud

Explain CoT to a colleague who's still adding "let's think step by step" to every system prompt. No notes. Under 90 seconds.

Checkpoints — did you:
- Distinguish free-form CoT from structured CoT?
- Name the field-order rule (thinking field first, answer fields after, in a strict/ordered schema)?
- Name the model-tier gradient (frontier models benefit less than cheaper models)?
- Cite Wei et al. 2022 as the foundational paper?

If you skipped any: you described it, you didn't argue for it.

### Level 3 — Apply it to a new scenario

A new chain lands in the planned reincodes AI surface: a "decide which algorithm to recommend for this user's data shape" chain that takes a description of the input (size, ordering, distribution, mutation pattern) and returns one of: `bubble | insertion | selection | merge | quick | heap`. Multi-signal classification — exactly the kind of problem CoT helps. Design the output schema with the structured-CoT pattern. Which field comes first? What's its type? What model tier would you target?

Write your answer (3-5 sentences minimum). Then open `.aipe/study-prep-fundamentals-for-ai/02-dsa/README.md` to ground your "which signals matter for sorting choice" reasoning against the actual complexity-cheat-sheet table.

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff from the Tradeoffs section. Answer in writing: "If I were starting the `/ai/cot` visualizer today with the same constraints (static export, no live LLM, GH Pages deploy), would I keep the model-tier toggle (Haiku / Sonnet / Opus precomputed for every input)? Or would I simplify to single-tier and free the precompute budget for more inputs? What does each choice cost?"

Reference the actual code:
→ Point to `next.config.ts` L1–L17 to support the static-export constraint
→ Point to `public/ai/cot/` JSON file count (18 with three tiers, 6 with one tier) as the bundle-size tradeoff

There is no right answer. The point is specificity.

### Quick check — code reference test

Without opening any files, answer:
- What file in reincodes controls the static-export contract that constrains how the visualizer ships?
- What array in `conceptsData.tsx` would need a new entry to register the visualizer in the home grid?
- How many precomputed-output JSON files does the model-tier toggle add to the bundle (3 inputs × 2 pipelines × 3 tiers)?

Then open the files and verify.

✓ Pass: `next.config.ts`, `CONCEPT_CATEGORIES`, 18 (or 9 if you computed inputs × pipelines × tiers but missed that each is one file per tier per pipeline)
✗ Fail on details: file and array names matter more than the exact count.
