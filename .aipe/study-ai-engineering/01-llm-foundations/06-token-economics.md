# Token economics (input vs output cost, caching, batching)

**Industry name(s):** Token economics, LLM cost modeling, prompt caching, batch API, cost optimization
**Type:** Industry standard

> The cost model of LLM serving — input tokens at one rate, output tokens at 3-5× that rate, prompt cache hits at 10% of input rate, batch API at 50% of standard rate. The math determines what's possible to ship at scale.

**See also:** → [01-what-is-an-llm](01-what-is-an-llm.md) · → [02-tokenization](02-tokenization.md) · → [07-heuristic-before-llm](07-heuristic-before-llm.md) · → [../06-production-serving/](../06-production-serving/)

---

## Why care

### Why care anchored to a frontend primitive

You build a feature with a `fetch()` to your backend that returns a small JSON payload. The per-request cost is your server's compute time, roughly zero on a per-request basis at small scale. At 10k requests/day, you don't think about it; at 1M requests/day, you scale the server. Now swap that `fetch()` for an LLM call. The per-request cost is *not* zero — every call moves real money from your bank account to the provider. At 10k calls/day at $0.01 each, it's $100/day. At 1M calls/day, it's $10k/day. The cost math becomes the architecture: which calls hit the model, which calls get cached, which calls run in batch, and which calls don't happen at all. Token economics is the discipline of making that math survivable.

### Move 2 — Name the question

That math has a name — *token economics*. Specifically: the dollar-per-token rate on input and output tokens, the discounts available via prompt caching and batch APIs, the cost variance by model size and provider, and the cost projection per user as the chain scales. The question is operational: what does each call cost, what levers reduce that cost, and what's the cost-per-active-user metric the business runs on. Without this discipline, LLM features that worked in prototype become unaffordable in production, and teams shipping at scale without it get surprise five-figure cloud bills.

### Move 3 — Why answering that question matters

