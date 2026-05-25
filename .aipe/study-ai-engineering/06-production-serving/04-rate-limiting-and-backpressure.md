# Rate limiting and backpressure

**Industry name(s):** Rate limiting, throttling, backpressure, queue depth management, 429 handling
**Type:** Industry standard

> Providers cap requests-per-minute (RPM) and tokens-per-minute (TPM); your service has to respect them, queue when they fill, and propagate backpressure to the UI. The right rate-limit strategy is the difference between "the service runs fine until 12pm then breaks for 3 hours" and "the service degrades gracefully and recovers without an incident."

**See also:** → [05-retry-and-circuit-breaker](05-retry-and-circuit-breaker.md) · → [02-llm-cost-optimization](02-llm-cost-optimization.md) · → [../04-agents-and-tool-use/06-error-recovery](../04-agents-and-tool-use/06-error-recovery.md)

---

## Why care

### Move 1 — The grounded scenario

You ship a chain that handles 50 calls/second steady-state. At launch it's fine. A marketing campaign drives traffic to 300 calls/second for 20 minutes at noon. Anthropic returns `429 Too Many Requests`. Your app retries; each retry also returns 429. Within minutes, every user request is failing. The error page shows a generic "something went wrong." Users abandon. The chain is functional, the model is fine, the provider is fine — the failure is between you and the provider.

### Move 2 — Name the question

The question is *how much load you let through to the provider* and *what happens to the excess*. Providers cap throughput per organization; your service has to enforce its own cap below that, queue requests that exceed it, and tell the UI to back off when the queue fills. Rate limiting and backpressure are the two halves: rate limiting decides what gets through; backpressure tells upstream callers what to do when they can't.

### Move 3 — Why answering that question matters

**Why you need to answer that question at all:** because launching without rate-limit handling means the first traffic spike — campaign, viral moment, runaway agent loop — takes the service down. The mitigation is operational hygiene that every web service has built for decades; LLM features just inherit the same problem. The teams shipping LLM features that survive their first viral moment all have the same shape: in-app token bucket, queue with bounded depth, 429 backoff with jitter, and a UI that surfaces "we're processing your request" instead of "something went wrong."

### Move 4 — Concrete before/after

Without rate limiting:
- 300 calls/sec hits the chain
- Anthropic 429s after ~50/sec
- Your app retries immediately; thundering herd
- Provider 429s harder (backoff penalty); queue depth grows unbounded in memory
- Service OOM in 5 minutes

With rate limiting + backpressure:
- 50 calls/sec passes through (token bucket caps at provider limit)
- Remaining 250/sec enter the queue
- Queue depth alerts at 80% capacity
- UI shows "estimated wait: 30 seconds" with a progress indicator
- Service stays up; users see degraded but functional UX
- Spike subsides; queue drains in 5 minutes

### Move 5 — The one-line summary

Rate limiting + backpressure is HTTP keep-alive's mirror image for the request rate — instead of pacing the connection to fit infinite bandwidth, you pace the connection to fit finite provider quota. Mechanics below.

---

## How it works

### Move 1 — The mental model

Provider quota is a bucket that refills at a fixed rate (50 RPM = 50 tokens added per minute). Your service consumes tokens by making requests. When the bucket is empty, requests have to wait. The token bucket is the canonical algorithm; the queue holds requests waiting for tokens.

```
token bucket + queue

provider quota refill rate: 50 RPM
                ↓
       ┌────────────────┐
       │ token bucket   │  ← max 50 tokens
       │ (capacity 50)  │
       └────────┬───────┘
                │ token available?
                ▼
       ┌────────────────┐
       │ request queue  │  ← bounded depth
       │ (max 1000)     │
       └────────┬───────┘
                │ FIFO dequeue when token available
                ▼
       ┌────────────────┐
       │ provider call  │
       └────────────────┘
```

### Move 2 — The layered walkthrough

#### Provider-side rate limits (RPM, TPM, concurrent)

The technical thing: every provider returns `429 Too Many Requests` with headers naming the quota (`anthropic-ratelimit-requests-remaining`, `retry-after`). The bridge from frontend: this is the same shape as GitHub's API rate limits — headers tell you how much room you have. Concrete consequence: your service has to read those headers and pace itself; ignoring them means hitting the wall.

#### App-side rate limiting (token bucket, per-tenant)

