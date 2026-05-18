# AI features in this app

**Industry name(s):** — (project-specific aggregation page; the catalog-of-AI-features pattern from the study-guide spec.)
**Type:** Project-specific

> The meta file for AI in reincodes. Today, the answer is "none in production code." Tomorrow, the answer is the four visualizer pages the curriculum named — and this file holds the buildable list.

**See also:** → `01-tokenization.md` · → `02-embeddings-geometrically.md` · → `03-rag-pattern.md` · → `04-agents-and-tool-use.md`

---

## Why care

You open `src/app/` and scan the route directory. You see `sorting/`, `trees/`, `recursions/`, `graphs/`. You grep for `openai`, `anthropic`, `embedding`, `tokenize`. Zero hits. There is no `useChat()`, no `fetch('/api/llm')`, no SDK in `package.json`. The site is 100% client-side static export of hand-written algorithm visualizers.

So when an interviewer asks "what AI features have you built?", the honest answer about reincodes is "none — this is my classical DSA visualizer." That answer is fine *if* the same conversation includes loopd (LLM application engineering), aipe (RAG over project context), or contrl-mo (classical ML pipeline). The curriculum is explicit about this: reincodes is the *interview prep surface* — the place where AI concepts get *visualized for teaching*, not the place where AI features run in production.

The frontend instinct here is the right one: keep the static site static, keep the AI runtime out, and use this codebase for what it's good at — interactive visualizations of patterns the other projects exercise in code. The meta question this file answers is "where would AI surface in reincodes if it surfaced anywhere, and what's the buildable path?"

**Why you need to answer that question at all:** because the curriculum is not a wish list; it's a plan. The four AI engineering files in this directory each name a concrete page that would slot into the existing visualizer catalog. This file is the index of those pages — what they are, where they'd live, why they earn shelf space, and what shape the home page takes when they ship.

Without an aggregation file:
- Each concept file describes its own visualizer in isolation.
- The reader doesn't see the four together as a coherent "AI engineering category."
- The decision points that span the four (shared bundling? shared corpus? shared category in `conceptsData.tsx`?) have no home.

With this file:
- One page lists all four planned visualizers as a buildable batch.
- The shared architectural decisions (route prefix, bundle strategy, conceptsData category) live here once.
- The home-page integration story is in one place.

This file is the AI section's `README.md` for the *project*, complementary to the directory's `README.md` which is the navigation index for the *files*.

---

## How it works

Today: nothing. There is no AI integration. The build pipeline is `next build` → static HTML/JS → GitHub Pages. No API keys, no provider SDKs, no server routes. The four "AI features" are all *planned* visualizers from the curriculum's interview-prep section, each documented in its own concept file in this directory.

The future shape, when the visualizers ship:

```
src/app/
 ├── sorting/             (6 pages — existing)
 ├── trees/               (3 pages — existing)
 ├── recursions/          (3 pages — existing)
 ├── graphs/              (5 pages — existing)
 └── ai/                  (new — 4 pages from this directory's exercises)
     ├── tokenization/
     │   └── page.tsx     (see 01-tokenization.md)
     ├── embeddings/
     │   └── page.tsx     (see 02-embeddings-geometrically.md)
     ├── rag/
     │   └── page.tsx     (see 03-rag-pattern.md)
     └── agent-loop/
         └── page.tsx     (see 04-agents-and-tool-use.md)

src/components/
 ├── ArrayVisualizer/             (existing)
 ├── BinaryVisualizer/             (existing)
 ├── CallstackVisualizer/          (existing — parallels AgentLoopVisualizer)
 ├── NetworkDiagram/               (existing — parallels EmbeddingsPlot for d3)
 ├── (new for AI)
 ├── TokenChipList/
 ├── EmbeddingsPlot/
 ├── RAGPipeline/
 └── AgentLoopVisualizer/

src/components/Home/conceptsData.tsx
  CONCEPT_CATEGORIES:
    "sorting"          (existing)
    "graphs"           (existing)
    "trees"            (existing)
    "recursion"        (existing)
    "ai-engineering"   (new — adds 4 tiles)
```

