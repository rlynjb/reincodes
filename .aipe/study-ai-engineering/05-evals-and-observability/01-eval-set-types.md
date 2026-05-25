# Eval set types — golden, regression, adversarial

**Industry name(s):** Eval sets, golden sets, regression sets, adversarial sets, eval discipline
**Type:** Industry standard

> Three distinct eval sets, each catching a different class of failure: golden (intended behavior), regression (every production failure ever caught), adversarial (deliberate failure modes). All three earn their place; collapsing them is what costs you.

**See also:** → [02-eval-methods](02-eval-methods.md) · → [03-llm-as-judge-bias](03-llm-as-judge-bias.md) · → [04-llm-observability](04-llm-observability.md) · → [../04-agents-and-tool-use/06-error-recovery](../04-agents-and-tool-use/06-error-recovery.md) · → [../../study-prompt-engineering/05-eval-driven-iteration.md](../../study-prompt-engineering/05-eval-driven-iteration.md)

---

## Why care

### Move 1 — The grounded scenario

You've shipped an LLM-powered feature. It works — you tested it on a handful of inputs while building it, the outputs looked right, you shipped. Two weeks later a user reports a wrong tag extraction. You fix it. A month later another user reports the same wrong extraction. You fix it again. Three months later you upgrade from Sonnet 4.6 to Sonnet 4.7 and *three* different things break that worked before. The team's response: write more tests. You start a `tests/llm-outputs.test.ts` file with ~30 inputs and expected outputs. After a few sprints the file is 200 lines of mixed concerns — some tests for happy-path behavior, some tests for the bugs from production, some tests for weird edge cases you imagined. When a new model release lands, the file's pass rate drops to 70% and nobody can tell which kind of failure is which.

### Move 2 — Name the question

That mess has a name — *eval set discipline*. Not the number of cases, not the eval method (exact-match vs rubric vs LLM-judge — that's the next file), not the scoring threshold — just the question of *what kind of failure each case is designed to catch, and which set it belongs in*. Production LLM applications need three distinct sets: a *golden set* (intended behaviors, the happy-path canon), a *regression set* (every production failure that's been caught, monotonically growing), and an *adversarial set* (deliberate failure modes you imagined to stress-test the system). Each set catches a different class of failure. Mixing them in one file is how eval discipline collapses.

### Move 3 — Why answering that question matters

**Why you need to answer that question at all:** because every model upgrade, prompt change, or chain refactor regresses *something*, and the question is *what kind of regression you're catching*. A golden-set regression means the basic intended behavior broke — block the release. A regression-set regression means a known production failure recurred — block the release. An adversarial-set regression means a stress-test failed — might be acceptable depending on what failed. Without the three-way split, you can't tell which regression matters most. The team ships when the aggregate pass rate is "good enough" and silently accepts known-bad behavior because it's lumped in with stress-test noise. The discipline is what lets you say "I will not ship a release that fails *any* golden case, I will be strict about *any* regression-set case, and I will accept adversarial-set failures only if I've decided they're acceptable risk." Without the split, every release is a judgment call against a single number; with the split, the policy is automatic.

### Move 4 — Concrete before/after

Without eval set discipline (one mixed file):

- 200 test cases in `llm-outputs.test.ts`, mixed concerns
- Failure: "12 of 200 tests failed" — which 12 matter?
- Releases blocked by adversarial failures that were always going to fail
- Production bugs not caught because nobody added them as regression cases
- Model upgrade: 30% pass-rate drop, team can't tell what broke and what was always broken

With eval set discipline (three named sets):

- Golden set: 30 happy-path cases (intended behavior); blocking, must pass 100%
- Regression set: 47 cases (every production failure caught); blocking, must pass 100%
- Adversarial set: 80 cases (deliberate stress); informational, ratchets up over time
- Failure: "1 golden, 0 regression, 14 adversarial" — block release because of the golden
- Model upgrade: golden + regression pass, adversarial drops 20% — review the 16 failing adversarial cases, decide which to fix and which to accept

### Move 5 — The one-line summary

Three eval sets, three different jobs: golden defines what good *is*, regression locks in what production has *already broken*, adversarial probes what *might* break. All three earn their place; the discipline is keeping them separate. The rest of the file is the mechanics.

---

## How it works

### Move 1 — The mental model

The three eval sets are three different tests of a system, each with a different job. If you've built a React app, the analogy maps cleanly: the golden set is the *unit tests of intended behavior* (component renders with valid props produces expected output); the regression set is the *bug tickets turned into tests* (the file naming "fixes #1234 — input X returned wrong output, now expects Y"); the adversarial set is the *fuzz tests* (random inputs, edge cases, malformed data — does the component handle them?). Each layer catches failures the others can't. Removing any one leaves a gap.

