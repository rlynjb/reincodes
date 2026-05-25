# LLM cost optimization

**Industry name(s):** Model-tier routing, prompt compression, batch API, cost-tier cascading
**Type:** Industry standard

> Once caching is in place, the next layers are model-tier routing (Haiku for easy, Sonnet for hard), prompt compression (summarization, retrieval-as-compression), and the batch API for offline workloads (50% discount). Each addresses a different cost vector.

**See also:** → [01-llm-caching](01-llm-caching.md) · → [../01-llm-foundations/06-token-economics](../01-llm-foundations/06-token-economics.md) · → [../01-llm-foundations/07-heuristic-before-llm](../01-llm-foundations/07-heuristic-before-llm.md)

---

## Why care

### Move 1 — The grounded scenario

Your chain runs at 100K calls/day. Caching brought cost from $1,400/day to $900/day. The CFO asks for another 50% cut. You look at the chain and notice 60% of requests are simple ("what's my balance?"), 30% are medium, 10% are complex multi-step questions. You're sending all 100K through Sonnet 4 because some need it. That's the next knob.

### Move 2 — Name the question

The question is *which calls need which model*. Routing cheap requests to cheap models (Haiku at 1/5 the price), reserving expensive models for the hard cases, compressing context where verbose docs add no value, and batching offline workloads for the 50% batch-API discount. These are independent levers; each addresses a different fraction of the bill.

### Move 3 — Why answering that question matters

**Why you need to answer that question at all:** the cost curve isn't flat per call. A "tag this todo" classification costs $0.0002 on Haiku and $0.003 on Sonnet — a 15x ratio for the *same correct output* on the easy cases. Senior LLM application engineering is recognizing that "the best model for everything" is the wrong default; "the cheapest model that's good enough for this case" is the right one. The teams ignoring this are paying 5-10x more than the teams routing.

### Move 4 — Concrete before/after

Without cost optimization (all Sonnet):
- 100K calls × $0.0275 = $2,750/day = ~$1M/year

With routing (60% Haiku, 30% Sonnet, 10% Opus):
- 60K × $0.005 + 30K × $0.0275 + 10K × $0.13 = $300 + $825 + $1,300 = $2,425/day → ~$885K/year

Add batch API for the 30% async workload:
- Shift 30K Sonnet calls to batch (50% off): saves $410/day → ~$735K/year

Total reduction: ~26% on top of caching. Same correctness on the routed cases (verify via eval set).

### Move 5 — The one-line summary

Cost optimization is `useMemo` for LLM calls — pick the cheapest computation that returns the right answer, and only reach for the expensive one when the cheap one provably fails. Mechanics below.

---

## How it works

### Move 1 — The mental model

A production LLM chain has a cost-tier hierarchy: heuristic (free) → smallest LLM ($) → medium LLM ($$) → largest LLM ($$$). The senior move is routing each request to the lowest tier that returns the right answer.

```
cost-tier cascade

request ──► heuristic gate ──► answer found?
                │
                ▼ no
            Haiku ($) ──► confidence high?
                │
                ▼ no
            Sonnet ($$) ──► confidence high?
                │
                ▼ no
            Opus ($$$) ──► final answer

each tier 5-25x more expensive than the one above.
```

### Move 2 — The layered walkthrough

#### Model-tier routing

The technical thing: classify the difficulty of the incoming request, route to the cheapest model that handles that class reliably. Routing logic can be rule-based (keyword match, request length), heuristic (small classifier model), or learned (eval-set-driven). The bridge from frontend: this is the same shape as a CDN's tiered caching — serve from edge first, fall back to origin only when needed. Concrete consequence: a chain that routes 60% of traffic to Haiku at 1/5 the cost saves ~50% of the bill, while correctness on hard cases stays Sonnet-quality. Concrete condition where it breaks: misclassified hard cases routed to Haiku produce wrong answers; the routing classifier itself becomes an eval target.

```
routing decision shape

input ──► classifier (Haiku, fast) ──► difficulty: "easy" | "medium" | "hard"
                                            │
                                            ▼
              easy ──► Haiku            (response)
              medium ──► Sonnet
              hard ──► Opus
```

#### Prompt compression