**Why you need to answer that question at all:** because the cost ledger of LLM serving is the load-bearing constraint on what you can ship. I have shipped a feature in 2024 that worked beautifully through internal testing and produced a 12× cost projection on launch day because nobody had modelled the chain-of-chain compounding (chain A produces output that becomes chain B's input, doubling the input tokens, then chain C is called twice per chain B output). The fix took a week — restructuring to share prefix-cacheable system prompts across the three chains, batching the chain-A calls, and adding a heuristic that filtered chain B's input by 60% before the LLM saw it. The diagnostic took a day because the team had not built a cost-projection spreadsheet before shipping; without it, the launch-day blow-up was unsurvivable. Token economics is the spreadsheet, the dashboard, the per-call decomposition that lets you decide what's affordable before you commit to building it.

### Move 4 — Concrete before/after

Without thinking about token economics:

- "It costs about $0.01 per call" — true for one model, one config, one input length
- No per-call cost logged; spend visible only via the provider dashboard
- Cost projections assume average-case; production hits worst-case
- "We can absorb the cost" turns into "we need to raise prices" by month two
- Chain composition adds tokens nobody noticed; the second chain re-tokenises everything the first chain produced

With token economics:

- Per-call cost decomposed into input vs output, cached vs uncached, model-tier
- Cost-per-user metric tracked alongside DAU/MAU
- Prompt caching enabled where prefixes are static (system prompt, few-shot examples)
- Heuristic-before-LLM filters cheap-to-decide cases out of the expensive path
- Batch API used for offline workloads (re-indexing, eval suites, content generation)
- Chain composition modelled in a spreadsheet before shipping; total chain cost predicted within 20%

### Move 5 — The one-line summary

Token economics is the cost model of LLM serving — input tokens at one rate, output tokens at 3-5× that rate, prompt cache hits at 10% of input rate, batch API at 50% of standard rate — analogous to how database I/O is the cost model of a CRUD application, except the unit is tokens not bytes and the rate card is provider-specific. The full mechanics are below.

---

## How it works

### Move 1 — The mental model

Every LLM call has a cost equal to `(input_tokens × input_price) + (output_tokens × output_price)`. Input tokens are everything you send: system prompt, conversation history, few-shot examples, user message. Output tokens are everything the model emits. The provider's price card sets the rates per million tokens, and the rates differ by model (Sonnet 4 is ~10× cheaper than the original GPT-4; Haiku is ~10× cheaper than Sonnet 4). Three discounts modify the math: prompt caching (~90% off input tokens that match a cached prefix on Anthropic, ~50% on OpenAI), batch API (~50% off all tokens for async/offline workloads), and model routing (cheap model for cheap decisions, expensive model only when needed).

The strategy: model the cost per call decomposed by token type and discount eligibility, project it across scale (calls/day × cost/call), and use the projection to drive architectural decisions about which calls to make, which to cache, and which to skip entirely.

```
The cost equation per call

  cost = (input_tokens × input_rate)
       + (cached_input_tokens × cached_input_rate)   ← 10% of input_rate on Anthropic
       + (output_tokens × output_rate)               ← 5x input_rate typically
       
  + applied across scale:
  total = sum over all calls
  cost_per_user = total / DAU
```

### Move 2 — The layered walkthrough

#### The input/output rate asymmetry

The technical thing: output tokens are 3-5× the cost of input tokens at every major provider. For Claude Sonnet 4 (2026): $3/M input, $15/M output (5:1 ratio). For GPT-5: similar ratio. For Haiku/GPT-5-mini: lower absolute prices, similar ratio. The bridge from a frontend primitive: this is the equivalent of how reading bytes from a CDN is cheap and writing bytes to a database is expensive — the asymmetry reflects the underlying cost of the operation. Output tokens require one forward pass each (autoregressive generation); input tokens are processed in parallel (one forward pass over the full prefix). Concrete consequence: chains that produce long outputs (essays, summaries with elaborate structure, code generation) are dominated by output cost. Chains that consume long inputs and produce short outputs (classification, extraction, RAG with large retrieval context) are dominated by input cost. The cost-optimisation lever differs: long-output chains want shorter outputs (tighter prompts, smaller `max_tokens`); long-input chains want cached prefixes.

```
cost asymmetry visualised — same dollar amount, different token mix

  $3.00 of Sonnet 4 buys you:
  ──────────────────────────
  1,000,000 input tokens      (cheap; one forward pass over the prefix)
  200,000 output tokens       (expensive; one forward pass per generated token)
  
  $3.00 of Haiku buys you:
  ──────────────────────────
  3,750,000 input tokens      ($0.80/M input)
  750,000 output tokens       ($4/M output)
  
  $3.00 of Sonnet 4 cached:
  ──────────────────────────
  10,000,000 cached input     (90% off; one forward pass amortised across calls)
  200,000 output tokens       (still expensive)
```

#### Per-model pricing variance

The technical thing: providers offer model tiers at different price points. Anthropic in 2026: Haiku (cheapest), Sonnet (mid), Opus (most capable, most expensive). OpenAI: gpt-5-nano (cheapest), gpt-5-mini, gpt-5, o-series (reasoning models). Within a provider, the model tiers are roughly an order of magnitude apart in price. Across providers, equivalent-tier models are within 2-3× of each other in price. The bridge from a database primitive: this is the equivalent of OLTP vs OLAP — the cheap model is the high-throughput, low-complexity path; the expensive model is the analytical, capable-but-costly path. Concrete consequence: model routing — sending cheap calls (classification, extraction, structured output, short questions) to a cheap model and expensive calls (long-form generation, multi-step reasoning, complex creative work) to a capable model — is the single largest cost lever after caching. A team that routes 80% of calls to Haiku and 20% to Sonnet 4 pays roughly 30% of what a team routing 100% to Sonnet 4 pays.

#### Prompt caching as the economic lever

The technical thing: providers cache the prefix of an input prompt server-side. The first call with a given prefix pays the full input rate; subsequent calls within a TTL window (Anthropic: 5 minutes by default, configurable; OpenAI: auto-detected, no explicit TTL) hit the cache and pay 10% of the input rate (Anthropic) or 50% (OpenAI). The cache prefix has to be exactly the same across calls — same token IDs, same order. The bridge from frontend: this is the equivalent of HTTP CDN caching with the URL as the cache key — the URL has to match byte-for-byte; the headers can vary. Concrete consequence: prompt structure determines cache eligibility. If the system prompt + few-shot examples + retrieved context comprise 80% of the input tokens, and they're identical across users (or differ only at the end), the cache hit shaves 70% off the input cost on every call after the first. If those constant parts get mixed with per-user data (user ID interpolated mid-prompt, history rendered in non-deterministic order), the cache never hits. Cache-friendly prompt structure is a design choice, not a tuning option.

```
cache-friendly prompt structure

  ┌─────────────────────────────────┐  ← cached prefix
  │ system prompt    (constant)     │
  │ few-shot examples (constant)    │
  │ retrieved docs    (semi-stable) │  ← cached if retrieval is deterministic
  ├─────────────────────────────────┤  ← cache boundary
  │ user message     (varies)       │  ← always uncached, that's fine
  │ history         (varies)        │
  └─────────────────────────────────┘
  
  per-call cost: 10% of (cached prefix tokens × input_rate) + full uncached rate on the rest
```

#### Batch API for offline workloads

The technical thing: providers offer a batch API where the caller submits a batch of requests and receives results within 24 hours. Anthropic's batch API: 50% discount on all tokens. OpenAI's batch API: 50% discount, 24-hour SLA. The bridge from frontend: this is the equivalent of scheduled background jobs vs interactive queries — same operation, looser latency requirement, lower cost. Concrete consequence: any workload that can tolerate 24-hour latency is a candidate. Eval suites running against a golden set: batch. Re-indexing for stale embeddings: batch. Content generation for non-urgent UGC: batch. Real-time chat: not batch. The decision is purely about user-visible latency tolerance; the savings are mechanical.

#### The cost-per-user metric

The technical thing: the operational metric for LLM cost at scale is *cost-per-active-user-per-month*. Total LLM spend divided by DAU or MAU. The bridge from frontend: this is the same metric as cost-per-user infrastructure spending — it answers the unit-economics question. Concrete consequence: this metric should appear on the same dashboard as user growth, retention, and revenue. When it grows faster than revenue, the business is upside down on AI spend; when it shrinks while user count grows, the optimisations are working. Without this metric, the team is flying blind on whether LLM features are economically sustainable. With it, every architectural decision can be tested against the unit economics.

#### The cost curve at 10× scale

The technical thing: at 10× the user count, naive serving produces 10× the cost. Cost-engineered serving produces 3-5× the cost because the levers (prompt caching, model routing, heuristic-before-LLM) compound as volume grows. The bridge from a database primitive: this is the analog of how database costs grow sublinearly with proper indexing and query optimisation, but superlinearly without. Concrete consequence: the time to think about cost optimisation is *before* the user base 10×s, because retrofitting cost optimisation under load is harder than designing for it. Specifically: prompt structure (cache-friendly), model routing (cheap default, expensive escalation), heuristic-before-LLM (filter the predictable cases) are all design decisions, not tuning options. Teams that ship without them and try to add them at 10× pay both the unit cost and the architectural retrofit cost simultaneously.

### Move 3 — The principle

The principle that generalises beyond any one provider: *the cost ledger is the architecture.* Every LLM-powered system at scale converges on the same engineering practice — measure per call, project across scale, optimise the dominant cost. The order of operations is also stable: prompt caching first (largest gain, smallest change), heuristic-before-LLM second (filter the cheap cases out), model routing third (right model for the right job), batch API fourth (anything async), and prompt compression last (if all else has been done). Teams that follow this order pay 2-3× less than teams that don't, and the difference compounds. Cost engineering for LLM systems isn't optimisation theatre; it's the discipline that determines whether the feature can ship at scale.

The full picture is below.

---

## Token economics — diagram

```
┌─ The per-call cost decomposition ────────────────────────────────────┐
│                                                                       │
│   call cost = input_cost + cached_input_cost + output_cost           │
│                                                                       │
│   ┌─────────────────────────────────────────────────────────────┐    │
│   │ INPUT TOKENS                                                │    │
│   │   system prompt (often cacheable)                          │    │
│   │   few-shot examples (often cacheable)                      │    │
│   │   retrieved context (sometimes cacheable)                  │    │
│   │   history (usually not cacheable)                          │    │
│   │   user message (never cacheable)                           │    │
│   │   priced at $X / 1M tokens                                 │    │
│   │   cached prefix priced at 10% × $X (Anthropic)             │    │
│   │                                       50% × $X (OpenAI)    │    │
│   └─────────────────────────────────────────────────────────────┘    │
│                                                                       │
│   ┌─────────────────────────────────────────────────────────────┐    │
│   │ OUTPUT TOKENS                                               │    │
│   │   the model's response                                     │    │
│   │   priced at ~5× input rate                                 │    │
│   │   no cache (each output is unique)                         │    │
│   │   bounded by max_tokens                                    │    │
│   └─────────────────────────────────────────────────────────────┘    │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
                              │
                              ▼   per-call cost summed across volume
┌─ Scale = volume × cost per call ─────────────────────────────────────┐
│                                                                       │
│   daily_cost = calls_per_day × cost_per_call                         │
│   monthly_cost = daily_cost × 30                                     │
│   cost_per_user = monthly_cost / MAU                                 │
│                                                                       │
│   the metric the business runs on                                    │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
                              │
                              ▼   levers, in priority order
┌─ Cost-engineering levers ────────────────────────────────────────────┐
│                                                                       │
│   1. PROMPT CACHING                                                  │
│      Structure prompts so the constant prefix is large and cached   │
│      90% off input on Anthropic, 50% on OpenAI                       │
│                                                                       │
│   2. HEURISTIC-BEFORE-LLM                                            │
│      Cheap classifier filters predictable cases                     │
│      60-90% of calls eliminated entirely                            │
│                                                                       │
│   3. MODEL ROUTING                                                   │
│      Cheap model for cheap decisions, expensive for hard ones       │
│      30-50% cost reduction at the same quality bar                  │
│                                                                       │
│   4. BATCH API                                                       │
│      Any workload tolerating 24h latency                            │
│      50% off all tokens                                              │
│                                                                       │
│   5. PROMPT COMPRESSION                                              │
│      Shorter prompts, smaller max_tokens, RAG over full context     │
│      Diminishing returns; last resort                               │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

The boundary between the upper bands (per-call decomposition, scaled to monthly cost) and the lower band (cost-engineering levers in priority order) is what makes the architecture decision tractable: model the call, project to scale, apply levers in order, measure the result.

---

## In this codebase

**Not yet implemented.** reincodes is a Next.js static-export DSA visualizer with no AI surface in production code — there are zero LLM calls, no token logs, no cost dashboard. The existing study guide (`.aipe/study-ai-engineering/`) positions reincodes as the *interview-prep visualizer host* per the curriculum: a place to *teach* AI concepts through visualizers, not a place where AI runs for users. The buildable target for this concept is below in Project exercises — a `/ai/token-economics` calculator page with sliders for input tokens, output tokens, calls-per-DAU, daily active users, and cache-hit rate, that computes monthly cost across three providers (Anthropic Sonnet 4, OpenAI GPT-5, Anthropic Haiku) with batch API toggle.

**Expected file paths** (when built):
- `src/app/ai/token-economics/page.tsx` — the calculator page
- `src/components/TokenEconomicsCalculator/` — slider components, per-provider rate card, projection charts
- `src/const/provider-pricing.ts` — current per-million-token rates per provider per model (input, cached input, output, batch)

---

## Elaborate

### Where this pattern comes from

The per-token billing model arrived with OpenAI's GPT-3 API in 2020. Before that, NLP serving was either self-hosted (you owned the GPU, the cost was opex on hardware) or API-based with per-request flat fees. GPT-3's per-1k-tokens pricing was the first time the unit economics tied directly to the workload's computational cost. The model has been near-universal since: every major provider prices per token. Prompt caching arrived later — Anthropic launched it in August 2024 (90% discount on cached input); OpenAI's auto-caching arrived in late 2024 (50% discount). The batch API existed earlier but became prominent in 2024-2025 as eval-driven development scaled. The cost-engineering discipline matured in 2024-2026 as production deployments at scale exposed teams to the math.

### The deeper principle

The deeper principle is that *the unit-economics constraint is the load-bearing constraint on what's possible*. Every product decision is gated by whether the unit economics work. A feature that costs $0.10 per use is fine for a $50/month subscription user; the same feature at $0.30 per use is a margin disaster. The cost ledger isn't a side concern; it's a primary engineering constraint, on the same level as latency, reliability, and feature correctness. Teams that don't treat it that way ship features that are technically successful and economically failed. The 2024-2026 maturation of LLM product engineering can be characterised as the field collectively learning to treat token economics as a first-class architectural concern, not a tuning afterthought.

### Where this breaks down

The cost-equation framing breaks down at three edges. First, reasoning models: o-series models and Anthropic's extended thinking emit hidden reasoning tokens that count toward the output budget but aren't visible to the caller. The cost model has to widen: `cost = input + cached_input + (output_tokens + reasoning_tokens) × output_rate`. The reasoning tokens can dwarf the visible output, sometimes 5-10×, which makes naive cost projections badly wrong. Second, vision and audio: multimodal inputs price differently — images at a per-image rate (often equivalent to ~85-1700 tokens depending on resolution), audio at per-second rates. The token model doesn't cover them cleanly. Third, fine-tuning: fine-tuned models bill at different rates than the base model, often with a per-token premium plus a training cost. The economics of fine-tuning are complex and out of scope here; the relevant point is that the token-economics framing covers most production calls but has carve-outs.

### What to explore next

- [01-what-is-an-llm](01-what-is-an-llm.md) → the function shape that produces the cost structure
- [02-tokenization](02-tokenization.md) → the unit you bill in; multilingual asymmetry shows up as cost asymmetry
- [07-heuristic-before-llm](07-heuristic-before-llm.md) → the second-largest cost lever (filtering predictable cases)
- [../06-production-serving/](../06-production-serving/) → batching, caching, and serving infrastructure

---

## Tradeoffs

### Comparison table — both costs in one frame

```
┌──────────────────┬──────────────────────┬─────────────────────────┐
│ Cost dimension   │ Path taken           │ Alternative             │
│                  │ (cost-engineered     │ (naive serving — single │
│                  │  serving + dashboard)│  model, no caching)     │
├──────────────────┼──────────────────────┼─────────────────────────┤
│ Monthly cost     │ ~$3-5k/month at 1M   │ ~$30k/month at 1M       │
│ at 1M calls/day  │ calls/day             │ calls/day               │
│ Engineering time │ ~3-5 days to set up  │ Zero day-1; weeks to    │
│                  │ caching + routing    │ retrofit later          │
│ Architectural    │ Prompt structure     │ "Whatever the docs show │
│ complexity       │ designed for caching │ in their example"       │
│ Observability    │ Per-call cost log,   │ Provider dashboard only │
│ surface          │ cost-per-user metric │                         │
│ Migration cost   │ Cost model survives  │ Switching providers     │
│                  │ provider switches    │ resets the cost model   │
│ Forecasting      │ Reliable at 10× scale│ Linear extrapolation    │
│                  │ projection            │ from current spend      │
│ Onboarding       │ New engineer reads   │ New engineer guesses    │
│                  │ cost dashboard       │ from invoice surprise   │
│ Margin protection│ Levers in place      │ Margin compression as   │
│                  │ before scale         │ scale grows             │
└──────────────────┴──────────────────────┴─────────────────────────┘
```

### What we gave up (when planning the reincodes visualizer)

The first cost is *keeping the rate card current*. Provider pricing changes — Anthropic and OpenAI have both adjusted prices multiple times since 2023. The visualizer's calculator outputs are only useful if the rate card matches current pricing. The rate card lives in `src/const/provider-pricing.ts` and needs manual updates whenever providers change prices. The maintenance burden is roughly quarterly — three or four updates per year — and a clear "last updated" timestamp in the UI is essential to keep the calculator's outputs trustable. Adding an automated "fetch latest pricing" mechanism would require a backend (forbidden by the static-export contract), so the manual-update approach is the only viable architecture.

The second cost is *teaching scope decisions*. The calculator's input dimensions could include many more variables (per-region pricing, image/audio multimodal costs, fine-tuning premiums, model-specific output limits). Capturing all of them makes the UI overwhelming; capturing too few makes the calculator a toy. The chosen scope (input tokens, output tokens, calls/DAU, DAU count, cache-hit rate, batch-on/off, three providers) covers the 80% case for production LLM cost reasoning. Anything beyond that — fine-tuning, multimodal, reasoning models — belongs in dedicated content rather than the main calculator. The visualizer's "advanced mode" toggle could expose the additional variables; the default mode keeps the surface tight.

The third cost is *the calculator's reach as a teaching tool*. A calculator with sliders is interactive but doesn't *narrate* — it shows the math but doesn't explain it. The accompanying text on the page has to walk the reader through "move the cache-hit-rate slider from 0% to 80% and watch what happens" with explicit prompts. Without that prose layer, the calculator becomes a curiosity rather than a teaching artifact. The visualizer's value is in the combination of the interactive calculator and the prose that explains each lever's effect.

### What the alternative would have cost (skipping the visualizer)

If reincodes never builds the `/ai/token-economics` calculator, the cost is *zero* in the codebase. The concept gets taught in this written study guide, in the curriculum's Phase 1 build items (`[B1.2]`: token usage logging table; `[B1.8]`: AI cost & latency panel in loopd's settings), and gets exercised in production at every LLM-serving project in the portfolio. The reincodes site stays pure-DSA.

The cost of *not* building it shows up in the interview-prep surface. Token economics is the concept where a *spreadsheet-shaped artifact* communicates the cost dynamics in a way that prose never does. A reader who has spent 10 minutes moving the calculator's sliders understands the cost levers; a reader who has only read about them doesn't. For interviews that probe "have you thought about LLM cost at scale," the calculator is concrete proof of having modelled the math.

### The breakpoint

The visualizer earns its place during interview rounds where the candidate is asked "how would you think about cost at 100k DAU?" The verbal answer is correct ("prompt caching, model routing, heuristic-before-LLM, batch API"); the visual answer ("I built a calculator — let me show you the projection") is dramatically more credible. The breakpoint is event-shaped: an interview that pushes on the unit-economics conversation hard enough that the verbal answer feels insufficient.

### What wasn't actually a tradeoff

Live pricing fetches from provider APIs were not a real option. Provider rate cards aren't exposed as queryable APIs (they're documentation pages). Even if they were, the static-export constraint forbids fetch-at-request-time. The manual rate card in `src/const/provider-pricing.ts` isn't a downgrade from a live alternative; it's the only architecture compatible with the deploy story. The maintenance burden is the cost of correctness.

---

## Tech reference (industry pairing)

### Anthropic prompt caching

- **Codebase uses:** not yet — the planned `/ai/token-economics` calculator would model Anthropic's caching discount (90% off input tokens on cache hits) as a primary lever. The accompanying prose would walk through the prompt-structure design decisions that enable cache hits.
- **Why it's here:** Anthropic's prompt caching was the first widely-deployed prompt-cache-as-API-feature and remains the most aggressive discount (10× cheaper cached input). The calculator's "cache-hit rate" slider's outsized effect on monthly cost is what makes the prompt-structure argument operational.
- **Leading today:** Anthropic prompt caching — `adoption-leading` for LLM cost engineering, 2026.
- **Why it leads:** 90% discount on cached input is the largest single per-call lever available; 5-minute default TTL is long enough to span typical user sessions; explicit `cache_control` markers in the request let the caller designate which prefix segments are cacheable.
- **Runner-up:** OpenAI prompt caching — `adoption-leading` for OpenAI deployments; ~50% discount; auto-detected (no explicit markers); smaller discount but simpler integration.

### OpenAI batch API

- **Codebase uses:** not yet — the calculator's "batch mode" toggle would model OpenAI's 50% batch discount for any workload tolerating 24-hour latency.
- **Why it's here:** the batch API is the canonical mechanism for offline workload discount across providers. The 50% discount applies to both input and output tokens, making it the second-largest cost lever for batchable workloads.
- **Leading today:** OpenAI batch API — `adoption-leading` for offline LLM workloads, 2026.
- **Why it leads:** the broadest ecosystem support; JSONL-format request files are simple to generate; the 24-hour SLA is reliable; results retrievable via standard API patterns.
- **Runner-up:** Anthropic batch API — `adoption-leading` for Anthropic deployments; identical 50% discount; similar JSONL request format; somewhat lighter ecosystem tooling but functionally equivalent.

### LangSmith / Langfuse (cost observability)

- **Codebase uses:** not yet — irrelevant for the static-export reincodes calculator, which doesn't make real LLM calls. Named here because production LLM cost observability is what turns the calculator's projections into a closed loop with real data.
- **Why it's here:** the calculator demonstrates the *theoretical* cost model; production deployment requires *measured* cost data, which is the observability platform's job. The two tools are complementary — the calculator predicts, the observability platform measures, the gap between them is the modelling error to close.
- **Leading today:** Langfuse — `adoption-leading` for LLM observability and cost tracking, 2026.
- **Why it leads:** self-hostable (important for cost-sensitive teams), per-trace cost decomposition, integration with LangChain and LlamaIndex out of the box, eval-suite integration.
- **Runner-up:** LangSmith — `adoption-leading` for LangChain ecosystem; managed offering; richer eval-suite features; more expensive per trace at scale.

---

## Project exercises

### [B-reincodes-token-economics-viz] Build the token-economics calculator

- **Exercise ID:** `[B-reincodes-token-economics-viz]` — derived from the curriculum's "Interview prep surface — reincodes" entry and Phase 1 concept `[C1.6]` (Token economics).
- **What to build:** a page at `/ai/token-economics` that renders an interactive calculator. Sliders for: average input tokens per call, average output tokens per call, calls per active user per day, daily active users, cache-hit rate (0-95%). Toggle for batch-API on/off. Provider selector for Anthropic Sonnet 4, OpenAI GPT-5, Anthropic Haiku (with rates loaded from `src/const/provider-pricing.ts`). Output: monthly cost in dollars, cost per active user per month, total tokens per month. A breakdown chart shows the cost split across input / cached input / output. A second card shows the "without cost engineering" baseline (no caching, no batch, 100% to the most expensive model) for comparison. Prose alongside the calculator walks the reader through "move the cache-hit slider; watch the cost drop" interactions.
- **Why it earns its place:** the calculator makes the *cost-engineering levers* observable — the reader moves a slider and watches the monthly cost drop by 70%, or moves the DAU slider and watches the cost scale superlinearly without cost engineering. The interview signal is that the candidate built a teaching artifact for the most business-relevant LLM concept.
- **Files to touch:** `src/app/ai/token-economics/page.tsx` (calculator page), `src/components/TokenEconomicsCalculator/` (slider components, breakdown chart, side-by-side cost cards), `src/const/provider-pricing.ts` (per-provider rate card with last-updated timestamp). Add a row to `src/components/Home/conceptsData.tsx`'s category list under a new `ai-engineering` category.
- **Done when:** the page loads at `/reincodes/ai/token-economics/` in production (GitHub Pages), all sliders update the cost output in real time, the provider selector swaps rate cards correctly, the cache-hit slider's outsized effect is visually obvious, mobile layout collapses the cost cards into a scrollable stack, `next build` passes under `output: "export"`. Rate card includes a clear "last updated" timestamp; rate changes require a manual update commit.
- **Estimated effort:** 1-2 days. Rate card + per-provider models: half day. Calculator + sliders + reactive cost output: half day. Breakdown chart + side-by-side comparison: half day. Prose explainer + mobile polish: half day.

---

## Summary

### Part 1 — concept recap

Token economics is the cost model of LLM serving: `cost = input_tokens × input_rate + output_tokens × output_rate`, with output tokens at 3-5× the input rate. Prompt caching discounts cached input by 90% (Anthropic) or 50% (OpenAI). Batch API discounts all tokens by 50% for 24-hour-tolerant workloads. Model routing across tiers (Haiku/mini for cheap calls, Sonnet/GPT-5 for hard calls) cuts cost by 30-50% at the same quality bar. The cost-per-active-user metric is the unit-economics constraint that determines what's possible at scale. In this codebase the concept is *planned* rather than implemented: reincodes has no LLM surface, and the buildable target is a `/ai/token-economics` calculator with sliders for the key variables, a per-provider rate card, and a side-by-side baseline showing what cost engineering saves.

### Part 2 — key points to remember

- **The asymmetry**: output tokens are 3-5× the cost of input tokens. Output-heavy chains optimise for shorter outputs; input-heavy chains optimise for cached prefixes.
- **The lever order**: prompt caching first (largest gain), heuristic-before-LLM second, model routing third, batch API fourth, prompt compression fifth (diminishing returns).
- **The cache-friendly structure**: constant prefix (system + few-shot + retrieved docs) gets cached; variable suffix (user message + history) doesn't. Order matters.
- **The unit-economics metric**: cost-per-active-user-per-month. The number the business runs on. Track it alongside DAU.
- **The reincodes shape**: implementation is Case B; the buildable target is a calculator with sliders for input/output tokens, calls/DAU, DAU, cache-hit rate, batch toggle, and three-provider rate card.

---

## Interview defense

### What an interviewer is really asking

Behind "have you thought about LLM cost?" the interviewer is checking whether the candidate has shipped a feature whose cost projection was wrong and felt the consequence. A junior answer says "yes, we monitor it on the provider dashboard." A senior answer names the per-call decomposition, names the levers in priority order, names the cost-per-user metric, and names a specific case where they re-engineered a chain because the launch projection was unaffordable. The interviewer is checking for the operational framing because LLM cost engineering is the most business-relevant skill in the field — features that can't ship economically don't ship at all.

### Likely questions

**Q (mid):** Why are output tokens more expensive than input tokens?

A: The model runs one forward pass per output token (autoregressive generation) and one forward pass over the entire input prefix (parallel attention). Generating 1000 output tokens requires 1000 forward passes; processing 1000 input tokens requires one forward pass amortised over the prefix. The cost asymmetry reflects this: output requires more compute per token, so providers price it ~5× higher. The practical consequence: long-output chains are dominated by output cost (you reduce cost by shortening the output via tighter prompts, smaller `max_tokens`, or more focused tasks); long-input chains are dominated by input cost (you reduce cost by caching the prefix or filtering the context with retrieval/heuristics before the LLM sees it).

```
input pricing                       output pricing
─────────────────                  ─────────────────
$3 / 1M tokens (Sonnet 4)           $15 / 1M tokens (Sonnet 4)
one forward pass per call           one forward pass per token
parallel attention                  autoregressive generation
optimise by caching prefix          optimise by shortening output
```

**Q (senior):** A chain costs $0.01 per call at current scale. The product team wants to know what the cost looks like at 10× scale. Walk me through the projection.

A: Three things matter. First, the per-call cost decomposition: of the $0.01, how much is input, cached input, and output? At 10× scale, if the input is cacheable and the cache hit rate goes up (more users hitting the same prefixes), the per-call cost actually *drops* because the cache amortises better. If the input is per-user (history, retrieved per-user context) and doesn't benefit from caching, the per-call cost stays flat. Second, the volume itself: 10× calls is 10× cost at flat per-call rate, $30k/month if currently $3k. Third, the levers: have we maxed out caching, heuristic-before-LLM, model routing, and batch API at current scale? If not, 10× scale is the right moment to apply them — the savings compound at scale. The realistic projection at 10× is usually 3-5× cost (not 10×) if cost engineering is applied; the projection at 10× without cost engineering is 10× or worse (because chain-of-chain compounding shows up as scale grows). The right answer in the interview is to model the breakdown, not to give a single number.

```
naive 10x projection                cost-engineered 10x projection
────────────────────                ─────────────────────────────
$3k/month → $30k/month               $3k/month → $9-15k/month
linear in volume                     sublinear: cache hit rate grows
no architectural change              prompt caching maxed, heuristic
                                     filters 70%, model routing for
                                     20% of calls, batch for 30% of
                                     the chain volume
```

**Q (arch):** At 10× the chain complexity — a feature with five sub-chains each calling the LLM — how does the cost model compose?

A: Two things change at five sub-chains. First, the cost decomposition becomes per-chain: each chain has its own input/output profile, its own cache eligibility, its own model-routing decision. The cost projection is the sum across all five chains, not a single number. Second, chain composition compounds the cost: chain A's output becomes chain B's input, which is paid as input cost to chain B. If chain A produces 500 tokens of output (cost $0.0075 at Sonnet 4 output rate), those 500 tokens become chain B's input (cost $0.0015 at Sonnet 4 input rate), and so on through the chain graph. The senior move is modelling the chain graph in a spreadsheet: rows are chains, columns are (avg input tokens, avg output tokens, cache eligibility, model tier, calls per user request); the spreadsheet sums to a per-user-request cost. The model-routing decision per chain is then explicit (chain A is a classifier → Haiku; chain B is the generation step → Sonnet; chain C is a verifier → Haiku again). Without this model, "cost optimization" is vibes; with it, the optimisations are testable changes against a baseline.

```
single chain at scale              5-chain ecosystem at scale
─────────────────────              ───────────────────────────
cost = calls × per-call             cost = sum over chains of:
                                    chain_calls × per-chain-call
                                    + chain composition overhead
                                    (intermediate outputs as inputs)
single optimisation surface         per-chain decisions:
                                    - model tier
                                    - cache prefix
                                    - heuristic filter
                                    - batch eligibility
```

### The question candidates always dodge

**Q:** Isn't LLM cost just going to keep dropping? Why optimise now when GPT-7 will be free?

A: Provider pricing has dropped over time — GPT-4 in 2023 was ~30× more expensive than equivalent models in 2026 — but the cost-engineering levers are not made redundant by lower base prices. Three reasons. First, demand grows faster than price drops: as models get cheaper, products use them for more things, and total spend grows even as per-token cost drops. The 2024 pattern was teams whose total LLM spend grew 5× year-over-year even though per-call cost dropped 3×. Second, the *competitive* cost is what matters: if competitors are running at $0.001 per call and you're running at $0.005, the difference is your margin or your pricing power. Cost engineering is a competitive advantage at any absolute price level. Third, the architectural shifts (cache-friendly prompts, heuristic-before-LLM, model routing) are not "do they save money this quarter" — they're "do they keep the feature shippable at 10× scale." That question doesn't depend on absolute price.

```
"cost will drop, don't optimise"      reality
──────────────────────────────       ─────────────────────────
+ correct at the per-token level       per-token drops 30%/year
- ignores demand growth                product use grows faster
- ignores competitive cost              competitors optimise too
- ignores scale-driven failures         architectural retrofit is
                                         more expensive than design
```

The honest answer: "the prices will drop and the workloads will grow faster; the cost-engineering work isn't optimization theatre, it's the architecture that survives 10× scale." The candidate who waits for prices to drop is the candidate whose feature gets shut down for being unprofitable in the meantime.

### One-line anchors

- "The cost ledger is the architecture. Model per call, project across scale, apply levers in priority order."
- "Output tokens are 3-5× input. Long-output chains optimise for shorter outputs; long-input chains optimise for cached prefixes."
- "Lever priority: prompt caching, heuristic-before-LLM, model routing, batch API, prompt compression."
- "Cost-per-active-user-per-month is the unit-economics metric. Track it alongside DAU."
- "Provider prices drop; demand grows faster. Cost engineering is competitive, not optional."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw the cost equation from memory: input × rate + cached input × discounted rate + output × output rate. Draw the lever priority order (cache, heuristic, routing, batch, compression). Label which lever produces the largest single-call gain.

✓ Pass: equation correct, levers in priority order, prompt caching identified as largest gain
✗ Fail: re-read the primary diagram, wait 10 minutes, try again.

### Level 2 — Explain it out loud

Explain token economics to a product manager who knows the LLM features cost money but doesn't know how the bill is computed. No notes. Under 90 seconds.

Checkpoints — did you:
- Name the input/output rate asymmetry?
- Name at least three cost-engineering levers in priority order?
- Reference cost-per-active-user as the unit-economics metric?
- Reference the buildable target (`/ai/token-economics` calculator) as how you'd demonstrate the concept in reincodes?

If you skipped any: you described the cost equation, you didn't tell the PM what to optimise.

### Level 3 — Apply it to a new scenario

A teammate proposes a chat feature where every user message triggers two LLM calls: one to classify intent, one to generate a response. Cost projection at 1M messages/day: ~$20k/month at Sonnet 4 across both calls. Lay out the cost-engineering plan: which calls should be cached, which should route to a cheaper model, which should be filtered by a heuristic, and what does the projection look like after applying all levers?

Write your answer (3–5 sentences minimum). Then check whether your proposed architecture matches the constraints `00-overview.md` names for any planned AI feature in reincodes (static-export contract, precomputed corpus, no live LLM at request time).

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff from the Tradeoffs section. Answer in writing: "If I were starting the `/ai/token-economics` calculator today with the same constraints (static export, no live LLM, GH Pages deploy), would I still keep the rate card as a manual-update constant? Why or why not? If I'd change it, what would I do instead — fetch from a public pricing API? Embed a 'last verified' date in the UI? — and what would that cost?"

Reference the actual code:
→ Point to `next.config.ts` L7 (`output: "export"`) to support the static-export constraint
→ Point to what would need to change for live pricing — `next.config.ts` loses `output: "export"`, deploy target shifts, a backend fetches pricing nightly

There is no right answer. The point is specificity.

### Quick check — code reference test

Without opening any files, answer:
- What file in reincodes controls the static-export contract that constrains how the calculator ships?
- What file would hold the per-provider rate card constant?
- What field in `conceptsData.tsx` would need a new entry to register the calculator in the home grid?

Then open the files and verify.

✓ Pass: `next.config.ts`, `src/const/provider-pricing.ts`, `ConceptCategory[]` (the exported array)
✗ Fail on details: that's fine — the shape is what matters. File and constant names should be recoverable.
