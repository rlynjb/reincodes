# Prompt chaining

**Industry name(s):** Prompt chaining, sequential composition, LLM pipelines, multi-step prompting
**Type:** Industry standard

> Passing the structured output of one LLM call as the typed input of the next — the basic pattern that turns a single chat into a production AI system, and the failure mode (cascading errors) that makes the validation discipline non-negotiable.

**See also:** → [01-context-window](01-context-window.md) · → [02-lost-in-the-middle](02-lost-in-the-middle.md) · → [../study-prompt-engineering/06-single-purpose-chains](../../study-prompt-engineering/06-single-purpose-chains.md) · → [../study-prompt-engineering/02-structured-outputs](../../study-prompt-engineering/02-structured-outputs.md) · → [../00-overview](../00-overview.md)

---

## Why care

### Move 1 — The grounded scenario

You've shipped a feature that takes a user's free-text journal entry and produces a structured response: a category label, a 1-line summary, and three suggested tags. The first version does the obvious thing — one prompt, one call, the model is asked to return all three fields as JSON. It works most of the time. Then the failures start: the category is wrong 5% of the time, and on those calls the tags are *also* wrong because they were inferred against the wrong category. One user reports that a single weird input ("just venting, ignore this") produced a category of "todo" with tags `["urgent", "shopping", "grocery"]`. One bad classification cascaded into a bad summary cascaded into bad tags. You can't fix the tags without also re-examining the category. The chain is too tightly coupled.

### Move 2 — Name the question

That coupling has a name — *prompt chaining*. Not the model's intelligence, not the prompt's quality, not the schema enforcement — just the question of *whether the next step in your pipeline has been given a clean input from the previous step, and what happens at the boundary if it hasn't*. A prompt chain is a sequence of LLM calls where each call's structured output becomes the next call's structured input. The pattern is the LLM-equivalent of Unix pipes: small, single-purpose, composed.

### Move 3 — Why answering that question matters

**Why you need to answer that question at all:** because *errors at boundary N propagate to every step ≥ N+1*. If your classifier emits the wrong category 5% of the time and your summarizer trusts the category, your summarizer's quality is capped at 95% — even if the summarizer itself is perfect. If your summarizer trusts a wrong category and your tagger trusts the summarizer, your tagger is capped at 95% of 95%, which is 90.25%. Stack three chains with 95%-confident boundaries and you ship a feature that's right only 86% of the time. I have shipped chains that looked individually solid — each chain at 95% on its eval set — and degraded systematically in production specifically because errors at the first chain's boundary propagated unchecked through the next two. The fix was not "make each chain better" — it was "validate at every boundary" — and the lift was 6–8 percentage points on end-to-end accuracy without touching a single prompt.

### Move 4 — Concrete before/after

Without chained prompts (one big prompt):

- One 400-line prompt asks for category, summary, and tags in one JSON
- Model has to keep all three jobs in attention simultaneously
- Failure mode is correlated: wrong category often comes with wrong tags
- Eval is end-to-end only — no per-step accuracy
- Cost: one LLM call (cheaper per call, but more retries when output is malformed)

With single-purpose chains + validation at every boundary:

- Three small chains: `classify` → `summarize(category)` → `tag(category, summary)`
- Each chain has its own schema, its own few-shot examples, its own retry budget
- Validation between each step (Zod parse + business rules) catches malformed outputs *before* they reach the next chain
- Per-step accuracy measurable; pipeline accuracy decomposable
- Cost: three LLM calls (more total spend per request, but each call is shorter and cached more aggressively)

### Move 5 — The one-line summary

Prompt chaining is Unix pipes for LLMs — small composable single-purpose calls joined by typed contracts at every boundary, where the discipline of *validating at the boundary* is the thing that turns a 3-chain pipeline into a system instead of a fragile demo. The full mechanics are below.

---

## How it works

### Move 1 — The mental model

A prompt chain is a *typed pipeline*. Each node is an LLM call. Each edge is a typed contract — a Zod schema, a TypeScript type, an explicit "this object has these fields with these constraints." The contract is enforced *at the boundary*, not inside the nodes — the previous node emits a string of JSON, the boundary parses and validates, the next node receives an already-validated typed object. Skipping the boundary validation is the bug that turns chains brittle.

The strategy: every chain output is a typed object; every chain input is a typed object; every boundary between chains has a parse-and-validate step that either succeeds (next chain runs against a clean input) or fails (the pipeline halts with a structured error, not a downstream garbage-in-garbage-out).

