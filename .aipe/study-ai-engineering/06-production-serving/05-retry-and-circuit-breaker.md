# Retry and circuit breaker

**Industry name(s):** Exponential backoff, jittered retry, circuit breaker, idempotent retry, per-error-class retry policy
**Type:** Industry standard

> Retry with exponential backoff for transient failures. Open the circuit when failures sustain — let the dependency recover instead of pounding it. Distinguish "model misbehaved" (don't retry — eval problem) from "network blipped" (retry — infra problem).

**See also:** → [04-rate-limiting-and-backpressure](04-rate-limiting-and-backpressure.md) · → [../04-agents-and-tool-use/06-error-recovery](../04-agents-and-tool-use/06-error-recovery.md) · → [01-llm-caching](01-llm-caching.md)

---

## Why care

### Move 1 — The grounded scenario

Your chain calls Anthropic. At 2am, Anthropic's us-east-1 has a 90-second blip; ~3% of requests fail with 5xx. Your app has no retry; users see ~3% error rate during the blip, then everything recovers. Meanwhile your other chain (the agent loop) hits the same blip, but the agent retries the failed tool call... which fails... triggering the agent to retry the *whole loop*... which makes 5 more tool calls... each of which might fail. By 2:05 you've made 1000 extra calls for nothing, your bill ticks up, and the eval-side alerts page on-call.

### Move 2 — Name the question

The question is *which failures are worth retrying and how to retry them without amplifying load*. Transient infrastructure failures (5xx, network blip, rate limit 429) deserve retry with backoff. Persistent failures (4xx schema-violation, refusal, 401 auth) don't — retry won't change them. Circuit breaker is the orthogonal mechanism: when failure rate sustains above threshold, stop trying and let the dependency recover.

### Move 3 — Why answering that question matters

**Why you need to answer that question at all:** because LLM dependencies are flaky — providers have incidents, networks have blips, rate limits trigger at peak. A chain without retry returns the first transient failure to the user; a chain with retry-everything-immediately turns a 1% transient failure into a 10x load amplification. The middle path — retry transients with exponential backoff, circuit-break sustained failures, never retry deterministic failures — is the operational standard.

### Move 4 — Concrete before/after

Without retry:
- 1% baseline transient failure rate
- Users see 1% error rate
- No load amplification

With naive immediate retry (no backoff, no max):
- 1% failures retry immediately
- During incidents, 30% failures retry, 30% of *those* retry, etc.
- Load 3-5x amplified during incidents; provider 429s; thundering herd

With exponential backoff + circuit breaker:
- Transient 1% retry with exponential backoff (50ms, 200ms, 1s, 5s, give up)
- After 5 sustained failures in 30s, circuit opens (no requests for 30s)
- After 30s, circuit half-open — single test request; if it succeeds, close
- During incidents, load doesn't amplify; users see slightly elevated error rate; service recovers automatically

### Move 5 — The one-line summary

Retry + circuit breaker is `Promise.retry()` with `setTimeout` between attempts plus a kill-switch when the dependency is on fire — same shape as every modern HTTP client library, applied to LLM calls. Mechanics below.

---

## How it works

### Move 1 — The mental model

Failures fall into two categories: *transient* (will succeed on retry) and *persistent* (won't). Retry policy maps error classes to "retry" or "don't." Circuit breaker is the second-order rule: too many failures, regardless of class, means stop trying for a while.

```
failure taxonomy + retry decision

error class                       retry?
─────────────────────────         ──────────────
5xx server error                  yes (transient)
429 rate limited                  yes (with longer backoff)
network timeout                   yes (transient)
408 client timeout                yes
4xx schema validation            no (persistent — eval issue)
4xx refusal / safety              no (persistent — model decision)
401 / 403 auth                    no (persistent — config issue)
422 invalid args                  no (persistent — caller bug)

circuit breaker:
  IF rolling_failure_rate > 50% AND sustained > 30s
  THEN open the circuit (no calls for 30s)
```

### Move 2 — The layered walkthrough

#### Exponential backoff with jitter

The technical thing: each retry waits `base * 2^attempt + random_jitter`. Base 50ms, max 5s, jitter ±25%. Jitter prevents thundering herd — without it, all failed requests retry at the same instant and hit the wall together. The bridge from frontend: this is the same algorithm in every HTTP client (axios-retry, ky, undici). Concrete consequence: spreads retry load across time so the dependency can recover.

```
backoff schedule (base 50ms, factor 2, max 5s, jitter ±25%)

attempt    base      with jitter
─────      ─────     ──────────────
1          50ms      37-62ms
2          100ms     75-125ms
3          200ms     150-250ms
4          400ms     300-500ms
5          800ms     600-1000ms
6          1.6s      1.2-2.0s
7          3.2s      2.4-4.0s
8          5s        3.75-5s (capped)
```

#### Per-error-class retry policy

The technical thing: not every error is retryable. Map error response codes to a policy: `retry_with_backoff` for 5xx/429/timeout, `no_retry` for 4xx persistent errors. The bridge: this is a switch statement on `error.status`. Concrete consequence: don't retry refusals (the model decided not to do the thing; retrying won't change the decision); don't retry schema validations (your prompt is wrong; fix the prompt). Concrete condition where it breaks: misclassified errors (a 503 that's actually a persistent provider outage gets retried forever).

