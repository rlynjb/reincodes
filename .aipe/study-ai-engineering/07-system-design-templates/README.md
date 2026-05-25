# 07 — System design templates (AI side)

IK-style interview-prompt reframes for AI/LLM system design. Each template uses the **9-labelled-bullet shape** (not the per-concept template): The prompt / Standard architecture / Data model / Key components / Scale concerns / Eval framing / Common failure modes / Applies to this codebase / How to make it apply.

## Files

- [01-search-ranking.md](01-search-ranking.md) — Design a search ranking system. Two-stage retrieval (hybrid: dense + sparse + RRF) + cross-encoder rerank + learned ranker. **Applies to reincodes: no** (no search surface).
- [02-tech-support-chatbot.md](02-tech-support-chatbot.md) — Design a tech support chatbot. RAG over KB + intent classification + tool calling + escalation routing. **Applies to reincodes: no** (no support surface).

## Applies-to-this-codebase table

```
template                    applies to reincodes?  why
─────────────────────────  ─────────────────────  ─────────────────────────
01-search-ranking           no                     no search surface; CONCEPT
                                                   CATEGORIES is a 17-entry
                                                   static grid
02-tech-support-chatbot     no                     no support surface; no
                                                   users, no KB, no escalation
                                                   path; static-export forbids
                                                   the always-on backend
```

Both templates are read as system-design study material rather than as buildable features for reincodes. The closest reincodes-specific buildable target for AI system design is the planned `/ai/rag` visualizer in `../03-retrieval-and-rag/11-rag.md`, which demonstrates retrieval + ranking mechanics against a precomputed corpus.