Per the existing pattern, each new page is `"use client"`, owns its animation state via `useState`, drives a dedicated visualizer component, and reuses `delayLoop` from `src/utils/delayLoop.ts` for step-through animation where applicable.

Constraints inherited from the static-export contract (`next.config.ts`: `output: "export"`):

1. **No server-side LLM calls.** Anything that needs an API key is gated to dev-only build scripts that output JSON to `public/`. Examples: `scripts/embed-corpus.ts` (one-off run to populate the embeddings demo), `scripts/build-rag-corpus.ts` (one-off to populate the RAG demo).
2. **No client-side API keys.** The browser cannot hold a provider key. If a visualizer needs *live* LLM output, the path is precomputed examples — not live calls.
3. **Bundle discipline.** Every AI visualizer is route-chunked under `/ai/*` so the home page doesn't pay for the WASM tokenizer or the embedding model bytes.

---

## AI features in reincodes — diagram

```
                       Today                              When the curriculum ships
                       ─────                              ─────────────────────────

  AI features:          none                              4 visualizer pages

  Production code:                                        Production code:
   AI SDK imports:      0                                  AI SDK imports:    0
                                                           (still — precompute
                                                            at build time)

  Build-time scripts:                                     Build-time scripts:
   AI scripts:          0                                  AI scripts:        2
                                                           (embed-corpus,
                                                            build-rag-corpus)

  conceptsData.tsx                                        conceptsData.tsx
  categories:           4                                  categories:        5
                                                           (+ "ai-engineering")

  Routes under /ai:     0                                  Routes under /ai: 4
                                                           (tokenization,
                                                            embeddings,
                                                            rag,
                                                            agent-loop)

  ───────────────────────────────────────────────────────────────────────────────
  In both states: the production runtime is the browser, period.
  In both states: no API keys, no server, no database.
  The shift is purely in what's pre-baked into the static bundle.
```

---

## In this codebase

**Not yet implemented — for the whole AI surface.** Deferred — reincodes is the interview-prep visualizer host per the curriculum; no AI viz built yet. This file is intentionally Case B at the *file level*: there is no production code path under `src/app/ai/` today, no AI tile in `src/components/Home/conceptsData.tsx`, no `scripts/` directory at the repo root.

The single concrete artifact related to AI in the repo today is this very `.aipe/study-prep-fundamentals-for-ai/03-ai-engineering/` directory — the study material that defines what the visualizers will be when they ship. The repo's runtime knows nothing about AI; the repo's *documentation* knows the full plan.

---

## Elaborate

### Where this pattern comes from

The "aggregate AI features in one place" file is from the study-guide spec's `## How this codebase uses AI specifically` section. Its purpose is to give an interviewer a single page they can scan to see what the candidate has built — names, shapes, costs, eval surfaces. For projects that *have* AI features (loopd, aipe, contrl-mo), this file lists them. For projects that don't (reincodes, today), the file lists what's planned and why the absence is deliberate.

### The deeper principle

Honest framing over impressive framing. The temptation when writing about a non-AI codebase is to find any thread to pull on — "well, the recursion visualizer is *kind of like* tree-search in an LLM" — and inflate it into an AI feature. That fails the interview test. The senior+ move is to be explicit about what's there and what isn't, name the reason for the gap, and point to the project where the AI work actually lives. Reincodes is the visualizer host. loopd, aipe, and contrl-mo are the AI projects. The story works only if each project owns its actual shape.

```
┌────────────────────────────────────────────────────────────┐
│  Wrong frame:  "Every project does some AI."                │
│                Inflates non-AI work, weakens AI claims.     │
│                                                             │
│  Right frame:  "Each project has a distinct shape.          │
│                 reincodes visualizes; loopd applies LLMs;   │
│                 aipe is prompt engineering as discipline;   │
│                 contrl-mo trains classical ML on-device."   │
│                                                             │
│                 Reading the four together is the answer to  │
│                 'show me three shapes of AI work.'          │
└────────────────────────────────────────────────────────────┘
```

### Where this breaks down

