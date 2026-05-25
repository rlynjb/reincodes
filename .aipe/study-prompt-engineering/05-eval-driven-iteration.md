# Eval-driven prompt iteration

**Industry name(s):** Eval-driven development, prompt evaluation, regression testing for LLMs, golden set evaluation
**Type:** Industry standard

> The discipline that separates senior prompt work from junior: change a prompt → run it against a held-out eval set → keep the change only if scores improve without regressions. Vibes-based iteration is how prompts get worse over time without anyone noticing.

**See also:** → [01-anatomy](01-anatomy.md) · → [02-structured-outputs](02-structured-outputs.md) · → [03-prompts-as-code](03-prompts-as-code.md) · → [04-token-budgeting](04-token-budgeting.md) · → [10-self-critique](10-self-critique.md)

---

## Why care

### Move 1 — The grounded scenario

You've shipped a classifier chain — input is a todo string, output is a label like `todo / question / vent`. It works fine for two weeks. A teammate notices the classifier is mislabeling some sarcastic vents as questions ("why am I even alive?" → `question` instead of `vent`). They open a PR that adds three new instructions to the system prompt: "Pay attention to sarcasm." "Hyperbolic phrasing usually means vent." "Questions are literal information requests." You eyeball the change, run two examples in the playground, agree it looks better, merge. A month later the on-call gets a Slack ping: the daily-summary chain that depends on the classifier is producing nonsense, because the new instructions broke the `todo` label on imperative sentences with question marks ("can you remind me to call mom?" → `question` instead of `todo`).

### Move 2 — Name the question

That regression has a name — *eval-driven prompt iteration*, or more precisely, the absence of it. Not whether the new instructions sound smart, not whether the playground examples improved, not whether the PR reviewer agreed — just whether the change improved a *held-out test set* without regressing any case that already passed. The question every prompt change has to answer is: "what's the score against the eval set, before and after?" Without that number, you're iterating on vibes.

### Move 3 — Why answering that question matters

**Why you need to answer that question at all:** because LLM prompts are non-deterministic functions whose behavior on case A you've never seen depends on token-level interactions you can't predict. Hamel Husain's writing on evals — the canonical reference in the field — makes this point relentlessly: "your evals are your product." I have shipped prompts that I was *sure* were better, that passed every playground check, that the team agreed looked sharper — and that regressed a critical edge case nobody had thought to test. The eval set is what catches that. Without one, you ship the regression and find out from production telemetry three weeks later. With one, you catch it before the PR merges. The senior-vs-junior dividing line in prompt work is whether the engineer iterates against a number or against a feeling.

### Move 4 — Concrete before/after

Without an eval set:

- "It looks better in the playground" → merge
- A month later: production output regressed on a class of inputs nobody thought to check
- Debugging: bisect the prompt, can't tell which instruction caused which regression
- Fix: add another instruction to counteract the regression → new regression a month later
- Outcome: prompt grows in length, quality drifts, nobody trusts the chain

With an eval set:

- Change prompt → run 30 cases through both versions → diff outputs
- New version scores 28/30, old version scored 27/30; new version regressed 1 case
- Reviewer: "the regression case is the sarcastic-question class — is that an acceptable tradeoff?"
- Decision is *visible*, *defensible*, and *cheap to revisit* (the eval set persists)
- Outcome: prompt stays diff-able, regressions get caught at the PR, quality is observable

### Move 5 — The one-line summary

Eval-driven iteration is the prompt-engineering version of `pnpm test` — you don't ship the change until the test suite passes, where "the test suite" is 20-50 hand-curated input/output pairs (the golden set) plus every production failure that's been added back as a regression case (the regression suite). The mechanics are below.

---

## How it works

### Move 1 — The mental model

A prompt change is a code change to a non-deterministic function. The same input might produce different output across calls; the same prompt with one word changed might produce wildly different output. So the only way to know whether a change is an improvement is to measure it against a fixed set of inputs whose expected outputs you've already agreed on. That fixed set is the golden set. The iteration loop becomes: change prompt → run golden set → diff outputs → keep change if score went up without regression.

The strategy: you stop treating prompt iteration as authoring (write something that sounds right) and start treating it as engineering (write something that passes the tests).

```
The iteration loop

  ┌────────────────────────────┐
  │ Change prompt              │
  └────────────┬───────────────┘
               ▼
  ┌────────────────────────────┐
  │ Run against eval set       │
  │ (30 cases, 5 minutes)      │
  └────────────┬───────────────┘
               ▼
  ┌────────────────────────────┐
  │ Diff outputs vs prior run  │
  │ - Score up?                │
  │ - Any case regressed?      │
  └────────────┬───────────────┘
               ▼
  ┌────────────────────────────┐
  │ Keep change if both true   │
  │ Revert otherwise           │
  └────────────────────────────┘
```

