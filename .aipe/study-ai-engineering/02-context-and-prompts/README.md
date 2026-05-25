# 02 — Context and prompts

How the context window works as a finite resource, why position inside it matters, and how to compose prompts into chains. **3 concept files**, all Case B for reincodes. The prompt-engineering discipline as a whole lives in [`../../study-prompt-engineering/`](../../study-prompt-engineering/) — this sub-section covers the *operational* angle (context window mechanics, position effects, chain composition) rather than the *authoring* angle (prompt anatomy, structured-output authoring, eval discipline).

## Files

- [01-context-window.md](01-context-window.md) — model context limits; effective context vs nominal context; the 80% headroom rule.
- [02-lost-in-the-middle.md](02-lost-in-the-middle.md) — the empirical attention-degradation curve at position 50%; implications for prompt structure.
- [03-prompt-chaining.md](03-prompt-chaining.md) — sequential composition; typed contracts at chain boundaries; cascading-error failure mode.

## Reading order

Any order. These three concepts are independent. If pressed, 01 → 02 → 03 builds in difficulty (mechanics → empirical effect → composition).