```
A prompt chain as a typed pipeline

  ┌───────────┐  string   ┌────────┐   ClassifyOut   ┌──────────────┐
  │ raw user  │ ────────▶ │  LLM   │ ──────────────▶ │ ZodParse +   │
  │ input     │           │ call A │                 │ validate     │
  └───────────┘           └────────┘                 └──────────────┘
                                                            │
                                                            ▼ typed
                                                     ┌──────────────┐
                                                     │ chain B input│
                                                     └──────────────┘
                                                            │
                              ┌─────────────────────────────┘
                              ▼
                          ┌────────┐  SummarizeOut  ┌──────────────┐
                          │  LLM   │ ─────────────▶ │ ZodParse +   │
                          │ call B │                │ validate     │
                          └────────┘                └──────────────┘
                                                            │
                                                            ▼
                                                       (chain C)
```

### Move 2 — The layered walkthrough

#### The chain as a single function

The technical thing: each chain in a pipeline is a function with a typed input and a typed output. The function's body wraps one LLM call. The input type is the previous chain's output type (or the raw user input, for the first chain). The output type is the next chain's input type (or the user-visible result, for the last chain). Bridge from frontend: this is a `useQuery` hook returning a typed object — the consumer can rely on the shape without re-validating. Concrete consequence: the chain's *contract* is the type signature; the chain's *implementation* is the prompt + the model + the parser. The two can evolve independently — you can swap the model behind chain A without changing anything upstream, as long as the output schema holds.

```
chain as a typed function

async function classifyChain(
  input: { entry: string }
): Promise<{ category: "todo" | "question" | "vent"; confidence: number }> {
  const response = await llm.call({ ...promptForClassify, input });
  return ClassifyOutSchema.parse(response);  // validation HERE
}
```

#### The boundary parse — the load-bearing step

The technical thing: between chain A and chain B sits a *parse-and-validate* step. The LLM returned a string. The string is parsed as JSON. The JSON is validated against the chain's output schema (Zod, JSON Schema, custom validator). On success, the typed object passes to chain B. On failure — malformed JSON, schema mismatch, business-rule violation — the pipeline halts with a structured error. The validation is not optional. Bridge from frontend: this is the same instinct as parsing a server response with Zod before passing it into React state — every input from an untrusted source gets validated at the boundary. The LLM is an untrusted source. Concrete consequence: the boundary parse is where *cascading error mitigation* lives. Without it, a malformed chain-A output silently corrupts chain B's input, and the failure surfaces three steps later as an inexplicable wrong answer.

```
boundary parse — the discipline

raw LLM string:    '{"category": "todo", "confidence": 0.92}'
       │
       ▼
JSON.parse:        { category: "todo", confidence: 0.92 }  ← unknown shape
       │
       ▼
ClassifyOutSchema  ─── enum check ─── number check ─── range check
       .parse                                        (0 <= conf <= 1)
       │
       ▼
typed object:      ClassifyOut { category: "todo", confidence: 0.92 }
       │
       ▼
next chain receives validated input
```

#### Sequential vs parallel composition

The technical thing: chains can compose two ways. *Sequential* is the default — chain B waits for chain A's output, then runs. *Parallel* is when two chains can run from the same input without depending on each other; their outputs join at a downstream step. Sequential is simpler to reason about; parallel is faster when the chains are independent. Bridge from frontend: this is the same distinction as `await`ing two `fetch()` calls in series versus `Promise.all()`-ing them. Concrete consequence: every chain composition should be drawn as a DAG (directed acyclic graph) before being implemented. The shape of the DAG tells you the worst-case latency (longest path) and the maximum parallelism (max width). Trying to figure out the dependencies after the chains are wired together is the source of most pipeline tangles.

```
sequential composition           parallel composition
─────────────────────           ─────────────────────
   A                                A
   │                                │
   ▼                          ┌─────┴─────┐
   B                          ▼           ▼
   │                          B           C
   ▼                          │           │
   C                          └─────┬─────┘
                                    ▼
latency: A + B + C            D (joins B and C)

                              latency: A + max(B,C) + D
```

#### The cascading-error failure mode

The technical thing: in a sequential chain `A → B → C` with per-step accuracy 95%, end-to-end accuracy is `0.95 × 0.95 × 0.95 = 0.857`. Three chains at 95% individually produce a pipeline that's right only 86% of the time. Five chains at 95% produce 77%. Ten chains at 95% produce 60%. The math is sobering: as the chain grows, individual quality is not enough. Bridge from frontend: this is the same compounding problem as joining 10 microservices each with 99.9% uptime and discovering your composite system is at 99%. Concrete consequence: validate aggressively at every boundary so the *per-step accuracy* of "validated input → validated output" is much higher than the *raw LLM accuracy*. Validation catches malformed outputs early and either retries (extending latency but holding quality) or fails fast (degrading availability but preserving quality), instead of letting a bad output corrupt the rest of the pipeline.