### Move 2 — The layered walkthrough

#### The golden set

The technical thing: 20-50 hand-curated input/output pairs, stored in version control alongside the prompt. Each pair captures *one expected behavior* — typically one input, one expected output, plus optionally tags for the class of behavior being tested. If you're coming from frontend, this is like a Storybook fixture or a Jest test case: a known input, a known expected output, a passing/failing assertion. Concrete consequence: when you add a new feature to the prompt (handle sarcasm), you add 3-5 cases that exercise that feature, run the full set, and see whether the new cases pass without breaking the old ones. The set grows with the chain.

```
golden set shape — one JSON file per chain

[
  {
    "id": "todo-001",
    "input": "buy milk",
    "expected": { "label": "todo" },
    "tags": ["imperative", "common"]
  },
  {
    "id": "vent-007",
    "input": "i hate mondays",
    "expected": { "label": "vent" },
    "tags": ["emotional", "common"]
  },
  {
    "id": "question-edge-003",
    "input": "can you remind me to call mom?",
    "expected": { "label": "todo" },
    "tags": ["imperative", "question-form", "edge"]
  }
]
```

#### The regression suite

The technical thing: a second set of cases sourced from *production failures*. Every time a customer reports an output that's wrong, or telemetry surfaces a chain output that breaks downstream parsing, the input + expected output gets added to the regression suite. The bridge from frontend: this is the bug-report-becomes-test pattern. A bug ticket says "the chain returned X for input Y, but should have returned Z" — you add `{input: Y, expected: Z}` to the regression suite *before* you ship the fix, then ship the fix, then verify the new case passes. Concrete consequence: every production failure is fixed forever. The regression suite never shrinks.

```
regression suite — grows monotonically

Production failure 2026-01-12:
  Input:    "remind me to call mom"
  Got:      { label: "question" }
  Expected: { label: "todo" }
  Fix:      Added "imperative sentences with question marks → todo"
            to system prompt
  Case added: regression-2026-01-12-001
  Status:    permanently in the eval set
```

#### The iteration loop

The technical thing: a script that runs the eval set against a candidate prompt version, captures per-case outputs, and produces a diff against the previous run. The bridge from frontend: it's `pnpm test --watch` for prompts. In React you change a component, the test runner re-runs the affected tests; in prompt work you change a prompt file, the eval runner re-runs the affected cases. Concrete consequence: the loop has to be fast (under 5 minutes for 30 cases) and cheap (each run costs ~$0.10-0.50 depending on model + tokens). If the loop is slow or expensive, engineers skip it; if it's fast and cheap, they use it on every change.

```
iteration loop — one shell command

$ pnpm eval --chain=classifier --version=candidate

Running 32 cases against classifier@candidate...
  ✓ todo-001 (87ms)
  ✓ todo-002 (62ms)
  ✗ todo-003 (74ms) — expected "todo", got "question"
  ✓ vent-001 (90ms)
  ...
  ✗ regression-2026-01-12-001 (68ms) — REGRESSION

Score: 30/32 (was 32/32 on main)
Regressions: 2 (1 new failure, 1 regression of a known fix)
Time: 3m 42s
Cost: $0.21

Decision: do not merge until regressions resolved
```

#### LLM-as-judge