When a project legitimately spans two shapes. The curriculum keeps the four projects deliberately separate (loopd = LLM app, aipe = prompt eng, contrl-mo = classical ML, reincodes = viz). If a future product genuinely sits across two — say, an LLM-powered IDE plugin that also ships a trained classifier — this clean split stops working and the aggregation file has to grapple with both shapes. For reincodes specifically, the clean split is intentional and load-bearing: reincodes is *only* the visualizer.

### What to explore next

- The four sibling files in this directory each describe one of the planned visualizers in detail (`01-tokenization.md`, `02-embeddings-geometrically.md`, `03-rag-pattern.md`, `04-agents-and-tool-use.md`).
- The `system-design-templates/` subdirectory holds interview-prompt reframes (search ranking, tech support chatbot) — these are generated regardless of codebase applicability and surface mostly as thought experiments for reincodes.
- The curriculum's "Interview prep surface — reincodes" section lists six visualizers total; this directory covers the four pure-AI-engineering ones. The remaining two (confusion-matrix interactive, bias-variance interactive) live in `04-machine-learning/` (when that directory is built) because they belong to classical ML eval, not LLM engineering.

---

## Tradeoffs

### Comparison table — both costs in one frame

┌──────────────────┬──────────────────────────┬──────────────────────────┐
│ Cost dimension   │ Keep reincodes pure-viz  │ Add real AI runtime here │
├──────────────────┼──────────────────────────┼──────────────────────────┤
│ Static export    │ Preserved                │ Broken (need server)     │
│ Hosting cost     │ $0 (GH Pages)            │ Hosting + LLM costs      │
│ API keys         │ None                     │ Required, can't be safe  │
│                  │                          │ in a static bundle       │
│ Build complexity │ Build scripts run once   │ Server runtime + deploy  │
│ Teaching surface │ Sharp — one shape        │ Muddled — two shapes     │
│ Portfolio story  │ Clean three-shape split  │ Two projects do the same │
│                  │                          │ thing                    │
└──────────────────┴──────────────────────────┴──────────────────────────┘

### Sub-block 1 — what keeping reincodes pure-viz costs

Live AI demos are off the table. Visitors can't type their own prompt and see real model output; they see precomputed examples or in-browser tokenization (which is real but offline). For a portfolio site, "I can't show you the live thing" is a real cost — it shifts the burden of the interactive moment onto the explanation rather than the demo. The mitigation is what the four concept files all do: precompute interesting examples, let the user toggle stages, animate the structure. The interactivity is at the *visualization layer*, not the *model layer*.

A second cost is the build-time scripts. `scripts/embed-corpus.ts` and `scripts/build-rag-corpus.ts` need OpenAI (or equivalent) API keys to run. They run on the developer's machine, not in CI. The outputs (`public/embeddings/corpus.json`, `public/rag/corpus.json`) get committed to git. A new contributor who wants to regenerate the corpus needs an API key; until then, they use the committed JSON. That's a real operational rough edge.

### Sub-block 2 — what adding a real AI runtime would cost

Breaking the static-export contract. The first byte of server-side runtime — an API route, an SSR endpoint, anything that needs Node at request time — means leaving GitHub Pages, picking a hosting provider, configuring environment variables, and paying for compute. The site went from $0 to $5–20/month minimum and from "ships in a `git push`" to "ships through a CI/CD with secret management." That's the hosting cost, but the bigger cost is *teaching surface clarity*: reincodes was the visualizer; now it's also doing what loopd does, with a worse codebase for the job (no SQLite, no journal model, no chain registry). The three-shape portfolio collapses into two-shape (loopd-like + visualizer + ML) — strictly worse for the interview.

### Sub-block 3 — the breakpoint

The breakpoint to revisit is "an AI surface emerges that fundamentally requires user input the visualizer can't precompute." Specifically: a tokenization page works fine in-browser via WASM (no breakpoint). An embeddings page works fine with precomputed corpus + in-browser cosine (no breakpoint, *unless* the teaching value of "type your own sentence" outweighs the bundle cost of shipping a 30MB Transformers.js embedding model). A RAG page where the user types their own query against a precomputed corpus also works (no breakpoint). The breakpoint is "the user wants to upload their own corpus and search it" — which is the moment reincodes is no longer the visualizer host and the work belongs in loopd or a new project entirely. Until that moment, pure-viz is the right call.