```
compounding error in unvalidated chains

steps:    1     2     3     4     5     6     7     8     9     10
acc=99%:  99%   98%   97%   96%   95%   94%   93%   92%   91%   90%
acc=95%:  95%   90%   86%   81%   77%   74%   70%   66%   63%   60%
acc=90%:  90%   81%   73%   66%   59%   53%   48%   43%   39%   35%
```

### Move 3 — The principle

The principle that generalises: *a chain is only as strong as its weakest boundary*. The classical anti-pattern is to focus on chain quality individually (better prompts, better few-shot examples) without investing in boundary discipline. The senior move is the opposite — invest first in boundary contracts (schemas, validation, structured retry) and only then in chain quality. A 90%-accurate chain with strong boundaries outperforms a 95%-accurate chain with weak boundaries, because the boundary discipline catches the 10% of bad outputs *before* they cascade. The full picture is below.

---

## Prompt chaining — diagram

```
┌─ Prompt chaining as a typed pipeline ───────────────────────────────────┐
│                                                                         │
│   Raw user input                                                        │
│        │                                                                │
│        ▼                                                                │
│   ┌────────────────┐                                                    │
│   │ Chain A        │       chain = LLM call + prompt template +         │
│   │ (Classify)     │               output schema                        │
│   └────────────────┘                                                    │
│        │                                                                │
│        ▼ raw string output                                              │
│   ┌────────────────┐                                                    │
│   │ Boundary       │       parse + validate + retry-on-fail             │
│   │ (Zod parse)    │                                                    │
│   └────────────────┘                                                    │
│        │                                                                │
│        ▼ ClassifyOut (typed, validated)                                 │
│   ┌────────────────┐                                                    │
│   │ Chain B        │       receives validated input,                    │
│   │ (Summarize)    │       outputs to next boundary                     │
│   └────────────────┘                                                    │
│        │                                                                │
│        ▼ raw string output                                              │
│   ┌────────────────┐                                                    │
│   │ Boundary       │                                                    │
│   │ (Zod parse)    │                                                    │
│   └────────────────┘                                                    │
│        │                                                                │
│        ▼ SummarizeOut (typed, validated)                                │
│   ┌────────────────┐                                                    │
│   │ Chain C        │                                                    │
│   │ (Tag)          │                                                    │
│   └────────────────┘                                                    │
│        │                                                                │
│        ▼                                                                │
│   ┌────────────────┐                                                    │
│   │ Final          │       user-visible result                          │
│   │ output         │                                                    │
│   └────────────────┘                                                    │
│                                                                         │
│   The two failure modes:                                                │
│                                                                         │
│   With boundary validation:                                             │
│   chain A returns malformed JSON                                        │
│        ▼                                                                │
│   boundary catches it, retries chain A with stricter prompt             │
│        ▼                                                                │
│   chain B receives a validated input or the pipeline halts cleanly      │
│                                                                         │
│   Without boundary validation:                                          │
│   chain A returns malformed JSON                                        │
│        ▼                                                                │
│   chain B parses what it can; some fields are wrong                     │
│        ▼                                                                │
│   chain C operates on wrong fields; produces plausible wrong output     │
│        ▼                                                                │
│   user sees confidently wrong final result; no error logged             │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

The diagram makes the chain's *spine* (chains) and *joints* (boundaries) visible separately. The chain quality is in the spine; the system quality is in the joints. Most pipelines that fail in production have strong spines and weak joints — the engineer focused on the visible thing (the prompts) and not the load-bearing thing (the contracts between them).

---

## In this codebase

**Not yet implemented.** reincodes is a Next.js static-export DSA visualizer with zero AI surface in production code — no chains, no LLM calls, no pipelines. The existing study guide ([`../study-prompt-engineering/06-single-purpose-chains.md`](../../study-prompt-engineering/06-single-purpose-chains.md)) covers the *prompt-engineering side* of the same pattern (when to split, when to keep monolithic); this file covers the *AI-engineering side* (the typed contracts, the validation discipline, the cascading-error math). The buildable target is below in Project exercises — a `/ai/prompt-chaining` page that renders a 3-stage chain with toggleable boundary validation, showing how a single bad output propagates with and without validation.

**Expected file paths** (when built):
- `src/app/ai/prompt-chaining/page.tsx` — the visualizer page
- `src/components/PromptChainingVisualizer/` — chain boxes, boundary parse indicators, toggle for validation on/off, cascading-error animation
- `public/ai/prompt-chaining/chain-traces.json` — precomputed traces of a 3-stage chain with good inputs, bad inputs, and the boundary-validated vs boundary-skipped outputs
- `scripts/precompute-prompt-chaining.ts` — build-time script that runs the 3 chains against Anthropic with deliberate bad-input cases injected to demonstrate cascading errors

---

## Elaborate

### Where this pattern comes from

Prompt chaining as a named pattern is older than LLMs but became load-bearing in late 2022 when GPT-3.5 made structured outputs reliable enough to use as input to subsequent calls. LangChain (launched October 2022) popularized "Chain" as a first-class abstraction. Anthropic's prompt engineering guide formalized "chain of prompts" as a best practice in 2023. The deeper roots are in *Unix pipes* (1972) — small tools, single jobs, composed via stdin/stdout — and in *functional reactive programming* — typed transformations composed via operators. What 2023–2024 added was the discipline that "typed" must be *enforced at the boundary*, not just "intended" — because LLM outputs are stochastic and untrusted.

### The deeper principle

The deeper principle is that *type discipline at the LLM boundary is the engineering move that scales* from a single chain to a pipeline of any depth. The 1990s lesson was that microservices fail without strong API contracts (typed schemas, OpenAPI, Protobuf); the 2010s lesson was that data pipelines fail without strong intermediate schemas (Avro, Parquet, dbt models); the 2020s lesson is that LLM pipelines fail without strong inter-chain contracts (Zod schemas, JSON Schema, OpenAI/Anthropic structured outputs). The same pattern shows up every decade at a new boundary because the failure mode is the same: untyped boundary + stochastic component = silent garbage propagation. The naming changes; the discipline doesn't.

### Where this breaks down

The chain framing breaks down for *agentic loops* where the structure of the next step depends on the *content* of the previous step. In an agent loop, chain N+1's identity (which tool to call, which sub-prompt to run) is determined by chain N's output; the pipeline isn't a fixed DAG, it's a dynamic state machine over messages. The boundary validation still applies (each tool call has a typed schema), but the *composition* shape changes — you can't draw the DAG up front because the DAG is constructed at runtime. The chain-vs-agent split is the load-bearing decision in any planned LLM system; cross-reference `04-agents-and-tool-use/` (planned sub-section, sibling to this one).

### What to explore next

- [01-context-window](01-context-window.md) → each chain has its own context window budget; chaining splits one giant budget into multiple smaller budgets
- [02-lost-in-the-middle](02-lost-in-the-middle.md) → why chaining can be a mitigation for long-context attention degradation (multiple shorter calls vs one long call)
- [../study-prompt-engineering/06-single-purpose-chains](../../study-prompt-engineering/06-single-purpose-chains.md) → the prompt-engineering sibling concept — when to split, when to keep monolithic
- [../study-prompt-engineering/02-structured-outputs](../../study-prompt-engineering/02-structured-outputs.md) → the type-level enforcement that makes boundary validation tractable
- [../03-retrieval-and-rag/11-rag](../03-retrieval-and-rag/11-rag.md) → the canonical 5-stage chain (chunk → embed → store → retrieve → generate) is a chain in this sense

---

## Tradeoffs

### Comparison table — both costs in one frame

```
┌──────────────────┬──────────────────────┬─────────────────────────┐
│ Cost dimension   │ Path taken           │ Alternative             │
│                  │ (chained + validated)│ (one big prompt)        │
├──────────────────┼──────────────────────┼─────────────────────────┤
│ LLM calls/req    │ N calls (1 per chain)│ 1 call                  │
│ Total cost/req   │ N × per-chain cost   │ Higher per-call cost    │
│                  │                      │ (longer prompt + output)│
│ Latency          │ sum(chain latencies) │ One longer call         │
│                  │ or max() if parallel │                         │
│ Per-step eval    │ Per-chain accuracy   │ End-to-end only         │
│                  │ + boundary success   │                         │
│ Failure isolation│ Which chain failed   │ "It returned wrong JSON"│
│                  │ is loggable          │ — no inner attribution  │
│ Reproducibility  │ Replay any chain     │ Replay the whole call   │
│                  │ in isolation         │                         │
│ Cascading errors │ Mitigated by         │ Compound at every       │
│                  │ boundary validation  │ implicit boundary       │
│ Provider lock-in │ Each chain can use   │ One model handles all   │
│                  │ a different model    │ jobs; can't swap        │
│ Code complexity  │ N chain modules +    │ One prompt file         │
│                  │ N schemas            │                         │
└──────────────────┴──────────────────────┴─────────────────────────┘
```

### What we gave up (when planning the reincodes visualizer)

The first cost is *precompute complexity*. A meaningful `/ai/prompt-chaining` visualizer needs to show the cascading-error story — same chain, same input, two runs (validation on, validation off), different outputs. That requires the precompute script to run each chain twice for each demo input, and to inject *deliberate bad outputs* in the validation-off path so the cascading-error narrative renders. About a full day of design work on the precompute script alone (which input cases? which deliberate bad outputs? which boundary validations to skip?) before the page renders anything.

The second cost is *teaching surface entanglement with the prompt-engineering sibling file*. [`../study-prompt-engineering/06-single-purpose-chains.md`](../../study-prompt-engineering/06-single-purpose-chains.md) covers the *when to split* question; this file covers the *how to compose* question. The split is real (one is a design decision, one is a composition discipline) but the reader has to be told which file answers which question. The cross-reference at the top of this file (`See also`) is the seam.

The third cost is *bundle size for the chain traces JSON*. Three chains × two paths (validated + unvalidated) × five demo inputs × full LLM traces per chain = roughly 200–400KB of JSON in the route bundle. That's a measurable hit. Code-splitting under `/ai/prompt-chaining` keeps it off the home page, but the route is heavy.

### What the alternative would have cost (skipping the visualizer)

If reincodes never builds `/ai/prompt-chaining`, the cost is zero in the codebase. The pattern is documented here and reinforced in the prompt-engineering guide. The actual production use lives at other portfolio projects (loopd's 5-chain pipeline is the canonical example in the curriculum). reincodes stays pure-DSA.

The cost of *not* building it shows up at the moment an interviewer asks "how do you compose multiple LLM calls in a production system?" Without a visualizer, the candidate describes the pattern verbally or with whiteboard diagrams. That's perfectly fine but weaker than "here's the visualizer — click 'validate boundary' on/off and watch what happens to the final answer when chain A returns a malformed category."

### The breakpoint

The visualizer earns its place the day the candidate is preparing for a Senior+ AI-engineering interview round and needs to demonstrate that they distinguish between *demos* (one prompt) and *systems* (chained prompts with typed boundaries). The interview signal is whether the candidate has internalized the cascading-error math — "5 chains at 95% is a 77% pipeline" — and the mitigation. The breakpoint is event-shaped.

### What wasn't actually a tradeoff

Skipping validation between chains was never a real option. Without validation, the chain stops being a *pipeline* and becomes a *sequence of vibes* — each chain trusts the previous one's output without checking. The cascading-error math compounds against you, and the pipeline degrades in production in ways the dev environment can't catch. The cost of validation is roughly 5–10 lines of code per boundary (Zod schema + parse + retry); the cost of *not* validating is invisible in dev and 10–20 percentage points of accuracy loss in prod. There's no scenario where the latter wins.

---

## Tech reference (industry pairing)

### Anthropic Messages API + tool use

- **Codebase uses:** not yet — each chain in the planned `/ai/prompt-chaining` visualizer would be a separate Anthropic Messages API call, with the output structure enforced via the `tools` parameter (the tool-use shape is the canonical Anthropic pattern for typed outputs).
- **Why it's here:** Anthropic's tool-use parameter is the type-level enforcement that makes chain outputs reliable enough to use as the next chain's input. The visualizer's "boundary validation succeeded" path renders the tool-use parsing as the validation step.
- **Leading today:** Anthropic Messages API with tool use — `innovation-leading` for typed-output chain composition, 2026.
- **Why it leads:** the tool-use schema enforces structure at the model level (model is fine-tuned to emit valid tool calls), the response shape is parsable without regex hacks, and the cache discount applies to the static prefix (the tool schema is part of the cached prefix).
- **Runner-up:** OpenAI Chat Completions with structured outputs (`response_format`) — `adoption-leading` for cross-vendor typed-output chains; strict mode (`strict: true`) gives near-100% schema conformance.

### Zod (TypeScript schema validation)

- **Codebase uses:** not yet — would be the validator at every chain boundary in the planned visualizer. Each chain's output schema is a Zod schema; the boundary parse is `ChainOutputSchema.parse(rawString)`.
- **Why it's here:** Zod is the de facto TypeScript validator. The boundary validation step is exactly the use case Zod was designed for — parse untrusted input, narrow to a typed object, throw on mismatch.
- **Leading today:** Zod — `adoption-leading` for TypeScript schema validation, 2026.
- **Why it leads:** `z.infer<>` gives compile-time types from runtime schemas; ecosystem support (zod-to-json-schema for OpenAI structured outputs, anthropic-zod-bindings) means one schema definition works across multiple boundaries.
- **Runner-up:** Valibot — `innovation-leading` modular schema validator with a smaller bundle footprint; relevant if the static-export bundle-size constraint ever makes Zod too heavy in the route bundle.

### LangChain JS (Runnable pipelines)

- **Codebase uses:** not yet — would be the orchestration layer if the visualizer ever needs to render *runtime* chain execution. The `RunnableSequence` and `RunnableParallel` primitives map directly to the sequential and parallel composition shapes in this file's diagram.
- **Why it's here:** LangChain's Runnable interface is the canonical abstraction for chain composition in JS/TS, even though many production systems eventually outgrow it.
- **Leading today:** LangChain JS — `adoption-leading` for chain orchestration, 2026 (waning in 2026 but still the most widely-deployed).
- **Why it leads:** the largest ecosystem of pre-built chains, integrations with every major LLM provider, and a streaming API that handles the per-chain SSE plumbing.
- **Runner-up:** Mastra (TypeScript-native agent framework) — `innovation-leading` for typed chain composition; smaller and more opinionated than LangChain, with better TS ergonomics; the choice for new projects in 2026.

---

## Project exercises

### [B-reincodes-prompt-chaining-viz] Build the prompt-chaining visualizer

- **Exercise ID:** `[B-reincodes-prompt-chaining-viz]` — derived from the curriculum's reincodes "interview prep surface" entry; aligns with Phase 1 concept `[C1.10]` (single-purpose chains vs agent loops) and Phase 1 concept `[C1.4]` (structured outputs as typed contracts).
- **What to build:** a page at `/ai/prompt-chaining` that renders a 3-stage chain (`classify` → `summarize` → `tag`) as three connected boxes. Between each pair of boxes is a *boundary* indicator showing the Zod schema in use. A toggle at the top — "validate at every boundary" — switches between two precomputed traces of the same input. With validation on: the bad output from chain A gets caught and retried with a stricter prompt; the pipeline produces the correct final answer. With validation off: the bad output passes through unchanged; chain B and chain C operate on corrupted input; the final answer is plausibly-wrong. The reader sees the cascade in slow motion.
- **Why it earns its place:** the visualizer makes the *cascading-error math* visceral — the reader doesn't just read about boundary validation, they watch a single bad chain-A output corrupt the entire pipeline. The interview signal is that the candidate distinguishes demos from systems and has built a teaching artifact for the distinction.
- **Files to touch:** `src/app/ai/prompt-chaining/page.tsx` (visualizer page), `src/components/PromptChainingVisualizer/` (chain boxes, boundary indicators, toggle, animation timeline), `public/ai/prompt-chaining/chain-traces.json` (precomputed traces: 5 input cases × 2 paths each = 10 traces), `scripts/precompute-prompt-chaining.ts` (build-time script that runs the 3 chains, injects deliberate bad outputs at the boundary in the validation-off path, captures the cascading-error outputs). Add a row to `src/components/Home/conceptsData.tsx`'s `CONCEPT_CATEGORIES` under the `ai-engineering` category.
- **Done when:** the page loads at `/reincodes/ai/prompt-chaining/` in production (GitHub Pages), three chain boxes render with their schemas, the validation toggle switches the rendered trace, the animation steps through chain A → boundary → chain B → boundary → chain C with timing controls, the cascading-error case shows the wrong final answer with the inflection point highlighted. `next build` passes under `output: "export"`.
- **Estimated effort:** 2–3 days. Precompute script design (3 chains, 5 inputs, deliberate bad outputs, traces JSON shape): one day. Visualizer page + animation timeline: one day. Polish + cross-browser: half day.

---

## Summary

### Part 1 — concept recap

Prompt chaining is the LLM-equivalent of Unix pipes — small, single-purpose, sequential LLM calls composed via typed contracts at every boundary. Each chain is a function with a typed input and a typed output; between each pair of chains sits a *boundary parse* step that validates the previous chain's output (Zod, JSON Schema, structured-output enforcement) before passing it to the next chain. The load-bearing discipline is *validating at every boundary* — without it, a single bad chain-A output cascades through chains B and C unchecked, and end-to-end accuracy compounds against you (5 chains × 95% = 77%). In reincodes the concept is *planned* rather than implemented; the buildable target is `/ai/prompt-chaining` — a 3-stage chain visualizer with a validation toggle, precomputed at build time to show the cascading-error story side-by-side with the validation-mitigated path. The static-export contract forces the precompute approach; the cascading-error narrative is the pedagogical payload.

### Part 2 — key points to remember

- **The shape**: typed pipeline. Each chain is a function with typed input + typed output. Each boundary has a parse-and-validate step.
- **The composition modes**: sequential (chain B waits for chain A) and parallel (chains B and C run from the same A output, join downstream). Draw the DAG before implementing.
- **The cascading-error math**: 5 chains at 95% per-step accuracy = 77% end-to-end. Validation at boundaries is what mitigates the compounding.
- **The discipline**: every boundary is a parse + validate + retry, not just a "JSON.parse and hope." Treat LLM outputs as untrusted inputs.
- **The reincodes shape**: implementation is Case B; buildable target is `/ai/prompt-chaining` — a 3-stage chain visualizer with validate-on / validate-off toggle, precomputed traces showing cascading-error mitigation.

---

## Interview defense

### What an interviewer is really asking

Behind "how do you compose multiple LLM calls?" the interviewer is probing whether the candidate has shipped a multi-chain system to production or just composed prompts in a notebook. A junior answer describes chaining as "you take the output of one and pass it to the next" without naming the validation step. A senior answer leads with the cascading-error math and the boundary discipline: "I compose chains as a typed pipeline, validate at every boundary with a Zod schema, retry on schema failure with a stricter prompt, and run a per-chain eval so I can attribute end-to-end failures to specific chains." The interviewer is checking whether the candidate has internalized that *the boundary is the load-bearing thing, not the prompt*.

### Likely questions

**Q (mid):** What's prompt chaining?

A: Prompt chaining is composing multiple LLM calls into a pipeline where each call's structured output becomes the next call's structured input. The pattern is the LLM-equivalent of Unix pipes — small, single-purpose, typed contracts at every joint. Concretely: instead of one giant prompt that asks for a category, a summary, and tags in one JSON, I'd run three chains — `classify(entry) → category`, `summarize(entry, category) → summary`, `tag(entry, category, summary) → tags` — with a Zod parse between each pair. The advantage is per-chain eval (I can measure where the pipeline degrades), failure isolation (I know which chain produced a malformed output), and model flexibility (chain A can use Haiku for cost, chain B can use Sonnet for quality).

```
one big prompt                            chained prompts
─────────────────────                     ─────────────────────
LLM(entry) → {category, summary, tags}    chain A: LLM(entry) → category
                                          chain B: LLM(entry, category) → summary
                                          chain C: LLM(entry, cat, sum) → tags

  + 1 call                                 + 3 calls (more $)
  + monolithic prompt                      + 3 small prompts
  - hard to attribute failures             + per-chain eval
  - all-or-nothing retries                 + per-chain retry
  - correlated failure modes               + decorrelated failures
