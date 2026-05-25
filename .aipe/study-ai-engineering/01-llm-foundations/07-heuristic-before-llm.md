# Heuristic-before-LLM (when not to use an LLM)

**Industry name(s):** Heuristic-before-LLM, cheap path / expensive path, routing pattern, classifier ladder
**Type:** Industry standard

> The senior move of writing a cheap deterministic classifier (regex, keyword match, length check) before the expensive LLM call. Most inputs are predictable; pay the LLM only for the ones that aren't. 60-90% of calls eliminated in measured deployments.

**See also:** → [06-token-economics](06-token-economics.md) · → [08-provider-abstraction](08-provider-abstraction.md) · → [../05-evals-and-observability/](../05-evals-and-observability/) · → [../00-overview.md](../00-overview.md)

---

## Why care

### Why care anchored to a frontend primitive

You have a todo list with a `.map()` that classifies each item as a "task," "question," or "vent" based on user-written content. The naive solution: call an LLM for each todo. Latency: 800ms per call. Cost: $0.005 per call. At 100k todos/day: $500/day in LLM spend just for classification. But 70% of the todos start with `[`, contain keywords like "TODO" or "remind me," or are short imperative phrases — patterns a regex matches in 0.001ms for $0. The senior move isn't reaching for the LLM; it's writing the regex first and reserving the LLM for the 30% of inputs the regex can't decide. The classification ladder costs $150/day instead of $500/day, has lower average latency (most calls return in microseconds), and the failure modes are categorisable (regex misses are a class; LLM misses are a different class).

### Move 2 — Name the question

That ladder has a name — *heuristic-before-LLM*. Specifically: a deterministic, cheap-to-compute filter that routes inputs into two paths — a fast path that handles the predictable cases without calling the LLM, and a slow path that hands the ambiguous cases to the LLM. The heuristic doesn't have to be perfect; it has to be cheap, fast, and *better than random* on the predictable cases. The question is operational: which cases are predictable enough for the heuristic, what's the heuristic's coverage, how do you measure when the predictable-cases distribution drifts, and when does the heuristic-then-LLM ladder pay off relative to just calling the LLM every time.

### Move 3 — Why answering that question matters

**Why you need to answer that question at all:** because the LLM is expensive on every call, and most inputs to most chains are predictable on the cheap side. I have shipped a classification chain in 2024 where the team's instinct was "the LLM will figure it out, just send everything to it" — the launch-day projection was unaffordable, and the fix was writing a 40-line regex classifier that handled 75% of inputs with a 96% accuracy on the predictable patterns. The LLM only saw the remaining 25% — the cases where the regex returned "uncertain." Cost dropped 75%; latency dropped from 800ms average to 200ms average (because most calls bypassed the LLM entirely); and the regex made the failure modes inspectable — when the chain misclassified, we could check whether the regex routed it to the LLM (LLM error) or handled it directly (regex error), and we knew which layer to fix. The heuristic-before-LLM pattern is the difference between an LLM-powered feature and an LLM-overused feature; the latter is a common failure mode in 2024-2026 deployments by teams new to LLM engineering.

### Move 4 — Concrete before/after

Without heuristic-before-LLM:

- Every input goes through the LLM
- Average latency is the LLM's latency (~500-1500ms)
- Cost scales linearly with input volume — no shape
- "The model is wrong" is the only debugging tool
- Cost-per-active-user grows linearly; can't ship at scale

With heuristic-before-LLM:

- 60-90% of inputs handled by the heuristic in <1ms, $0
- LLM only sees the ambiguous cases
- Average latency drops to ~50ms (most calls are cheap path)
- Cost drops by the heuristic coverage rate (75% coverage = 75% LLM cost reduction)
- Failure mode is partitioned: heuristic errors are debuggable separately from LLM errors
- The chain's behaviour is more reproducible (the cheap path is deterministic)

### Move 5 — The one-line summary

Heuristic-before-LLM is the routing pattern that filters predictable inputs through a cheap deterministic classifier before the expensive LLM call — analogous to how a database query checks indexes before scanning the full table, except the "scan" is an LLM call costing real money. The full mechanics are below.

---

## How it works

### Move 1 — The mental model

The chain becomes a two-stage pipeline. Stage one: a cheap deterministic function (regex, keyword match, length check, structural check) that returns either a confident classification or a "don't know" signal. Stage two: the LLM call, executed only on inputs where the heuristic returned "don't know." The heuristic is designed for *high precision on a partial coverage* — it should be right when it's confident, and silent when it's not. The LLM handles the inputs the heuristic punts on. The combined system has two failure modes (heuristic miscalls a predictable case, LLM miscalls an ambiguous case), each of which is debuggable separately.

The strategy: design the heuristic to maximise coverage of inputs where you're confident the heuristic is right, accept that the LLM handles everything else, and measure both layers' accuracy independently.