The technical thing: shrink the input tokens without losing the information the model needs. Summarize earlier conversation turns; retrieve only the top-3 most-relevant docs instead of top-20; drop few-shot examples on calls where they don't help. The bridge from frontend: this is bundle splitting — ship only what's needed for this route, not the whole app. Concrete consequence: cutting input from 5K to 1.5K tokens saves ~70% of input cost on that call. Concrete condition where it breaks: over-compression starves the model of context it needed; calibrate against an eval set per chain.

#### Batch API (50% discount, async workloads)

The technical thing: provider batch APIs offer 50% off in exchange for a 24-hour SLA. Used for offline workloads (overnight eval runs, bulk classification, content moderation queues). The bridge from frontend: this is a build-time vs request-time split — work that doesn't need to be live can move to a cheaper async path. Concrete consequence: any workload that runs daily/weekly batches naturally fits; any interactive feature does not. Concrete condition where it breaks: trying to batch interactive workloads (user is waiting) breaks the UX.

### Move 3 — The principle

The principle: *the cheapest call is the one that returns the right answer*. This is the LLM-shaped version of "don't optimize the slow query you haven't measured" — except here you're optimizing the expensive call you *did* measure (via eval set) and proven the cheaper alternative works on.

Full picture below.

---

## Cost optimization — diagram