#### Circuit breaker (open / half-open / closed)

The technical thing: state machine over the dependency. Closed = normal operation. Open = no calls allowed; immediate failure. Half-open = single test call; if it succeeds, close; if it fails, re-open. The bridge: this is a feature flag with autoclose — the flag flips off when the dependency recovers. Concrete consequence: under sustained failure, traffic stops hitting the dead dependency; the dependency gets breathing room to recover; service degrades gracefully instead of pounding the wall.

```
circuit breaker state machine

       failures < threshold
     ┌──────────────────────┐
     ▼                      │
  CLOSED                    │
     │                      │
     │ failures ≥ threshold │
     ▼                      │
   OPEN                     │
     │                      │
     │ timeout (30s)        │
     ▼                      │
  HALF-OPEN                 │
     │                      │
     ├─ test succeeds ──────┘
     │
     ├─ test fails ──► back to OPEN
     │
```

#### Idempotency requirement

The technical thing: retried requests must be safe to repeat. For LLM calls this means: deterministic (temperature 0 or `seed` parameter); side-effect-free (no tool calls that write state on every attempt). The bridge: this is `PUT` vs `POST` — `PUT` is safe to retry, `POST` may double-charge. Concrete consequence: chains with tool-call side effects need an idempotency key (every request includes a `request_id`; the tool deduplicates by ID). Concrete condition where it breaks: retrying a tool-call chain without idempotency keys can charge the user twice / send the email twice / write the row twice.

### Move 3 — The principle

The principle: *retry transient failures, don't retry persistent ones, and have a kill-switch when failures sustain*. This is the same playbook as every other infra dependency — databases, HTTP APIs, message queues — applied to LLM calls. The novelty is the persistent-failure category for LLMs (refusals, schema violations, safety triggers) which doesn't exist in the same way for other infra.

Full picture below.

---

## Retry + circuit breaker — diagram

