# 01 — LLM foundations

The operational mental model + cost surface + cross-provider mechanics that every LLM-touching engineer needs before retrieval, agents, or production-serving concerns kick in. **9 concept files**, all Case B for reincodes (no AI surface today).

## Files

- [01-what-is-an-llm.md](01-what-is-an-llm.md) — autoregressive next-token prediction; the inference function as a stateless API; context window as the only memory.
- [02-tokenization.md](02-tokenization.md) — BPE / subword tokenization; per-provider tokenizers; the tokenization tax on non-English.
- [03-sampling-parameters.md](03-sampling-parameters.md) — temperature, top-p, top-k; the source of non-determinism; when each parameter actually matters.
- [04-structured-outputs.md](04-structured-outputs.md) — JSON mode / tool calling / response_format; strict mode; the courtesy-markdown-fence bug; cross-provider variation.
- [05-streaming.md](05-streaming.md) — SSE protocol; UI implications; when streaming helps vs hurts.
- [06-token-economics.md](06-token-economics.md) — input vs output cost; prompt caching as the economic lever; batch API; cost-per-user.
- [07-heuristic-before-llm.md](07-heuristic-before-llm.md) — the senior move of writing a cheap classifier before the expensive LLM call.
- [08-provider-abstraction.md](08-provider-abstraction.md) — switching, fallback, multi-provider; lowest-common-denominator vs provider-specific features.
- [09-user-override-locks.md](09-user-override-locks.md) — instruction hierarchy; soft locks vs hard locks; structural enforcement.

## Reading order

01 → 02 → 03 are the substrate (what is it, how does it count, why is it non-deterministic). Read them in order. 04-09 can be read by topic interest.