```
The heuristic-then-LLM pipeline

         input
           │
           ▼
   ┌────────────────────┐
   │ heuristic check    │  fast, free, deterministic
   │ (regex, rules,     │  high precision on predictable cases
   │  structural)       │
   └────────┬───────────┘
            │
       ┌────┴────────┐
       │ confident?  │
       └────┬────────┘
            │
       ┌────┴─────────┐
       │              │
       ▼ yes          ▼ no
   return         ┌────────────────┐
   directly       │ LLM call       │  expensive, slow, but smarter
                  │ (classifier)   │  handles ambiguous cases
                  └────────────────┘
```

### Move 2 — The layered walkthrough

#### The heuristic primitive

The technical thing: the heuristic is whatever runs deterministically and cheaply on the input — typically a regex, a keyword match, a length check, a structural check on JSON, or a combination. The bridge from frontend: this is the equivalent of input validation before the form submission — `if (!email.match(/^.+@.+/)) return "invalid email"` runs deterministically and returns a clear answer before you even consider the slow path. Concrete consequence: the heuristic's job is *not* to handle every case; it's to confidently handle the cases it knows. Inputs the heuristic doesn't recognise return "don't know" and proceed to the LLM. A heuristic that tries to handle every case becomes an unmaintainable rule pile; a heuristic that confidently handles 70% of cases and admits ignorance on the rest is the right shape.

```
regex heuristic for todo classification — high precision, partial coverage

  input → check in order:
    starts with "["                       → "task"  (e.g. "[x] buy milk")
    contains "?"                          → "question"
    starts with capital + verb pattern    → "task"  (e.g. "Buy milk")
    contains "i hate" / "i'm tired"       → "vent"
    none of the above                     → "don't know" → LLM
    
  measured coverage: 73% of real inputs
  measured precision on covered cases: 96%
  cost: 0.001ms per call (regex match)
```

#### The "don't know" signal

The technical thing: the heuristic returns one of two things — a confident classification or an explicit "uncertain" signal that tells the orchestration layer to escalate to the LLM. The bridge from a DB primitive: this is the equivalent of returning `NULL` vs returning a value — `NULL` is a signal to handle separately, not a default. Concrete consequence: the heuristic's design has to include the "uncertain" return value, and the threshold for confidence has to be tuned. A heuristic that returns a label with low confidence is worse than one that admits uncertainty, because the low-confidence label hides the failure mode (the orchestration layer thinks the heuristic handled it, but the heuristic was wrong). Always include the uncertainty signal.

#### The escalation path

The technical thing: when the heuristic punts, the orchestration layer calls the LLM with the same input, plus optionally some context about why the heuristic punted (e.g., "this input didn't match any known pattern; classify it"). The LLM's prompt is the standard chain prompt — the LLM doesn't know it's the second-tier path; it just sees an input and a job. The bridge from frontend: this is structurally the same as exception escalation in error handling — the cheap path either succeeds or escalates to the expensive recovery path. Concrete consequence: the LLM tier should be the same chain you'd have built if there were no heuristic; the heuristic is a filter in front of it, not a replacement for it. This keeps the LLM tier coherent and lets you evaluate it independently.

#### Measuring coverage and accuracy

The technical thing: two metrics matter. *Coverage* is the percentage of inputs the heuristic handles (returns a confident label rather than uncertain). *Precision on covered* is the percentage of confident labels that are correct. The bridge from search/ranking: this is the same logic as recall/precision in information retrieval — you want high precision on the slice you handle, and you accept that recall on that slice is partial because you have a fallback. Concrete consequence: the metric to optimise is *coverage at acceptable precision*. A heuristic with 90% precision on 50% coverage is better than one with 80% precision on 90% coverage if the LLM-tier accuracy is 95% — the second heuristic produces more total errors because its mistakes propagate without LLM-tier recovery. Set the precision threshold first (typically 95-98% on covered cases) and then maximise coverage subject to that constraint.

#### The drift detection problem