```
┌─ Cost layer cascade ──────────────────────────────────────────────┐
│                                                                   │
│   request                                                         │
│      │                                                            │
│      ├─► [free]  heuristic classifier                             │
│      │           ↓ "is this even an LLM problem?"                 │
│      │       routes to:                                           │
│      │       - rule-based answer (free)                           │
│      │       - cache hit (~$0)                                    │
│      │                                                            │
│      ├─► [$]    Haiku / nano (60% of traffic)                     │
│      │          easy classifications, simple extractions          │
│      │                                                            │
│      ├─► [$$]   Sonnet / GPT-5 (30%)                              │
│      │          medium complexity, multi-step reasoning           │
│      │                                                            │
│      └─► [$$$]  Opus / GPT-5 Pro (10%)                            │
│                 hard cases, agentic loops, code generation        │
│                                                                   │
│   orthogonal optimizations:                                       │
│      - prompt caching (90% input off, see 01-llm-caching)         │
│      - prompt compression (smaller inputs)                        │
│      - batch API (50% off for async workloads)                    │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**Not yet implemented.** reincodes has no LLM calls. The buildable target is below — a `/ai/cost-optimization` visualizer that renders 100 precomputed requests routed through the cost-tier cascade, with toggles for routing on/off and batch-API on/off, showing total cost across modes.

**Expected file paths:**
- `src/app/ai/cost-optimization/page.tsx`
- `src/components/CostOptimizationVisualizer/`
- `public/ai/cost-optimization/scenarios.json`

---

## Elaborate

### Where this pattern comes from

Cost-tier cascading is older than LLMs (CDN edge-vs-origin caching, GPU-vs-CPU offloading). The LLM-specific shape arrived when Anthropic shipped Haiku at ~5x cheaper than Sonnet (2024), making the cost gradient large enough that routing earned its place. Before that, model tiers were too close in price for routing to matter.

### The deeper principle

*Cost optimization is profile-driven, not theory-driven.* The right tier for a call depends on what the call actually needs, which depends on the chain's eval set, which depends on the chain's actual traffic. Skip the eval and you're guessing.

### Where this breaks down

Routing breaks when classification is itself the hard problem — if you can't tell which requests are easy, you can't route them. For those chains, send everything through one tier and accept the cost.

### What to explore next

- [01-llm-caching](01-llm-caching.md) — the first cost layer
- [../01-llm-foundations/07-heuristic-before-llm](../01-llm-foundations/07-heuristic-before-llm.md) — the free tier above all LLMs
- [../05-evals-and-observability/01-eval-set-types](../05-evals-and-observability/01-eval-set-types.md) — proves the cheap tier is good enough

---

## Tradeoffs

### Comparison table

```
┌──────────────────┬───────────────────┬─────────────────────────┐
│ Cost dimension   │ With routing      │ Single-tier (all big)   │
├──────────────────┼───────────────────┼─────────────────────────┤
│ Cost per call    │ 0.2-1.0x of big   │ 1.0x                    │
│ Complexity       │ Classifier + 3    │ One code path           │
│                  │ code paths        │                         │
│ Eval surface     │ Each tier needs   │ One eval set            │
│                  │ its own coverage  │                         │
│ Latency          │ +20-50ms (route)  │ Baseline                │
│ Failure mode     │ Misclassified     │ Same response on all    │
│                  │ hard → wrong      │                         │
│ Hire-ability     │ Pattern is well-  │ Trivial to onboard      │
│                  │ known             │                         │
└──────────────────┴───────────────────┴─────────────────────────┘
```

### What we gave up

Three code paths instead of one. An extra ~20-50ms latency for the routing classifier. Eval coverage per tier (a chain that routes to Haiku for easy cases needs an eval set proving Haiku handles those cases — that's a third eval set on top of the per-tier ones).

### What the alternative would have cost

Single-tier costs 5-10x more at scale. For a 100K/day chain, ~$1M vs ~$200K annually.

### The breakpoint

Routing earns its place at ~$500/day total LLM cost OR when the chain serves enough requests that the cost gradient is visible in monthly bills. Below that, complexity exceeds savings.

---

## Tech reference (industry pairing)

### Anthropic Haiku + Sonnet + Opus tiering

- **Codebase uses:** not yet — visualizer would route across Haiku 4 / Sonnet 4 / Opus 4 based on classified difficulty.
- **Why it's here:** Anthropic's tier ratio (~5x between Haiku and Sonnet, ~5x between Sonnet and Opus) makes routing economically meaningful.
- **Leading today:** Anthropic model tier family — `adoption-leading` for cost-tier routing, 2026.
- **Why it leads:** the price gradient is wide enough to matter; quality at each tier is high enough that the routing decisions feel safe.
- **Runner-up:** OpenAI gpt-5 / gpt-5-mini / gpt-5-nano — `adoption-leading` deployment-share alternative.

### Batch API (Anthropic Message Batches, OpenAI Batch API)

- **Codebase uses:** not yet — for any async workload (eval runs, bulk processing).
- **Why it's here:** 50% off in exchange for 24h SLA is the cleanest single discount in the LLM market.
- **Leading today:** Anthropic Message Batches — `adoption-leading` for batch processing, 2026.
- **Why it leads:** simple async submission, results delivered via signed URL, no orchestration overhead.
- **Runner-up:** OpenAI Batch API — equivalent feature, equivalent discount.

### Heuristic classifier (regex, keyword)

- **Codebase uses:** not yet — the visualizer's routing layer would start with a heuristic before calling Haiku.
- **Why it's here:** the cheapest tier is no LLM at all; regex + keyword wins for ~30-50% of routing decisions on most chains.
- **Leading today:** plain JavaScript regex — `adoption-leading`, always.
- **Why it leads:** zero latency, zero cost, deterministic.
- **Runner-up:** lightweight model (logistic regression on embeddings) — `innovation-leading` for cases where regex is too brittle.

---

## Project exercises

### [B-reincodes-cost-optimization-viz] Build the cost-optimization visualizer

- **Exercise ID:** `[B-reincodes-cost-optimization-viz]`
- **What to build:** a page at `/ai/cost-optimization` that renders 100 precomputed requests routed through the cost-tier cascade. Toggles: routing on/off, batch API on/off. A cost bar updates as the user steps through the stream.
- **Why it earns its place:** demonstrates the cost-tier gradient *visually* — flat-line cost with all-Sonnet, stepped-down cost with routing.
- **Files to touch:** `src/app/ai/cost-optimization/page.tsx`, `src/components/CostOptimizationVisualizer/`, `public/ai/cost-optimization/scenarios.json`. Register in `conceptsData.tsx`.
- **Done when:** page loads, routing toggle works, cost bar updates per mode, batch toggle saves the expected 50% on async-flagged requests.
- **Estimated effort:** 1–2 days.

---

## Summary

### Part 1 — concept recap

Cost optimization after caching is a stack: model-tier routing (Haiku for easy, Sonnet for hard, Opus for hardest) cuts the bill ~50% on traffic with mixed difficulty; prompt compression (summarize, retrieve top-3 not top-20) saves another 30-70% per call where context is over-supplied; batch API (50% off, 24h SLA) cuts async-workload costs in half. In reincodes Case B; the buildable target is a `/ai/cost-optimization` visualizer demonstrating the cascade against precomputed scenarios. The constraint is that each tier needs its own eval coverage — routing decisions are eval-driven, not vibe-driven.

### Part 2 — key points to remember

- **Routing**: cheapest tier that's good enough. 5-25x cost gradient per tier.
- **Compression**: cut input tokens without starving context. Eval-driven calibration.
- **Batch**: 50% off in exchange for 24h SLA. Async workloads only.
- **Order**: caching first, then routing, then compression, then batch.
- **Eval cost**: per-tier eval sets are mandatory; misclassified hard cases are wrong answers.
- **Breakpoint**: ~$500/day total LLM cost. Below that, complexity exceeds savings.

---

## Interview defense

### What an interviewer is really asking

"How do you cut LLM costs without quality loss?" — testing whether you treat cost as a routing problem (mature) or a model-swap problem (junior). Senior answer leads with caching + routing.

### Likely questions

**Q (mid):** What's the cheapest way to cut LLM cost in half?

A: Caching first (90% off input on cache hits, $0 setup if your prefix is static). Then model-tier routing (Haiku at 1/5 the price for easy cases). Combined, those typically take 60-70% off the bill before you touch the prompt itself.

```
cost-cut order