```

**Q (senior):** What's the failure mode when you chain prompts without validation between them?

A: Cascading errors. If chain A is right 95% of the time and chain B trusts A's output without validation, chain B's end-to-end accuracy is capped at 95% — even if chain B itself is perfect. Stack three chains at 95% each and the pipeline is 86% accurate end-to-end. Stack five and you're at 77%. The math compounds, and the failures are *silent* in production — chain B happily processes chain A's wrong category and emits a plausible-sounding wrong summary; chain C trusts the wrong summary and emits a confidently wrong tag set. The mitigation is boundary validation — every chain's output gets parsed against its schema (Zod or equivalent), and on schema failure either retry chain A with a stricter prompt or fail the pipeline with a structured error. The validation discipline turns "95% × 95% × 95% = 86%" into "98% × 98% × 98% = 94%" because the boundary catches most malformed outputs before they corrupt downstream chains.

```
without validation                        with validation
──────────────────────                    ──────────────────────
chain A: 95%                              chain A: 95%
chain B trusts A: capped at 95%           boundary catches malformed A: 98%
chain C trusts B: capped at 0.95²         chain B receives validated: 95%
                                          boundary: 98%
end-to-end: 0.95³ = 86%                   chain C: 95%
                                          end-to-end: ~94%
```

**Q (arch):** At 10× the chain depth — say, 30 chained calls — does the chaining pattern still hold, or do you switch to something else?

A: At 30 chained calls the pattern doesn't break; the *composition layer* breaks first. Sequential chaining of 30 calls means worst-case latency is sum(30 chain latencies) — easily 60+ seconds, well past any user-facing tolerance. Two structural changes need to happen. First, draw the DAG and parallelize aggressively — typically only 5–10 of those 30 calls are actually sequential; the rest can run in parallel. Latency drops from sum() to longest-path. Second, move from synchronous chaining to *event-driven orchestration* — a workflow engine (Inngest, Temporal, LangGraph's persistent state) that runs chains as jobs, persists intermediate state, and resumes from failures. The boundary validation discipline scales — each of the 30 chains still has a typed schema, each boundary still parses — but the *composition layer* is no longer "one giant `await` chain in TypeScript"; it's a state machine over a queue. The breakpoint where this matters is roughly 5–7 chains in synchronous sequential composition; past that the orchestration layer earns its place.

```
3 chains: synchronous sequential       30 chains: workflow orchestration
                                        ┌──────────────────────────────┐