### Sub-block 4 — what wasn't actually a tradeoff

"Build the AI features somewhere else and embed them in reincodes via iframe" was not a real alternative. iframe-embedded demos lose the visual cohesion of the site (different fonts, different layout), fail to participate in the basePath contract, and add a hosting dependency on whatever the iframe points at. The four planned visualizers run *inside* reincodes' React tree because that's the only shape that preserves the visual and architectural contracts that make reincodes coherent as a site.

---

## Tech reference (industry pairing)

### Next.js 15 (already in the project)

- **Codebase uses:** Next.js 15.5.15 with App Router and `output: "export"`. See `next.config.ts` and `package.json`. Every page is `"use client"`.
- **Why it's here:** the framework that turns `src/app/**/page.tsx` into a static-HTML bundle. Without `output: "export"`, the GitHub Pages deploy doesn't work.
- **Leading today:** Next.js — adoption-leading for React-based static + SSR sites, 2026.
- **Why it leads:** App Router unifies static and dynamic rendering, the export mode is a first-class build target, and the React 19 ecosystem assumes Next.
- **Runner-up:** Astro — innovation-leading for content-first static sites with islands of interactivity; Vite + React Router for SPA-only builds; Remix (now React Router v7) for SSR-first apps.

### GitHub Pages (the deploy target)

- **Codebase uses:** `.github/workflows/deploy.yml` builds and publishes to GitHub Pages with `basePath: "/reincodes"` in production. The single hosting layer.
- **Why it's here:** zero-cost CDN-served static hosting that doesn't require any infrastructure decisions. The site has been up since the curriculum positioned reincodes as the viz surface.
- **Leading today:** GitHub Pages — adoption-leading for "free static hosting tied to the repo," 2026.
- **Why it leads:** free, no separate account, configurable via repo settings, custom-domain capable. Default pick when the project is "static + open source."
- **Runner-up:** Cloudflare Pages or Vercel — innovation-leading with better Lighthouse / faster CDN; Netlify Free is the third option for similar shape.

### (No AI SDK)

- **Codebase uses:** *nothing in `package.json` from any AI provider.* No `@anthropic-ai/sdk`, no `openai`, no `cohere-ai`, no `langchain`. This is the deliberate choice.
- **Why it's here:** the absence is the design. reincodes' runtime knows nothing about LLMs. The four planned visualizers either bundle WASM tokenizers (no SDK needed) or rely on precomputed JSON produced by dev-only build scripts (SDK lives in a scripts/ directory, not shipped to the browser).
- **Leading today:** the relevant SDK is dictated by what the build script targets. For embeddings: OpenAI SDK or `@anthropic-ai/sdk` — adoption-leading, 2026.
- **Why it leads:** if and when a build script runs, it should be the official provider SDK to keep the script simple, typed, and current with the provider's API.
- **Runner-up:** LangChain / LlamaIndex — innovation-leading abstractions, but the abstraction tax exceeds the savings for a single-purpose embed-the-corpus script. The build scripts here would never need them.

---

## Project exercises

The four exercises listed below are the same exercises detailed in the per-concept files. They appear here as a *batch* — the buildable AI engineering surface for reincodes — so the reader sees them as a coherent next sprint rather than four separate items.

### [B-reincodes-tokenization] Tokenization visualizer

- **Exercise ID:** Curriculum reference: `[C1.1]` + interview-prep entry `Tokenization visualizer [exercises C1.1]`.
- **What to build:** see `01-tokenization.md` for the full spec. A page at `/ai/tokenization` with a textarea, in-browser WASM tokenizer, and color-coded token chips.
- **Why it earns its place:** the gap between `string.length` and token count is the single most common bug in early LLM work; visualizing it is high-value.
- **Files to touch:** `src/app/ai/tokenization/page.tsx`, `src/workers/tokenizer.worker.ts`, `src/components/TokenChipList/`, `src/components/Home/conceptsData.tsx`.
- **Done when:** page loads, accepts paste/typing, encodes within 200ms, token count matches `tiktoken.encode(text).length` exactly. Build passes `next build` under `output: "export"`.
- **Estimated effort:** 1–2 days.