```
the three sets, by job

  ┌────────────────────────────────────────────┐
  │ golden set                                 │
  │  ◄── "what good looks like, by design"     │
  │  ◄── 20–50 cases, slow-growing             │
  │  ◄── must pass 100% (blocking)             │
  └────────────────────────────────────────────┘
  ┌────────────────────────────────────────────┐
  │ regression set                             │
  │  ◄── "every production failure, captured"  │
  │  ◄── grows monotonically over time         │
  │  ◄── must pass 100% (blocking)             │
  └────────────────────────────────────────────┘
  ┌────────────────────────────────────────────┐
  │ adversarial set                            │
  │  ◄── "deliberate stress, edge cases"       │
  │  ◄── 50–500 cases, broad coverage          │
  │  ◄── ratcheted target, not 100%            │
  └────────────────────────────────────────────┘
```

### Move 2 — The layered walkthrough

#### The golden set

The technical thing: 20-50 input/expected-output pairs that define the intended behavior of the chain or agent. Hand-curated, slow to grow. The cases represent the *canon* — the kinds of inputs the system was built to handle, with the outputs that "good" means. New golden cases are added when scope expands (new feature, new behavior), not when bugs are caught. The bridge from frontend: this is the snapshot test for a component's primary use cases — the rendering of the happy path with three or four typical prop shapes. Concrete consequence: golden-set failures are *severe*. They mean the basic intended behavior has regressed. The release-gate policy is "any golden failure blocks the release; debug before merging."

```
golden set composition (loopd tag-extractor chain example)

  case 1: "buy milk" → { tags: ["todo", "shopping"] }
  case 2: "i'm tired" → { tags: ["mood"] }
  case 3: "react bug in line 42" → { tags: ["dev", "react"] }
  ... 25 more representative inputs

  cases added when:
    - new feature ships (new behavior to canon)
    - new edge case is discovered as intended
  
  cases NOT added when:
    - a bug is caught (those go to regression set)
    - someone imagined a weird input (that's adversarial)
```

#### The regression set

The technical thing: every production failure that's been caught and fixed, captured as a test case. Grows monotonically — once a case is in, it stays in forever. The case's job is *making sure that specific failure never recurs*. When a user reports a bug, the fix process is: (1) add the failing input to the regression set with the *now-expected* output, (2) verify the test fails against current code, (3) fix the code/prompt/chain so the test passes, (4) ship. The regression set thereafter prevents *that exact failure* from recurring. The bridge from frontend: this is the bug-fix-test discipline familiar from any mature codebase — every bug ticket spawns a test that proves the fix and prevents recurrence. Concrete consequence: regression-set failures are *acutely embarrassing*. They mean a previously-fixed bug has come back, often via a refactor or model upgrade. The release-gate policy is "any regression failure blocks the release; rollback the change that introduced it."

```
regression set growth over time

  month 1: 0 cases (just shipped)
  month 2: 3 cases (3 production bugs caught + fixed)
  month 6: 18 cases (cumulative)
  year 1:  47 cases
  year 2:  82 cases

  the set ratchets up forever; cases never leave
  (unless the underlying feature is removed)
```

#### The adversarial set

The technical thing: 50-500 cases the engineer constructs *deliberately* to stress-test the system. Edge cases (empty input, extremely long input, non-English text), malformed inputs (broken JSON, missing fields), boundary cases (the input is right on the edge of two categories), injection attempts (user input tries to override the system prompt). Cases are added proactively, not reactively. The bridge from frontend: this is property-based testing or fuzz testing — generate inputs the developer wouldn't naturally think of and see what breaks. Concrete consequence: adversarial-set failures are *informational*. They tell you about the failure surface, but not all of them have to be fixed — some failure modes are acceptable risk. The release-gate policy is "track the pass rate, ratchet it up over time, but don't necessarily block on individual failures unless the failure shape is unacceptable."

```
adversarial set categories

  ┌─ empty / minimal inputs ───────────────────────┐
  │  - empty string                                │
  │  - one character                               │
  │  - whitespace only                             │
  └────────────────────────────────────────────────┘
  ┌─ very long inputs ─────────────────────────────┐
  │  - 10x the typical input length                │
  │  - context-window edge                         │
  └────────────────────────────────────────────────┘
  ┌─ multilingual / encoding ──────────────────────┐
  │  - non-ASCII text                              │
  │  - emoji-heavy                                 │
  │  - mixed languages                             │
  └────────────────────────────────────────────────┘
  ┌─ injection attempts ───────────────────────────┐
  │  - "ignore previous instructions and..."       │
  │  - delimiter injection                         │
  │  - role-confusion attempts                     │
  └────────────────────────────────────────────────┘
  ┌─ malformed structure ──────────────────────────┐
  │  - broken JSON in input                        │
  │  - SQL/code embedded in natural text           │
  │  - missing required fields                     │
  └────────────────────────────────────────────────┘
```