chainA → chainB → chainC                │  Orchestrator                │
                                        │  (Inngest / Temporal /       │
total: 3-6 seconds                      │   LangGraph)                 │
                                        │                              │
                                        │  ├ chainA (parallel batch 1) │
                                        │  ├ chainB (parallel batch 1) │
                                        │  ├ chainC (parallel batch 2) │
                                        │  ├ ... (DAG-scheduled)       │
                                        │  └ chainZ                    │
                                        │                              │
                                        │  total: longest-path + retry │
                                        │  budget + idempotency        │
                                        └──────────────────────────────┘
```

### The question candidates always dodge

**Q:** Won't chaining cost N× more in LLM spend than one big prompt? Why pay that premium?

A: That argument compares the wrong costs. Yes, chaining means N calls instead of 1, so the *raw API cost* is higher. But chaining lets you (a) use cheaper models for the easier sub-tasks — chain A can be Haiku, chain B can be Sonnet, chain C can be Haiku — and (b) cache more aggressively because each chain has a smaller, more-stable prefix. The cost calculus usually comes out close to even, sometimes in chaining's favor. The real cost difference is in *operations*. Cost ledger:

```
one big prompt                           chained prompts
─────────────────────                    ─────────────────────
+ 1 API call ≈ $0.05                     + 3 API calls ≈ $0.04 (mixed
  (all jobs on Sonnet)                     models, prefix caching)
