# 06 — Production serving

What changes the day your LLM feature has real users: caching, cost optimization, defense against prompt injection, backpressure, retry semantics. **5 concept files**, all Case B for reincodes.

## Files

- [01-llm-caching.md](01-llm-caching.md) — prompt cache, semantic cache, exact-match; cache hit-rate as the operational metric.
- [02-llm-cost-optimization.md](02-llm-cost-optimization.md) — model-tier routing, prompt compression, batch API.
- [03-prompt-injection.md](03-prompt-injection.md) — defense in depth; author-side + runtime-side defenses; Simon Willison's stance.
- [04-rate-limiting-and-backpressure.md](04-rate-limiting-and-backpressure.md) — provider rate limits, 429 backoff, queue depth.
- [05-retry-and-circuit-breaker.md](05-retry-and-circuit-breaker.md) — exponential backoff, idempotency, per-error-class retry policy.

## Reading order

Any order — each addresses a different production concern. If pressed, 01 → 02 (cost-side) then 03 (security-side) then 04 → 05 (reliability-side).

## Related reading

- [`../../study-prompt-engineering/12-prompt-injection-defense.md`](../../study-prompt-engineering/12-prompt-injection-defense.md) — the author-side view of prompt injection defense (the present sub-section covers the runtime-side complement).