#### How the three sets compose

The technical thing: all three sets run on every release, but the *block-or-warn* policy differs per set. Golden: 100% required, blocks merge. Regression: 100% required, blocks merge. Adversarial: ratcheted threshold (e.g. "must be ≥ 85% pass rate" — and the threshold rises over time as the team accepts each failure). The eval harness runs all three, emits a per-set pass rate, and the CI policy decides what to block on. Without the per-set policy, a single aggregate pass rate hides the structure — a release that passes golden but fails 3 regressions and 20 adversarials looks the same as a release that passes everything except 23 adversarials, but the first should be blocked and the second probably shipped.

```
the release-gate decision tree

  release candidate
        │
        ▼
   run all three sets
        │
        ▼
  ┌────────────────────────────┐
  │ golden pass = 100%?        │
  └────────────┬───────────────┘
        no    │    yes
         │    ▼
         │   ┌───────────────────────────┐
         │   │ regression pass = 100%?   │
         │   └────────────┬──────────────┘
         │         no    │    yes
         │          │    ▼
         │          │   ┌────────────────────────┐
         │          │   │ adversarial pass ≥     │
         │          │   │ ratchet target?        │
         │          │   └────────┬───────────────┘
         │          │      no   │   yes
         │          │       │   ▼
         │          │       │   ship
         │          │       │
         ▼          ▼       ▼
       BLOCK     BLOCK    review + decide
        (sev=1)  (sev=1)  (sev=2 — fix or accept)
```

### Move 3 — The principle

The principle is *eval sets are typed by intent, not by content*. The same input can be in two sets if it represents two different jobs: a tricky-but-handled case might be in golden (canonical "good") *and* in regression (because it once broke in production). The discipline is naming the *intent* of each case — what is this case here to catch? Without that intent label, the set drifts into a single mixed pile and the policy collapses. This generalizes to any testing discipline: in a React codebase, the unit tests, snapshot tests, integration tests, and E2E tests all coexist because each has a different job; collapsing them into one "tests" folder erases the structure that lets you reason about coverage. LLM eval sets need the same separation, applied to the specific failure modes the LLM boundary introduces.

The full picture is below.

---

## Eval set types — diagram