```
┌─ Request flow ────────────────────────────────────────────────────┐
│                                                                   │
│   request ──► circuit breaker check                               │
│                       │                                           │
│            ┌──────────┴──────────┐                                │
│            ▼                     ▼                                │
│         CLOSED                  OPEN                              │
│            │                     │                                │
│            ▼                     ▼                                │
│      try call                fail-fast (503 to caller)            │
│         │                                                         │
│         ├─ success ──► record success, return                     │
│         │                                                         │
│         ├─ 5xx/429/timeout ──► retry with backoff                 │
│         │                       (max 5 attempts)                   │
│         │                          │                              │
│         │                ┌─────────┼────────┐                     │
│         │                ▼         ▼        ▼                     │
│         │             success    fail     fail                    │
│         │                │         │        │                     │
│         │                │         │        ▼                     │
│         │                │         │   record failure             │
│         │                │         │        │                     │
│         │                │         │        ▼                     │
│         │                │         │   threshold reached?         │
│         │                │         │        │                     │
│         │                │         │        ▼ yes                 │
│         │                │         │   open circuit               │
│         │                │         │                              │
│         └─ 4xx ──────────┴─────────┴─► return error (no retry)    │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

The flow makes retry vs no-retry decisions visible per error class; circuit-breaker state gates the whole sequence.

---

## In this codebase

**Not yet implemented.** reincodes has no LLM calls. The buildable target is below — a `/ai/retry-circuit-breaker` visualizer that renders a 100-request stream with 5% transient failure rate, toggles 3 retry policies (none / exponential / exponential+circuit-breaker), and shows success rate + latency distribution per policy.

**Expected file paths:**
- `src/app/ai/retry-circuit-breaker/page.tsx`
- `src/components/RetryCircuitBreakerVisualizer/`
- `public/ai/retry-circuit-breaker/scenarios.json`

---

## Elaborate

### Where this pattern comes from

Exponential backoff and circuit breaker are 2000s-era patterns from distributed systems (Netflix's Hystrix popularized circuit breaker; AWS docs canonicalized exponential backoff with jitter). The LLM-specific addition is the persistent-failure taxonomy (refusals, schema violations) that doesn't apply to traditional infra.

### The deeper principle

*Failure handling is a first-class design concern, not a TODO comment.* Retry policy is part of the chain's API contract — callers need to know "this chain retries idempotently" to compose it safely.

### Where this breaks down

Retry breaks down when the underlying failure is your prompt, not infra. A chain that keeps schema-violating after 5 retries doesn't have an infra problem; it has an eval problem. The retry logic just delays surfacing the real issue. The mitigation: per-error-class metrics — alert when schema-violation rate spikes, separate from infra failure rate.

### What to explore next

- [04-rate-limiting-and-backpressure](04-rate-limiting-and-backpressure.md) — orthogonal mechanism for throughput limits
- [../04-agents-and-tool-use/06-error-recovery](../04-agents-and-tool-use/06-error-recovery.md) — when the LLM itself has to recover from tool failures
- Netflix's Hystrix documentation — canonical circuit breaker reference

---

## Tradeoffs

### Comparison table

```
┌──────────────────┬───────────────────┬─────────────────────────┐
│ Cost dimension   │ Retry + breaker   │ No retry                │
├──────────────────┼───────────────────┼─────────────────────────┤
│ Setup effort     │ Retry policy + CB │ Zero                    │
│                  │ state             │                         │
│ Cost per call    │ +0-50% in storms  │ Baseline                │
│ p99 latency      │ Higher in storms  │ Lower (just fail)       │
│ User-visible     │ Lower (retries    │ Higher (1st failure     │
│ error rate       │ hide transients)  │ visible)                │
│ Provider load    │ Bounded (CB caps  │ Unbounded amplification │
│ amplification    │ at threshold)     │                         │
│ Failure isolation│ Strong            │ None                    │
│ Maintenance      │ Tune backoff +    │ None                    │
│                  │ CB thresholds     │                         │
└──────────────────┴───────────────────┴─────────────────────────┘
```

### What we gave up

Engineering time for retry+CB logic (~2 days for a clean implementation). Tuning effort for backoff schedule and CB thresholds (per-chain calibration via eval). Cost increase during storms (retries don't reduce calls; they redistribute them in time).

### What the alternative would have cost

User-visible error rate equal to transient failure rate (1-3% during normal operation, much higher during incidents). No load isolation — provider incidents become your incidents.

### The breakpoint

Retry + CB earns its place the day the chain ships to production. Below that scale, error budget tolerance is higher than the cost of the discipline.

---

## Tech reference (industry pairing)

### Retry library (per-language)

- **Codebase uses:** not yet — `p-retry` (Node) or `tenacity` (Python).
- **Why it's here:** correct exponential backoff with jitter is tedious to write; libraries handle it.
- **Leading today:** `p-retry` — `adoption-leading` for Node retry, 2026.
- **Why it leads:** TypeScript-first, composes with promises, configurable per-error retry decisions.
- **Runner-up:** axios-retry — `adoption-leading` HTTP-specific.

### Circuit breaker library

- **Codebase uses:** not yet — `opossum` (Node) or Polly (.NET equivalent).
- **Why it's here:** circuit breaker state management is non-trivial; libraries handle the state machine.
- **Leading today:** `opossum` — `adoption-leading` for Node CB, 2026.
- **Why it leads:** clean API, integrates with metrics, fallback support.
- **Runner-up:** custom CB on top of Redis — `innovation-leading` for distributed CB.

### Idempotency key pattern

- **Codebase uses:** not yet — would pass `idempotency_key` as a request parameter to dedup retries.
- **Why it's here:** retrying side-effecting tool calls without idempotency causes double-execution.
- **Leading today:** Stripe-style `Idempotency-Key` header — `adoption-leading` standard.
- **Why it leads:** widely understood pattern; works across any HTTP API.

---

## Project exercises

### [B-reincodes-retry-circuit-breaker-viz] Build the retry-circuit-breaker visualizer

- **Exercise ID:** `[B-reincodes-retry-circuit-breaker-viz]`
- **What to build:** a page at `/ai/retry-circuit-breaker` that simulates a 100-request stream with 5% transient failure rate. Three policy toggles: no retry / exponential backoff / exponential + circuit breaker. Render success rate, latency distribution, total provider calls per policy.
- **Why it earns its place:** demonstrates the load-amplification problem visibly — naive retry produces a "extra calls during incident" curve that exponential backoff flattens and circuit breaker truncates.
- **Files to touch:** `src/app/ai/retry-circuit-breaker/page.tsx`, `src/components/RetryCircuitBreakerVisualizer/`, `public/ai/retry-circuit-breaker/scenarios.json`.
- **Done when:** page loads, all 3 policies toggle, time-series renders correctly, circuit-breaker state visualization works.
- **Estimated effort:** 1–2 days.

---

## Summary

### Part 1 — concept recap

Retry + circuit breaker is the failure-handling discipline that separates production-grade LLM chains from hobby projects. Exponential backoff with jitter for transient failures (5xx, 429, timeout); never retry persistent failures (4xx, refusal); circuit breaker as the kill-switch when failures sustain. In reincodes Case B; visualizer demonstrates the load-amplification difference across three policies. Idempotency keys are mandatory for any chain with side-effecting tool calls.

### Part 2 — key points to remember

- **Two failure classes**: transient (retry) vs persistent (don't).
- **Exponential backoff with jitter** to prevent thundering herd.
- **Circuit breaker** opens after sustained failures, closes after recovery.
- **Idempotency keys** for side-effecting tool calls.
- **Per-error-class metrics** to distinguish "infra flaky" from "prompt broken."
- **Non-negotiable** the day the chain ships to production.

---

## Interview defense

### What an interviewer is really asking

"How do you handle failures from the LLM API?" — testing whether the candidate distinguishes transient from persistent failures and reaches for established patterns. Junior: "wrap in try/catch and retry." Senior: "per-error-class policy with exponential backoff + circuit breaker + idempotency keys for side-effecting chains."

### Likely questions

**Q (mid):** Why exponential backoff instead of linear?

A: Exponential gives the dependency time to recover proportional to how badly it's failing. Linear retries (every 100ms) keep hammering at fixed rate even during sustained outages. Exponential (50ms, 100ms, 200ms, 400ms, 800ms...) starts aggressive but backs off quickly — the failed requests don't dogpile when the provider is on fire.

```
linear vs exponential during 5s outage

