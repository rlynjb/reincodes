# LLM-as-judge bias

**Industry name(s):** Position bias, verbosity bias, self-preference bias, judge model bias
**Type:** Industry standard

> LLM-as-judge introduces three known biases: position (first response often wins), verbosity (longer judged better), self-preference (judge prefers outputs from its own model family). Mitigations: randomize order, set length budget, cross-model judging. The bias is real but tractable.

**See also:** → [02-eval-methods](02-eval-methods.md) · → [01-eval-set-types](01-eval-set-types.md) · → [04-llm-observability](04-llm-observability.md)

---

## Why care

### Move 1 — The grounded scenario

You run a pairwise LLM-judge eval: prompt A vs prompt B, judge picks the better response across 100 cases. Prompt B wins 65-35. You ship prompt B. A week later, you re-run the same eval but swap the order of A and B in the judge prompt. Prompt B wins again — but this time only 52-48. The model's "B is better" judgment was inflated by ~13 percentage points because B happened to be presented first.

### Move 2 — Name the question

The question is *whether the judge's score reflects the output quality or the judge's biases about presentation*. LLM-as-judge introduces three documented biases: position (the first option in a pair gets favored), verbosity (longer responses scored higher independent of content), and self-preference (a model judges its own family's outputs higher). Without mitigation, every LLM-judge eval has these biases baked into the scores.

### Move 3 — Why answering that question matters

**Why you need to answer that question at all:** because LLM-judge eval drives iteration decisions, and biased scores drive wrong decisions. The teams that ship LLM-judge evals without bias mitigation are iterating against a noisy signal — the prompts that "win" might be the ones the judge happens to score higher, not the ones that are actually better. The mitigation cost is low (randomize order, cap response length, use cross-model judging); the cost of skipping is months of false-positive prompt changes that look better in eval but don't move production metrics.

### Move 4 — Concrete before/after

Without bias mitigation:

- Pairwise A vs B, judge always sees A first
- Position bias: A wins ~55-45 by virtue of position alone
- Real signal: B is 5pp better; observed: B is "10pp worse"
- Decision: ship A (wrong)

With bias mitigation:

- Pairwise A vs B, judge sees randomized order (50/50)
- Position bias averages out
- Real signal: B is 5pp better; observed: B is 5pp better
- Decision: ship B (right)

### Move 5 — The one-line summary

LLM-as-judge bias is the same shape as A/B test position bias — the option presented first wins extra because of position, not quality. Mitigations are mechanical (randomize, normalize, cross-validate). Mechanics below.

---

## How it works

### Move 1 — The mental model

The judge model is a model. It has training biases that surface when asked to compare outputs. Three load-bearing biases for pairwise eval:

```
bias            shape                                    mitigation
─────           ──────────────────────────────          ─────────────────
position        first option wins ~5-15pp extra         randomize order per case
verbosity       longer response wins independent       cap length in rubric;
                of content                              normalize by length
self-preference judge model prefers outputs from        cross-model: model A judges
                its own family                          model B outputs
```

### Move 2 — The layered walkthrough

#### Position bias

The technical thing: when shown two outputs (A, B), the judge often prefers whichever is presented first. Documented across all major models; magnitude varies (5-15pp at typical thresholds). The bridge from frontend: this is the same shape as A/B test position effects on the page — the first card gets clicked more independent of content. Concrete consequence: any pairwise eval without order randomization inflates the first option's score. Concrete mitigation: randomize the order for each case in the eval set; track per-position results to detect residual bias.

```
position bias mitigation: randomized order

case 1: show (A, B) — judge picks A
case 2: show (B, A) — judge picks B (would have picked first regardless)
case 3: show (A, B) — judge picks A
case 4: show (B, A) — judge picks A
...
aggregate: real signal emerges from the noise
```

#### Verbosity bias

The technical thing: judges score longer responses higher independent of content quality. Bridge: this is the same shape as essay-grading bias — longer essays often score higher. Concrete consequence: a chain that returns 300 words "wins" against a chain that returns 100 words on the same correctness, just because of length. Concrete mitigation: rubric explicitly mentions length neutrality ("score on correctness, not length"); cap the response length in the prompt itself so both candidates produce similar-length responses.

#### Self-preference bias

The technical thing: a model used as judge tends to prefer outputs that came from its own model family. Claude judging Claude vs GPT outputs tilts toward Claude; GPT judging the reverse tilts toward GPT. Bridge: this is the same shape as cultural bias in human review — judges favor what looks familiar. Concrete consequence: an eval using GPT-as-judge to compare two GPT prompts has *less* self-preference bias than the same eval using GPT-as-judge to compare a GPT prompt against a Claude prompt. Concrete mitigation: cross-model judging (Claude judges GPT outputs; GPT judges Claude outputs; agree on both); use multiple judge models and ensemble.

```
cross-model judging cancels self-preference

setup: comparing GPT prompt vs Claude prompt

judge GPT:    GPT prompt wins 60% (self-preference)
judge Claude: Claude prompt wins 58% (self-preference, mirror)

cross-model average:
  GPT prompt: (60% + 42%) / 2 = 51%
  Claude prompt: (40% + 58%) / 2 = 49%
  → real signal: roughly tied; both judges show their bias
```

#### Rubric specificity

The technical thing: vague rubrics ("is this good?") amplify all three biases. Specific rubrics ("score on accuracy 1-5: incorrect=1, missing key fact=2, partially correct=3, correct=4, correct + cited=5") reduce bias by constraining the judgment surface. Bridge: this is the difference between "looks good" and "passes the type check" — specific criteria reduce subjective drift. Concrete consequence: rubric work is part of eval method design; ship a rubric per chain.

### Move 3 — The principle

The principle: *judges are models with biases; treat their output as a noisy estimate, not ground truth*. The same way we don't trust a single human reviewer for high-stakes decisions, we shouldn't trust a single LLM-judge run. Mitigations are mechanical; skipping them means iterating on noise.

Full picture below.

---

## LLM-judge bias — diagram

```
┌─ Pairwise eval (naive) ──────────────────────────────────────────┐
│                                                                  │
│   for case in eval_set:                                          │
│     judge(case, A, B) → pick winner                              │
│                                                                  │
│   biases stacked:                                                │
│     - position (A always first)                                  │
│     - verbosity (longer wins)                                    │
│     - self-preference (judge picks own family)                   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘

┌─ Pairwise eval (mitigated) ──────────────────────────────────────┐
│                                                                  │
│   for case in eval_set:                                          │
│     randomize order: (A, B) or (B, A)                            │
│     normalize length: cap both at N tokens                       │
│     ensemble: judge with model X AND model Y                     │
│     specific rubric: "score on 5 dimensions, not 'is it good'"   │
│                                                                  │
│   residual bias: small, calibratable                             │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

Mitigations are mechanical and stack; each one removes one bias source.

---

## In this codebase

**Not yet implemented.** No chains, no judges. The buildable target is below — a `/ai/llm-as-judge-bias` visualizer that runs the same precomputed (output A, output B) pair 100 times in randomized order, shows the position-bias curve, toggles cross-model judging, demonstrates self-preference.

**Expected file paths:**
- `src/app/ai/llm-as-judge-bias/page.tsx`
- `src/components/JudgeBiasVisualizer/`
- `public/ai/llm-as-judge-bias/scenarios.json`

---

## Elaborate

### Where this pattern comes from

LLM-judge bias was documented in 2023-2024 (Zheng et al. "Judging LLM-as-a-Judge"; Stanford / Berkeley papers on bias quantification). The mitigations (randomization, cross-model, rubric specificity) emerged from teams shipping LLM-judge evals in production and finding their scores didn't track human judgments without bias correction.

### The deeper principle

*Any judgment surface has biases.* Human reviewers have them (confirmation bias, anchoring). LLM judges have them too, just measurable ones. The discipline is the same: measure the bias, design mitigations into the workflow.

### Where this breaks down

Mitigations break down at the tail of cases the judge model wasn't trained on (domain-specific outputs, code in obscure languages, multilingual cases). For those, HITL on the divergent set + cross-model judging on the rest.

### What to explore next

- [02-eval-methods](02-eval-methods.md) — the broader method choice that LLM-judge is one of
- [04-llm-observability](04-llm-observability.md) — track judge variance over time
- Zheng et al. "Judging LLM-as-a-Judge" — canonical bias measurement paper

---

## Tradeoffs

### Comparison table

```
┌──────────────────┬───────────────────┬─────────────────────────┐
│ Cost dimension   │ With mitigations  │ Naive LLM-judge         │
├──────────────────┼───────────────────┼─────────────────────────┤
│ Cost per case    │ 2-3x naive        │ 1x                      │
│                  │ (cross-model adds │                         │
│                  │ judge calls)      │                         │
│ Eval reliability │ High              │ Low (biases dominate)   │
│ Iteration signal │ Real              │ Noisy                   │
│ Setup effort     │ Rubric + random + │ Single rubric           │
│                  │ cross-model       │                         │
│ Maintenance      │ Re-calibrate when │ None (until obvious     │
│                  │ judge model       │ wrong)                  │
│                  │ upgrades          │                         │
└──────────────────┴───────────────────┴─────────────────────────┘
```

### What we gave up

2-3x cost per eval run (cross-model judging doubles or triples the judge calls). Rubric design time per chain. Order randomization adds bookkeeping.

### What the alternative would have cost

Iterating on noisy signal — months of "prompt B is better" decisions that don't move production metrics, because the eval was measuring position/verbosity/self-preference, not real quality.

### The breakpoint

Mitigations earn their place the day you adopt LLM-as-judge for any production eval. The cost is low; the alternative (biased scores driving wrong decisions) is high.

---

## Tech reference (industry pairing)

### Cross-model judging (Claude judges GPT, GPT judges Claude)

- **Codebase uses:** not yet — visualizer would use both Anthropic + OpenAI for the same eval.
- **Why it's here:** cross-model is the canonical self-preference mitigation.
- **Leading today:** cross-model ensemble — `innovation-leading` standard for production evals, 2026.
- **Why it leads:** mathematically symmetric — each model's bias cancels the other's; agreement signal is robust.
- **Runner-up:** single-model + HITL calibration — `adoption-leading` for cost-constrained teams.

### Rubric-based judging (promptfoo, custom)

- **Codebase uses:** not yet — visualizer would use a specific multi-dimensional rubric.
- **Why it's here:** specific rubrics reduce subjective drift across runs.
- **Leading today:** promptfoo's `model-graded` evaluator — `adoption-leading` for rubric-based judging.
- **Why it leads:** integrates with order randomization; supports rubric tuning.

### Order randomization (custom)

- **Codebase uses:** not yet — would be implemented in the eval-runner script.
- **Why it's here:** the simplest, cheapest mitigation; should always be on.
- **Leading today:** trivial implementation; standard in every mature eval framework.

---

## Project exercises

### [B-reincodes-judge-bias-viz] Build the judge-bias visualizer

- **Exercise ID:** `[B-reincodes-judge-bias-viz]`
- **What to build:** a page at `/ai/llm-as-judge-bias` that takes the same precomputed (output A, output B) pair and runs the judge 100 times in randomized order. Render the position-bias curve. Toggle "cross-model judging" to show how self-preference cancels with cross-validation. Toggle "rubric specificity" between vague and specific to show the variance difference.
- **Why it earns its place:** demonstrates the position-bias curve visually — it's hard to *not* believe the bias is real when you see the percentages shift just by reordering.
- **Files to touch:** `src/app/ai/llm-as-judge-bias/page.tsx`, `src/components/JudgeBiasVisualizer/`, `public/ai/llm-as-judge-bias/scenarios.json`.
- **Done when:** page loads, position-bias curve renders, cross-model + rubric toggles work.
- **Estimated effort:** 1–2 days.

---

## Summary

### Part 1 — concept recap

LLM-as-judge introduces three biases — position (first option wins extra), verbosity (longer wins extra), self-preference (judge favors own family's outputs). Each is documented; each has a mechanical mitigation (randomize order, normalize length, cross-model judging). In reincodes Case B; visualizer demonstrates position-bias curve and the self-preference cancellation. Without mitigation, LLM-judge evals iterate on noise.

### Part 2 — key points to remember

- **Three biases**: position, verbosity, self-preference.
- **Three mitigations**: randomize order, cap length / normalize, cross-model judging.
- **Rubric specificity** reduces all three by constraining the judgment surface.
- **Cost**: 2-3x naive (cross-model doubles judge calls).
- **The trap**: ship LLM-judge without mitigations, iterate on biased signal for months.

---

## Interview defense

### What an interviewer is really asking

"What are the limitations of LLM-as-judge?" — testing whether the candidate has shipped LLM-judge evals or just read about them. Junior: "the judge model might be wrong." Senior: "three documented biases — position, verbosity, self-preference — with mechanical mitigations."

### Likely questions

**Q (mid):** What's position bias?

A: The judge tends to prefer whichever option is presented first in a pairwise comparison. Magnitude is 5-15 percentage points depending on the judge model and the case. Mitigation is order randomization — for half the cases, show (A, B); for the other half, show (B, A); aggregate. The bias averages out; the real signal emerges.

```
position bias measurement

show (A, B): A wins 65%, B wins 35%
show (B, A): A wins 52%, B wins 48%
delta:        A inflates 13pp when first

aggregate (randomized): A wins 58.5%, B wins 41.5%
→ real signal: A is ~17pp better, not 30pp
```

**Q (senior):** How would you detect self-preference in your eval?

A: Cross-model audit. Run the same eval with two different judge models. If the conclusions agree, self-preference isn't dominant. If they disagree systematically (judge X picks model X's output more often than judge Y picks the same), self-preference is in the scores. Mitigation: cross-model ensemble (average results across judges) or HITL calibration on the disagreement cases.

```
self-preference detection

run with judge X (e.g., GPT): output_A wins 60%
run with judge Y (e.g., Claude): output_A wins 40%

→ 20pp disagreement strongly suggests self-preference
→ true signal is somewhere in between
→ cross-model ensemble: 50% (which IS the right answer
   when self-preference is the dominant signal)
```

**Q (arch):** At 10x scale (1000+ cases per eval), how does bias mitigation scale?

A: At scale, three things become important. First, automated bias detection — run a position-randomization check on every eval and alert when the per-position delta exceeds a threshold (e.g., 5pp). Second, judge model rotation — different judges per eval run; track per-judge bias over time. Third, HITL sampling — for every 1000 cases LLM-judged, sample 50 for HITL; use the HITL labels to recalibrate. The total architecture becomes "LLM-judge at bulk + HITL at sample + bias monitoring continuously."

### The question candidates always dodge

**Q:** Couldn't you just use a stronger judge model and avoid biases?

A: Bigger/stronger judge models have *smaller* biases but still have them — the bias is structural to LLM judgment, not a function of capability. GPT-5 as judge still has position bias (smaller than Haiku, but present). The honest answer: model upgrade reduces magnitude; only mitigation eliminates the bias. Teams that bet on "the next model will fix this" wait forever; the mitigations are mechanical and stable.

```
bias magnitude by model capability

judge model        position bias     mitigation needed?
─────────────       ─────────         ────────────────
Haiku               ~15pp             yes
Sonnet              ~10pp             yes
Opus                ~7pp              yes
GPT-4o              ~10pp             yes
GPT-5               ~5pp              yes (smaller, still real)
Future-Mega         ~3pp?             still yes
```

### One-line anchors

- "Three biases: position, verbosity, self-preference. Three mitigations: randomize, normalize, cross-model."
- "Randomize order on every pairwise eval. Cheapest mitigation, biggest impact."
- "Cross-model judging cancels self-preference. Worth 2-3x cost on production evals."
- "Bigger models reduce magnitude; only mitigation eliminates bias."
- "Iterating on a biased eval is iterating on noise."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Draw the three biases and their mitigations.

### Level 2 — Explain it out loud
Explain LLM-judge bias to a colleague using LLM-as-judge without order randomization. Under 90 seconds.

### Level 3 — Apply it
Design a pairwise eval for comparing two GPT prompts. The judge is GPT-5. What mitigations are mandatory and why?

### Level 4 — Defend
Pick the biggest tradeoff. Would the visualizer focus on one bias or all three?

### Quick check
- What file controls the static-export contract?
- Where does the visualizer register?
- What JSON file holds the scenarios?