```
┌─ Eval set composition (per LLM feature) ───────────────────────────┐
│                                                                    │
│   ┌──────────────────────────────────────────┐                    │
│   │ Golden set                               │                    │
│   │   ◄── intended behavior                  │                    │
│   │   ◄── 20–50 cases                        │                    │
│   │   ◄── grows when scope expands           │                    │
│   │   ◄── blocking: 100% required            │                    │
│   │   ◄── catches: feature regressions       │                    │
│   └──────────────────────────────────────────┘                    │
│                                                                    │
│   ┌──────────────────────────────────────────┐                    │
│   │ Regression set                           │                    │
│   │   ◄── every production failure ever      │                    │
│   │       caught + fixed                     │                    │
│   │   ◄── 0 → ∞ cases (monotonic growth)     │                    │
│   │   ◄── grows when production bugs land    │                    │
│   │   ◄── blocking: 100% required            │                    │
│   │   ◄── catches: regressions of fixed bugs │                    │
│   └──────────────────────────────────────────┘                    │
│                                                                    │
│   ┌──────────────────────────────────────────┐                    │
│   │ Adversarial set                          │                    │
│   │   ◄── deliberate stress, edge cases,     │                    │
│   │       injection attempts                 │                    │
│   │   ◄── 50–500 cases                       │                    │
│   │   ◄── grows when team imagines new       │                    │
│   │       failure modes                      │                    │
│   │   ◄── ratchet target (e.g. 85% → 90%)    │                    │
│   │   ◄── catches: unanticipated failure     │                    │
│   │       modes; surface mapping             │                    │
│   └──────────────────────────────────────────┘                    │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**Not yet implemented.** reincodes has no LLM features, no eval sets, no eval harness — there's nothing to evaluate because nothing's being inferred. The closest existing analog is the *visualizer test pattern* (or rather the absence of one — the codebase has no test suite per the README: "no tests. no CI beyond the GH Pages deploy"). The conceptual mapping would be: golden = "the bubble sort visualizer renders correctly with the default input"; regression = "this specific input that once broke the highlight index works now"; adversarial = "an input of 1000 elements still animates without crashing." None of these exist as tests.

The buildable target is below in Project exercises — a `/ai/eval-set-types` page that renders three precomputed eval sets side-by-side as collapsible tables, with a "what each one catches" annotation per set. A toggle shows the union view: all three sets stacked with their type labels, so the reader can see how the same chain has three different test surfaces.

**Expected file paths** (when built):
- `src/app/ai/eval-set-types/page.tsx` — the visualizer
- `src/components/EvalSetTypesVisualizer/` — set columns, case-row renderer, type-labeled badges, union toggle
- `public/ai/eval-set-types/sets.json` — three eval sets, ~20-30 cases each, with pass/fail outcomes against a reference chain
- `scripts/precompute-eval-set-types.ts` — build-time script that defines the three sets, runs each case against Claude, captures pass/fail with brief outcome notes

---

## Elaborate

### Where this pattern comes from

The three-set discipline emerged in 2023-2024 as production LLM teams realized that their initial eval setups (one big mixed test file) weren't catching the right failures. The vocabulary is borrowed from traditional software testing — "regression tests" and "adversarial testing" are decades-old concepts — but the LLM application of them required new disciplines because LLM outputs aren't byte-equal across runs and the eval methods (exact match, rubric, LLM-judge — see `02-eval-methods.md`) are different from traditional pass/fail. Hamel Husain's writing on LLM evals (published 2023-2024) was particularly influential in codifying the three-set framing; his term "regression set" emphasized the monotonic growth pattern that distinguishes it from golden. By 2025 the discipline was standard in mature LLM teams; the rest of the industry is still catching up.

### The deeper principle

The deeper principle is that *eval sets are knowledge artifacts that compound over time*. The golden set encodes what you intended at design time. The regression set encodes what you learned from production. The adversarial set encodes what you imagined as failure surface. Each set is a different *kind* of knowledge, and collapsing them into one pile loses the structure of *how each piece of knowledge was acquired and what it represents*. The discipline of separation is the discipline of preserving the *provenance* of the knowledge — same way you wouldn't dump bug-fix commits, design-decision documents, and onboarding READMEs into one file and call it "docs." The separation is the structure that makes the knowledge useful long-term.

### Where this breaks down

The three-set discipline breaks down in three places. First, *case overlap*. A case can legitimately belong in two sets (a tricky-but-correct case that's golden *and* once broke as a regression). The right move is to *duplicate* the case across sets with the appropriate metadata, not to pick one set arbitrarily. Second, *adversarial set growth*. Without intent, the adversarial set can grow without bound (the team imagines failure modes faster than they can be addressed) and the ratchet-target threshold gets meaningless. Mitigation: each adversarial case needs a "what this is testing" annotation; cases without intent get pruned. Third, *cross-feature evals*. When a chain depends on another chain, the eval set lines blur (is this a regression of feature A or feature B?). The mitigation is per-chain eval sets with clear ownership, plus integration eval sets that cover the composition.

### What to explore next

- [02-eval-methods](02-eval-methods.md) → how each case in any set gets scored (exact match, rubric, LLM-judge); the methods are orthogonal to the set types
- [03-llm-as-judge-bias](03-llm-as-judge-bias.md) → when LLM-as-judge is the eval method, the biases that affect scoring
- [04-llm-observability](04-llm-observability.md) → production failures become regression cases; the observability stack is what surfaces the failures to add
- [../../study-prompt-engineering/05-eval-driven-iteration.md](../../study-prompt-engineering/05-eval-driven-iteration.md) → the broader eval-driven iteration loop that the three-set discipline lives inside
- Hamel Husain's blog on LLM evals — required reading; the three-set framing comes from there

---

## Tradeoffs

### Comparison table — both costs in one frame

```
┌────────────────────┬──────────────────────┬─────────────────────────┐
│ Cost dimension     │ Three-set discipline │ One mixed eval file     │
├────────────────────┼──────────────────────┼─────────────────────────┤
│ Setup time         │ +1 day per feature   │ Same day (one file)     │
│                    │ (designing the       │                         │
│                    │ three sets)          │                         │
│ Case-add time      │ Pick the right set;  │ Append to file          │
│                    │ name the intent      │                         │
│ Release gate       │ Per-set policy       │ Single aggregate %      │
│ policy             │ (block/warn)         │ (block at threshold)    │
│ Model-upgrade      │ Per-set delta clear  │ Aggregate drop;         │
│ regression review  │ ("golden held,       │ unclear what broke      │
│                    │ adversarial dropped")│                         │
│ False positives    │ Low (adversarial     │ Higher (any test fail   │
│ on releases        │ doesn't block by     │ blocks if at threshold) │
│                    │ default)             │                         │
│ False negatives    │ Lower (golden +      │ Higher (regression of   │
│ on regressions     │ regression catch     │ a known fix can pass    │
│                    │ what each is for)    │ on aggregate)           │
│ Eval-set bloat     │ Each set's growth    │ Linear bloat; no        │
│                    │ rate has different   │ pruning signal          │
│                    │ controls             │                         │
│ Onboarding         │ Clear: "this case    │ Confusing: "why does    │
│                    │ is here because..."  │ this case exist?"       │
└────────────────────┴──────────────────────┴─────────────────────────┘
```

### What we'd give up (when planning the visualizer)

The first cost is *constructing three realistic sets*. The visualizer's value proposition is showing what each set catches that the others don't — which requires the sets to be *genuinely different* in content. Hand-crafting 20-30 cases per set takes ~1 day; each case needs an input, an expected output, a one-line "this is here because..." annotation, and the precomputed pass/fail outcome against a reference chain. The cases have to be *real*-looking, not toy data, otherwise the visualizer reads as abstract.

The second cost is *precompute fidelity*. Running 60-90 cases through Claude with consistent prompts takes ~$3-5 of API spend per full rebuild. The script needs to validate each output against its expected output (exact-match for some, rubric-scored for others — preview of `02-eval-methods.md`), capture the pass/fail, and ship the JSON.

The third cost is *teaching the *policy* not just the *sets**. The visualizer has to make the release-gate decision tree legible — golden blocks, regression blocks, adversarial ratchets. Otherwise the reader sees "three sets" but not "three sets *and* three policies." The right shape is probably a "simulated release" interaction: the reader sees the per-set pass rate and gets prompted with the policy decision (block/warn/ship), which makes the policy operable.

### What the alternative would have cost (skipping the visualizer)

If reincodes never builds `/ai/eval-set-types`, the cost is zero in the codebase. Eval discipline lives in loopd's Phase 3 build items — `[B3.2]`-`[B3.7]` each ship a specific eval suite, the discipline is exercised on real chains. Interview answer: "here's loopd's eval harness, here are the three set types I run against the caption chain, here's the policy."

The cost of *not* building it shows up in interview rounds where the candidate is expected to demonstrate eval discipline visually — "show me how you'd structure evals for an LLM feature." Without the visualizer, the candidate is reading loopd code or whiteboarding; with the visualizer, the candidate is pointing at rendered tables of cases with type labels.

### The breakpoint

The visualizer earns its place when the candidate is interviewing for roles that involve setting up LLM eval discipline from scratch — staff+ application engineers, eval-platform roles, anywhere eval is the load-bearing concern. For typical LLM-application roles where eval discipline is one concern, the visualizer is overkill.

### What wasn't actually a tradeoff

Showing only the golden set was not a real option. The pedagogical value is the *three-way split* — without all three, the visualizer teaches "evals exist" not "evals are structured." A one-set visualizer would be redundant with the existing study-prompt-engineering's eval-driven-iteration file.

---

## Tech reference (industry pairing)

### Hamel Husain's eval framework (informal canon)

- **Codebase uses:** not yet — would be the conceptual reference for the visualizer's three-set framing. Hamel's blog (2023-2024) codified the golden/regression/adversarial vocabulary that the field uses.
- **Why it's here:** Hamel's framing is the most widely-cited version of the three-set discipline in industry. Major teams (Anthropic's developer relations, OpenAI's eval cookbook contributors, Hugging Face's evaluation library) cite it directly or implicitly.
- **Leading today:** Hamel's blog + the eval discipline it codifies — `adoption-leading` for vocabulary, 2024-2026.
- **Why it leads:** the framing is grounded in real production experience (Hamel ran ML at Github, then consulted on LLM evals); the vocabulary is intuitive and the discipline is enforceable in CI.
- **Runner-up:** OpenAI's eval cookbook + Anthropic's internal eval guidance — `adoption-leading` for vendor-specific eval tooling; both lean on similar set-type framings but with vendor-specific scoring infrastructure.

### Promptfoo / Inspect (eval frameworks)

- **Codebase uses:** not yet — would be a candidate for the eval harness if the visualizer ever moved beyond precomputed results to interactive eval running. For the static-export deploy, precomputed JSON is the only viable shape.
- **Why it's here:** Promptfoo (open-source CLI for prompt evals) and Inspect (open-source LLM evals framework from the UK AI Safety Institute) are the leading open-source eval harnesses. Both support the three-set discipline via configuration; the visualizer's precompute script could use Promptfoo's runner under the hood.
- **Leading today:** Promptfoo — `adoption-leading` for open-source LLM eval CLIs, 2024-2026.
- **Why it leads:** YAML/JSON eval configuration, supports exact-match + rubric + LLM-judge scoring, integrates with CI (GitHub Actions, GitLab CI), and the result format is well-suited to dashboard rendering.
- **Runner-up:** Inspect — `innovation-leading` for safety-focused evals; more sophisticated than Promptfoo for adversarial / safety / capability evals, less polished for everyday application evals.

### Langfuse / LangSmith / Phoenix (observability platforms)

- **Codebase uses:** not yet — would be the production target where regression cases originate. Production failures captured by observability become regression cases in the eval set; the loop is "observe → capture → add to regression → fix → ship."
- **Why it's here:** the regression set's growth depends on a steady stream of production failures being surfaced. Without observability, regression cases come from user reports (slow, lossy); with observability, the team can detect failures the user didn't bother to report.
- **Leading today:** Langfuse (self-hosted) / LangSmith (LangChain-affiliated) — `adoption-leading` for LLM observability, 2025-2026.
- **Why it leads:** trace-based observability (every LLM call captured with prompt, response, latency, cost), Langfuse is open-source and self-hostable, LangSmith integrates tightly with LangChain.
- **Runner-up:** Phoenix (Arize) — `innovation-leading` for ML-side observability with LLM extensions; better for teams with both LLM and classical ML in their stack.

---

## Project exercises

### [B-reincodes-eval-set-types-viz] Build the eval-set-types visualizer

- **Exercise ID:** `[B-reincodes-eval-set-types-viz]` — derived from the curriculum's reincodes "interview prep surface" entry and Phase 3 concept `[C3.1]` (golden sets, adversarial sets, regression sets).
- **What to build:** a page at `/ai/eval-set-types` that renders three eval sets side-by-side as collapsible tables. Each set's header shows the set name (golden / regression / adversarial), the case count, the pass rate, and a one-line "this set catches..." annotation. Each row in a set's table is one case: the input (truncated to 80 chars), the expected output / rubric, the actual output, the pass/fail outcome, and an intent annotation ("this case is here because..."). A toggle at the top switches between "three columns" view (compact comparison) and "union" view (all cases in one long list with type-color-coded badges). A simulated-release row at the bottom shows the policy outcome ("Golden: 30/30 ✓, Regression: 47/47 ✓, Adversarial: 68/80 → SHIP" vs. "Golden: 28/30 ✗ → BLOCK").
- **Why it earns its place:** the visualizer makes the *policy* operable. The reader sees three sets, three pass rates, and one release decision — which surfaces the discipline (you don't ship on aggregate, you ship per-set with per-set policies). The interview signal is that the candidate built a tool that teaches eval set structure as a *release-gate decision*, not just as a test-organization scheme.
- **Files to touch:** `src/app/ai/eval-set-types/page.tsx` (visualizer), `src/components/EvalSetTypesVisualizer/` (three-column layout, case-row renderer, intent annotation, union toggle, simulated-release row), `public/ai/eval-set-types/sets.json` (three eval sets — 25 golden, 30 regression, 60 adversarial — with cases, expected outputs, intent annotations, and precomputed pass/fail outcomes), `scripts/precompute-eval-set-types.ts` (build-time script that defines the three sets for a reference chain — say, a tag-extractor — runs each case against Claude, validates against expected output, captures pass/fail with notes, writes JSON). Add a row to `CONCEPT_CATEGORIES` in `src/components/Home/conceptsData.tsx` under a new `ai-engineering` category.
- **Done when:** the page loads at `/reincodes/ai/eval-set-types/` in production, three sets render with case counts and pass rates, every case shows input/expected/actual/intent, the union toggle flips between compact and union views, the simulated-release row shows the per-set policy decision, `next build` passes under `output: "export"`. Build script runs all ~115 cases against Anthropic API.
- **Estimated effort:** 2-2.5 days. Eval-set design (3 sets × 20-30 cases × hand-curated content + intent annotations): 1 day. Precompute script + Anthropic runs: half day. Page + three columns + simulated-release row + union toggle: 1 day.

---

## Summary

### Part 1 — concept recap

Three eval sets, three different jobs. Golden defines intended behavior — 20-50 hand-curated happy-path cases that represent what "good" looks like; must pass 100% on every release, blocking. Regression captures every production failure ever caught — grows monotonically over time as bugs are surfaced and fixed; must pass 100%, blocking. Adversarial probes deliberate failure modes — edge cases, malformed inputs, injection attempts; not blocking individually, but ratcheted as a pass-rate threshold (e.g. ≥85%) that rises as the team addresses failures. The discipline is *keeping them separate*; collapsing them into one mixed file is how eval policy collapses, because the team can't tell which kind of failure each test catches. The release-gate policy reads the per-set pass rates and decides: any golden or regression failure blocks the release; adversarial regressions go through review. In this codebase the concept is Case B; the buildable target is a `/ai/eval-set-types` page rendering three sets side-by-side with a simulated-release row that shows the per-set policy outcome.

### Part 2 — key points to remember

- **The three sets**: golden (intended behavior), regression (caught production failures), adversarial (deliberate stress). Each has a different job.
- **The growth shapes**: golden grows slowly (scope changes), regression grows monotonically (bug captures), adversarial grows broadly (failure imagination).
- **The policy**: golden + regression block at 100%; adversarial ratchets at a threshold and triggers review on miss.
- **The discipline**: eval sets are typed by *intent*, not by content. The intent annotation per case is the load-bearing detail.
- **The reincodes shape**: Case B. Visualizer renders three sets side-by-side with a simulated-release row surfacing the per-set release-gate policy.

---

## Interview defense

### What an interviewer is really asking

Behind "how do you structure LLM evals?" the interviewer is testing whether the candidate has shipped LLM features past the first month of production and developed the discipline to separate eval concerns. A junior answer says "I have a test file with input/output pairs." A senior answer names the three-set structure and the per-set policy. A staff answer adds the regression-set growth pattern (monotonic), the adversarial ratchet (not all failures block), and the release-gate decision tree.

### Likely questions

**Q (mid):** What's the difference between a golden set and a regression set?

A: Golden defines intended behavior — happy-path cases the system is designed to handle, hand-curated, slow-growing. New cases get added when the feature's scope expands. Regression captures every production failure that's been caught and fixed — grows monotonically forever, never shrinks. The decision rule for adding a case: if it's a case representing what "good" looks like *by design*, it goes in golden; if it's a case that *broke in production* and has been fixed, it goes in regression. Both are blocking at 100% on every release.

```
the discriminator

  golden                          regression
  ───────────────                 ───────────────
  intended behavior               caught production failure
  hand-curated                    grows as bugs land
  20–50 cases                     0 → ∞ cases
  feature design output           bug-fix output
  "this is good"                  "this once was bad,
                                   never again"
```

**Q (senior):** Why doesn't every failure block the release? Shouldn't all evals be 100% pass?

A: Because adversarial cases represent *failure modes you're aware of but haven't committed to fixing yet*. Some adversarial failures are real bugs you'll fix soon; others are edge cases the team has decided are acceptable risk for now (e.g. "the chain doesn't handle emoji-heavy input gracefully, but only 0.1% of users use emoji that way, low priority"). If every adversarial case blocked the release, the team would either (a) refuse to add edge cases to the adversarial set (counterproductive — you want to track the failure surface), or (b) be blocked on every release by known-acceptable risks. The ratchet pattern handles this: the adversarial pass rate is tracked, the target rises over time as the team addresses cases, but individual failures don't block individual releases. The discipline that *does* block: golden (the canon) and regression (caught failures) — those are the cases where "we know this should work" is settled.

```
why the policy splits

  golden + regression               adversarial
  ─────────────────────             ────────────────────
  "we know this should work"        "we know this might
  "this once worked, must            break, tracking the
   keep working"                     failure surface"
                                    
  ANY failure = ship-blocker        threshold target;
                                    individual failures
                                    go through review
```

**Q (arch):** Your eval set has grown to 500 cases. A model upgrade comes in and 87 cases fail. Walk me through the response.

A: Split by set type first. The 87 failures are some combination of golden, regression, and adversarial. Step 1: identify the type breakdown ("3 golden, 11 regression, 73 adversarial"). Step 2: golden failures are sev-1, drop the model upgrade — the canon is broken, this isn't a "review and decide" situation, the canon is *what the chain is for*. Step 3: regression failures are sev-1.5, drop the upgrade and reach out to the model provider — these are known-fixed bugs recurring, which usually points to a model-side change the provider can speak to. Step 4: adversarial failures are sev-2, review each one. Some will be acceptable risks (the model's drop on emoji-heavy text isn't load-bearing), some will surface real new bugs that need patching before the upgrade can land. The upgrade waits until golden + regression are back at 100% and adversarial is back at or above the ratchet target. Without the three-set split, the response is "87 tests failed, panic" — same data, no actionable structure.

```
the response triage

  87 failures
        │
        ▼
   split by set
        │
        ├── 3 golden        ◄── BLOCK upgrade (canon broken)
        │   (sev-1)
        │
        ├── 11 regression    ◄── BLOCK + escalate to provider
        │   (sev-1.5)             (known-fixed bug recurring)
        │
        └── 73 adversarial  ◄── review per-case; accept or fix
            (sev-2)             (likely some real bugs hidden
                                in the noise)
```

### The question candidates always dodge

**Q:** Isn't this just over-engineering a test file? Most teams ship with way less rigor and do fine.

A: That argument breaks at the first model upgrade. "Way less rigor" works when the system is stable and the inputs don't change. The moment the model provider releases a new version — and they release new versions every quarter — the team without eval discipline can't tell whether their chain regressed because of (a) the new model behaving differently, (b) the team's recent prompt changes, or (c) a real underlying bug. They roll back the upgrade out of caution, miss the cost/quality improvements, and over the year lose 20-30% of the available model capability because they can't confidently land upgrades. The three-set discipline pays for itself the first time a model upgrade ships smoothly because golden + regression held and adversarial dropped in expected places. The teams that "ship with way less rigor and do fine" are either (1) running stable workloads on stable models with no upgrades, or (2) doing fine right now but accumulating tech debt that compounds at the next provider release. The honest framing: eval discipline is the cost you pay to *keep moving* — to land model upgrades, refactor prompts, evolve the system without losing confidence in what works. The candidate who dismisses it is signaling they've only worked on stable systems; the right answer names the upgrade-velocity tax of not investing in evals.

```
two team trajectories

  team A: no eval discipline       team B: three-set discipline
  ───────────────────────          ───────────────────────────
  ship fast initially              ship slightly slower initially
  rolls back upgrades              lands upgrades confidently
  prompt changes scary             prompt changes routine
  6 months in: stuck               6 months in: 3 model
  on Sonnet 4.4                    upgrades shipped, smaller
                                   model on simple cases,
                                   30% cost savings
```

### One-line anchors

- "Three sets, three jobs: golden (canon), regression (caught failures), adversarial (deliberate stress)."
- "Golden + regression are blocking at 100%. Adversarial is ratcheted, not blocking individually."
- "Eval sets are typed by intent, not by content. The 'this is here because...' annotation per case is the load-bearing detail."
- "Regression growth is monotonic. Cases never leave the set; the set ratchets up forever."
- "Without per-set policy, every model upgrade is a vibes-based debate. With it, the policy is automatic."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw the three eval sets from memory: name each, its growth pattern, its release-gate policy. Annotate "what each catches" per set.

✓ Pass: three sets drawn, growth pattern per set, policy per set, "catches" annotation per set
✗ Fail: re-read the primary diagram and Move 2 walkthrough, wait 10 minutes, try again

### Level 2 — Explain it out loud

Explain the three-set discipline to a colleague who has one mixed `tests/llm-outputs.test.ts` file. No notes. Under 90 seconds.

Checkpoints — did you:
- Name the three sets and their jobs?
- Distinguish the growth patterns (slow / monotonic / broad)?
- State the policy difference (blocking vs ratcheted)?
- Reference the buildable target (`/ai/eval-set-types`) as how you'd demonstrate the discipline?

If you skipped any: you described the sets, you didn't argue the policy.

### Level 3 — Apply it to a new scenario

A new chain lands in the planned reincodes AI surface: a "summarize this DSA visualization" chain that takes an algorithm name and a description of the current step and returns a one-paragraph explanation. Design the three eval sets. Write 3-5 cases per set with their intent annotations.

Write the eval-set design. Then verify: are your golden cases really *intended* behavior (not bug fixes)? Are your regression cases tied to specific (imagined) production failures with intent annotations? Are your adversarial cases stressing the failure surface (long input, empty input, ambiguous algorithm name)?

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff from the Tradeoffs section. Answer in writing: "If I were building `/ai/eval-set-types` today with the same constraints, would I show 3 sets × 25 cases or 3 sets × 50 cases? Why?"

Reference the actual code:
→ Point to `next.config.ts` for the static-export constraint that bounds JSON ship size
→ Identify what would shift if the eval-set sizes doubled (~2x JSON, ~2x API spend, ~2x precompute time, denser case-row rendering)

### Quick check — code reference test

Without opening any files, answer:
- Which two eval sets are blocking at 100% on every release?
- What's the growth pattern of the regression set?
- What's the canonical industry voice (blog/writer) for the three-set framing?

Then verify against the file.

✓ Pass: golden + regression block at 100%, regression grows monotonically (never shrinks), Hamel Husain's blog
✗ Fail on details: the policy split and the monotonic-growth shape are what matter; recover them.
