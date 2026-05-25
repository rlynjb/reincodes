# AI engineering — overview

This codebase (reincodes) is a Next.js 15 static-export DSA visualizer + portfolio site. **No AI surface in production code.** The guide treats every concept as Case B (curriculum-relevant but not yet implemented) and uses the planned `/ai/*` visualizer family as the primary buildable target.

```
┌─ This codebase's AI/ML surface (today) ───────────────────────────┐
│                                                                   │
│   none.                                                           │
│                                                                   │
│   No LLM calls, no chains, no agents, no embeddings, no           │
│   trained models. Static export to GitHub Pages forbids           │
│   server runtime, which forbids API keys, which forbids           │
│   any live AI call at request time.                               │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘

┌─ Planned surface (per the existing reincodes study + curriculum) ─┐
│                                                                   │
│   /ai/tokenization        BPE viz, in-browser tokenizer (WASM)    │
│   /ai/embeddings          cosine similarity playground            │
│   /ai/rag                 5-stage pipeline visualizer             │
│   /ai/agent-loop          ReAct loop animation                    │
│   /ai/prompt-anatomy      4-section prompt visualizer             │
│   /ai/structured-outputs  schema enforcement visualizer           │
│   /ai/prompts-as-code     prompt-version timeline                 │
│   /ai/token-budget        context window allocator                │
│   /ai/eval-iteration      golden-set runner                       │
│   /ai/cot                 reasoning-field visualizer              │
│   /ai/self-critique       critique-revise side-by-side            │
│   /ai/meta-prompting      LLM-drafts-prompt workflow              │
│   /ai/prompt-injection    defense-in-depth playground             │
│   /ai/forbidden-patterns  7-day caption convergence demo          │
│                                                                   │
│   All visualizers precompute LLM outputs at build time and        │
│   ship as JSON. Live API calls at request time are out.           │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘

┌─ Where the buildable target lives ────────────────────────────────┐
│                                                                   │
│   ai-features-in-this-codebase.md  ← the meta aggregation file   │
│   ml-features-in-this-codebase.md  ← OMITTED (no ML surface)     │
│                                                                   │
│   Each sub-section's concept files cross-reference the planned   │
│   /ai/* visualizer that would demonstrate the concept in the     │
│   browser, under the static-export constraint.                   │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

## Component legend (the planned surface)

- **`src/app/ai/tokenization/page.tsx`** — BPE / tokenizer visualizer. WASM tokenizer (tiktoken-wasm or similar) runs in the browser; text input renders as colored token chips with IDs.
- **`src/app/ai/embeddings/page.tsx`** — embedding-space visualizer. Precomputed sentence embeddings projected to 2D via UMAP/t-SNE; cosine similarity lines on hover.
- **`src/app/ai/rag/page.tsx`** — 5-stage RAG pipeline (chunk → embed → store → retrieve → generate) with precomputed corpus + outputs.
- **`src/app/ai/agent-loop/page.tsx`** — ReAct loop (thought → action → observation → ...) animated against a precomputed trace.
- **`src/app/ai/prompt-anatomy/page.tsx`** — 4-section prompt visualizer (system / context / few-shot / user) with toggleable bands.
- **`src/app/ai/eval-iteration/page.tsx`** — golden-set runner showing per-case pass/fail diff between two prompt variants.
- *(plus the 7 other visualizers listed in the planned-surface diagram above; each gets a buildable target in its corresponding concept file's Project exercises block)*
- **`next.config.ts`** — the static-export contract (`output: "export"`, `basePath`, `assetPrefix`) that defines what's possible inside `/ai/*`.
- **`src/components/Home/conceptsData.tsx`** — the catalog where each `/ai/*` visualizer registers under a new `ai-engineering` category (parallel to `sorting`, `trees`, `recursions`, `graphs`).
- **`scripts/precompute-*.ts`** *(planned, per-visualizer)* — build-time scripts that call Anthropic / OpenAI to capture outputs and commit them to `public/ai/{concept}/`.

## Cross-cutting constraint

The static-export contract (`output: "export"` in `next.config.ts`) is load-bearing for every AI visualizer in reincodes. No server runtime means no API keys at request time, which means every LLM output the visualizer renders has to be precomputed at build time and committed to `public/ai/{concept}/` as JSON. The visualizer is a *playback machine* over precomputed data, not a *live* call. This constraint is named in every concept file's Tradeoffs and Project exercises blocks.

## Codebase shape

Per the spec's three-shapes framing: this codebase is **none of the three shapes today** — it has neither LLM application engineering, nor prompt engineering as a discipline (that lives in the separate `study-prompt-engineering/` guide), nor classical ML. The codebase's role in the wider portfolio (per the curriculum) is **interview-prep visualizer host** — the place where AI concepts get *taught through visualizers*, not the place where AI runs for users. Every file in this guide is Case B because the codebase has nothing to be Case A on.