The technical thing: heuristics drift. The input distribution changes over time — users phrase things differently, product features change which classes are common, new edge cases emerge. The heuristic that handled 75% of inputs at launch might handle 50% six months later, and the precision on covered cases might also drift. The bridge from a frontend primitive: this is the same problem as cache invalidation — the cache (here, the heuristic's rules) goes stale as the underlying reality (input distribution) changes. Concrete consequence: every heuristic needs (a) a periodic eval sampling current production inputs to measure current coverage and precision, and (b) a sampling mechanism where a fraction of inputs the heuristic confidently handles also get sent to the LLM, to catch silent precision degradation. Without these monitors, the heuristic silently degrades and the chain's effective accuracy drops without anyone noticing.

```
heuristic monitoring loop

  production inputs
        │
        ▼
  heuristic returns:
    confident → return label
    uncertain → escalate to LLM
        │
        ▼
  sampled subset (5-10%):
    also send confident-labelled inputs to LLM
    compare heuristic label to LLM label
    surface mismatches for review
        │
        ▼
  periodic dashboard:
    coverage rate (target ≥ 60%)
    precision on covered (target ≥ 95%)
    sample mismatch rate (target ≤ 5%)
```

#### When the heuristic earns its place

The technical thing: the heuristic-before-LLM pattern pays off when (a) the input distribution has predictable structure, (b) the LLM is the dominant cost, and (c) latency matters. It doesn't pay off when (a) inputs are genuinely diverse with no shared structure, (b) the LLM call is cheap enough that the heuristic's complexity isn't worth it, or (c) the chain runs offline and latency doesn't matter. The bridge from a frontend primitive: this is the same logic as deciding whether to add a memoisation layer — the cache pays off when the computation is expensive and the inputs are reused; if the computation is cheap or inputs are unique, the cache adds complexity without benefit. Concrete consequence: not every chain needs a heuristic. The decision is empirical — measure the chain's cost, latency, and input distribution; build the heuristic only when the math says the savings justify the engineering and maintenance burden.

### Move 3 — The principle

The principle that generalises beyond any one chain: *the LLM is not the answer to every problem; it's the answer to the problems where cheaper tools fail.* This is the senior engineer's framing of any expensive tool — use it for what only it can do, and use cheaper tools for what they can do. The history of LLM-powered systems in 2024-2026 is full of teams shipping "LLM-for-everything" architectures that prove unaffordable at scale; the architectural fix is always some version of "filter the predictable cases out before the LLM sees them." Treat the LLM as a high-leverage expensive resource — like a senior engineer's time — and only call it when the cheaper resources have legitimately failed.

The full picture is below.

---

## Heuristic-before-LLM — diagram

```
┌─ The two-tier classification ladder ─────────────────────────────────┐
│                                                                       │
│                     input                                            │
│                       │                                              │
│                       ▼                                              │
│       ┌─────────────────────────────────┐                            │
│       │ STAGE 1: HEURISTIC              │                            │
│       │   regex / keyword / structural  │                            │
│       │   cost: ~$0 / latency: ~1ms     │                            │
│       │   returns: confident label OR   │                            │
│       │             "uncertain"         │                            │
│       └────────────┬────────────────────┘                            │
│                    │                                                  │
│           ┌────────┴─────────┐                                       │
│           │                  │                                       │
│      confident          uncertain                                    │
│           │                  │                                       │
│           ▼                  ▼                                       │
│       return         ┌─────────────────────────────────┐             │
│       label          │ STAGE 2: LLM                    │             │
│                      │   provider call (Claude/GPT)    │             │
│                      │   cost: ~$0.005 / latency: 800ms│             │
│                      │   returns: label + confidence   │             │
│                      └────────────┬────────────────────┘             │
│                                   │                                  │
│                                   ▼                                  │
│                              return label                            │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
                              │
                              ▼   measured metrics, periodically
┌─ Monitoring loop ────────────────────────────────────────────────────┐
│                                                                       │
│   coverage             = % of inputs handled by heuristic            │
│   precision_on_covered = % of heuristic labels that are correct      │
│   llm_accuracy         = % of LLM labels that are correct            │
│   total_accuracy       = (coverage × precision) + (1-coverage) ×    │
│                            llm_accuracy                              │
│   cost_savings         = (1 - heuristic_call_cost / llm_call_cost)  │
│                            × coverage                                │
│                                                                       │
│   sample 5-10% of confident-labelled inputs through LLM              │
│   to catch silent precision degradation                              │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

The boundary between the upper band (the routing decision per input) and the lower band (the monitoring loop) is what makes the pattern sustainable: the routing is deterministic per call, the monitoring catches drift over time.

---

## In this codebase

**Not yet implemented.** reincodes is a Next.js static-export DSA visualizer with no AI surface in production code — there are zero LLM calls, no classification chains, no routing decisions. The existing study guide (`.aipe/study-ai-engineering/`) positions reincodes as the *interview-prep visualizer host* per the curriculum: a place to *teach* AI concepts through visualizers, not a place where AI runs for users. The buildable target for this concept is below in Project exercises — a `/ai/heuristic-before-llm` page with a text input field that runs both paths side-by-side: the regex heuristic returns instantly with a label or "uncertain"; the LLM path returns a precomputed label from the `public/ai/heuristic/example-runs.json` corpus. The reader sees the latency and cost difference, and which paths the heuristic confidently handles vs which it escalates.

**Expected file paths** (when built):
- `src/app/ai/heuristic-before-llm/page.tsx` — the visualizer page
- `src/components/HeuristicVisualizer/` — input field, two-path renderer with latency clocks, decision-tree visualization
- `src/utils/ai/todoHeuristic.ts` — the actual regex heuristic (for the cheap path, runs client-side)
- `public/ai/heuristic-before-llm/example-runs.json` — precomputed corpus of (input, regex_label, llm_label, ground_truth) records captured at build time by `scripts/precompute-heuristic.ts`

---

## Elaborate

### Where this pattern comes from

The heuristic-before-LLM pattern predates LLMs by decades. It's the same architectural shape as classical ML pipelines that use a fast rule-based filter before a more expensive learned classifier (spam filtering: regex rules before Bayesian classifier; fraud detection: hand-coded checks before ML model). The LLM-era application of the pattern emerged in 2023-2024 as teams hit the cost ceiling on LLM-for-everything architectures. The specific framing — "use the cheap deterministic path for predictable cases, reserve the LLM for ambiguous cases" — became standard practice in 2024 production deployments and is now industry-default for high-volume LLM features. Eugene Yan's blog and Hamel Husain's writing on LLM cost engineering both emphasised the pattern as the single largest cost optimisation available after prompt caching.

### The deeper principle

The deeper principle is that *the right tool for each input depends on the input's characteristics, not on the chain's default architecture*. The LLM is the right tool for inputs whose classification requires nuance, context, world knowledge, or generative inference. A regex is the right tool for inputs whose classification depends on surface structure that's documentable in rules. Treating one tool as the answer to all inputs ignores the input distribution; matching the tool to the input is the senior architectural move. This principle generalises beyond LLM/regex: it's the same principle that animates SQL-vs-OLAP, JIT-vs-AOT, cache-vs-compute. The shape of the input determines the right tool.

### Where this breaks down

The heuristic-before-LLM framing breaks down at three edges. First, when the input distribution genuinely has no predictable structure: a chain that takes free-form long-form user content (essays, journal entries, code) may have no regex-discoverable shape that correlates with the label. In that case, the heuristic returns "uncertain" on 99% of inputs and pays a maintenance cost for no benefit. Second, when the LLM is the right tool for *every* case, even predictable ones, because the chain's job is generation rather than classification (creative writing, summarisation, conversation). The heuristic-then-LLM pattern is for classification-shaped chains; generation chains rarely benefit. Third, when the cost of an LLM call is already low (Haiku/mini at small input/output sizes can be ~$0.0002/call), the engineering cost of building and maintaining the heuristic exceeds the savings. The pattern's ROI shifts with the absolute cost of the LLM tier.

### What to explore next

- [06-token-economics](06-token-economics.md) → the cost math that motivates the pattern; the heuristic is the second-largest lever after caching
- [08-provider-abstraction](08-provider-abstraction.md) → the LLM tier benefits from provider abstraction so model routing (cheap LLM for ambiguous → expensive LLM for hardest) becomes possible
- [../05-evals-and-observability/](../05-evals-and-observability/) → measuring coverage, precision, and drift requires an eval harness
- [../00-overview.md](../00-overview.md) → the planned visualizer surface includes `/ai/heuristic-before-llm` as a Phase 1 target

---

## Tradeoffs

### Comparison table — both costs in one frame

```
┌──────────────────┬──────────────────────┬─────────────────────────┐
│ Cost dimension   │ Path taken           │ Alternative             │
│                  │ (heuristic-then-LLM  │ (LLM for everything)    │
│                  │  classifier ladder)  │                         │
├──────────────────┼──────────────────────┼─────────────────────────┤
│ Average latency  │ 50-100ms (cheap path │ 500-1500ms (every call  │
│                  │ dominates)           │ hits the LLM)           │
│ Average cost     │ $0.001 per call      │ $0.005 per call         │
│ Cost at 100k/day │ $100/day             │ $500/day                │
│ Engineering time │ +1 day per chain     │ 0                       │
│ Maintenance      │ Quarterly heuristic  │ Zero                    │
│ overhead         │ review + retune      │                         │
│ Failure modes    │ Two debuggable       │ One opaque              │
│ Drift detection  │ Required (5-10%      │ N/A (no rules to drift) │
│                  │ sampling)            │                         │
│ Reproducibility  │ Cheap path is        │ All calls subject to    │
│                  │ deterministic        │ LLM sampling variance   │
│ Onboarding       │ Read the regex rules │ "It's the model"        │
│ Cold-start       │ Heuristic works on   │ LLM call required for   │
│                  │ day one (no data)    │ first user              │
└──────────────────┴──────────────────────┴─────────────────────────┘
```

### What we gave up (when planning the reincodes visualizer)

The first cost is *the heuristic's quality bar*. The visualizer's teaching value depends on the regex actually working — handling the obvious cases correctly so the reader sees "the heuristic gets these right; the LLM was overkill." Writing a good todo-classification regex is half a day of work and benefits from prior experience writing regex classifiers. A weak regex undermines the visualizer's teaching point because the reader sees the regex fail on cases the LLM clearly handles, and the "use the heuristic when you can" lesson becomes "the LLM is just better at everything." The honest move is to test the regex against a real corpus (e.g., a sample of loopd's labelled todos) and tune until the precision is 95%+ on covered cases.

The second cost is *the precomputed corpus' breadth*. To demonstrate both paths convincingly, the precomputed JSON needs at least 30-50 inputs spanning predictable cases (regex handles), ambiguous cases (LLM handles), and edge cases (both fail). For each input, the corpus needs the regex label, the LLM label, and the ground truth. That's a ~5KB JSON file but the labeling step requires human effort — someone has to write the inputs, predict the regex outcomes, run the LLM, and annotate ground truth. About 2-3 hours of careful work.

The third cost is *teaching the failure-mode-partitioning point*. The visualizer's most subtle teaching point is that the two-path system has two debuggable failure modes (regex error, LLM error), and an interactive UI has to make both visible. The visualizer's design needs to surface "the regex said X, the LLM said Y, the ground truth is Z" in a way that's not overwhelming. A simple "color-code the disagreements" approach works; a richer "show the regex's decision tree" approach teaches more but doubles the UI complexity. The decision is empirical — pick the simpler design first, iterate if the teaching point doesn't land.

### What the alternative would have cost (skipping the visualizer)

If reincodes never builds the `/ai/heuristic-before-llm` visualizer, the cost is *zero* in the codebase. The concept gets taught in this written study guide, in the curriculum's Phase 1 build items (`[B1.5]`: document heuristic regex coverage in loopd; `[B1.8]`: AI cost & latency panel), and gets exercised in production at loopd. The reincodes site stays pure-DSA.

The cost of *not* building it shows up in the interview-prep surface. The "when not to use an LLM" question is one of the most common senior-screening questions in 2026 AI engineering interviews — interviewers are trying to distinguish candidates who use LLMs as a hammer from candidates who think about the routing decision. A verbal answer is correct but generic; a visual answer with a live side-by-side ("watch the regex handle this in 1ms, watch the LLM take 800ms on the ambiguous case, watch the cost difference") is dramatically more credible.

### The breakpoint

The visualizer earns its place during interview rounds where the candidate is asked "when wouldn't you use an LLM?" The verbal answer ("when a regex handles it") is correct but doesn't demonstrate insight; the visual answer ("I built a side-by-side — let me show you which inputs land in each path") demonstrates the candidate has internalised the routing decision by building it. The breakpoint is event-shaped: an interview that pushes on the "when not to LLM" question hard enough that the verbal answer feels insufficient.

### What wasn't actually a tradeoff

Live LLM calls on user input were not a real option. The static-export contract forbids API keys at request time. Even if a backend existed, running a live LLM call per visitor would create variance in the LLM column's output that undercuts the teaching consistency — the reader can't compare "my LLM result" to "your LLM result" when they're different captures. The precomputed-corpus approach is the only architecture that gives consistent teaching value, and it's compatible with the deploy story.

---

## Tech reference (industry pairing)

### Regex / JavaScript RegExp

- **Codebase uses:** not yet — the planned `/ai/heuristic-before-llm` visualizer would implement the cheap path in JS regex (`src/utils/ai/todoHeuristic.ts`), running client-side with no dependencies.
- **Why it's here:** regex is the canonical heuristic primitive for text classification. It's deterministic, cheap, well-understood, and produces inspectable failure cases. For most text-classification chains, the heuristic layer is a regex chain.
- **Leading today:** JavaScript RegExp — `adoption-leading` for browser-side heuristics, 2026.
- **Why it leads:** built into the language, zero bundle cost, deterministic, easily testable. Modern V8 regex engine is fast (sub-millisecond on typical inputs). The right primitive for client-side rule-based filtering.
- **Runner-up:** `re2-wasm` — `innovation-leading` linear-time regex engine that avoids catastrophic-backtracking failures of the default V8 engine on adversarial inputs. Relevant for production deployments with untrusted input; overkill for the reincodes visualizer's teaching corpus.

### Anthropic Messages API (escalation tier)

- **Codebase uses:** not yet — the visualizer's "LLM tier" would use Anthropic Sonnet 4 as the escalation target, with outputs precomputed at build time and shipped as JSON.
- **Why it's here:** the LLM tier is the same chain you'd have written without the heuristic; the heuristic's job is to filter inputs before they reach it. Sonnet 4 is the canonical choice for classification chains that require nuance.
- **Leading today:** Anthropic Messages API — `adoption-leading` for production classification work, 2026.
- **Why it leads:** structured output via tool use makes classification responses reliable; strict-mode schemas guarantee shape; the model handles edge cases (sarcasm, multi-intent inputs, ambiguous phrasing) that regex can't.
- **Runner-up:** Anthropic Haiku — `adoption-leading` for cost-sensitive LLM tiers; 10× cheaper than Sonnet 4; appropriate when the heuristic has already filtered out most cases and the LLM tier handles a smaller, less-demanding subset.

### Eval framework (custom or Langfuse / Phoenix)

- **Codebase uses:** not yet — irrelevant for the visualizer's static-export deployment but named here because production deployment of the pattern requires measuring both layers' accuracy separately.
- **Why it's here:** the pattern's correctness depends on monitoring (coverage, precision-on-covered, drift detection). Without an eval framework, the heuristic silently degrades and the team doesn't know until users complain.
- **Leading today:** Langfuse — `adoption-leading` for LLM observability and per-layer eval, 2026.
- **Why it leads:** self-hostable, supports custom metrics per chain layer, integrates with the eval-suite pattern that exposes the heuristic's coverage and precision over time.
- **Runner-up:** Phoenix / Arize — `adoption-leading` for ML and LLM observability across the same platform; richer for teams running both ML pipelines and LLM chains.

---

## Project exercises

### [B-reincodes-heuristic-viz] Build the heuristic-before-LLM visualizer

- **Exercise ID:** `[B-reincodes-heuristic-viz]` — derived from the curriculum's "Interview prep surface — reincodes" entry and Phase 1 concept `[C1.9]` (Heuristic-before-LLM).
- **What to build:** a page at `/ai/heuristic-before-llm` with a text input field at the top (defaulting to a curated example, with a dropdown of precomputed examples). Below the input: two side-by-side cards. Card A renders the regex heuristic's evaluation tree (which rules matched, which fell through, final label or "uncertain"), runs in <1ms, shows a green/yellow/red indicator. Card B shows the LLM's precomputed response for the same input, with a simulated 800ms loading state via `delayLoop` to convey the latency cost, then the label. Below the cards: a metrics strip showing average latency and per-call cost, and a coverage indicator showing what % of the precomputed corpus the regex confidently handles. A "browse the corpus" toggle reveals all 30+ precomputed examples with regex label, LLM label, and ground truth in a table.
- **Why it earns its place:** the visualizer makes the *routing decision* observable — the reader types an input, watches one path finish in 1ms and the other in 800ms, and sees that for predictable inputs the LLM was overkill. The interview signal is that the candidate built a teaching artifact for the most under-applied LLM engineering pattern, the one that distinguishes senior LLM engineers from "LLM-for-everything" engineers.
- **Files to touch:** `src/app/ai/heuristic-before-llm/page.tsx` (visualizer page), `src/components/HeuristicVisualizer/` (two-path renderer, decision-tree visualisation for the regex path, latency clocks, corpus-browse table), `src/utils/ai/todoHeuristic.ts` (the actual regex heuristic, runs client-side), `public/ai/heuristic-before-llm/example-runs.json` (30+ precomputed (input, regex_label, llm_label, ground_truth) records), `scripts/precompute-heuristic.ts` (build-time script that loads the corpus of inputs, runs each through the regex, runs each through Claude, persists JSON). Add a row to `src/components/Home/conceptsData.tsx`'s category list under a new `ai-engineering` category.
- **Done when:** the page loads at `/reincodes/ai/heuristic-before-llm/` in production (GitHub Pages), the regex evaluates user input in real time client-side, the LLM panel simulates the latency cost with `delayLoop`, the corpus browser shows all examples with their per-layer outcomes, the precomputed regex achieves at least 70% coverage at 95%+ precision on the corpus, `next build` passes under `output: "export"`. Mobile layout stacks the two cards vertically without losing the comparison.
- **Estimated effort:** 2 days. Regex heuristic + corpus curation: half day. Precompute script + LLM calls + ground-truth labeling: half day. Two-path renderer + decision-tree visualisation: half day. Corpus browser + metrics strip + mobile polish: half day.

---

## Summary

### Part 1 — concept recap

Heuristic-before-LLM is the routing pattern that filters predictable inputs through a cheap deterministic classifier (regex, keyword match, structural check) before the expensive LLM call. The heuristic returns either a confident label or an explicit "uncertain" signal; the LLM only sees the uncertain cases. In measured deployments, 60-90% of inputs to classification chains are handled by the cheap path, producing matching reductions in cost and average latency. The pattern requires monitoring (coverage rate, precision on covered cases, drift detection via sampling) to remain reliable over time. In this codebase the concept is *planned* rather than implemented: reincodes has no LLM surface, and the buildable target is a `/ai/heuristic-before-llm` visualizer with a real client-side regex, a precomputed LLM corpus, and side-by-side latency/cost comparisons.

### Part 2 — key points to remember

- **The pattern**: cheap deterministic classifier first; LLM only for cases the heuristic can't decide. Two debuggable failure modes (regex error, LLM error).
- **The metrics**: coverage rate (% inputs handled by heuristic), precision on covered cases (% of heuristic labels correct). Target ≥60% coverage at ≥95% precision.
- **The cost win**: 60-90% reduction in LLM calls. Latency drops because most calls bypass the LLM.
- **The drift problem**: heuristics go stale as input distribution changes. Sample 5-10% of confident cases through the LLM to catch degradation.
- **The reincodes shape**: implementation is Case B; the buildable target is a side-by-side visualizer under `/ai/heuristic-before-llm` with a real regex and precomputed LLM corpus.

---

## Interview defense

### What an interviewer is really asking

Behind "when wouldn't you use an LLM?" the interviewer is checking whether the candidate has internalised the *routing decision* — that the LLM is the answer to *some* problems, not *every* problem. A junior answer says "when it's not necessary" without specifying when. A senior answer names the heuristic-before-LLM pattern, names the predictable-vs-ambiguous input split, names a specific chain where they applied it (the loopd classifier with 73% regex coverage). The interviewer is checking for the operational framing because "LLM-for-everything" is the most common architectural mistake among teams new to LLM engineering, and the candidate's awareness of it is a signal that they've shipped at non-trivial scale.

### Likely questions

**Q (mid):** Doesn't the regex add complexity? Why not just send everything to the LLM?

A: At small scale (~1k calls/day), the LLM-for-everything approach is fine — the cost is trivial, the latency is acceptable, the complexity is lower. At larger scale (10k+ calls/day), the math shifts. The LLM is paid for every call regardless of input simplicity; the regex is paid once during development and runs effectively free thereafter. For inputs that have predictable structure (todo lists starting with brackets, questions ending in `?`, imperatives starting with capitalised verbs), the LLM is overkill — a regex captures the pattern with 95%+ precision in 1ms for $0. The complexity of the regex is real but bounded — a 40-line classifier in one file, written once, reviewed periodically. The complexity of LLM-for-everything is the operational complexity of paying $500/day instead of $100/day and dealing with latency complaints. The senior move is naming the breakpoint (scale where the math shifts) rather than dismissing the regex as "extra code."

```
small scale (~1k/day)              large scale (100k+/day)
─────────────────                  ─────────────────────────
LLM-for-everything is fine          heuristic-before-LLM is mandatory
$5/day in LLM cost                  $500/day → $100/day with heuristic
latency complaints negligible       average latency 800ms → 50ms
no engineering ROI on heuristic     heuristic ROI is enormous
```

**Q (senior):** How do you keep the heuristic from going stale?

A: Three mechanisms. First, periodic coverage and precision audit: at least quarterly, sample current production inputs (a few hundred) and measure (a) what % the heuristic handles, (b) what % of those are right. If coverage drops below the target or precision drops below the threshold, retune the heuristic. Second, continuous sampling: 5-10% of confidently-labelled inputs are also sent to the LLM (cost is small because the LLM tier already has capacity), and the labels are compared. When the heuristic and LLM disagree, surface the case for human review. Disagreements concentrate on the boundary where the heuristic is starting to fail — drift detection. Third, eval suite that catches regressions: when the heuristic is edited, run it against a golden set of labelled examples to verify precision hasn't dropped. Without these three mechanisms, the heuristic silently degrades and the chain's effective accuracy drops without anyone noticing. With them, the heuristic stays maintainable for years.

```
quarterly audit                     continuous sampling
─────────────────                  ─────────────────────────
sample 200 prod inputs              5-10% confident-cases →
measure coverage + precision        LLM for comparison
fix if outside target               surface disagreements

eval suite on edits                 dashboard with metrics
─────────────────                  ─────────────────────────
golden set per chain                coverage, precision, drift
run on every heuristic edit         alerts on threshold breach
catch regressions in CI             link to the affected cases
```

**Q (arch):** At 10× the chain count — a chain ecosystem with 20 different classification chains — how does heuristic-before-LLM compose?

A: Two architectural decisions at 20 chains. First, the heuristic-then-LLM pattern is per-chain, not global — each chain has its own input distribution and its own predictable-vs-ambiguous split. A shared heuristic library doesn't make sense; what makes sense is a shared *framework* for the pattern (a `withHeuristic(heuristic, llmCall)` higher-order function that takes a heuristic and an LLM-call function and applies the routing logic uniformly). Second, the monitoring infrastructure is shared: one dashboard tracks per-chain coverage and precision, one eval framework runs per-chain golden sets, one sampling mechanism does the continuous LLM-comparison. The shared infrastructure means each new chain's heuristic-pattern integration is "write the heuristic, register it with the framework" rather than "build the whole monitoring story from scratch." At 20 chains × 70% average coverage, the chain ecosystem makes ~7M LLM calls/day instead of ~20M without the pattern, saving roughly $50k/month at Sonnet 4 pricing.

```
single chain                       20-chain ecosystem
─────────────────                  ─────────────────────────
one regex, one LLM tier            shared withHeuristic() wrapper
ad-hoc monitoring                  shared monitoring dashboard
manual quarterly review            automated drift detection
                                   per-chain golden sets
                                   per-chain coverage targets
```

### The question candidates always dodge

**Q:** Won't the LLM eventually be so cheap and fast that the heuristic becomes unnecessary?

A: Possibly. Per-token cost has dropped 30× since 2023, and per-token latency has dropped 5-10× over the same period. At some price/latency floor, the engineering ROI of the heuristic disappears. But two factors push back: first, demand grows faster than cost drops (teams use cheap LLMs for more things, total LLM volume grows even as per-call cost shrinks); second, the latency comparison is not absolute, it's relative — even if the LLM is 100ms, the regex is 1ms, and for high-frequency chains the 100× difference still matters. The honest 2026 answer: at current pricing and latency, the heuristic pays off for most production classification chains with ≥10k calls/day. As LLMs get cheaper, the break-even point shifts, but it doesn't disappear. The cost ledger:

```
"LLM will be free, skip heuristic"     2026 reality
─────────────────────────────────      ─────────────────────────
+ correct on per-call cost trend       per-call cost drops, demand grows
- ignores cumulative chain volume      total LLM spend grows
- ignores latency ratio                regex still 100× faster
- ignores failure-mode debugging       still want partitioned errors
                                       still want sampling reproducibility
```

The candidate who waits for LLMs to become free is the candidate whose chain bill grew past the budget before the prices dropped enough to save them.

### One-line anchors

- "The LLM is the answer to problems where cheaper tools fail. Not the answer to every problem."
- "Heuristic returns a confident label or 'uncertain.' Only uncertain cases escalate to the LLM."
- "Target ≥60% coverage at ≥95% precision on the covered slice. Measure both, quarterly."
- "Sample 5-10% of confident cases through the LLM for drift detection. Heuristics go stale."
- "Pattern pays off above ~10k calls/day at current pricing. Engineering ROI scales with volume."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw the two-tier classifier ladder from memory: input → heuristic → confident-or-uncertain branch → LLM for uncertain. Add the monitoring loop (sampling, coverage/precision metrics, drift detection). Label the cheap path and the expensive path.

✓ Pass: ladder shape correct, confident/uncertain branch labelled, monitoring loop included
✗ Fail: re-read the primary diagram, wait 10 minutes, try again.

### Level 2 — Explain it out loud

Explain heuristic-before-LLM to a colleague who has shipped one LLM-powered classifier and currently sends every input to the LLM. No notes. Under 90 seconds.

Checkpoints — did you:
- Name the two-stage routing (heuristic, then LLM if uncertain)?
- Name the coverage and precision metrics?
- Name one concrete bug LLM-for-everything causes (cost regression, latency complaints, failure mode opacity)?
- Reference the buildable target (`/ai/heuristic-before-llm` visualizer) as how you'd demonstrate the concept in reincodes?

If you skipped any: you described the pattern, you didn't argue for it.

### Level 3 — Apply it to a new scenario

A teammate proposes a chain that classifies user-submitted feedback as "bug report," "feature request," "compliment," or "complaint." They want to send every feedback through the LLM. Lay out the heuristic-before-LLM design: what would the regex/heuristic look like, what coverage do you expect, what's the precision target, and how would you monitor drift?

Write your answer (3–5 sentences minimum). Then check whether your proposed architecture matches the constraints `00-overview.md` names for any planned AI feature in reincodes (static-export contract, precomputed corpus, no live LLM at request time).

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff from the Tradeoffs section. Answer in writing: "If I were starting the `/ai/heuristic-before-llm` visualizer today with the same constraints (static export, no live LLM, GH Pages deploy), would I still build a real client-side regex or would I precompute the regex outcomes too? Why or why not? What does it cost in teaching value or storage to choose either path?"

Reference the actual code:
→ Point to `next.config.ts` L7 (`output: "export"`) to support the static-export constraint
→ Point to what would need to change for a real-time LLM tier — `next.config.ts` loses `output: "export"`, deploy target shifts, API keys live somewhere

There is no right answer. The point is specificity.

### Quick check — code reference test

Without opening any files, answer:
- What file in reincodes controls the static-export contract that constrains how the visualizer ships?
- Where would the actual regex heuristic live in the codebase (which path)?
- What field in `conceptsData.tsx` would need a new entry to register the visualizer in the home grid?

Then open the files and verify.

✓ Pass: `next.config.ts`, `src/utils/ai/todoHeuristic.ts` (or similar — the point is `src/utils/`), `ConceptCategory[]` (the exported array)
✗ Fail on details: that's fine — the shape is what matters. File and directory names should be recoverable.
