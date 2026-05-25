# LLM observability

**Industry name(s):** LLM tracing, prompt logging, AI observability, evals-as-monitoring
**Type:** Industry standard

> Per-call logging (prompt, response, tokens, latency, cost), trace IDs for chain-of-chains, cost dashboards, the eval set's role in observability (production failures become regression cases). Langfuse / Helicone / Phoenix are the canonical tools.

**See also:** → [01-eval-set-types](01-eval-set-types.md) · → [../06-production-serving/01-llm-caching](../06-production-serving/01-llm-caching.md) · → [../06-production-serving/05-retry-and-circuit-breaker](../06-production-serving/05-retry-and-circuit-breaker.md)

---

## Why care

### Move 1 — The grounded scenario

Your chain runs fine for three weeks. A user reports that the chain returned a wrong answer for their query. You go to debug. The prompt is in your code, but the *exact prompt sent* depends on retrieved context, conversation history, user-specific data. You can't reproduce the call from the user's report alone. You have no log of what the model saw, what it returned, or even which model version handled the call. The debugging session goes nowhere.

### Move 2 — Name the question

The question is *how do you know what your LLM-backed feature is actually doing in production*. Code observability (logs, metrics, traces) is decades old. LLM observability is the same shape applied to LLM calls: log the full prompt + response + cost + latency + model version per call; trace IDs span the chain-of-chains; dashboards surface cost spikes, error rates, eval-score drift. Without it, every production issue is unsolvable.

### Move 3 — Why answering that question matters

**Why you need to answer that question at all:** because LLM features fail in ways code features don't. A code bug fails deterministically — same input, same wrong output, every time. An LLM "bug" can manifest as 2% of calls returning wrong, the rest fine — debugging that requires seeing the calls, the prompts, the responses, the costs. The teams shipping reliable LLM features have observability infrastructure from day one; the teams without it discover problems three weeks late from customer reports they can't reproduce.

### Move 4 — Concrete before/after

Without LLM observability:

- User reports wrong answer at 2pm
- Engineer can't reproduce — doesn't know what exact prompt the user got
- 6 hours of guessing; close ticket "couldn't reproduce"
- Same issue surfaces 5 more times over the next week
- Eventually rediscovered via eval set; root cause: stale embedding

With LLM observability:

- User reports wrong answer at 2pm
- Engineer queries traces by user_id + timestamp
- Full prompt + response + retrieval context + model version visible
- Root cause identified in 20 minutes: retrieval returned a stale doc
- Case added to regression eval set; fix shipped same day

### Move 5 — The one-line summary

LLM observability is `console.log` + tracing for prompts — every call captured with its inputs, outputs, costs, and metadata, so debugging is "open the trace" instead of "rebuild from memory." Mechanics below.

---

## How it works

### Move 1 — The mental model

Per-call logging plus trace IDs that span chained calls. Each LLM call captures: prompt (system + user), response, tokens (input + output + cache hits), latency, cost, model + version, retrieval context (if RAG), tool calls (if agent). Trace IDs link the calls in a chain so multi-step flows are reconstructable.

```
trace shape

trace_id: abc123 (user request)
  │
  ├─ span: intent_classifier
  │    model: claude-haiku-4
  │    input_tokens: 200
  │    output_tokens: 30
  │    latency: 180ms
  │    cost: $0.00006
  │    
  ├─ span: retrieve (RAG)
  │    embedding_model: text-embedding-3-large
  │    top_k: 5
  │    retrieved_doc_ids: [d1, d4, d12]
  │    latency: 90ms
  │
  ├─ span: generate
  │    model: claude-sonnet-4
  │    input_tokens: 3500 (cache_read: 2000)
  │    output_tokens: 450
  │    latency: 2.1s
  │    cost: $0.012
  │
  └─ total: 2.5s, $0.012, 3 spans
```

### Move 2 — The layered walkthrough

#### Per-call logging

The technical thing: for every LLM call, capture and store: full prompt, full response, model + version, tokens (input/output/cache), latency, cost, error info if any. The bridge from frontend: this is the network tab — but for LLM calls. Concrete consequence: when a user reports an issue, the engineer can reconstruct exactly what the model saw and produced. Concrete condition where it breaks: PII in prompts requires redaction before logging; the redactor itself becomes a critical path that has to be eval'd.

#### Trace IDs (chain-of-chains)

