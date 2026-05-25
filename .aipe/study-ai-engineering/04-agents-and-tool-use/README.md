# 04 — Agents and tool use

The agent loop: when to reach for it, what its mechanics are, and how to keep it from spiraling. **6 concept files**, all Case B for reincodes.

## Files

- [01-agents-vs-chains.md](01-agents-vs-chains.md) — chains as fixed pipelines; agents as loops; the architectural choice + cost ledger.
- [02-tool-calling.md](02-tool-calling.md) — tool definitions, request-response cycle, parallel tool calls, error handling.
- [03-react-pattern.md](03-react-pattern.md) — ReAct (Reason + Act); termination conditions; modern variants.
- [04-tool-routing.md](04-tool-routing.md) — which tool, when; confidence-based vs semantic routing.
- [05-agent-memory.md](05-agent-memory.md) — short-term context vs long-term retrieval; summarization; lost-in-the-middle intersection.
- [06-error-recovery.md](06-error-recovery.md) — tool failure modes; retry / clarify / give-up; the eval-discipline angle.

## Reading order

01 → 02 → 03 first (the architectural choice + the mechanics + the canonical loop). 04-06 read by topic interest once the foundation lands.

## Related templates

The tech-support chatbot template ([`../07-system-design-templates/02-tech-support-chatbot.md`](../07-system-design-templates/02-tech-support-chatbot.md)) is the canonical agent-shaped system design — it composes RAG + intent classification + tool calling + escalation routing.