### [B-reincodes-embeddings] Cosine similarity playground

- **Exercise ID:** Curriculum reference: `[C2.1]` + interview-prep entry `Cosine similarity playground [exercises C2.1]`.
- **What to build:** see `02-embeddings-geometrically.md` for the full spec. A page at `/ai/embeddings` with 20 precomputed sentence embeddings in 2D via t-SNE, nearest-neighbor highlighting on click.
- **Why it earns its place:** the geometric intuition for what embeddings are is the foundation for debugging RAG; without it, "the wrong chunk was retrieved" has no diagnostic.
- **Files to touch:** `scripts/embed-corpus.ts`, `public/embeddings/corpus.json`, `src/app/ai/embeddings/page.tsx`, `src/components/EmbeddingsPlot/`, `src/utils/cosine.ts`, `src/components/Home/conceptsData.tsx`.
- **Done when:** page loads under 1MB, all 20 points render, clicking shows the 3 nearest by cosine, scores match the in-page utility output. Build passes `next build` under `output: "export"`.
- **Estimated effort:** 1–2 days.

### [B-reincodes-rag] RAG pipeline visualizer

- **Exercise ID:** Curriculum reference: interview-prep entry `RAG pipeline visualizer [exercises C2.1, C2.4, C2.6]`.
- **What to build:** see `03-rag-pattern.md` for the full spec. A page at `/ai/rag` animating the five RAG stages against a precomputed corpus, with a toggle between *loopd-shape* (synthesis prose) and *aipe-shape* (spec markdown) RAG.
- **Why it earns its place:** RAG is the single most-asked AI engineering interview pattern, and the failure modes are all in the pipeline, not in the LLM.
- **Files to touch:** `scripts/build-rag-corpus.ts`, `public/rag/corpus.json`, `src/app/ai/rag/page.tsx`, `src/components/RAGPipeline/`, `src/utils/cosine.ts`, `src/components/Home/conceptsData.tsx`.
- **Done when:** all five stages animate in sequence, toggling chunking strategy re-runs retrieval, toggling the loopd/aipe shape changes only the final prompt preview. Build passes `next build`.
- **Estimated effort:** 1 week.

### [B-reincodes-agent-loop] Agent loop animation

- **Exercise ID:** Curriculum reference: interview-prep entry `Agent loop animation [exercises C4.2]`.
- **What to build:** see `04-agents-and-tool-use.md` for the full spec. A page at `/ai/agent-loop` animating a ReAct loop turn-by-turn against precomputed example traces, with three preset cases (clear, ambiguous, off-distribution).
- **Why it earns its place:** most agent tutorials show the diagram and the prompt; almost none show *one turn at a time, with the model's thought visible*, which is the actual teaching surface.
- **Files to touch:** `public/agent-loop/example-*.json`, `src/app/ai/agent-loop/page.tsx`, `src/components/AgentLoopVisualizer/`, `src/components/Home/conceptsData.tsx`.
- **Done when:** three preset traces play through correctly, "step" advances one turn at a time, termination conditions named in the UI. Build passes `next build`.
- **Estimated effort:** 1–2 days.

### Building all four — total scope estimate

If sequenced as one sprint: ~2 weeks calendar (one tokenization day, one embeddings day, a week for RAG, two days for the agent loop). The shared utilities (`src/utils/cosine.ts`, the `"ai-engineering"` category in `conceptsData.tsx`) get built once and reused across the latter three. The shared bundle decisions (worker for tokenizer, precomputed JSON pattern, route-chunked under `/ai/*`) get made once at the start.

---

## Interview defense

### What an interviewer is really asking

When an interviewer asks "what AI features have you built?" and the answer for reincodes is "none — it's my visualizer site," they're checking whether you understand *what kind of project this is*. The senior+ candidate names the gap deliberately ("reincodes is the visualizer surface; the actual AI work lives in loopd, aipe, and contrl-mo, with reincodes as the teaching layer") and references the curriculum's three-shape framing as the rationale. The junior candidate either inflates the visualizer's role ("well, the algorithm pages are *kind of like* AI...") or apologizes for the gap. The interview point is that the project's role is intentional.