The technical thing: don't even attempt requests over the provider quota. Implement a token bucket on your side that caps at provider RPM. The bridge: like the `<= max` check before pushing to a queue. Concrete consequence: provider 429s become rare (your bucket pre-throttles); when they happen, it's because you misjudged provider quota and need to adjust your bucket.

#### Queue with bounded depth

The technical thing: when the bucket is empty, queue incoming requests. Bound the queue depth (e.g., 1000) so memory doesn't grow without limit. The bridge: this is the same as a `Promise.all` with a concurrency limit. Concrete consequence: bursts get absorbed up to the queue limit; sustained overload returns "service unavailable" at the API edge instead of OOM'ing the service.

```
queue depth alarm levels

depth     status                  action
─────     ──────────────         ─────────────────────────
0-50%     normal                  process FIFO
50-80%    elevated                log + page on-call
80-95%    critical                shed lowest-priority traffic
95-100%   shedding                429 to incoming requests
```

#### Backpressure to the UI

The technical thing: when the queue is non-empty, the API returns "processing — estimated time X seconds" instead of synchronous response. The UI shows a progress state with the estimate. The bridge: this is the React `pending` state. Concrete consequence: users don't see errors; they see waiting, which is recoverable.

### Move 3 — The principle

The principle: *throughput limits are universal; rate limiting is what makes them visible upstream*. Every system has a throughput limit; the question is whether you discover it via 429s (reactive) or enforce it at your edge (proactive). Proactive rate limiting + backpressure is the same architecture every long-lived production service converges to.

Full picture below.

---

## Rate limiting + backpressure — diagram

```
┌─ Client / UI ─────────────────────────────────────────────────────┐
│                                                                   │
│   user action ──► API call                                        │
│                      │                                            │
│                      ▼                                            │
│                  "processing — est. 30s" + spinner                │
│                                                                   │
└───────────────────────────────────────│───────────────────────────┘
                                        │
                                        ▼
┌─ Your service (API layer) ────────────────────────────────────────┐
│                                                                   │
│   incoming request                                                │
│      │                                                            │
│      ▼                                                            │
│   token bucket check ──► capacity?                                │
│      │                       │                                    │
│      │                       ▼ no                                 │
│      │                  enqueue                                   │
│      │                       │                                    │
│      ▼ yes                   ▼                                    │
│   provider call         queue depth alarm?                        │
│      │                       │                                    │
│      ▼                       ▼                                    │
│   response             80%+: log + page                           │
│      │                 95%+: shed (return 503)                    │
│      ▼                                                            │
│   return to client                                                │
│                                                                   │
└───────────────────────────────────────│───────────────────────────┘
                                        │
                                        ▼  bucket refills at provider RPM
┌─ Provider (Anthropic / OpenAI) ───────────────────────────────────┐
│   per-org quota: e.g. 50 RPM, 40K TPM                             │
│   429 if exceeded (with retry-after header)                       │
└───────────────────────────────────────────────────────────────────┘
```

Backpressure flows upstream: provider → your service → UI → user.

---

## In this codebase

**Not yet implemented.** reincodes has no LLM calls, no rate limit pressure. The buildable target is below — a `/ai/rate-limiting` visualizer that simulates a 100-request stream against two modes (no rate limit / with rate limit + backpressure) and shows queue depth, success rate, 429 count over time.

**Expected file paths:**
- `src/app/ai/rate-limiting/page.tsx`
- `src/components/RateLimitingVisualizer/`
- `public/ai/rate-limiting/scenarios.json`

---

## Elaborate

### Where this pattern comes from

Token bucket + leaky bucket are 1980s networking algorithms. Cloud APIs adopted them in the 2000s as the canonical rate limiting primitives. LLM providers inherit the same model; the LLM-specific twist is the dual quota (RPM + TPM) — token-per-minute is the load-bearing one for long-context chains.

### The deeper principle

*Backpressure makes capacity legible.* A system that 429s silently is invisible; a system that surfaces "queue depth = 800/1000" is observable. The shift from reactive to proactive rate limiting tracks the broader shift from "ship and watch dashboards" to "model the bottleneck and enforce it at the edge."

### Where this breaks down

Backpressure breaks down for inherently synchronous UX (a chat interface where the user expects instant response). For those cases, the right answer is provisioned throughput (pay the provider for higher quota) rather than queueing — users won't tolerate "estimated wait: 30s" in a chat.

