# 03 — AI engineering

The five concept files in this directory cover LLM application engineering fundamentals as they apply to reincodes' curriculum role: the interview-prep visualizer host. None of the patterns below are implemented in production code today; every file is Case B from the spec's perspective (concept tagged for the project, not yet built). The `## Project exercises` blocks carry the buildable targets — four planned visualizer pages plus the meta aggregation file.

## Files in this section

### LLM foundations

- `01-tokenization.md` — byte-pair encoding, why context windows are sized in tokens, the character-vs-token gap. Plans the `/ai/tokenization` visualizer.

### RAG and embeddings

- `02-embeddings-geometrically.md` — embeddings as vectors in high-dimensional space, cosine similarity, t-SNE for 2D projection. Plans the `/ai/embeddings` cosine-similarity playground.
- `03-rag-pattern.md` — the five RAG stages (chunk, embed, store, retrieve, generate), with the curriculum's loopd-shape vs aipe-shape RAG variants. Plans the `/ai/rag` pipeline visualizer.

### Agents

- `04-agents-and-tool-use.md` — agent loop as a `while` around a typed-response handler, ReAct, termination conditions, when *not* to use an agent. Plans the `/ai/agent-loop` animation.

### Codebase use

- `05-ai-features-in-this-app.md` — the meta aggregation file. Honest framing of "no AI in production today" plus the buildable surface area (the four visualizer pages from files 01–04 as a coherent sprint).

## AI features table

| Feature | Pattern used | Why this pattern |
|---|---|---|
| (none yet — see `system-design-templates/` for interview reframes) | — | reincodes is the interview-prep visualizer host per the curriculum; the actual AI work lives in loopd (LLM application engineering), aipe (prompt engineering as discipline), and contrl-mo (classical ML). The static-export contract (`output: "export"` in `next.config.ts`) plus the deliberate three-shape portfolio split keep AI runtime out of this project. The four planned visualizers in files 01–04 are the buildable surface; until they ship, this table stays empty. |

→ See `system-design-templates/` for IK-style interview reframes (search ranking, tech support chatbot).
