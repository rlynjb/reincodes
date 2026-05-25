# Eval methods

**Industry name(s):** Exact-match eval, semantic similarity eval, LLM-as-judge, human-in-the-loop annotation
**Type:** Industry standard

> Four methods for scoring LLM outputs against expected behavior: exact-match (cheap, deterministic, schema-friendly), semantic similarity (fuzzy, embedding-based), LLM-as-judge (flexible, biased — see next file), human-in-the-loop (gold standard, slow, expensive). Each fits different chain shapes; the senior move is matching method to chain.

**See also:** → [01-eval-set-types](01-eval-set-types.md) · → [03-llm-as-judge-bias](03-llm-as-judge-bias.md) · → [../../study-prompt-engineering/05-eval-driven-iteration.md](../../study-prompt-engineering/05-eval-driven-iteration.md)

---

## Why care

### Move 1 — The grounded scenario

You have a golden set of 30 cases for your classifier chain. You change a prompt and want to know "is this version better?" You run the chain on all 30 cases against both prompt versions. Now you need to *score* the outputs. For a classifier (output = enum label), exact match works perfectly. For the summarizer chain (output = free-form prose), exact match returns 0 every time (the new prompt produces different prose, all of it potentially good). For the chatbot chain (output = conversation), exact match is meaningless. The score depends entirely on what *scoring method* you use.

### Move 2 — Name the question

The question is *how do you turn "output" into "score"*. The answer differs by output type. Exact match works for structured outputs (`{label: "todo"}` === `{label: "todo"}`). Semantic similarity works for short free-form outputs ("the meeting is at 3pm" vs "meeting's scheduled for 3"). LLM-as-judge works for everything but introduces bias. Human-in-the-loop works for everything but at human-grading cost. The choice isn't ideological; it's per-chain-shape.

### Move 3 — Why answering that question matters

**Why you need to answer that question at all:** because the scoring method is what determines whether a "better" prompt actually *is* better. A semantic-similarity eval that scores 0.95 on both versions tells you nothing if the change actually improved correctness on a specific edge case the semantic check can't distinguish. The wrong method either misses real improvements (false negative — prompt is better but eval says same) or rewards superficial improvements (false positive — output sounds better, semantic score up, actual correctness unchanged). The teams shipping reliable LLM features pick the scoring method per chain and revisit when the chain's output type changes.

### Move 4 — Concrete before/after

Classifier chain (output = enum), wrong method:

- Eval method: LLM-as-judge with rubric
- Cost: $0.001/case × 30 cases × 2 versions = $0.06 per eval run
- Issue: judge can mistakenly mark a correct label as "could be better"; introduces noise on a fundamentally exact-match problem

Classifier chain, right method:

- Eval method: exact-match (`output.label === expected.label`)
- Cost: $0 (no LLM call needed for scoring)
- Result: deterministic per-case pass/fail; aggregate score is unambiguous; per-class confusion matrix is trivial

### Move 5 — The one-line summary

Eval methods are `Object.is` vs `_.isEqual` vs `JSON.stringify ===` for LLM outputs — pick the method that matches the output's actual equality semantics, not the most sophisticated one. Mechanics below.

---

## How it works

### Move 1 — The mental model

Four methods, four tradeoffs:

```
method                  works for                      cost      determinism
─────────────────       ────────────────              ──────    ───────────
exact match             structured outputs (JSON)     $0        ✓ fully
semantic similarity     short free-form text          $0.0001   mostly
LLM-as-judge           prose, conversation, ambiguous $0.001    ✗ noisy
human-in-the-loop      anything (gold standard)       $0.50+    ✓ fully
```

### Move 2 — The layered walkthrough

#### Exact-match (the default for structured outputs)

The technical thing: compare output JSON byte-for-byte (or via deep-equal) with expected JSON. The bridge: this is `_.isEqual` or `JSON.stringify(a) === JSON.stringify(b)`. Concrete consequence: works for any chain with a typed schema; pass/fail is unambiguous; no scoring noise. Concrete condition where it breaks: when "different output, same meaning" counts as correct — e.g., array order doesn't matter, or two semantically-equivalent labels exist.

#### Semantic similarity (embedding-based)

The technical thing: embed the actual output and expected output; compute cosine similarity; pass if ≥ threshold (typically 0.85-0.95). The bridge: this is fuzzy string-match for high-dimensional space. Concrete consequence: works for short free-form outputs ("meeting at 3pm" vs "3pm meeting"); catches paraphrases the LLM might produce. Concrete condition where it breaks: long-form outputs (a 500-word summary can have 0.95 similarity to a wrong answer if the topic words are right but the details are wrong); domain-specific equivalence (medical/legal terms where small wording shifts matter).