### What to explore next

- [05-retry-and-circuit-breaker](05-retry-and-circuit-breaker.md) — what to do when individual calls fail
- [02-llm-cost-optimization](02-llm-cost-optimization.md) — reducing call volume is the cheapest rate-limit mitigation
- Provider docs on quota increase requests — the operational escape hatch

---

## Tradeoffs

### Comparison table

```
┌──────────────────┬─────────────────────┬─────────────────────────┐
│ Cost dimension   │ Rate limit + queue  │ Naive (no limits)       │
├──────────────────┼─────────────────────┼─────────────────────────┤
│ Setup effort     │ Token bucket lib +  │ Zero                    │
│                  │ queue + UI states   │                         │
│ Spike handling   │ Graceful degrade    │ Service down            │
│ Steady-state     │ Identical           │ Identical               │
│ p99 latency      │ Higher (queue wait) │ Lower (until breakage)  │
│ Failure mode     │ Degraded UX         │ Full outage             │
│ Recovery         │ Automatic           │ Manual (page on-call)   │
│ Cost             │ Same provider bill  │ Same                    │
│ Observability    │ Queue depth visible │ Only 429s as signal     │
└──────────────────┴─────────────────────┴─────────────────────────┘
```

### What we gave up

Higher p99 latency during peaks (users wait in queue). Engineering time for the rate-limit logic + UI states (~2-3 days for a clean implementation).

### What the alternative would have cost

A single 20-minute traffic spike that takes the service down costs more than years of rate-limit infrastructure. The cost asymmetry is what makes rate limiting non-negotiable for production.

### The breakpoint

Rate limiting earns its place the day the chain ships to production traffic. There is no scale at which "let the provider 429 us" is the right answer.

---

## Tech reference (industry pairing)

### Token bucket library (per-language)

- **Codebase uses:** not yet — would use `bottleneck` (Node) or `aiolimiter` (Python) for the bucket implementation.
- **Why it's here:** correct implementation is non-trivial; libraries handle the edge cases.
- **Leading today:** `bottleneck` — `adoption-leading` for Node rate limiting.
- **Why it leads:** weighted requests, priority queues, per-key limits, distributed coordination via Redis.
- **Runner-up:** custom token bucket with Redis — `innovation-leading` for fine control.

### Queue (in-memory or Redis/BullMQ)

- **Codebase uses:** not yet — in-memory for single-instance; BullMQ for multi-instance.
- **Why it's here:** queue depth needs to survive process restarts and span instances when the app scales horizontally.
- **Leading today:** BullMQ (Redis-backed) — `adoption-leading` for Node job queues, 2026.
- **Why it leads:** durable, observable, integrates with the Bull dashboard.
- **Runner-up:** Inngest — `innovation-leading` event-driven background jobs.

### Provider rate-limit response headers

- **Codebase uses:** not yet — would read Anthropic's `anthropic-ratelimit-*` headers to size the bucket dynamically.
- **Why it's here:** provider quota changes (tier upgrades, throttle events); reading headers means the bucket adapts.
- **Leading today:** Anthropic + OpenAI both emit standard rate-limit headers.
- **Why they lead:** standardized header names make multi-provider code clean.

---

## Project exercises

### [B-reincodes-rate-limiting-viz] Build the rate-limiting visualizer

- **Exercise ID:** `[B-reincodes-rate-limiting-viz]`
- **What to build:** a page at `/ai/rate-limiting` that simulates a 100-request stream over 60 seconds. Two modes: no rate limit (immediate 429 cascade) vs with rate limit + backpressure (queue depth visible, requests pace, eventual drain). Render queue depth over time, success rate, 429 count.
- **Why it earns its place:** the visualizer makes the "spike → outage" failure mode visible — without the discipline, the line of failed requests stretches across the timeline; with it, the queue absorbs the spike and drains gracefully.
- **Files to touch:** `src/app/ai/rate-limiting/page.tsx`, `src/components/RateLimitingVisualizer/`, `public/ai/rate-limiting/scenarios.json`.
- **Done when:** page loads, both modes work, time-series graphs render correctly.
- **Estimated effort:** 1 day.

---

## Summary

### Part 1 — concept recap