The technical thing: every user request gets a trace_id; every LLM call in that request gets a span_id; spans link to the parent trace. The bridge: this is OpenTelemetry / distributed tracing, applied to LLM calls. Concrete consequence: multi-step flows (classifier → retriever → generator) are visible as a tree; you see which step's latency dominated, which step's cost dominated, which step failed. Concrete condition where it works: when the tracing library is wired through every chain; breaks when one chain forgets to propagate the trace_id and creates an orphan span.

#### Cost dashboards (per-feature, per-tenant, per-model)

The technical thing: aggregate per-call costs into dashboards segmented by feature, by user/tenant, by model, by time. The bridge: this is the same shape as web app cost dashboards (CDN bandwidth, storage costs). Concrete consequence: spot cost spikes (a chain doubled in cost overnight = a prompt edit broke caching; a user 10x'd in cost = an agent loop went infinite); track cost-per-user as a key product metric.

```
cost dashboard shape

per-feature:
  classifier:  $12/day (-3%)
  retrieval:   $8/day (+1%)
  generation:  $45/day (+25%)  ← alert
                
per-user (top spenders):
  user_487:  $2.50/day  (normal)
  user_902:  $48/day    ← agent loop?
  user_113:  $1.20/day  (normal)

per-model:
  haiku:   62% of calls, 18% of cost
  sonnet:  35% of calls, 71% of cost
  opus:    3% of calls, 11% of cost
```

#### Eval-set integration (production failures → regression cases)

The technical thing: when a user reports a bad response (thumbs-down, support ticket), the trace gets pulled and the (input, expected) pair gets added to the regression eval set. Future prompt iterations are tested against this expanded set. The bridge: this is bug-tracker-to-test-case automation. Concrete consequence: the eval set grows monotonically; every production failure becomes a future regression case. Concrete condition where it works: the feedback loop between user reports and eval set is fast (minutes-to-hours); breaks when the loop is days-to-weeks (failures accumulate uncaptured).

### Move 3 — The principle

The principle: *what you can't observe, you can't debug*. Code observability arrived a decade ago; LLM observability is catching up. The teams shipping reliable LLM features treat observability as a launch requirement, not a nice-to-have.

Full picture below.

---

## LLM observability — diagram

```
┌─ Application code ────────────────────────────────────────────────┐
│                                                                   │
│   user request ──► chain handler                                  │
│                       │                                           │
│                       ▼                                           │
│                  generate trace_id                                │
│                       │                                           │
│         ┌─────────────┼─────────────┐                             │
│         ▼             ▼             ▼                             │
│      classifier   retriever   generator                           │
│      (span 1)     (span 2)    (span 3)                            │
│         │             │             │                             │
│         └─────────────┴─────────────┘                             │
│                       │                                           │
│                       ▼                                           │
│              observability SDK                                    │
│              (Langfuse / Helicone / Phoenix)                      │
│                       │                                           │
└───────────────────────┼───────────────────────────────────────────┘
                        │
                        ▼  async write
┌─ Observability backend ───────────────────────────────────────────┐
│                                                                   │
│   trace storage (ClickHouse / Postgres)                           │
│       │                                                           │
│       ├─► UI: trace search, replay, diff                          │
│       ├─► cost dashboards (per-feature / user / model)            │
│       ├─► alerts (cost spike, error rate, eval-score drift)       │
│       └─► export: production failures → eval set                  │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

The async write keeps observability out of the request critical path.

---

## In this codebase

**Not yet implemented.** No LLM calls means no traces, no observability. The buildable target is below — a `/ai/llm-observability` visualizer that renders a precomputed trace of a 3-chain pipeline; each span expandable to show full prompt + response + cost; an aggregate view shows cost-per-chain over a simulated 7-day window.

**Expected file paths:**
- `src/app/ai/llm-observability/page.tsx`
- `src/components/ObservabilityVisualizer/`
- `public/ai/llm-observability/traces.json`

---

## Elaborate

### Where this pattern comes from

LLM observability tools emerged 2023-2024 (Langfuse, Helicone, Phoenix, LangSmith). Before that, teams rolled their own logging or relied on provider-side dashboards (rate limits, total cost, but not per-call detail). The shift to dedicated tools tracked the shift from "demo LLM features" to "production LLM features that need debugging support."

### The deeper principle

*Observability is the price of distributed-systems complexity, and LLM-backed apps are distributed systems.* The discipline transfers directly from the web/cloud world.

### Where this breaks down

Observability breaks down when logging volume exceeds storage budget. At 10M+ calls/day, full-prompt logging gets expensive — sample (10% full logs, 100% structured fields) or move to cheaper cold storage for full prompts.

### What to explore next

- [01-eval-set-types](01-eval-set-types.md) — the feedback loop from observability to evals
- [../06-production-serving/01-llm-caching](../06-production-serving/01-llm-caching.md) — `cache_read_input_tokens` is a key observability metric
- Langfuse / Helicone / Phoenix docs

---

## Tradeoffs

### Comparison table

```
┌──────────────────┬───────────────────┬─────────────────────────┐
│ Cost dimension   │ Full observability│ No observability        │
├──────────────────┼───────────────────┼─────────────────────────┤
│ Setup effort     │ Integrate SDK +   │ Zero                    │
│                  │ wire trace IDs    │                         │
│ Per-call cost    │ +0.5ms latency    │ Baseline                │
│                  │ (async write) +   │                         │
│                  │ ~$0.0001/call     │                         │
│                  │ storage           │                         │
│ Debug speed      │ Minutes           │ Hours-to-days           │
│ Cost visibility  │ Per-feature, per- │ Total only              │
│                  │ user dashboards   │                         │
│ Eval feedback    │ Automatic         │ Manual / lost           │
│ loop                                                            │
│ Storage cost     │ ~$0.0001/call ×   │ None                    │
│                  │ scale             │                         │
└──────────────────┴───────────────────┴─────────────────────────┘
```

### What we gave up

SDK integration time (~1-2 days per chain). Trace-ID propagation work across every chain. Storage costs for full prompts (manageable until ~10M calls/day; then sample).

### What the alternative would have cost

Debug sessions taking hours instead of minutes. Cost spikes invisible until the monthly bill. Production failures uncaptured for the eval set, so the same bug recurs. Each cost compounds over time.

### The breakpoint

Observability is non-negotiable the day the chain ships to production. Below that scale, dev-time logging is enough; once users hit it, traces become mandatory.

---

## Tech reference (industry pairing)

### Langfuse

- **Codebase uses:** not yet — would be the canonical SDK for the visualizer's mocked traces.
- **Why it's here:** Langfuse is the most-adopted OSS LLM observability tool in 2026; self-hostable; rich UI for trace inspection.
- **Leading today:** Langfuse — `adoption-leading` for OSS LLM observability, 2026.
- **Why it leads:** SDK-friendly, supports trace IDs across providers, eval-set integration, cost tracking, self-hostable.
- **Runner-up:** Helicone — `adoption-leading` for hosted observability; simpler setup, less customization.

### Phoenix (Arize)

- **Codebase uses:** not yet.
- **Why it's here:** Phoenix specializes in eval-focused observability — strongest for eval-set integration and drift detection.
- **Leading today:** Phoenix — `innovation-leading` for ML-eval integration, 2026.
- **Why it leads:** strong eval primitives; treats observability + evals as one system.

### LangSmith (LangChain)

- **Codebase uses:** not yet.
- **Why it's here:** LangSmith is the hosted observability tool from the LangChain team; tight integration with the LangChain SDK.
- **Leading today:** LangSmith — `adoption-leading` for LangChain users.
- **Why it leads:** zero-config when already using LangChain; native trace propagation.

---

## Project exercises

### [B-reincodes-observability-viz] Build the LLM-observability visualizer

- **Exercise ID:** `[B-reincodes-observability-viz]`
- **What to build:** a page at `/ai/llm-observability` that renders a precomputed trace of a 3-chain pipeline (intent → retrieve → generate). Each span expandable to show the full prompt + response + token breakdown + cost. An aggregate view shows cost-per-chain over a simulated 7-day window with a "cost spike alert" triggered on day 4.
- **Why it earns its place:** demonstrates the trace shape + the cost-visibility concrete value (spotting the day-4 spike via dashboard vs missing it in raw logs).
- **Files to touch:** `src/app/ai/llm-observability/page.tsx`, `src/components/ObservabilityVisualizer/`, `public/ai/llm-observability/traces.json`.
- **Done when:** page loads, trace tree renders, span expansion works, aggregate view shows the spike alert.
- **Estimated effort:** 1–2 days.

---

## Summary

### Part 1 — concept recap

LLM observability captures per-call prompt + response + tokens + cost + latency + model version, links them via trace IDs across chained calls, and surfaces aggregate metrics in dashboards. The feedback loop from production failures to eval-set regression cases is what closes the iteration loop. In reincodes Case B; visualizer demonstrates a 3-chain trace with cost-spike alert. Langfuse / Helicone / Phoenix are the canonical tools; non-negotiable for production.

### Part 2 — key points to remember

- **Per-call logging**: full prompt + response + metadata, async-written.
- **Trace IDs**: span chained calls across the request flow.
- **Cost dashboards**: per-feature, per-user, per-model.
- **Eval-set integration**: production failures become regression cases.
- **Storage cost**: ~$0.0001/call; sample at 10M+/day.
- **Non-negotiable**: the day the chain ships to production.

---

## Interview defense

### What an interviewer is really asking

"How do you debug LLM features in production?" — testing whether the candidate treats observability as launch-required or as a nice-to-have. Junior: "add `console.log`." Senior: "trace ID per request, per-call logging with structured fields, cost dashboards segmented by feature/user/model, eval-set feedback loop."

### Likely questions

**Q (mid):** What goes into a trace?

A: Per-call: prompt (system + user), response, tokens (input/output/cache_read), latency, cost, model version, error info. Per-chain: trace_id linking spans, parent span_ids for hierarchy, retrieval context if RAG, tool calls if agent. The shape is OpenTelemetry-derived but with LLM-specific fields.

```
minimum trace fields

per call:                         per chain:
  prompt                           trace_id
  response                         span_ids + parent_ids
  model + version                  retrieval context
  tokens (in / out / cache)        tool calls
  latency_ms                       total tokens
  cost_usd                         total cost
  error (if any)                   total latency
```

**Q (senior):** What's the relationship between observability and evals?

A: They form a closed loop. Production failures (surfaced via user reports, low CSAT, errors) become regression eval cases. The eval set grows monotonically. New prompt iterations are tested against the full set including the new cases — so the same failure doesn't ship twice. Without observability, you can't capture production failures; without evals, captured failures don't prevent future regressions.

```
observability ↔ eval loop

production: user thumbs-down on response
       │
       ▼
observability: trace pulled, prompt + response captured
       │
       ▼
human: marks expected output, adds to regression set
       │
       ▼
next prompt iteration: runs against expanded set
       │
       ▼
guaranteed: same failure doesn't ship twice
```

**Q (arch):** At 10x scale (10M+ calls/day), what changes?

A: At 10M+/day, storing full prompts becomes expensive. Three shifts: (1) sample full logs at 10%, keep all structured fields at 100% — full prompts are queryable on the sample, aggregate analysis works on full data; (2) cold storage for older traces (>7 days) — query speed drops but cost drops more; (3) automated alerting on per-feature cost / error rate / eval-score drift — at this scale, dashboards aren't enough; alerts are mandatory.

```
storage strategy by scale

scale          full logs        structured fields    alerts
─────          ─────────        ────────────────    ──────
100K/day       100%             100%                 manual
1M/day         100%             100%                 cost spikes
10M/day        10% sample       100%                 cost + error + drift
100M/day       1% sample        100%                 cost + error + drift +
                                                     per-tenant anomaly
```

### The question candidates always dodge

**Q:** Couldn't you just rely on the provider's dashboards?

A: Provider dashboards show what the *provider* sees — total calls, total tokens, total cost. They don't show per-chain breakdown, per-user attribution, per-feature cost, prompt+response content, or trace structure. For multi-chain pipelines, the provider view is a black box — "your org spent $X yesterday." Application-level observability shows *which chain*, *which user*, *which prompt edit caused the spike*. The honest answer: provider dashboards are useful for billing reconciliation; application-level observability is what makes debugging possible.

```
provider dashboard vs application observability

provider:                         application:
  total calls                       per-chain breakdown
  total tokens                      per-user attribution
  total cost                        per-feature cost
  rate-limit status                 prompt + response visible
                                    trace structure
                                    eval-set integration

provider = billing reconciliation
application = debugging + iteration
```

### One-line anchors

- "What you can't observe, you can't debug."
- "Trace ID per request; span ID per call; observability follows the chain."
- "Per-call cost is the unit; per-feature dashboard is the view."
- "Production failures become regression cases. The feedback loop closes via observability."
- "Non-negotiable the day the chain ships."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Draw the trace structure from request through observability backend.

### Level 2 — Explain it out loud
Explain LLM observability to a colleague about to ship a chain with no logging. Under 90 seconds.

### Level 3 — Apply it
A new chain ships. What 5 metrics would you put on the launch dashboard?

### Level 4 — Defend
Pick the biggest tradeoff. Would the visualizer show one chain or three?

### Quick check
- What file controls the static-export contract?
- Where does the visualizer register?
- What JSON file holds the precomputed traces?