- monolithic prompt = larger             + smaller per-chain prompts
  cached prefix shifts on every edit       cache better
+ 1 retry on failure (wipes              + retry the failing chain only
  whole call's progress)                   (don't redo passed chains)
- can't swap model per sub-task          + chain A on Haiku, chain B on
                                           Sonnet, chain C on Haiku
- end-to-end eval only                   + per-chain eval; pipeline
                                           accuracy decomposable
- correlated failure mode                + decorrelated failures
  (one bad output → whole call wrong)      via boundary validation
- 2-day debugging when output regresses  + boundary log says exactly
  ("which part of the prompt broke?")      which chain failed
```

The honest answer: the per-call cost looks higher; the *operational* cost (debugging time, eval iteration speed, model-swap flexibility, retry cost on partial failures) is dramatically lower. The interview move is naming the operational dimension explicitly rather than defending raw API spend.

### One-line anchors

- "Prompt chaining is Unix pipes for LLMs — small, single-purpose, typed contracts at every joint."
- "5 chains at 95% per-step accuracy = 77% end-to-end. Boundary validation is what reclaims the points."
- "The boundary is the load-bearing thing, not the prompt. Strong joints, decent spines beats weak joints, strong spines."
- "Sequential or parallel — draw the DAG before implementing. Latency is the longest path; max parallelism is the max width."
- "Past 5–7 chains in synchronous sequential composition, the orchestration layer earns its place. Chaining the pattern stays; the runtime changes."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw the typed-pipeline diagram from memory: three chain boxes connected by two boundary parse steps, raw user input feeding chain A, final output emerging from chain C. Label each boundary with what gets validated.

✓ Pass: 3 chains, 2 boundaries, typed inputs/outputs labelled, raw-input and final-output endpoints clear
✗ Fail: re-read the primary diagram, wait 10 minutes, try again

### Level 2 — Explain it out loud

Explain prompt chaining to a colleague who has shipped a one-prompt LLM feature and is wondering why their PM wants them to "break it up." No notes. Under 90 seconds.

Checkpoints — did you:
- Name the chain-as-typed-function abstraction?
- Distinguish sequential from parallel composition?
- Mention boundary validation as the load-bearing discipline?
- Name the cascading-error math (X% × X% × X% compounds)?
- Reference the buildable target (`/ai/prompt-chaining` visualizer) as how you'd teach it?

If you skipped any: you described the structure, you didn't argue for the discipline.

### Level 3 — Apply it to a new scenario

A planned reincodes feature: a chain that takes a DSA algorithm name from the user (e.g., "quicksort") and produces (a) a 1-paragraph natural-language explanation, (b) a short pseudo-code block, (c) a list of 3 worked example inputs. The current implementation is one prompt that asks for all three.

Decompose this into a chain. Define the input/output schema for each sub-chain. Draw the DAG — is it sequential, parallel, or mixed? Where would you place the boundary validation? What would each chain's eval look like?

Write your answer (5+ sentences plus the DAG). Then verify against the `## How it works` section's "sequential vs parallel composition" walkthrough.

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff from the Tradeoffs section. Answer in writing: "If I were starting the `/ai/prompt-chaining` visualizer today, would I precompute the cascading-error traces with deliberate bad outputs injected, or would I run the chains live in a serverless function so the demo is interactive? Why? What does each choice cost?"

Reference the actual code:
→ Point to `next.config.ts` for the static-export contract that forces the precompute decision
→ Point to where the chain-traces JSON would land (`public/ai/prompt-chaining/chain-traces.json`)

There is no right answer. The point is specificity.

### Quick check — code reference test

Without opening any files, answer:
- What's the math for end-to-end accuracy of a 5-chain pipeline at 95% per-step?
- What library would handle boundary validation in TypeScript?
- What's the difference between sequential and parallel chain composition?

Then verify by re-reading the `## How it works` section.

✓ Pass: "0.95^5 ≈ 77%", "Zod", "sequential = depends on previous; parallel = independent, join downstream"
✗ Fail on details: that's fine — the shape is what matters. The math should be recoverable from the multiplication.