Rate limiting + backpressure is the operational discipline that lets an LLM-backed service survive its first traffic spike. Token bucket on your side caps requests below provider quota; bounded queue absorbs bursts; UI shows progress instead of errors. In reincodes Case B; the visualizer demonstrates spike behavior with and without the discipline. Non-negotiable for production traffic.

### Part 2 — key points to remember

- **Token bucket on your side**, sized at provider quota. Pre-throttle.
- **Bounded queue** for excess. Shed at the cap, don't OOM.
- **Backpressure to the UI** — "processing" beats "error."
- **Read provider rate-limit headers** to size the bucket dynamically.
- **No scale at which "let provider 429" is the answer.** Discipline at every scale.

---

## Interview defense

### What an interviewer is really asking

"How do you handle traffic spikes?" — testing whether you treat throughput limits as a first-class design concern. Junior: "scale the servers." Senior: "rate limit at the edge, queue with bounded depth, backpressure to the UI."

### Likely questions

**Q (mid):** Why use a token bucket instead of just retrying on 429?

A: Retry without backoff creates thundering herd — all the failed requests retry simultaneously, hit the wall together, retry again, repeat. Token bucket prevents the wall in the first place by capping outbound requests below provider quota; retries are reserved for transient failures, not steady-state overload.

```
naive retry vs token bucket

retry on 429:                     token bucket:
  100 reqs/s hit 50/s limit         50 reqs/s pass through
  50 succeed, 50 429                50 enqueue
  50 retry → 50 429 again          queue drains as bucket refills
  thundering herd                  no thundering herd
```

**Q (senior):** Where do you put the rate limiter — at the API gateway, in the app server, or per-client?

A: All three. Per-client (API key based) for fairness across users; per app-server instance for protecting the provider; at the gateway for ingress shaping. The hierarchy: gateway > app > client. Each layer enforces its own limit; the tightest one wins.

```
rate limit hierarchy

ingress (CDN/gateway): per-IP, anti-DDoS
       ▼
app server: per-org, sized to provider quota
       ▼
per-client: per-API-key, fairness across customers
```

**Q (arch):** At 10x traffic, what changes about rate-limiting strategy?

A: At 10x, single-instance token buckets become inadequate — multiple app instances need coordinated rate limiting. Move to a Redis-backed distributed token bucket; the per-instance bucket becomes the local fast-path with the global bucket as the source of truth. Queue moves from in-memory to BullMQ (Redis-backed) for durability across restarts.

```
scale → coordination story

1 instance:     in-memory bucket + in-memory queue
3 instances:    Redis bucket + BullMQ queue (durable)
30 instances:   sharded buckets per region + per-shard queues
```

### The question candidates always dodge

**Q:** Couldn't you just buy more provider quota and avoid this whole problem?

A: For short-term spike handling, yes — provider quota increases are real and fast. But the cost is real ($X/month for higher RPM tier), and the underlying engineering problem (your service has to handle bursts) doesn't go away — it just moves to a higher absolute number. The discipline of "model the limit, enforce at edge, surface backpressure" applies at every scale. Buying more quota without the discipline means the same incident at 10x throughput.

```
"just buy more quota" trap

10 RPM → 50 RPM upgrade           50 RPM → 500 RPM upgrade
spike at 100/s → 429                spike at 1000/s → 429
same problem, larger numbers        same problem, larger numbers
```

### One-line anchors

- "Token bucket on your side; queue for the overflow; backpressure to the UI."
- "Throughput limits are universal. Rate limiting is what makes them legible upstream."
- "Naive retry on 429 = thundering herd. Token bucket = pre-throttle."
- "No scale at which 'let provider 429' is the right answer."
- "Buying more quota doesn't replace the discipline; it raises the absolute number."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Draw the bucket + queue + provider flow. Label what triggers backpressure.

### Level 2 — Explain it out loud
Explain rate limiting + backpressure to a colleague about to ship an LLM feature without it. Under 90 seconds.

### Level 3 — Apply it
A new chain expects 100 calls/sec steady-state with occasional 500 calls/sec spikes for 5 minutes. Provider quota is 200 RPM. Design the rate-limit + queue parameters.

### Level 4 — Defend
Pick the biggest tradeoff. Would you use an in-memory queue or Redis-backed?

### Quick check
- What file controls static-export contract?
- Where does the visualizer register?
- What JSON file holds the scenarios?