```
semantic similarity example

expected: "the meeting is at 3pm"
output:   "meeting's at 3pm"          → cos sim 0.92  ✓ PASS
output:   "meeting cancelled"         → cos sim 0.45  ✗ FAIL
output:   "meeting at 4pm"            → cos sim 0.88  ✓ PASS (wrong! — false positive)
```

#### LLM-as-judge (with rubric)

The technical thing: pass the (input, expected, actual) tuple to an LLM with a rubric ("score 1-5 on accuracy, brevity, helpfulness; explain"). Aggregate scores. The bridge: this is like having a code reviewer score PRs — flexible, captures nuance, also slow + opinionated. Concrete consequence: works for free-form outputs where exact/semantic methods don't apply. Concrete condition where it breaks: see next file (`03-llm-as-judge-bias.md`) — position bias, verbosity bias, self-preference bias all distort scores.

```
LLM-as-judge prompt shape

system: "You are an evaluator. Rate the actual output against the expected.
         Score 1-5 on: accuracy, completeness, brevity.
         Return JSON: { accuracy: int, completeness: int, brevity: int, notes: string }"

user: "Input: [user query]
       Expected output: [expected]
       Actual output: [actual]"
```

#### Human-in-the-loop (gold standard)

The technical thing: humans label outputs against the same rubric. The bridge: this is QA review for software releases — slow, expensive, definitive. Concrete consequence: 100% accurate within annotator agreement; used as the gold standard against which the other methods get calibrated. Concrete condition where it works: high-stakes chains where wrong scoring is more expensive than human annotation ($0.50/case × 100 cases = $50 to know whether your prompt is actually better); when it breaks: anything that needs to scale beyond ~1000 cases.

### Move 3 — The principle

The principle: *the eval method is a design choice, not a default*. Picking the right method per chain is part of the chain's design — it follows from the output shape, the cost budget, and the stakes. The chains that ship with the wrong method either don't catch real regressions or burn budget on noisy scores.

Full picture below.

---

## Eval methods — diagram

```
┌─ Output type → method ────────────────────────────────────────────┐
│                                                                   │
│   structured (JSON, enum, typed)                                  │
│        │                                                          │
│        ▼                                                          │
│      EXACT MATCH (cheap, deterministic)                           │
│                                                                   │
│   short free-form (1-2 sentences)                                 │
│        │                                                          │
│        ▼                                                          │
│      SEMANTIC SIMILARITY (cheap, fuzzy)                           │
│                                                                   │
│   long free-form (prose, conversation)                            │
│        │                                                          │
│        ▼                                                          │
│      LLM-AS-JUDGE (with rubric, watch for bias)                   │
│                                                                   │
│   high-stakes anything                                            │
│        │                                                          │
│        ▼                                                          │
│      HUMAN-IN-THE-LOOP (gold standard, slow)                      │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘

calibration: use HITL to verify the other methods on a sample
```

The mapping makes the choice mechanical once you know the output shape.

---

## In this codebase

**Not yet implemented.** reincodes has no chains, no eval set, no scoring runs. The buildable target is below — a `/ai/eval-methods` visualizer that takes a small precomputed (input, expected, actual) eval set and scores it four ways simultaneously, showing where methods agree and where they diverge.

**Expected file paths:**
- `src/app/ai/eval-methods/page.tsx`
- `src/components/EvalMethodsVisualizer/`
- `public/ai/eval-methods/eval-set.json`

---

## Elaborate

### Where this pattern comes from

ML evaluation literature is decades old (precision/recall, F1, classification metrics). The LLM-specific addition is the open-ended-output problem — older ML outputs were structured (labels, regressions), so exact-match always applied. Free-form text output forced the methods catalog to grow: semantic similarity, LLM-as-judge, human-in-the-loop.

### The deeper principle

*Equality is application-specific.* `===` works for primitives, deep-equal for objects, semantic similarity for text — each is the right answer for some shape of data. LLM evals just inherit the same question.

### Where this breaks down

All four methods break when the eval set itself is wrong (expected outputs are stale or mis-labeled). The mitigation: HITL re-labeling on a quarterly cadence; if the eval set drifts from real production behavior, the method choice doesn't matter.

### What to explore next

- [03-llm-as-judge-bias](03-llm-as-judge-bias.md) — when LLM-as-judge breaks
- [01-eval-set-types](01-eval-set-types.md) — what to score (the eval set) before how to score
- [`../../study-prompt-engineering/05-eval-driven-iteration.md`](../../study-prompt-engineering/05-eval-driven-iteration.md) — the iteration loop that uses these methods

