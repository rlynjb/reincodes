# 05 — Evals and observability

The discipline that distinguishes senior LLM application engineers from junior ones: measure every change against a fixed set; trace every production call; treat failures as new eval cases. **4 concept files**, all Case B for reincodes.

## Files

- [01-eval-set-types.md](01-eval-set-types.md) — golden / regression / adversarial; what each catches.
- [02-eval-methods.md](02-eval-methods.md) — exact-match / semantic / LLM-as-judge / human-in-the-loop.
- [03-llm-as-judge-bias.md](03-llm-as-judge-bias.md) — position, verbosity, self-preference; mitigations.
- [04-llm-observability.md](04-llm-observability.md) — tracing, logging, dashboards; Langfuse / Helicone / Phoenix.

## Reading order

01 → 02 → 03 → 04. The progression is *what to evaluate against* → *how to evaluate* → *what to watch out for in evaluation* → *how to observe production*. Each builds on the prior.

## Related reading

- [`../../study-prompt-engineering/05-eval-driven-iteration.md`](../../study-prompt-engineering/05-eval-driven-iteration.md) — the prompt-engineering-side view of the same discipline.
- Hamel Husain's writing on evals is the canonical practitioner reference.