### Likely questions

[mid] Q: Walk me through the AI features in this app.

A: There are none in production code today — reincodes is a Next.js static-export DSA visualizer. The curriculum I'm working through positions it as the "interview prep visualizer host" — a place where AI concepts get visualized for teaching, not a place where AI features run for users. The buildable surface is four visualizer pages — tokenization, embeddings, RAG pipeline, agent loop — each one route-chunked under `/ai/*`, each one using precomputed examples or in-browser WASM so the static-export contract stays intact. The actual AI work in my portfolio lives in three other projects, with deliberately different shapes — loopd for LLM application engineering, aipe for prompt engineering as a discipline, contrl-mo for classical ML.

Diagram:
```
My portfolio — three shapes deliberately separated
──────────────────────────────────────────────────

  reincodes       │  visualizer host          │  THIS PROJECT
                  │  (DSA + planned AI viz)   │
  ────────────────┼───────────────────────────┼──────────────────
  loopd           │  LLM application eng      │  AI shape 1
                  │  (5 chains + RAG)         │
  ────────────────┼───────────────────────────┼──────────────────
  aipe            │  prompt eng + meta-tooling│  AI shape 2
                  │  (templates + slash cmds) │
  ────────────────┼───────────────────────────┼──────────────────
  contrl-mo       │  classical supervised ML  │  AI shape 3
                  │  (form classifier + recs) │
```

[senior] Q: Why didn't you just add AI features to reincodes directly? It's already the project everyone sees.

A: Two reasons. First, the static-export contract is load-bearing — `output: "export"` in `next.config.ts` is what lets the site ship to GitHub Pages for free with no infrastructure. Adding a server route to call an LLM would mean leaving GH Pages, picking a host, managing API keys, and paying for compute. That's not a tradeoff I want to pay for a portfolio site. Second, mixing shapes hurts the interview story — the three-shape portfolio (LLM app + prompt eng + classical ML) is what differentiates me from candidates who have only consumed pre-trained LLMs. If reincodes also did LLM stuff, it'd duplicate loopd's role without adding signal. Keeping it pure-viz preserves both the deploy simplicity and the portfolio clarity.

Diagram:
```
What we picked: pure-viz reincodes + 3 separate AI projects
                ─────────────────────────────────────────────
                Hosting:   GH Pages, $0
                Story:     "three shapes of AI work"
                Risk:      static-export stays simple

What we didn't: add LLM features to reincodes
                ─────────────────────────────
                Hosting:   $5+/mo, secrets management
                Story:     "two projects do LLMs, kind of"
                Risk:      reincodes becomes "loopd lite"
                           (loses its actual job)
```

[arch] Q: When would reincodes graduate from "viz host" to "AI app"?

A: When the visualizer category grows past 4–6 pages and there's a clear user demand for something only a live model can give — e.g., "let me upload my own corpus and search it" or "let me chat with the visualization to understand it." That demand isn't there today; the planned visualizers all teach with precomputed examples that show structure without needing a live model. If it ever shifts, the migration is non-trivial: I'd need to leave the static-export contract behind, pick a hosting provider with edge functions or SSR, manage provider API keys, and add observability. Until that demand exists, the breakpoint isn't worth crossing.

Diagram:
```
Today's boundary                      Future boundary
────────────────                      ───────────────

reincodes runtime:                    reincodes runtime:
  - browser                             - browser
  - 0 secrets                           - edge function or SSR
  - 0 server compute                    - secret management
                                        - hosting cost
                                        - LLM token cost
Visualizers:                          Visualizers:
  - precomputed examples                - precomputed + live user input
                                        - real-time corpus uploads
Static-export contract:               Static-export contract:
  ✓ preserved                           ✗ broken (migration done)
```

### The question candidates always dodge

Q: Be honest — isn't it a stretch to have an "AI engineering" section in a project's study guide when the project itself doesn't use AI?