---

## Tradeoffs

### Comparison table

```
┌──────────────────┬────────────┬───────────┬──────────────┬──────────┐
│ Cost dimension   │ Exact      │ Semantic  │ LLM-judge    │ Human    │
├──────────────────┼────────────┼───────────┼──────────────┼──────────┤
│ Cost per case    │ $0         │ $0.0001   │ $0.001-0.01  │ $0.50+   │
│ Latency per case │ <1ms       │ ~10ms     │ 1-5s         │ minutes  │
│ Determinism      │ Full       │ High      │ Low (noisy)  │ Full     │
│ Output type fit  │ Structured │ Short free│ Anything     │ Anything │
│ False positive   │ None       │ Medium    │ Medium-high  │ Lowest   │
│ False negative   │ None       │ Low       │ Medium       │ Lowest   │
│ Scale            │ Unlimited  │ Millions  │ Thousands    │ Hundreds │
└──────────────────┴────────────┴───────────┴──────────────┴──────────┘
```

### What we gave up

Each method has its own setup. Exact-match: schema definition (already needed for structured outputs). Semantic: embedding model integration + similarity threshold tuning. LLM-judge: rubric design + judge model selection. HITL: annotation pipeline + annotator training.

### What the alternative would have cost

Using one method for everything fails: exact-match misses paraphrase improvements; semantic over-rewards superficially-similar wrong answers; LLM-judge introduces noise at the scoring layer; HITL doesn't scale. The cost of mismatched method is the cost of unreliable evals.

### The breakpoint

Method choice is per-chain. The breakpoint where you outgrow exact-match is when you ship a free-form output. The breakpoint where you outgrow semantic is when output length crosses ~3 sentences. The breakpoint where you reach for HITL is when chain stakes justify $50+ per eval run.

---

## Tech reference (industry pairing)

### Promptfoo / Inspect / Langfuse

- **Codebase uses:** not yet — visualizer would mimic promptfoo's per-method scoring output.
- **Why it's here:** these tools support multi-method scoring natively; promptfoo specifically lets you configure exact-match + semantic + LLM-judge for the same eval set.
- **Leading today:** promptfoo — `adoption-leading` for OSS prompt eval framework, 2026.
- **Why it leads:** zero-config, multi-method, integrates with CI.
- **Runner-up:** Inspect (UK AISI) — `innovation-leading` for safety evals with stronger model-rated rubrics.

### OpenAI text-embedding-3 / Voyage / Cohere embed

- **Codebase uses:** not yet — for semantic similarity scoring.
- **Why it's here:** embeddings are the substrate for semantic similarity; quality of similarity scores depends on embedding model quality.
- **Leading today:** OpenAI text-embedding-3-large — `adoption-leading`, 2026.
- **Why it leads:** strong out-of-domain performance, low cost, ubiquitous SDK support.
- **Runner-up:** Voyage / Cohere — `innovation-leading` for specialized domains.

### Anthropic / OpenAI for LLM-judge

- **Codebase uses:** not yet — visualizer would use either as the judge model.
- **Why it's here:** judge model choice matters for bias (see next file).
- **Leading today:** cross-model judging (Claude judges GPT, GPT judges Claude) — `innovation-leading` for bias-resistant scoring.

---

## Project exercises

### [B-reincodes-eval-methods-viz] Build the eval-methods visualizer

- **Exercise ID:** `[B-reincodes-eval-methods-viz]`
- **What to build:** a page at `/ai/eval-methods` that loads a precomputed eval set (~15 cases mixing structured + short free-form + long free-form) and scores each case four ways simultaneously. An agreement matrix shows where methods agree; highlights cases where they diverge.
- **Why it earns its place:** the visualizer makes the method-fits-output insight visceral — same case, four scores, sometimes wildly different.
- **Files to touch:** `src/app/ai/eval-methods/page.tsx`, `src/components/EvalMethodsVisualizer/`, `public/ai/eval-methods/eval-set.json` + precomputed scores per method.
- **Done when:** page loads, all 15 cases render, agreement matrix populates, divergent cases highlighted.
- **Estimated effort:** 1–2 days.

---

## Summary

### Part 1 — concept recap

Four eval methods — exact-match, semantic similarity, LLM-as-judge, human-in-the-loop — each fit different output types. Exact-match for structured (free, deterministic), semantic for short free-form (cheap, fuzzy), LLM-judge for prose (flexible, biased), HITL for high-stakes (slow, gold standard). In reincodes Case B; visualizer demonstrates method-vs-output fit. The senior move is picking method per chain rather than defaulting to one.

### Part 2 — key points to remember

