# AI features in this codebase

reincodes is a Next.js 15 static-export DSA visualizer + portfolio site. **It does not currently use any LLM-powered features.** The concepts in this guide are covered as study material; the Project exercises block in each concept file identifies the planned `/ai/*` visualizer that would demonstrate the concept in the browser under the static-export contract.

## Production AI surface (today)

```
none.
```

Zero LLM calls, zero chains, zero agents, zero embeddings, zero trained models. The static-export contract (`output: "export"` in `next.config.ts`) forbids server runtime, which forbids API keys at request time, which forbids any live AI call from the browser. The 17-entry concept catalog at `src/components/Home/conceptsData.tsx` is the closest the codebase comes to "structured data" — and it's a hand-curated array of visualizer tiles, not anything an LLM produced or consumes.

## Planned AI surface (the buildable target)

Per the curriculum, reincodes is positioned as the **interview-prep visualizer host** — the place where AI concepts get taught through visualizers, not the place where AI runs for users. Each concept file in this guide's `## Project exercises` block names the corresponding planned `/ai/*` visualizer. Below is the consolidated table of planned visualizers, grouped by which sub-section their concept lives in.

### From 01-llm-foundations/

### `/ai/what-is-an-llm`

- **Feature:** Animate next-token generation token-by-token over a short prompt, with a top-5 probability distribution side-panel at each step.
- **Patterns used:** [`01-llm-foundations/01-what-is-an-llm`](01-llm-foundations/01-what-is-an-llm.md) — operational mental model of autoregressive next-token prediction.
- **Why these patterns:** the visualizer's pedagogical payoff is making the "the model is just predicting next token by next token" insight visceral instead of abstract.

### `/ai/tokenization`

- **Feature:** Text input renders as colored token chips with IDs; toggle between OpenAI and Anthropic tokenizers; show token-to-character ratio for English vs Japanese vs code.
- **Patterns used:** [`01-llm-foundations/02-tokenization`](01-llm-foundations/02-tokenization.md).
- **Why these patterns:** tokenization is the unit of cost + the unit of context-window — every other AI cost calculation depends on it.

### `/ai/sampling`

- **Feature:** Same prompt run at 5 temperatures (0, 0.3, 0.7, 1.0, 1.4) with precomputed outputs; side-panel shows the top-5 candidate distribution at each token.
- **Patterns used:** [`01-llm-foundations/03-sampling-parameters`](01-llm-foundations/03-sampling-parameters.md).
- **Why these patterns:** seeing the same input produce wildly different outputs at different temperatures is the cleanest way to internalize non-determinism.

### `/ai/structured-outputs`

- **Feature:** Render a schema as a tree; run a prompt against three precomputed variants (strict on, no "be polite" instruction, courtesy-fence bug active); toggle to see what breaks.
- **Patterns used:** [`01-llm-foundations/04-structured-outputs`](01-llm-foundations/04-structured-outputs.md) (operational), [`../study-prompt-engineering/02-structured-outputs.md`](../study-prompt-engineering/02-structured-outputs.md) (authoring-side).
- **Why these patterns:** the cross-reference is intentional — the operational mechanics belong here; the prompt-engineering authoring discipline belongs in the prompt-engineering guide.

### `/ai/streaming`, `/ai/token-economics`, `/ai/heuristic-before-llm`, `/ai/provider-abstraction`, `/ai/user-override-locks`

- **Patterns used:** corresponding files in `01-llm-foundations/`.
- **Why these patterns:** each demonstrates one operational LLM concept (latency UX, cost calculation, when not to use an LLM, provider switching, system-prompt authority) via a precomputed playback visualizer.

### From 02-context-and-prompts/

### `/ai/context-window`, `/ai/lost-in-the-middle`, `/ai/prompt-chaining`

- **Patterns used:** corresponding files in `02-context-and-prompts/`.
- **Why these patterns:** the context window's mechanics + lost-in-the-middle's attention curve + chain composition with typed contracts are the three substrate concepts a reader needs before tackling RAG and agents.

