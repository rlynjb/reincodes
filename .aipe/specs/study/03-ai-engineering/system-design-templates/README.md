# AI system design templates

Five (well, two for AI; the ML side has three) IK-style interview reframes. Each template uses the **9-bullet system-design shape** (not the per-concept template). Generated for every AI study guide regardless of whether the current codebase exemplifies the prompt.

## Files

1. **[01-search-ranking](./01-search-ranking.md)** — design a search ranking system.
2. **[02-tech-support-chatbot](./02-tech-support-chatbot.md)** — design a customer-support chatbot.

## What these are

Each template is a synthesised answer to a common interview prompt. The body is a 9-bullet list:

- `The prompt:` — the verbatim interview question.
- `Standard architecture:` — the diagram you'd draw on a whiteboard.
- `Data model:` — what's stored where.
- `Key components:` — named subsystems with one technical choice each.
- `Scale concerns:` — what breaks first at named thresholds.
- `Eval framing:` — metrics, online vs offline, caveats.
- `Common failure modes:` — what an interviewer will probe.
- `Applies to this codebase:` — `yes` / `partially` / `no` + reasoning.
- `How to make it apply:` — refactor path; references curriculum exercises when relevant.

## Applies table

| Template | Applies to reincodes? | Refactor path |
|---|---|---|
| Search ranking | `no` | The full pattern requires a corpus; not in scope. The visualizer-only version is the planned **RAG pipeline visualizer** (`Cosine similarity playground` + `RAG pipeline visualizer`). |
| Tech support chatbot | `no` | The full pattern is anchored to **loopd**, not reincodes. The RAG-pipeline viz exercises retrieval + reranking but not the chatbot wrapper. |

## How to use

- In an interview prep cycle: open the template, study the diagram, walk through the eval framing.
- When asked "design X" in an interview: the template gives a ~5-minute scaffold; fill in the project-specific details.
- The `Applies` row tells you which codebase you'd defend the answer with — for reincodes, both templates require pointing at loopd / aipe / contrl-mo work, not reincodes itself.