The technical thing: using a separate LLM call to score each output against a rubric, when the expected output isn't a single canonical answer. Useful for chains where the output is free-form prose (a summary, a generated reply) where there's no "correct" answer but there is "better" and "worse." The bridge from frontend: think of it like a snapshot test where the comparison function is fuzzy — "is the new output as good as or better than the old one on this rubric?" Concrete consequence: LLM-as-judge is appropriate when the output is unstructured *and* the judging rubric is more reliable than human grading at scale. Concrete condition where it breaks: when the judging model has the same blind spots as the generating model (asking GPT-4o to evaluate GPT-4o output on subtleties of GPT-4o's voice — circular).

```
LLM-as-judge — when no canonical answer exists

For each (input, generated_output) pair:

  System: "You are an evaluator. Rate the response on
           accuracy (1-5), tone (1-5), and brevity (1-5).
           Return JSON: { accuracy, tone, brevity, notes }."

  User:   "Input was: [input]
           Response was: [generated_output]
           Rate it."

  Output: { accuracy: 4, tone: 3, brevity: 5,
            notes: "Misses the 'why' question, but correct
                    in what it does cover." }

  Aggregate over 30 cases for a per-rubric average.
```

#### Why you write the eval before iterating the prompt

The technical thing: the order of operations matters. If you write the eval after the prompt, you're tempted to write the eval *to match what the prompt currently does* — a passing eval that proves nothing. If you write the eval first, you're forced to articulate "what should this chain do?" before you've seen what it does, which is the harder and more useful question. The bridge from frontend: this is TDD applied to prompts. Red-green-refactor with prompts means: write the expected output (red), iterate the prompt until it passes (green), refactor the prompt while keeping the eval passing. Concrete consequence: chains built eval-first end up with crisper system prompts and tighter output schemas because the engineer had to think about the target before writing the means.

#### The specific bug: average up, edge case down

The technical thing: a prompt change that improves the average score but regresses a single critical case. The bridge from frontend: this is the classic "I optimized the common case and broke the edge case" failure — anyone who's tuned a hot path knows the shape. Concrete consequence: the eval set has to surface per-case results, not just averages. A 28/30 → 29/30 score that hides a `regression-2026-01-12-001` failure is worse than a 28/30 → 28/30 that holds the line on every case. The reporting matters as much as the eval itself.

### Move 3 — The principle

The principle that generalises beyond any one chain: *what you can't measure, you can't improve*. Software engineering learned this with tests, monitoring, and feature analytics decades ago. Prompt engineering is catching up. The teams shipping reliable LLM features in 2026 are the ones who built eval infrastructure first and iterated prompts second; the teams shipping unreliable features are the ones who iterate on vibes and find out from customer complaints. This isn't a sophistication-level question; it's a maturity-level question. Eval-driven iteration is the floor of professional prompt work, not the ceiling.

The full picture is below.

---

## Eval-driven iteration — diagram

```
┌─ Prompt source (versioned in git) ─────────────────────────────────┐
│   prompts/classifier@v2.md  ← candidate version                    │
│   prompts/classifier@v1.md  ← shipped version                      │
└───────────────────────────────┬────────────────────────────────────┘
                                │
                                ▼   feeds into runner
┌─ Eval runner (CLI or CI step) ─────────────────────────────────────┐
│                                                                    │
│   pnpm eval --chain=classifier --candidate=v2 --baseline=v1        │
│                                                                    │
│   ┌────────────────────────┬──────────────────────────────────┐    │
│   │ Golden set             │   Regression suite               │    │
│   │   classifier-          │     classifier-                  │    │
│   │     golden.json        │       regressions.json           │    │
│   │   (20-50 cases,        │     (every prod failure ever,    │    │
│   │    hand-curated)       │      monotonically growing)      │    │
│   └────────────────────────┴──────────────────────────────────┘    │
│                                                                    │
└───────────────────────────────┬────────────────────────────────────┘
                                │
                                ▼   runs each case
┌─ Provider (Anthropic / OpenAI) ────────────────────────────────────┐
│   For each case: send (system + few-shot + input) → capture        │
│   output → score against expected.                                 │
└───────────────────────────────┬────────────────────────────────────┘
                                │
                                ▼   produces diff
┌─ Output: score + per-case diff ────────────────────────────────────┐
│                                                                    │
│   Score:        30/32 (was 32/32)                                  │
│   New failures: 1 (todo-003 — "imperative with question mark")     │
│   Regressions:  1 (regression-2026-01-12-001)                      │
│   Cost:         $0.21                                              │
│   Decision:     DO NOT MERGE                                       │
│                                                                    │
│   ┌──────────────────────────────────────────────────────────┐     │
│   │ Per-case diff (excerpt)                                  │     │
│   │   todo-003:                                              │     │
│   │     v1 → { label: "todo" } ✓                             │     │
│   │     v2 → { label: "question" } ✗                         │     │
│   │   ↳ candidate degraded on imperative-question-form cases │     │
│   └──────────────────────────────────────────────────────────┘     │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

The boundary between the golden set and the regression suite is what makes the discipline scale. Golden set captures intended behaviors; regression suite captures historical failures. Together they define "what this chain does" in a way that survives engineer turnover, model upgrades, and prompt refactors.

---

## In this codebase

**Not yet implemented.** reincodes is a Next.js static-export DSA visualizer with no AI surface in production code — there are no chains to evaluate, no golden sets, no eval runners. The buildable target for this concept is below in Project exercises — a `/ai/eval-iteration` page that lets the reader load a golden set, toggle between two precomputed prompt variants (A and B), and see the per-row pass/fail diff with a regression alarm highlighting cases where B regressed despite a higher average score. The visualizer's job is to make the eval-driven discipline operable: the reader doesn't just read about why per-case diffs matter, they watch a regression hide inside a score improvement and learn to look for it.

**Expected file paths** (when built):
- `src/app/ai/eval-iteration/page.tsx` — the visualizer page
- `src/components/EvalIterationVisualizer/` — table rendering, version toggle, pass/fail diff
- `public/ai/eval-iteration/golden-set.json` — 20-30 precomputed input/expected pairs
- `public/ai/eval-iteration/variant-a-outputs.json` — outputs from prompt variant A
- `public/ai/eval-iteration/variant-b-outputs.json` — outputs from prompt variant B (with one deliberate regression)

---

## Elaborate

### Where this pattern comes from

Eval-driven prompt iteration didn't arrive fully formed either; it was forced into existence by Hamel Husain's writing on evals in 2023-2024, which captured what production teams had been learning the hard way. Before the discipline was named, prompt iteration looked like product-managers-vs-engineers arguments about "does this output feel better?" The shift came when teams started building golden sets to settle those arguments objectively. The pattern is still under-adopted — most LLM-feature shops still iterate on vibes — but every team that has shipped a reliable LLM feature for more than a year has converged on this practice or something very close to it.

### The deeper principle

The deeper principle is *non-determinism demands measurement*. Deterministic functions can be reasoned about; non-deterministic functions can only be characterized statistically. LLM prompts are non-deterministic in two senses: the model itself samples non-deterministically, and the model's behavior on case X depends on token-level interactions you can't predict from cases you've seen. The only way to know "is this change an improvement" is to measure improvement against a fixed set of representative cases. Software engineering learned this with tests, monitoring, A/B experiments, and feature analytics; prompt engineering is one decade behind on the same curve.

### Where this breaks down

The discipline breaks down when the chain's output is genuinely open-ended and human judgment is the gold standard — long-form creative writing, voice imitation, nuanced advice. In those cases the golden set can't be hand-curated because there's no canonical expected output, and LLM-as-judge inherits the same blind spots as the generating model. The honest answer for these cases is human-in-the-loop evaluation — sample 20-50 outputs per change, have humans rank them — which is slower and more expensive than automated eval but gives you a real signal. The trap is pretending automated eval works on these chains when it doesn't; you'll end up with a chain that scores well on the eval and produces output users don't like.

### What to explore next

- [10-self-critique](10-self-critique.md) → when self-critique earns its place as an alternative to golden-set evaluation
- [03-prompts-as-code](03-prompts-as-code.md) → if the prompt is versioned in git, the eval set has to live next to it
- [02-structured-outputs](02-structured-outputs.md) → structured outputs make eval-driven iteration *easier* because the per-case diff is a JSON comparison instead of a prose judgment
- Hamel Husain's "Your AI Product Needs Evals" → the canonical writing on this discipline; required reading

---

## Tradeoffs

### Comparison table — both costs in one frame

```
┌──────────────────┬─────────────────────┬─────────────────────────┐
│ Cost dimension   │ Path taken          │ Alternative             │
│                  │ (eval-driven)       │ (vibes-based)           │
├──────────────────┼─────────────────────┼─────────────────────────┤
│ Build time       │ 1-2 days to set up  │ Zero — no infra needed  │
│                  │ first eval set      │                         │
│ Per-iteration    │ 3-5 minutes + $0.20 │ 30 seconds (eyeball     │
│ time             │ to run eval         │  playground)            │
│ Iteration        │ Slower per change,  │ Faster per change,      │
│ velocity         │ fewer regressions   │ more regressions        │
│ Bug-find rate    │ Most regressions    │ Most regressions found  │
│                  │ caught in PR        │ in production           │
│ Onboarding cost  │ New engineer learns │ New engineer learns     │
│                  │ eval CLI in 30 min  │ "what does looking good │
│                  │                     │  mean for this chain?"  │
│                  │                     │ in weeks                │
│ Maintenance      │ Eval set has to be  │ No eval maintenance,    │
│ overhead         │ kept current with   │ but every prompt change │
│                  │ prompt schema       │ is a roll-of-dice       │
│ Cost per prompt  │ ~$0.20-0.50         │ Zero direct cost; high  │
│ change           │                     │ indirect cost (incidents)│
│ Defensibility    │ "Here's the score   │ "It felt better"        │
│                  │  delta and the      │                         │
│                  │  diff"              │                         │
└──────────────────┴─────────────────────┴─────────────────────────┘
```

### What we gave up (planning the visualizer)

The first cost is *engineering time before the page renders anything*. A meaningful `/ai/eval-iteration` visualizer needs 20-30 hand-curated golden cases plus two precomputed prompt variants (A as the baseline, B as the "looks better on average but regresses one case" variant) plus the per-case outputs for both. Producing that data takes ~half a day: design the schema, write the cases, call the API to capture outputs, package as JSON. The visualizer page itself is the easy part; the data is the hard part.

The second cost is *the deliberately-regressing variant*. The whole pedagogical point of the visualizer is showing how a regression can hide inside an average-score improvement. Constructing variant B so it actually does this — improves average by 1-2 cases while regressing a critical case — is harder than writing a "better" prompt. The author has to engineer the regression on purpose. That's a creative constraint that adds another half-day if you don't get it right on the first try.

The third cost is *the rubric problem for the variants*. To make the visualizer feel like real eval work, the cases need to span common, edge, and adversarial behaviors. If all 30 cases are easy, the visualizer trivializes the discipline. If too many cases are adversarial, the visualizer overstates how often regressions hide. Calibrating the case distribution to feel realistic is the third cost.

### What the alternative would have cost (skipping the visualizer)

If reincodes never builds `/ai/eval-iteration`, the cost is zero in the codebase. The discipline still gets taught — by this written file, by Hamel Husain's blog, by working through the curriculum's Phase 3 build items in aipe/loopd. The reincodes site stays pure-DSA.

The cost of not building it shows up in the portfolio story: eval-driven iteration is the senior-vs-junior dividing line in prompt work, and a hands-on visualizer that lets the reader catch a hidden regression is much sharper interview signal than "I read about it." The visualizer earns its place when the candidate is preparing for an AI-focused round and wants a concrete artifact to demo.

### The breakpoint

The visualizer earns its place the day the candidate has shipped enough prompts to have lived through a hidden-regression incident themselves and wants a teaching artifact that *reproduces the experience* for the reader. Until that lived experience exists, the visualizer would be teaching from theory rather than from production scars — which is what this written file is for. The breakpoint is event-shaped: the moment the candidate has a war story about an eval set catching what code review missed.

### What wasn't actually a tradeoff

Calling the real Anthropic API at request time inside the visualizer was not a real option — static-export contract precludes server runtime. Precomputed JSON outputs are the only path. This isn't a downgrade; it's the architectural constraint that defines what visualizer-shaped teaching looks like in reincodes.

---

## Tech reference (industry pairing)

### Hamel Husain's writing on evals

- **Codebase uses:** not yet — would be the canonical citation in the visualizer's `## Why this matters` panel (link out to hamel.dev's "Your AI Product Needs Evals" and related posts).
- **Why it's here:** Hamel is the operating definition of eval-driven prompt work in 2025-2026. Every claim about "evals are the senior dividing line" traces back to his writing.
- **Leading today:** Hamel's writing — `adoption-leading` for prompt eval discipline, 2026.
- **Why it leads:** he writes from production scars rather than demos; his framings (the golden set, the regression suite, the LLM-as-judge boundaries) have been adopted across the industry.
- **Runner-up:** Eugene Yan's blog (eugeneyan.com) — `adoption-leading` for ML evals generally with strong LLM-specific posts; the academic-meets-practitioner voice complements Hamel's pure-practitioner stance.

### Anthropic Messages API + token-cost reporting

- **Codebase uses:** not yet — the precompute script for the visualizer would call the Messages API to capture variant A and variant B outputs for each golden case.
- **Why it's here:** the eval runner needs reliable per-call cost reporting to feed the "cost per iteration: $0.21" line in the visualizer's output panel. Anthropic returns input/output token counts in every response.
- **Leading today:** Anthropic Messages API — `adoption-leading`, 2026.
- **Why it leads:** explicit `usage` field in every response (input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens); structured way to aggregate eval-run cost without scraping.
- **Runner-up:** OpenAI Chat Completions — `adoption-leading` deployment-share but the token-usage shape is similar; either works as a precompute target.

### Promptfoo

- **Codebase uses:** not yet — would be the inspiration for the visualizer's CLI-output mockup ("Score: 30/32, Regressions: 2, Cost: $0.21").
- **Why it's here:** promptfoo is the most-adopted open-source prompt eval framework as of 2026. Its CLI output shape — pass/fail per case, score delta, per-case diff on failure — is the visual language the visualizer borrows.
- **Leading today:** promptfoo — `adoption-leading` for OSS prompt eval, 2026.
- **Why it leads:** zero-config to start (point at a YAML file with cases), supports both deterministic (exact-match, JSON-schema) and LLM-as-judge eval modes, integrates with CI.
- **Runner-up:** Inspect (UK AISI's eval framework) — `innovation-leading` for safety evals with stronger model-rated rubrics and more sophisticated case-set composition; relevant if reincodes ever needed a safety-oriented eval.

### Zod

- **Codebase uses:** not yet — would define the schema for each golden case (`{ id: string, input: string, expected: z.unknown(), tags: z.array(z.string()) }`) and for each chain's output, enabling exact-match comparison in the visualizer.
- **Why it's here:** the per-case diff needs a programmatic comparison; Zod schemas make `expected vs actual` a typed comparison rather than a string-match hack.
- **Leading today:** Zod — `adoption-leading` for TS schema work, 2026.
- **Why it leads:** type inference, ecosystem, integration with structured-output APIs.
- **Runner-up:** Valibot — `innovation-leading` modular validator with smaller bundle; relevant for the static-export bundle-size constraint.

---

## Project exercises

### [B-reincodes-eval-iteration-viz] Build the eval-iteration visualizer

- **Exercise ID:** `[B-reincodes-eval-iteration-viz]` — aligns with Phase 3 curriculum concepts on eval-driven LLM iteration; the prompt-engineering analogue of Phase 3's eval discipline applied at the prompt layer rather than the system layer.
- **What to build:** a page at `/ai/eval-iteration` that loads a precomputed golden set (20-30 cases), renders it as a table with input / expected-output / variant-A-output / variant-B-output columns, and shows per-row pass/fail status for each variant. A "score panel" at the top shows the variant-A and variant-B aggregate scores with deltas. A "regression alarm" highlights any row where variant B regressed (failed where variant A passed) — even if variant B's aggregate score is higher. Toggle "show only regressions" and "show only new passes" filters help the reader focus. The pedagogical payoff: the reader sees that variant B's 28/30 → 29/30 score improvement *also* introduces a regression on a critical case (`regression-2026-01-12-001`), and learns to look for the per-case diff, not just the average.
- **Why it earns its place:** the visualizer operationalises the per-case-vs-average distinction that's the load-bearing insight of this concept. Reading "averages can hide regressions" is weaker than watching a "better" prompt regress a real case in front of you. The interview signal: the candidate built a tool that teaches the most-skipped discipline in prompt engineering by making the failure mode visible.
- **Files to touch:** `src/app/ai/eval-iteration/page.tsx` (visualizer page), `src/components/EvalIterationVisualizer/` (table renderer, score panel, regression alarm), `public/ai/eval-iteration/golden-set.json` (20-30 precomputed cases), `public/ai/eval-iteration/variant-a-outputs.json` + `variant-b-outputs.json` (precomputed model outputs for each case under each variant — generated by a build-time script that calls Anthropic with both prompt versions and commits the results), `scripts/precompute-eval-iteration.ts` (build-time script). Register the page in `src/components/Home/conceptsData.tsx` under a new `ai-engineering` category alongside the other planned `/ai/*` visualizers.
- **Done when:** the page loads at `/reincodes/ai/eval-iteration/` in production (GH Pages), the table renders all 30 cases with both variants' outputs, the regression alarm correctly highlights the one engineered-in regression case in variant B, the score panel shows variant A 30/30 and variant B 29/30 with the regression count = 1, "show only regressions" filter works without re-fetching. `next build` passes under `output: "export"`. The precompute script runs successfully against the actual Anthropic API (locally during precompute, not at deploy time) and produces deterministic JSON output.
- **Estimated effort:** 1-2 days. Golden set design + precompute script: half day. Page + table + score panel: half day. Regression-alarm logic + filters + polish: half day. Engineering variant B to actually exhibit the regression-hiding-in-improvement pattern (calibration work): can stretch to a full day on its own.

---

## Summary

### Part 1 — concept recap

Eval-driven iteration is the discipline of measuring every prompt change against a fixed set of hand-curated input/expected-output pairs (the golden set) plus every production failure that's ever been logged (the regression suite), keeping only the changes that improve the score *without* regressing any case that already passed. In reincodes this is Case B — no chains, no eval runner, no golden set exists in production code — but the buildable target is a `/ai/eval-iteration` visualizer that loads a precomputed golden set, lets the reader compare two prompt variants per case, and highlights regressions hidden inside score improvements via a per-row diff. The constraint that makes the visualizer the right shape is the static-export contract (live API calls are out, precomputed JSON is the path), and the cost being paid is the precompute infrastructure plus the deliberate engineering of a "looks better on average but regresses one case" variant to make the failure mode visible. The deeper take is that eval-driven iteration is the senior-vs-junior dividing line in prompt work — vibes-based iteration is how prompts get worse over time without anyone noticing.

### Part 2 — key points to remember

- **The shape**: golden set (hand-curated, 20-50 cases) + regression suite (every prod failure ever, monotonically grows) + a runner that produces per-case diffs.
- **The order**: write the eval BEFORE iterating the prompt — otherwise you write an eval that proves what the prompt already does, which proves nothing.
- **The failure mode that hides**: a prompt change that improves the average score while regressing a critical case. Per-case reporting catches this; average-only reporting hides it.
- **The reincodes shape**: implementation is Case B; the buildable target is a precomputed visualizer that demonstrates the regression-hiding-in-score-improvement pattern by toggling two prompt variants.
- **The canonical reference**: Hamel Husain's writing on evals. The team that ships this discipline first wins; the team that skips it iterates in circles forever.

---

## Interview defense

### What an interviewer is really asking

Behind "how do you iterate on prompts?" the interviewer is checking whether the candidate has lived through a regression that an eval would have caught. Junior answer: describes prompt iteration as a series of edits, plays in the playground, ships when it looks good. Senior answer: describes the iteration loop in terms of a golden set, names the specific bug class (average-up-edge-down), cites Hamel. The interviewer is filtering for engineers who treat prompt work as engineering (measurable, defensible) versus authoring (subjective, undefensible).

### Likely questions

**Q (mid):** What's in a golden set, and how big should it be?

A: 20-50 hand-curated cases per chain, stored as JSON in version control alongside the prompt. Each case has an input, an expected output, and tags that classify the kind of behavior being tested (common, edge, adversarial). The set has to be small enough to run in a few minutes (so engineers actually run it on every change) and large enough to cover the chain's intended behaviors plus a few edge cases. I start at 20-30 cases per chain, then grow the set as new behaviors get added — every new feature in the prompt adds 3-5 cases that exercise it.

```
golden set shape

cases.json (20-50 entries)
  ├─ id: stable string                  ← for diffing
  ├─ input: <chain input>               ← what gets sent
  ├─ expected: <chain output shape>     ← what should come back
  └─ tags: ["common" | "edge" | ...]   ← for filtering reports
```

**Q (senior):** When is LLM-as-judge appropriate, and when does it break?

A: LLM-as-judge is appropriate when the chain's output is unstructured (free-form prose, generated replies, summaries) and there's no canonical correct answer — only "better" and "worse" on a rubric. It breaks in two cases: first, when the judging model shares the blind spots of the generating model (asking GPT-4o to judge GPT-4o's voice — circular); second, when the rubric is vague enough that the judge model can rationalize any output as fitting. The mitigation for case one is using a *different* model for judging (claude judges gpt outputs, gemini judges claude outputs) — the cross-model contrast catches blind spots; for case two, the rubric has to specify failure modes as concretely as success modes ("the response is wrong if it omits the user's name; correct if it includes it"), so the judge has criteria sharper than "it's good if it feels good."

```
LLM-as-judge: works vs breaks

WORKS (cross-model, sharp rubric):       BREAKS (same model, vague rubric):
  judge: claude                              judge: gpt-4o
  ↓ judges                                  ↓ judges
  output: gpt-4o                             output: gpt-4o
  ↓ on rubric:                              ↓ on rubric:
    accuracy (1-5, with failure modes)        "is it good?"
    tone     (1-5, with failure modes)
    brevity  (1-5, with failure modes)       Result: 5/5 on everything,
  Result: catches errors the gen model              tells you nothing
          would miss (different blind spots)
```

**Q (arch):** At 10x — say, 100 chains across a portfolio of AI features, each with 30+ eval cases — how does the eval discipline scale?

A: At 100 chains × 30 cases × $0.10/case = $300 per full eval run, plus 5-10 minutes per chain × 100 chains = 8-16 hours serial. Two things have to change. First, parallelisation: the eval runner has to run chains concurrently with provider rate-limit budgets, dropping the 16h to ~30 minutes. Second, smart selection: not every PR runs the full eval suite; you only run evals for chains affected by the PR's prompt or schema changes, which is computed from the diff. The CI integration becomes: PR opens → diff identifies which chains changed → eval runner runs only those chains' evals → score delta posted as a comment on the PR. The 100-chain shape also forces a unified evaluation framework — promptfoo or similar — because home-grown per-chain eval scripts don't scale past ~10 chains.

```
at 10x scale, the bottleneck moves

1 chain                     100 chains (without scaling)
─────────                   ────────────────────────────
$0.20 per run               $300 per run        ← breaks first
5 min serial                16 hr serial        ← breaks second
1 prompt to maintain        100 prompts to maintain
1 eval to keep current      100 evals to keep current
                            ────────────────────────────
                            Solution: diff-aware eval runner,
                                       parallel API calls,
                                       unified framework (promptfoo).
```

### The question candidates always dodge

**Q:** Most teams I've seen don't have evals at all. Aren't you overstating how non-negotiable this is? Their products work.

A: Their products *appear* to work because nobody's looking at the per-case behavior. I have shipped LLM features at three companies; at the two with evals, regressions got caught at the PR. At the one without, regressions got caught in customer-support tickets three weeks after release, by which point the prompt had been edited four more times and the original regression was untraceable. "Their products work" is a survivorship bias — the products that work without evals are usually low-stakes (it doesn't matter if a label is wrong 5% of the time) or short-lived (the team shipped, declared victory, and the prompt's slow drift over six months never got measured). For anything high-stakes (medical, financial, legal) or long-lived (a chain that ships for a year+), the absence of evals is a deferred liability that compounds. The "but they work" defense is true at month 1, false at month 12, and disastrous at month 24.

```
the case for "no evals is fine"     vs    what the next 12 months looks like

  ┌──────────────────────────┐           ┌──────────────────────────┐
  │ Month 1                  │           │ Month 1: ship, looks fine │
  │   prompt v1: ship        │           │ Month 3: edit prompt,    │
  │   "looks good in demo"   │           │   support ticket #1      │
  │                          │           │ Month 6: edit prompt,    │
  │ Status: working ✓        │           │   support tickets #2-7   │
  └──────────────────────────┘           │ Month 9: rebuild prompt  │
                                          │   from scratch because    │
                                          │   nobody trusts it        │
                                          │ Month 12: rewrite from   │
                                          │   scratch a second time   │
                                          │ Status: chronic incidents │
                                          └──────────────────────────┘

  the survivorship-bias version          the version eval-driven teams skip
```

The interview move: name the time-horizon gradient. "No evals is fine for month 1; catastrophic for year 1+."

### One-line anchors

- "Vibes-based iteration is how prompts get worse over time without anyone noticing."
- "Write the eval BEFORE iterating the prompt — otherwise you write an eval that proves what the prompt already does."
- "Per-case diffs catch regressions that hide inside average-score improvements."
- "The senior-vs-junior dividing line in prompt work is whether the engineer iterates against a number or against a feeling."
- "Hamel Husain on evals is the canonical reference — every modern eval discipline traces back to his writing."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw the iteration loop diagram from memory: the prompt source, the eval runner, the golden set + regression suite, the provider call, the score + per-case diff output. Label which sections are versioned in git.

✓ Pass: four bands labeled (source, runner, provider, output), golden set and regression suite distinguished, the "decision" step at the bottom
✗ Fail: re-read the primary diagram, wait 10 minutes, try again.

### Level 2 — Explain it out loud

Explain eval-driven iteration to a colleague who has shipped one LLM-powered feature without any eval set. No notes. Under 90 seconds.

Checkpoints — did you:
- Distinguish golden set from regression suite?
- Name the "write the eval before iterating the prompt" rule?
- Name the specific bug class — average-up-edge-down?
- Cite Hamel Husain (or another canonical reference) as the starting reading?

If you skipped any: you described it, you didn't argue for it.

### Level 3 — Apply it to a new scenario

A new chain lands in the planned reincodes AI surface: a "summarize this DSA visualization" chain that takes the algorithm name, a description of the current step, and the algorithm's pseudocode, and returns a one-paragraph natural-language explanation. Design the golden set. What inputs? What expected outputs (or, since outputs are free-form, what rubric)? What edge cases?

Write your answer (3-5 sentences minimum). Then open `.aipe/study-ai-engineering/05-ai-features-in-this-app.md` and check whether your proposed eval design respects the static-export constraint (no live LLM at request time; precompute at build time).

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff from the Tradeoffs section. Answer in writing: "If I were starting the `/ai/eval-iteration` visualizer today with the same constraints (static export, no live LLM, GH Pages deploy), would I make the same precompute-the-variant-outputs call? Why or why not? If I'd change it, what would I do instead and what would that cost?"

Reference the actual code:
→ Point to `next.config.ts` L1–L17 to support the static-export constraint
→ Point to what would need to change if the visualizer needed live judging (e.g., let the reader edit a prompt in the browser and see the eval re-run live — would require leaving the static-export contract)

There is no right answer. The point is specificity.

### Quick check — code reference test

Without opening any files, answer:
- What file in reincodes controls the static-export contract that constrains how the visualizer ships?
- What array in `conceptsData.tsx` would need a new entry to register the visualizer in the home grid?
- What two JSON files in `public/ai/eval-iteration/` would carry the precomputed model outputs for the two prompt variants?

Then open the files and verify.

✓ Pass: `next.config.ts`, `CONCEPT_CATEGORIES` (in `conceptsData.tsx`), `variant-a-outputs.json` + `variant-b-outputs.json`
✗ Fail on details: file and array names matter more than line numbers.