- **Four methods**: exact / semantic / LLM-judge / HITL.
- **Output type determines method**: structured → exact; short text → semantic; prose → judge; high-stakes → human.
- **Calibration**: use HITL to verify cheaper methods on a sample.
- **Cost spread**: $0 to $0.50+/case across methods.
- **Reincodes shape**: Case B; visualizer demonstrates the agreement matrix.

---

## Interview defense

### What an interviewer is really asking

"How do you evaluate LLM outputs?" — testing whether the candidate matches method to output shape vs defaulting to one. Junior: "use LLM-as-judge." Senior: "exact match for structured, semantic for short text, LLM-judge with bias mitigation for prose, HITL for high-stakes — pick per chain."

### Likely questions

**Q (mid):** What's wrong with using LLM-as-judge for everything?

A: Two problems. First, it's expensive and noisy on problems where simpler methods give deterministic scores — classifier outputs don't benefit from a judge's nuance; they need exact match. Second, LLM-judge has known biases (position, verbosity, self-preference — see next file) that introduce scoring noise on top of real signal. The right move is exact-match where it applies, semantic where it applies, and reserve LLM-judge for cases where neither fits.

```
when LLM-judge over-applies

case                              right method     why not LLM-judge
─────────────────────────         ─────────       ────────────────────
"classify intent: todo/note"      exact match      LLM-judge adds noise
                                                   on a binary problem
"summarize in 1 sentence"         semantic         judge bias more
                                                   expensive than warranted
"explain this code in detail"     LLM-judge        right tool — no
                                                   shorter alternative
```

**Q (senior):** How do you calibrate semantic-similarity thresholds?

A: With HITL labels on a sample. Annotate ~50 cases manually (pass/fail). Run semantic on them. Find the threshold (e.g., 0.87) where the semantic-pass set best aligns with the human-pass set. Re-calibrate periodically — embedding model upgrades shift the distribution.

```
threshold calibration

sample: 50 cases, manually labeled
       ┌──────────────────────────────┐
       │ semantic score distribution  │
       │   PASS: peak around 0.91     │
       │   FAIL: peak around 0.65     │
       └──────────────────────────────┘
threshold = midpoint or use F1-optimized point
```

**Q (arch):** At 10x scale (100K eval cases), what changes about method choice?

A: At 100K, even semantic similarity ($0.0001/case) costs $10/eval-run, manageable but not free. LLM-judge ($0.001/case) costs $100/eval-run, run weekly = $5K/year. HITL doesn't scale at all — sample 100-500 cases for HITL spot-checks; rely on cheaper methods for the bulk. The architecture shifts: cheap methods at scale, expensive methods at sample, HITL at quarterly calibration.

```
method usage at scale

scale → 100        10K         100K
exact     all       all          all (free)
semantic  all       all          all ($10/run)
judge     all       all          sample 1K ($1/run)
HITL      all       sample 100   sample 100 (calibration)
```

### The question candidates always dodge

**Q:** Couldn't you just use HITL for everything and trust the gold standard?

A: HITL doesn't scale and doesn't update fast enough. Annotators are slow (~$0.50/case at fair labor rates means 100 cases = $50, 1000 cases = $500). Iteration speed matters more than gold-standard accuracy at the iteration step — you need to know "is this prompt better than the last one?" in 5 minutes, not next Tuesday after the annotation queue clears. The honest answer: HITL is the gold standard for *measuring* a method's reliability, but it's too slow to *be* the iteration method.

```
iteration speed vs accuracy

method      iteration speed     accuracy
─────       ─────────────       ────────
exact       seconds             100% (when applicable)
semantic    minutes             ~95%
judge       minutes             ~85%
HITL        days                ~99%

iteration speed = method's primary constraint
HITL accuracy doesn't help if it arrives a week late
```

### One-line anchors

- "Output type picks the method. Don't default to one."
- "Exact match for structured. Semantic for short text. Judge for prose. HITL for high-stakes."
- "HITL is the gold standard; cheaper methods are calibrated against it."
- "Method mismatch produces noise, not signal."
- "Iteration speed is the eval's primary constraint."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Draw the output-type → method mapping.

### Level 2 — Explain it out loud
Explain eval methods to a colleague using LLM-judge for every chain regardless of output type. Under 90 seconds.

### Level 3 — Apply it
A new chain returns a 3-paragraph explanation of a code change. Which method fits? Why not the others?

### Level 4 — Defend
Pick the biggest tradeoff. Would you use a single method or all four in the visualizer?

### Quick check
- What file controls static-export contract?
- Where does the visualizer register?
- What JSON file holds the eval set?