A: It's only a stretch if you think the project's study guide is a description of what the project does today. It's not — it's a study guide for what the project's role in the curriculum is. The curriculum positions reincodes as the interview-prep visualizer host. The "AI engineering" section in this study guide is the buildable surface area for that role — four concrete visualizer pages with specs detailed enough that someone could implement them straight from the markdown. The honest framing is: "reincodes doesn't ship AI today, but here are the four pages it will ship when the curriculum's interview-prep phase runs, and here's why those four were chosen." The interview move is to be explicit about the gap instead of pretending the existing recursion viz is "kind of AI." It isn't. It's recursion. The AI surface is the planned one, and the plan is real.

Diagram:
```
What we said            vs   What we did NOT say
─────────────                ──────────────────
"4 visualizer pages          "Recursion viz is kind
 are planned, here is         of AI because it's a
 each spec, each file         search algorithm."
 path, each effort
 estimate, each              "Sorting is AI because
 done-when."                  it's a learned ordering."

(Honest gap with a            (Inflated framing —
 buildable plan)              treats every algorithm
                              as AI. Junior signal.)
```

### One-line anchors

- "reincodes is the visualizer host; the actual AI work lives in three other projects."
- "The static-export contract is load-bearing — adding AI runtime would cost the deploy simplicity."
- "The four planned visualizers cover the LLM foundations the curriculum needs for interview-prep."
- "Mixing shapes hurts the interview story; keeping reincodes pure-viz keeps the three-shape portfolio sharp."
- "The buildable plan is real — every page has a spec, files, and an effort estimate. The plan is not a wish list."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw the "today vs when the curriculum ships" comparison from memory — what changes, what doesn't.

Open the file. Compare.

- Did you show that the production runtime stays browser-only in both states?
- Did you show that no AI SDK lands in `package.json` even after the visualizers ship?
- Did you note the two new build scripts (`embed-corpus.ts`, `build-rag-corpus.ts`) and the new conceptsData category?

### Level 2 — Explain it out loud

Explain reincodes' AI surface to an interviewer who just asked "tell me about the AI features in this codebase." No notes. Under 90 seconds.

Checkpoints — did you:
- Say "none in production today" without flinching?
- Name the curriculum's three-shape framing (loopd / aipe / contrl-mo) and reincodes' role within it?
- Name the four planned visualizers as a buildable batch?
- Reference the static-export contract as the reason for the design?

### Level 3 — Apply it to a new scenario

Answer this without looking at the file:

"A teammate suggests adding 'one little AI feature' to reincodes — say, an LLM-powered explainer that generates English narration of the current sorting step. The idea is to dogfood AI in the visualizer site. Walk through the decision. Would you do it? What would change?"

Write your answer. 3–5 sentences minimum.

### Level 4 — Defend the decision you'd change

The pure-viz framing of reincodes is the biggest architectural call in this file. Answer in writing:

"If you were starting reincodes today, knowing what you know now, would you keep it pure-viz or would you architect it as 'static-by-default with an opt-in edge runtime for AI features'? Why? What would each cost?"

Reference the actual constraints:
- Point to `next.config.ts` (`output: "export"`).
- Point to the curriculum's three-shape framing.

### Quick check — code reference test

Without opening any files, answer:
- What's the new route prefix the four AI visualizers would live under?
- What's the new category name in `CONCEPT_CATEGORIES`?
- What two build scripts would the `scripts/` directory hold?
- Which two existing components would the new AI visualizers parallel structurally?

Then open the files and verify.

- Pass: `/ai/*`.
- Pass: `"ai-engineering"`.
- Pass: `scripts/embed-corpus.ts`, `scripts/build-rag-corpus.ts`.
- Pass: `CallstackVisualizer` (parallels `AgentLoopVisualizer`); `NetworkDiagram` (parallels `EmbeddingsPlot` via shared d3 usage).

---

## Summary

This is the meta file for AI in reincodes. Today the production code has no AI surface — that's deliberate, because the static-export contract and the three-shape portfolio framing both depend on reincodes staying pure-viz. The buildable AI surface is the four visualizer pages from the four sibling concept files in this directory: tokenization, embeddings, RAG, agent loop. Each is route-chunked under `/ai/*`, each uses precomputed examples or in-browser WASM, none breaks the static-export contract.