caching        ──► -50% to -80%
routing        ──► -30% to -50% (on top of caching)
compression    ──► -20% to -40% (per call where applies)
batch          ──► -50% on async workloads (orthogonal)
```

**Q (senior):** When do you NOT route?

A: When classification is the hard problem. If you can't tell which requests are easy without solving the same problem the chain itself solves, the routing classifier becomes equivalent in cost to running the chain twice. For those chains, single-tier with caching is the right answer — accept the higher per-call cost and optimize via cache hit rate instead.

```
when routing fails

classification cost ≥ chain cost
   → routing doesn't earn its place
   → single tier + caching wins

example: legal contract analysis
   - "is this contract easy or hard?" is itself a contract analysis
   - send everything through Opus + cache aggressively
```

**Q (arch):** At 10x scale, which optimization becomes most important?

A: Cache hit rate. At 1M+ calls/day, every 1% bump in hit rate is worth ~$1K/month at typical pricing. Routing matters but plateaus once you've split traffic by tier; cache hit rate has no plateau until you reach the structural ceiling of your prompt stability. Operational focus shifts from "are we routing?" to "is our cache hit rate at 95%+ and why aren't we at 98%?"

```
optimization importance by scale

scale ──►       100/day    10K/day    1M/day
caching         skip       80% off    98%+ hit rate target
routing         skip       50% off    plateau at ~50%
compression     skip       per-chain  per-chain
batch           skip       async      load-bearing for batch jobs
```

### The question candidates always dodge

**Q:** Why not just use the cheapest model for everything?

A: Because cheapest models fail on hard cases in ways that compound downstream. A misclassification at the cheap tier doesn't just produce one wrong answer — it routes the user down a wrong path. The honest answer: cheapest-for-everything works in demos and breaks in production the first time a hard case lands. The senior move is routing *to* the cheap model when it's verifiably good enough, not defaulting *from* it.

```
cheapest-for-everything vs routing

ALL HAIKU                       ROUTED
hard case → wrong answer        hard case → routed to Sonnet → right
60% easy: cheap ✓               60% easy: cheap ✓
30% medium: questionable        30% medium: Sonnet ✓
10% hard: WRONG                 10% hard: Opus ✓ (rare, expensive)

result: bug count ≫ cost saved
```

### One-line anchors

- "Cheapest call that returns the right answer."
- "Caching first, routing second, compression third, batch fourth."
- "Per-tier eval coverage is mandatory; routing without evals is guessing."
- "Routing breakpoint: $500/day total bill OR mixed-difficulty traffic."
- "Cheapest-for-everything wins demos and loses production the first time a hard case lands."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Draw the cost-tier cascade from memory. Label each tier with its approximate cost relative to Sonnet.

### Level 2 — Explain it out loud
Explain cost optimization to a colleague whose chain is on track to cost $10K/month. Under 90 seconds.

### Level 3 — Apply it
Design a routing strategy for a customer-support chain: 70% FAQ-shaped, 25% account-action, 5% complaint. What tier per intent? Write your answer.

### Level 4 — Defend
Pick the biggest tradeoff. Would you build the visualizer with 3 tiers or 5? What does each add?

### Quick check
- What file controls static-export contract?
- Where does the visualizer register in the home grid?
- What JSON file carries the precomputed routing scenarios?
