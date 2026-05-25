# AI engineering study guide

Per-repo AI engineering study guide for reincodes. Covers LLM foundations, context management, retrieval, agents, evals, production serving, and (when applicable) classical ML — per the `/aipe:study-ai-engineering` spec.

## Codebase shape

**None of the three shapes today.** reincodes is a Next.js 15 static-export DSA visualizer + portfolio with zero AI surface in production code. The curriculum positions it as the *interview-prep visualizer host* — the place where AI concepts get taught through visualizers, not the place where AI runs for users. Every concept file in this guide is **Case B** (concept not implemented), and every concept's Project exercises block targets a planned `/ai/{concept}` visualizer under the static-export constraint.

For where AI/ML actually runs in the portfolio:
- **LLM application engineering** lives in buffr (Android journal with 5 AI chains)
- **Prompt engineering as a discipline** lives in aipe (markdown spec workflow)
- **Classical ML + on-device inference** lives in contrl-mo (calisthenics tracker with MediaPipe pose detection)

This guide stays reincodes-focused per spec scope (per-repo, not portfolio-wide).

## Sub-section index

### [01-llm-foundations/](01-llm-foundations/)
What an LLM is, tokenization, sampling parameters, structured outputs, streaming, token economics, heuristic-before-LLM, provider abstraction, user-override locks. **9 files.**

### [02-context-and-prompts/](02-context-and-prompts/)
Context window, lost-in-the-middle, prompt chaining. **3 files.** (Prompt engineering proper lives in [`../study-prompt-engineering/`](../study-prompt-engineering/).)

### [03-retrieval-and-rag/](03-retrieval-and-rag/)
Embeddings, embedding model choice, chunking strategies, vector databases, dense vs sparse, hybrid retrieval (RRF), reranking, query rewriting (HyDE), stale embeddings, incremental indexing, RAG, GraphRAG. **12 files.**

### [04-agents-and-tool-use/](04-agents-and-tool-use/)
Agents vs chains, tool calling, ReAct pattern, tool routing, agent memory, error recovery. **6 files.**

### [05-evals-and-observability/](05-evals-and-observability/)
Eval set types, eval methods, LLM-as-judge bias, LLM observability. **4 files.**

### [06-production-serving/](06-production-serving/)
LLM caching, LLM cost optimization, prompt injection, rate limiting + backpressure, retry + circuit breaker. **5 files.**

### [07-system-design-templates/](07-system-design-templates/)
IK-style interview-prompt reframes: search ranking, tech support chatbot. **2 files** in the 9-labelled-bullet system-design shape (not the per-concept template).

### Machine learning (omitted)
**08-machine-learning/ and 09-ml-system-design-templates/ are not generated** — reincodes has no ML surface (no trained models, no recommenders, no on-device inference). When the portfolio needs ML coverage, it lives in the contrl-mo repo's own `study-ai-engineering/` guide.

### Per-codebase synthesis
- [ai-features-in-this-codebase.md](ai-features-in-this-codebase.md) — meta aggregation file. Lists every AI feature in this codebase (currently: none) with the patterns each uses. Frames the planned `/ai/*` visualizers as the buildable surface.

(No `ml-features-in-this-codebase.md` — see "Machine learning (omitted)" above.)

## Reading order

The sub-sections are mostly independent; read by topic interest rather than in strict order. If you're new to LLM application engineering, start with [01-llm-foundations/](01-llm-foundations/) → [02-context-and-prompts/](02-context-and-prompts/) → [03-retrieval-and-rag/](03-retrieval-and-rag/). If you're already comfortable with the foundations and want the production-side view, jump to [05-evals-and-observability/](05-evals-and-observability/) → [06-production-serving/](06-production-serving/). The 07 templates are read in the *opposite* mode — not as concept study, but as interview-prep reframes for "design X" prompts.

## Companion guides

- [`../study-system-design-dsa/`](../study-system-design-dsa/) — the per-codebase study guide for system design + DSA in reincodes (the working DSA visualizer code, not the planned AI surface)
- [`../study-prompt-engineering/`](../study-prompt-engineering/) — topic-focused study guide on prompt engineering as a working discipline
- [`../audit-refactor-prep-fundamentals-for-ai/`](../audit-refactor-prep-fundamentals-for-ai/) — staff-engineer notebook of refactor opinions on reincodes (note: directory still uses the legacy 2-word descriptor naming convention; that skill hasn't migrated to fixed names yet)
