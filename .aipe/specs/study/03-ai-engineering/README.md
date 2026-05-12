# 03 — AI engineering

Concepts the curriculum says reincodes is meant to host as **interview-prep visualizers**. None implemented today; all files are **Case B** (curriculum-driven, not yet implemented).

The curriculum (`~/.config/aipe/global/aieng-curriculum.md`) places reincodes as the "interview prep surface — vizzes for tokenization, embeddings, RAG, agents, ML metrics." This section lists those concepts; the per-file `Project exercises` block is the buildable target.

## Files (grouped by sub-discipline)

### LLM foundations
1. **[01-tokenization](./01-tokenization.md)** — curriculum `[C1.1]`. The buildable target: tokenization visualizer.

### Retrieval and RAG
2. **[02-embeddings-geometrically](./02-embeddings-geometrically.md)** — curriculum `[C2.1]`. Cosine similarity playground.
3. **[03-dense-vs-sparse-retrieval](./03-dense-vs-sparse-retrieval.md)** — curriculum `[C2.4]`. Part of the RAG pipeline visualizer.
4. **[04-reranking-cross-encoder](./04-reranking-cross-encoder.md)** — curriculum `[C2.6]`. Part of the RAG pipeline visualizer.

### Agents and tool use
5. **[05-agent-loop](./05-agent-loop.md)** — curriculum `[C4.2]`. Agent loop animation.

## What this codebase uses for AI (today)

| Feature | Pattern | Why this pattern |
|---|---|---|
| *None* | — | reincodes has no AI surface in the current codebase. The featured projects (loopd, AdvntrCue, aipe) use AI internally; this site presents them as portfolio cards but makes no LLM calls itself. |

## What's planned (Case B inventory)

The curriculum's "Interview prep surface — reincodes" section (line 517 of `aieng-curriculum.md`) lists six planned vizzes:

```
[ ] Tokenization visualizer       → exercises C1.1
[ ] Cosine similarity playground  → exercises C2.1
[ ] RAG pipeline visualizer       → exercises C2.1, C2.4, C2.6
[ ] Agent loop animation          → exercises C4.2
[ ] Confusion matrix interactive  → exercises C3.4, C3.11  (ML-side; see ../04-machine-learning/)
[ ] Bias-variance interactive     → exercises C3.9          (ML-side; see ../04-machine-learning/)
```

Each maps to a file in this section or in `04-machine-learning/`. The `## Project exercises` block of each file is the spec for building it.

## Why no other AI concepts?

The full AI curriculum (`aieng-curriculum.md`) has ~50 concept entries across LLM foundations / Prompt engineering / Retrieval / Agents / Evals / Production. Most are anchored to **loopd** (LLM application engineering) or **aipe** (prompt engineering as discipline), not reincodes. Only the five concepts above are tagged for the reincodes "interview-prep surface" — and three of them are exercised by a single multi-stage viz (RAG pipeline).

If reincodes' scope ever expanded — say, to host LLM-graded interview practice problems — additional concepts would land here. Today, the inventory is deliberately curriculum-tagged-only.

→ See [`system-design-templates/`](./system-design-templates/) for IK-style interview reframes (search ranking, tech support chatbot).