linear (every 100ms):       exponential (50ms, 100ms, ...):
  attempt rate constant       attempt rate decreases
  50 attempts in 5s           ~7 attempts in 5s
  provider sees high load     provider sees recovering load
  during outage               during outage
```

**Q (senior):** When do you NOT retry?

A: When the failure is deterministic. 4xx errors generally indicate "your request is wrong" — retrying with the same request will produce the same error. Specifically: schema-validation failures (the prompt is wrong; fix the prompt, don't retry), refusals (the model decided not to do the thing; retrying won't change the decision), auth failures (config is wrong), invalid args (caller bug). The shape: distinguish "infra blipped" from "you sent the wrong thing."

```
retry decision tree

error                              retry?
─────                              ──────
5xx, 429, timeout                  yes (infra issue)
4xx schema validation              no (prompt issue)
4xx refusal / safety filter        no (model decision)
4xx auth / forbidden              no (config issue)
network reset                      yes (transient)
agent loop max iterations          no (agent design issue)
```

**Q (arch):** How do you size the circuit-breaker threshold?

A: From the failure rate baseline. If your normal failure rate is 0.5%, set the open threshold at maybe 5-10x baseline (3-5%) over a 30-second window. Too tight and the breaker opens during normal variance; too loose and it doesn't open until users see widespread failures. Tune via the eval set + production metrics — start at 5% / 30s, adjust based on the first month of data.

```
circuit breaker tuning