### From 03-retrieval-and-rag/

### `/ai/embeddings`, `/ai/embedding-model-choice`, `/ai/chunking`, `/ai/vector-databases`, `/ai/dense-vs-sparse`, `/ai/hybrid-retrieval`, `/ai/reranking`, `/ai/query-rewriting`, `/ai/stale-embeddings`, `/ai/incremental-indexing`, `/ai/rag`, `/ai/graph-rag`

- **Patterns used:** corresponding files in `03-retrieval-and-rag/`.
- **Why these patterns:** 12 visualizers, each demonstrating one retrieval primitive (the embedding-space 2D projection, the chunking-strategy comparison, the hybrid-retrieval fusion, the rerank-as-second-stage, the stale-embedding consequence, etc.) against a small precomputed corpus.

### From 04-agents-and-tool-use/

### `/ai/agents-vs-chains`, `/ai/tool-calling`, `/ai/react-loop`, `/ai/tool-routing`, `/ai/agent-memory`, `/ai/error-recovery`

- **Patterns used:** corresponding files in `04-agents-and-tool-use/`.
- **Why these patterns:** the agent loop's mechanics + tool-call semantics + ReAct's thought/action/observation timeline are best taught by animated playback of a precomputed trace.

### From 05-evals-and-observability/

### `/ai/eval-set-types`, `/ai/eval-methods`, `/ai/llm-as-judge-bias`, `/ai/llm-observability`

- **Patterns used:** corresponding files in `05-evals-and-observability/`.
- **Why these patterns:** evals are the senior-vs-junior dividing line in LLM application engineering; the visualizers make the discipline operable (golden vs regression vs adversarial sets compared on the same chain; judge-method agreement matrix; production tracing).

### From 06-production-serving/

### `/ai/llm-caching`, `/ai/cost-optimization`, `/ai/prompt-injection`, `/ai/rate-limiting`, `/ai/retry-circuit-breaker`

- **Patterns used:** corresponding files in `06-production-serving/`.
- **Why these patterns:** production-side concerns (cache hit-rate, cost-tier routing, defense-in-depth, backpressure, retry-with-circuit-breaker) all benefit from animated playback under different toggles.

## The architectural pattern across all planned visualizers

Every visualizer follows the same shape, dictated by the static-export contract:

```
build time:
  scripts/precompute-{concept}.ts
    │
    ├─ call Anthropic / OpenAI with each scenario
    ├─ capture outputs
    └─ commit to public/ai/{concept}/scenarios.json
                                  │
                                  ▼
ship time:
  next build (output: "export")
    │
    ▼
  static HTML + JS + public/ assets uploaded to GH Pages
                                  │
                                  ▼
runtime (browser):
  src/app/ai/{concept}/page.tsx
    │
    ├─ fetch public/ai/{concept}/scenarios.json
    ├─ render controls (toggles, sliders, model-tier select)
    └─ swap precomputed outputs based on control state — no API call
```

No visualizer in the planned `/ai/*` family makes a live LLM call from the browser. Each ships the precomputed evidence and renders a playback UI over it. This is the architectural constraint that defines what "AI in reincodes" can be.

## Cross-portfolio split

Per the curriculum, the three production AI shapes live in three other repos:

- **LLM application engineering** — **buffr** (Android journal with 5 single-purpose AI chains)
- **Prompt engineering as discipline** — **aipe** (markdown spec workflow as Claude Code / Codex plugin)
- **Classical ML + on-device inference** — **contrl-mo** (calisthenics tracker with MediaPipe pose detection)

reincodes' role in that split is the **teaching layer** — the place where the concepts from the other three projects get visualized for interview prep. The split is intentional and load-bearing: keeping reincodes pure-visualizer preserves the deploy story (zero-cost GH Pages), preserves the interview-prep three-shape framing (LLM app + prompt eng + classical ML, plus visualizer host), and keeps each project's job legible.