baseline failure rate: 0.5%
open threshold: 5% over 30s
test interval: 30s (half-open after this)
test count: 1 (single probe before re-closing)

tune based on:
  - false-open rate (breaker opening during normal variance)
  - false-close rate (breaker closing too quickly, re-opening)
  - mean time to recovery (how long incidents last)
```

### The question candidates always dodge

**Q:** Why not just rely on the LLM client library's built-in retry?

A: Most do — Anthropic SDK and OpenAI SDK both have built-in retry, and for simple cases they're enough. But the built-ins don't know your application's idempotency semantics, your per-error-class policy beyond "retry 5xx," or your service's circuit-breaker state. For production chains with side-effecting tool calls, agent loops, or multi-tenant fairness requirements, you need application-level retry control that the SDK can't provide. The honest answer: SDK retry is the floor; application retry is the production target.

```
SDK retry vs application retry

SDK retry (built-in):              application retry:
  retries 5xx + 429                custom per-error policy
  basic exponential backoff        configurable backoff
  no circuit breaker               circuit breaker
  no idempotency awareness         idempotency keys
  no per-chain config              per-chain policy
  
Good for: prototypes, demos        Good for: production chains
                                            with side effects
```

### One-line anchors

- "Retry transients with backoff; never retry persistent failures."
- "Circuit breaker is the kill-switch when failures sustain."
- "Idempotency keys for any chain that writes."
- "Per-error-class metrics distinguish 'infra flaky' from 'prompt broken.'"
- "SDK retry is the floor; application retry is the production target."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Draw the request flow with circuit breaker check, retry logic, and per-error-class decision.

### Level 2 — Explain it out loud
Explain retry + circuit breaker to a colleague about to ship a chain with side-effecting tool calls and no retry logic. Under 90 seconds.

### Level 3 — Apply it
A new chain calls an external API tool that sends emails. The API has a 2% transient failure rate. Design the retry + idempotency strategy.

### Level 4 — Defend
Pick the biggest tradeoff. Would you build the visualizer with 3 policies or 5?

### Quick check
- What file controls the static-export contract?
- Where does the visualizer register?
- What JSON file holds the scenarios?
