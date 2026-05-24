# Single-purpose chains

**Industry name(s):** Single-purpose chains, pipeline pattern, one-job-per-chain, chain decomposition
**Type:** Industry standard

> The production-cheap, debuggable, swap-able shape of an LLM pipeline — one chain, one job, composed end-to-end. The anti-monolith pivot you make the second time you've shipped LLM features.

**See also:** → [01-anatomy](01-anatomy.md) · → [02-structured-outputs](02-structured-outputs.md) · → [07-output-mode-mismatch](07-output-mode-mismatch.md) · → [09-chain-of-thought](09-chain-of-thought.md)

---

## Why care

### Move 1 — The grounded scenario

You build a feature that takes a journal entry and does three things: tag it, find related past entries, and write a one-paragraph summary. The first version is one big prompt — "given this entry, return JSON with tags, related entries, and a summary." It works on the demo. You ship it. Three weeks later, the summary starts coming back markdown-fenced; the tags are duplicating entries from the related-entries list; the related-entries field sometimes contains tag strings instead of entry IDs. You add a retry on schema fail. The retry sometimes works, sometimes returns the schema-shaped JSON with empty arrays. The next sprint you spend two days trying to figure out which of the three subtasks went wrong, because the model failed *one* of them and the entire response is now garbage.

### Move 2 — Name the question

That failure mode has a name — *multi-purpose chain decay*. The pattern that prevents it is *single-purpose chains*: each chain does one job, returns one output shape, gets composed into the larger pipeline at the application layer. The question this concept answers is *how do you carve an LLM feature into chains so that each chain is independently debugged, independently evaluated, and independently swappable*. Not "how do you write a clever prompt"; how do you *cut* the work into prompts.

### Move 3 — Why answering that question matters

**Why you need to answer that question at all:** because every LLM pipeline has a knee — a complexity threshold past which the single mega-prompt stops being cheaper-to-write and starts being expensive-to-debug. I have shipped both shapes. The first feature where I went mono-prompt looked clean for six weeks and then a downstream consumer changed its schema expectations, and the whole prompt had to be rewritten because the three subtasks had been entangled at the template level. The first feature where I went single-purpose looked like over-engineering for the first month and then *paid for itself in a single afternoon* — a customer complaint about the summarizer was traced in fifteen minutes to the summarizer chain, fixed by editing one prompt file, re-evaluated against its own golden set, and shipped without touching the tagger or the retriever.

### Move 4 — Concrete before/after

Without single-purpose chains:

- One 180-line prompt that does tag + retrieve + summarize
- One JSON schema with three top-level fields
- One eval set that scores all three subtasks at once
- One model (the biggest you can afford, because the prompt is doing everything)
- When tagging regresses, you can't tell whether the tagger logic changed or the summarizer changed
- Cost per call: ~$0.04 (large model, ~6k tokens of context + examples for three jobs)

With single-purpose chains:

- Three chains: `tagEntry` (small model, classifier), `findRelated` (small model, similarity scoring), `summarizeEntry` (large model, generation)
- Three schemas, each one field
- Three eval sets, each focused on one chain
- Three models, each picked for its chain's job
- When tagging regresses, you bisect to the tagger chain and only the tagger
- Cost per call: ~$0.012 (small models do the two cheap jobs, large model only summarizes)

### Move 5 — The one-line summary

A single-purpose chain is one prompt with one job, one schema, one model — composed with siblings at the application layer rather than collapsed into a mega-prompt. Analogous to how a React component tree splits responsibilities into focused components instead of one God component holding all state. The full mechanics are below.

---

## How it works

### Move 1 — The mental model

A multi-purpose chain is the LLM-equivalent of a 500-line React component that owns its own state, fetches three different APIs, renders three different UI shapes, and handles three different error cases. It works until someone needs to change one of the three shapes, at which point the blast radius is the whole component. A single-purpose chain is the same component split into three sibling components composed by a parent: each handles one job, each is independently testable, each can be re-rendered (re-run) without touching the others.

The strategy: when you can name two distinct outputs the chain is producing, that's two chains. The naming test is the carve.

```
Multi-purpose chain                Single-purpose chains
───────────────────────            ─────────────────────────────

   ┌───────────────────┐                     ┌────────────┐
   │                   │              ┌────► │ tagEntry   │ ──► tags[]
   │   one mega-       │              │      └────────────┘
   │   prompt          │   user       │
   │                   │   input ─────┼────► ┌────────────┐
   │   does:           │              │      │ findRelated│ ──► ids[]
   │   - tagging       │              │      └────────────┘
   │   - retrieval     │              │
   │   - summarizing   │              └────► ┌────────────┐
   │                   │                     │ summarize  │ ──► text
   └───────────────────┘                     └────────────┘
            │
            ▼
   one giant JSON
   (tags + related + summary)        composed at the application layer
```

### Move 2 — The layered walkthrough

#### The pipeline pattern

The technical thing: every LLM feature is decomposed into a directed acyclic graph of chains, where each node is a chain with one input shape and one output shape, and edges are the application-layer code that passes one chain's output to the next chain's input. Bridge from frontend: this is component composition — a `<EntryDetail>` page composes `<TagList>`, `<RelatedEntries>`, and `<Summary>`, each of which owns its own data shape and rendering logic. Concrete consequence: the pipeline is *visible in code* at the application layer, not hidden inside a prompt template. You can read the pipeline in TypeScript without opening any prompt files.

```
pipeline as TS at the application layer

 const tags        = await tagEntry(entry)            // chain 1
 const relatedIds  = await findRelated(entry, tags)    // chain 2
 const summary     = await summarizeEntry(entry, tags) // chain 3

 return { tags, relatedIds, summary }                  // shape composed in TS,
                                                       // not in a prompt
```

#### The debugging benefit

The technical thing: when output regresses, the bisect is one level above the prompt — *which chain's output went wrong* — instead of one level inside the prompt — *which paragraph of the mega-prompt is responsible*. Bridge from frontend: this is the React DevTools component tree — you click the broken component, you don't search the whole render output for the bug. Concrete consequence: the time-to-diagnose for a regression drops from "two days of bisecting prompt paragraphs" to "fifteen minutes of looking at the chain's eval set." I have actually measured this on two different production codebases; the ratio holds.

```
debugging cost — multi vs single

 multi-purpose                       single-purpose
 ─────────────                       ──────────────
 "output is wrong"                   "output is wrong"
   ↓                                   ↓
 "which of 3 subtasks?"              run pipeline trace
   ↓                                   ↓
 read 180-line prompt                "chain 2 returned wrong shape"
   ↓                                   ↓
 bisect by commenting out            open chain 2's prompt
 paragraphs                          + eval set, iterate
   ↓                                   ↓
 ~2 days                              ~15 minutes
```

#### The model-routing benefit

The technical thing: each chain picks its own model based on the chain's job. Classifiers are small (Haiku, GPT-4o-mini); generators are large (Sonnet, GPT-4o); the rare reasoning chain might warrant Opus. With a multi-purpose chain you're forced to pick one model for all jobs, which means paying the large-model price even for the classifier subtask. Bridge from frontend: this is code-splitting — you don't ship the heavy editor bundle on the marketing page. Concrete consequence: a five-chain pipeline that routes correctly can cost 30–60% less than the same logic in one mega-prompt on the largest model.

```
model-routing economics — same feature, two shapes

 multi-purpose                        single-purpose
 ─────────────                        ──────────────
 Sonnet × 1 call                      Haiku × 2 calls (tag + retrieve)
   $0.04/call                           + Sonnet × 1 call (summarize)
   for everything                       $0.001 + $0.001 + $0.010
                                        = $0.012/call
 = 100% baseline                       = 30% baseline
                                       70% saving, scales with traffic
```

#### The model-swap benefit

The technical thing: when a new model lands (Sonnet 4 → Sonnet 5, or you want to try GPT-5 for one chain), you swap *one* chain's model in isolation, re-run that chain's eval set, and ship if the score improves. With a multi-purpose chain, swapping the model means re-evaluating *all three subtasks at once*, and any one of them regressing blocks the swap. Concrete consequence: model upgrades become a per-chain decision, which means you can adopt the new model where it helps and stay on the old one where it doesn't.

#### The failure mode of multi-purpose chains

The technical thing: when a multi-purpose chain fails one of its subtasks, *the whole response is wrong*. The model returns the schema-shaped JSON with garbage in one field, your application has no way to know one field is bad, and the failure propagates to whichever consumer uses that field. The schema parse succeeds; the semantic check fails silently. Concrete consequence: silent partial failures become the dominant failure mode in production, and they show up as "the summarizer is bad sometimes" customer reports months after they started happening.

```
multi-purpose silent partial failure

 model returns:                       schema parse:      ✓ passes
   { tags: ["work","todo"],           tag consumer:     ✓ ok
     related: ["abc","def"],          related consumer: ✓ ok
     summary: "[summary of OTHER      summary consumer: ✓ runs (string is valid)
              entry by mistake]"      end user:         ✗ confused
   }
                                      bug surfaces:     weeks later, via support
```

### Move 3 — The principle

The principle that generalises beyond LLM pipelines: *single-responsibility scales; combined-responsibility doesn't*. This is the same principle as Unix's "do one thing well," React's "one component, one concern," the SOLID single-responsibility rule for functions, and microservices' bounded-context decomposition. LLM chains are the newest place to apply it, and the discipline arrives later there because the cost of an extra prompt *feels* like duplication when in fact it's separation of concerns. The day you take the single-purpose pivot is the day you treat chains as code units instead of as one-off prompt-engineering puzzles.

The full picture is below.

---

## Single-purpose chains — diagram

```
┌─ The pipeline (application-layer code) ────────────────────────────┐
│                                                                    │
│   input (journal entry)                                            │
│       │                                                            │
│       ▼                                                            │
│   ┌──────────────────┐                                             │
│   │ chain 1: tagEntry│                                             │
│   │  model:  Haiku   │  ──► tags: string[]                         │
│   │  schema: {tags}  │                                             │
│   │  eval:   tagger.json (golden set of 30)                        │
│   └──────────────────┘                                             │
│       │                                                            │
│       ▼                                                            │
│   ┌──────────────────┐                                             │
│   │ chain 2: related │                                             │
│   │  model:  Haiku   │  ──► related: id[]                          │
│   │  schema: {related}│                                            │
│   │  eval:   related.json (20 pairs)                               │
│   └──────────────────┘                                             │
│       │                                                            │
│       ▼                                                            │
│   ┌──────────────────┐                                             │
│   │ chain 3: summary │                                             │
│   │  model:  Sonnet  │  ──► summary: string                        │
│   │  schema: {text}  │                                             │
│   │  eval:   rubric LLM-judge on 25 entries                        │
│   └──────────────────┘                                             │
│       │                                                            │
│       ▼                                                            │
│   compose at TS layer:                                             │
│     { tags, related, summary }                                     │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
                              vs
┌─ The monolith (everything in one prompt) ──────────────────────────┐
│                                                                    │
│   input ──► one 180-line prompt ──► one JSON blob with 3 fields    │
│                                                                    │
│   - one model picked for everything (over-pays on cheap jobs)      │
│   - one schema; one regression = whole pipeline regression         │
│   - one eval set scoring 3 jobs at once (signal muddled)           │
│   - model swap re-evaluates all 3 jobs (blocks adoption)           │
│   - silent partial failure: schema passes, one field is wrong      │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

The boundary between the upper band (chain-per-job) and the lower band (one mega-chain) is the discipline this concept names. Crossing it isn't a model-quality decision; it's a debuggability and economics decision.

---

## In this codebase

**Not yet implemented.** reincodes is a Next.js static-export DSA visualizer with no AI surface in production code — there are zero LLM chains in the repo to decompose, and the static-export contract (`output: "export"` in `next.config.ts`) keeps it that way. The buildable target for this concept is below in Project exercises — a `/ai/single-purpose-chains` page that renders a 3-stage pipeline (classify → retrieve → generate) as connected boxes against precomputed outputs, with a toggle between "single-purpose mode" and "monolithic mode" so the reader can see the failure modes of mixing jobs in one prompt.

**Expected file paths** (when built):
- `src/app/ai/single-purpose-chains/page.tsx` — the visualizer page
- `src/components/SinglePurposeChainsVisualizer/` — pipeline graph, mode toggle, per-stage detail panels
- `public/ai/single-purpose-chains/pipeline-outputs.json` — precomputed outputs for both modes (single-purpose: 3 stages × N inputs; monolithic: 1 stage × same inputs with deliberate partial failures)
- `scripts/precompute-pipeline-outputs.ts` — build-time script that runs both shapes through Claude and captures outputs

---

## Elaborate

### Where this pattern comes from

The single-purpose chain pattern crystallized in production LLM systems in 2023 as teams hit the same wall: the first mega-prompt feature ships fast, the second one ships slower, the third one is unmaintainable. The shift was driven by two forces — prompt caching APIs (which work best when the prompt prefix is small and stable, i.e., each chain has its own cacheable prefix) and the arrival of cheap small models like Haiku and GPT-4o-mini (which made model-per-chain economically real). The canonical writing is Anthropic's "Building effective agents" post (which distinguishes single-purpose workflow chains from agent loops) and Eugene Yan's "Patterns for LLM applications" — both argue that workflow composition of single-purpose chains is the right default and agent loops are the exception, not the norm.

### The deeper principle

The deeper principle is that *abstraction boundaries are debuggability boundaries*. Every place you can draw a line and say "this is one job, this is another job" is a place you can later say "this job regressed, that job didn't." The mega-prompt erases those lines, which means it erases the debuggability boundaries. You can't bisect a continuous surface. The single-purpose decomposition isn't about clean code aesthetics; it's about preserving the ability to localize a failure to a small piece of the system, which is the load-bearing skill for operating any production system. LLM chains are subject to this principle the same way Lambda functions, database queries, and React components are.

### Where this breaks down

The pattern breaks down in two places. First, *truly atomic tasks* — if a job is "extract structured data from a paragraph and validate it against a schema," there's no further decomposition that makes sense; one chain is correct. Forcing decomposition there just creates ceremony. Second, *interactive agent loops* — when the LLM is doing reasoning over its own previous outputs in a turn-based loop, the "one chain, one job" framing breaks because the agent's job is *itself the composition of sub-jobs decided at runtime*. Agent loops need a different framing (state machines over messages, tool routing, termination conditions) and the single-purpose decomposition still applies to the *tools* the agent calls, not to the agent loop itself.

### What to explore next

- [01-anatomy](01-anatomy.md) → each single-purpose chain has its own four-section anatomy; the decomposition gives anatomy a place to live per chain
- [02-structured-outputs](02-structured-outputs.md) → each chain's output schema is the contract that makes composition safe
- [07-output-mode-mismatch](07-output-mode-mismatch.md) → the specific failure when chain A's output type doesn't match chain B's input type
- [09-chain-of-thought](09-chain-of-thought.md) → when a chain *should* be doing multi-step reasoning vs when that's a sign it should be two chains

---

## Tradeoffs

### Comparison table — both costs in one frame

```
┌──────────────────┬─────────────────────────┬─────────────────────────┐
│ Cost dimension   │ Path taken              │ Alternative             │
│                  │ (single-purpose chains) │ (one mega-prompt)       │
├──────────────────┼─────────────────────────┼─────────────────────────┤
│ Build time       │ 3–5 hours per chain     │ 1 hour for one prompt   │
│                  │ + composition layer      │                         │
│ Files added      │ N prompt files + N eval │ 1 prompt + 1 eval       │
│                  │ files + 1 pipeline.ts   │                         │
│ Cognitive load   │ Read the pipeline.ts to │ Read one prompt to      │
│                  │ see the shape           │ see everything          │
│ Per-call cost    │ Often 30-60% cheaper    │ Largest model × every   │
│                  │ via per-chain routing   │ job                     │
│ Debuggability    │ Bisect by chain         │ Bisect by paragraph     │
│ Eval signal      │ Per-chain score is the  │ Aggregate score muddled │
│                  │ same as job score       │ across subtasks         │
│ Model upgrades   │ Per-chain adoption      │ All-or-nothing upgrade  │
│ Partial failures │ One chain returns bad   │ Schema passes, one      │
│                  │ → caught, retried       │ field silently wrong    │
│ Prompt caching   │ Per-chain prefix caches │ Cache prefix changes    │
│                  │ independently            │ when any subtask edits  │
│ Onboarding       │ New contributor sees    │ New contributor reads   │
│                  │ named chains in TS      │ 180-line prompt blob    │
└──────────────────┴─────────────────────────┴─────────────────────────┘
```

### What we gave up (when planning the reincodes visualizer)

The first cost is *precompute matrix complexity*. To make the visualizer honest, both modes need outputs against the same inputs — and the monolithic-mode outputs need to demonstrate the actual failure modes (silent partial failure, schema-passes-but-wrong-field, occasional mode drift). That means the precompute script can't just run each shape once; it needs to run each input through the monolithic prompt enough times to *catch* a failure to embed in the example set. Either we run the script 10× per input until a failure shows up (expensive, non-deterministic, hard to commit cleanly), or we hand-craft "representative failures" in the precomputed JSON (cheap, deterministic, slightly less honest). The honest path costs ~$15-30 in API calls per regeneration; the curated path costs nothing but introduces a "we picked the failures" caveat. Either way, it's a real precompute design decision before any page renders.

The second cost is *visualizer state surface*. The page needs to track: which input is selected (out of ~5), which mode is active (single-purpose vs monolithic), which stage is being inspected (1, 2, or 3 in single-purpose mode; collapsed in monolithic mode), and whether the "show failure" toggle is on (which surfaces the silent partial failure in monolithic mode). That's a 4-axis state machine, which is more than any existing reincodes visualizer carries — the most stateful current page (`finding-shortest-path`) is roughly 2-axis. So the visualizer-component design lifts to a tier the codebase hasn't paid for before.

The third cost is *teaching surface clarity*. The page needs to show the *failure* of the monolithic shape, not just the difference in code structure. If the reader can only see "monolithic has one box, single-purpose has three" they haven't learned the lesson. The lesson is "the one-box version fails in ways you can't observe." Demonstrating that visually requires the visualizer to *animate* the silent failure — e.g., highlight the field that's wrong in the monolithic output, color-code stages green/red in single-purpose mode. That's a meaningful interaction-design lift on top of the precompute work.

### What the alternative would have cost (skipping the visualizer)

If reincodes never builds the single-purpose-chains visualizer, the cost is zero in this codebase. The pattern still gets exercised in loopd's 5-chain architecture (per the curriculum) and the discipline still gets named in this written guide. The reincodes site stays pure-DSA and the teaching of the pipeline pattern happens in the curriculum's project artifacts.

The cost of *not* building it shows up in the portfolio story: pipeline-pattern teaching is hard to demonstrate in a code repo because the lesson is *the absence* of a feature in the monolithic version. A reader looking at loopd's 5 chains might think "ok, you wrote 5 chains, that's just style" — without seeing what the 1-chain version would have looked like and failed at. The visualizer is the only way to put both shapes side-by-side at the same interaction level.

### The breakpoint

The visualizer earns its place the day the candidate is preparing for an interview round that includes "how do you decompose an LLM feature into chains" as a senior-level question. The visualizer becomes the demo answer: "here's a 3-stage pipeline; flip this toggle to see the monolithic shape; watch what happens to the summarizer field when the mode is wrong." Until that interview pressure exists, the buildable target stays in the backlog. The breakpoint is event-shaped, not quantitative.

### What wasn't actually a tradeoff

Live LLM calls in the visualizer were not a real option. The static-export contract (`output: "export"`) is load-bearing — it's what lets reincodes ship to GitHub Pages with no infrastructure, no API keys, no monthly bill. A live visualizer would mean leaving GH Pages, configuring secrets, paying for rate limits, and managing per-mode failure rates against an actual API. Precomputed outputs are the only option compatible with the deploy story; they also turn out to be *better* for teaching because failure modes can be curated to be observable rather than waiting for the live model to misbehave.

---

## Tech reference (industry pairing)

### Anthropic Messages API

- **Codebase uses:** not yet — the planned `/ai/single-purpose-chains` visualizer would use Claude as the precompute target. Three small chains run against Haiku, one chain runs against Sonnet for the generation stage, and the monolithic version runs against Sonnet (since the monolithic mega-prompt is expensive enough to need the larger model).
- **Why it's here:** Anthropic publishes model-routing guidance in its "Building effective agents" post that explicitly recommends single-purpose chain decomposition with per-chain model selection. The visualizer leans on that recommendation.
- **Leading today:** Anthropic Messages API — `adoption-leading` for production LLM chain composition, 2026.
- **Why it leads:** the model family (Haiku / Sonnet / Opus) is tiered for per-chain routing, prompt caching applies per-chain prefix, and tool-use schemas make per-chain output contracts explicit.
- **Runner-up:** OpenAI Chat Completions — `adoption-leading` in raw deployments; the GPT-4o / GPT-4o-mini tier is the same routing shape but the prompt caching API arrived later and is less mature.

### LangGraph (or Inngest / custom DAG)

- **Codebase uses:** not yet — the visualizer wouldn't *use* a workflow engine (the 3-stage pipeline is hand-composed in TS for clarity) but the concept page would reference workflow engines as the production answer for pipelines of 5+ chains.
- **Why it's here:** when single-purpose chains compose into pipelines of nontrivial size, the composition layer earns its own abstraction. LangGraph is the most-adopted shape for that abstraction in 2026.
- **Leading today:** LangGraph — `adoption-leading` for LLM workflow orchestration, 2026.
- **Why it leads:** the graph abstraction maps directly to "nodes are chains, edges are application-layer code," and the framework gives state management + retry policies + tracing without locking you into a specific provider.
- **Runner-up:** Inngest — `innovation-leading` durable-workflow framework that's not LLM-specific but works well for chain orchestration; also a custom TS pipeline (which is what loopd actually uses, per the curriculum) for pipelines of < 5 chains.

### Zod (TypeScript schema library)

- **Codebase uses:** not yet — would define the per-chain output schema for each of the 3 stages in single-purpose mode (`tagSchema = z.object({tags: z.array(z.string())})`, etc.) so the precompute script can validate each stage's output before committing the JSON.
- **Why it's here:** the single-purpose chain pattern's load-bearing benefit is that each chain has its own output contract. Zod is the way to make those contracts type-checkable in TypeScript.
- **Leading today:** Zod — `adoption-leading` for TS-first schema validation, 2026.
- **Why it leads:** `z.infer<>` gives compile-time types from runtime schemas; per-chain schemas can be exported and reused as both the validation target for the chain's output and the input type for the next chain.
- **Runner-up:** Valibot — `innovation-leading` modular schema validator with a smaller bundle footprint; relevant if the precomputed-JSON shape gets large enough that the validator's bundle cost matters in the static export.

---

## Project exercises

### [B-reincodes-single-purpose-chains-viz] Build the single-purpose-chains visualizer

- **Exercise ID:** `[B-reincodes-single-purpose-chains-viz]` — derived from the curriculum's reincodes "interview prep surface" entry; aligns with Phase 1 concept `[C1.10]` (single-purpose chains vs agent loops) and the "AI engineering" category planned in `src/components/Home/conceptsData.tsx`.
- **What to build:** a page at `/ai/single-purpose-chains` that renders a 3-stage pipeline (classify → retrieve → generate) as connected boxes. A mode toggle at the top of the page switches between "single-purpose" (three boxes, three named models, three schema badges) and "monolithic" (one big box, one model, one schema with three fields). In single-purpose mode, clicking any box opens a detail panel showing that chain's prompt, model, output, and per-chain cost. In monolithic mode, the single box shows the whole prompt and the JSON output — with a "show failure" toggle that highlights the silent partial failure (the summary field shows content from a different input than the tags field used). The reader sees, in one interaction, *why* single-purpose chains exist — flip to monolithic, toggle "show failure," watch the JSON parse successfully but the summary be wrong.
- **Why it earns its place:** the visualizer makes the decomposition *observable*. Most teaching of single-purpose chains is "trust me, it scales better" — this page lets the reader poke the monolithic shape until they see the failure with their own eyes. The interview signal is that the candidate built a tool that demonstrates the failure mode rather than just naming it.
- **Files to touch:** `src/app/ai/single-purpose-chains/page.tsx` (visualizer page), `src/components/SinglePurposeChainsVisualizer/` (pipeline graph + mode toggle + per-stage detail panel + failure highlight), `public/ai/single-purpose-chains/pipeline-outputs.json` (precomputed outputs for both modes against 5 example inputs), `scripts/precompute-pipeline-outputs.ts` (build-time script that runs both shapes through Claude with the per-mode model routing and captures outputs + costs). Add a row to `src/components/Home/conceptsData.tsx`'s `CONCEPT_CATEGORIES` under the new `ai-engineering` category (shared with the other planned `/ai/*` visualizers).
- **Done when:** the page loads at `/reincodes/ai/single-purpose-chains/` in production (GitHub Pages), 5 example inputs render with both modes, toggling modes re-renders the visualizer without a network call, the "show failure" toggle in monolithic mode highlights the wrong field in the JSON output. `next build` passes under `output: "export"`. The precompute script runs successfully against the actual Anthropic API locally (Haiku × 2 + Sonnet × 1 in single-purpose mode; Sonnet × 1 in monolithic mode), captures real costs, commits the JSON.
- **Estimated effort:** 2–3 days. Precompute script + JSON shape: half day (the per-mode routing makes this slightly larger than the prompt-anatomy precompute). Page + visualizer component: 1 day (the 4-axis state machine plus the failure-highlight animation is the lift). Polish + cross-browser testing of the mode toggle and detail panels: half to full day.

---

## Summary

### Part 1 — concept recap

A single-purpose chain is one prompt with one job, one schema, one model, composed with sibling chains at the application layer rather than collapsed into a multi-purpose mega-prompt. The benefit is *debuggability* (per-chain bisect when output regresses), *economics* (per-chain model routing — small models for classifiers, large for generation, often 30–60% cheaper than mega-prompt-on-largest-model), *eval signal* (per-chain score is the same as job score, not muddled across subtasks), and *model-upgrade adoption* (swap one chain's model at a time, re-run that chain's evals, ship if the score improved). In this codebase the pattern is *planned* rather than implemented: reincodes has no AI surface in production code, and the buildable target is a `/ai/single-purpose-chains` visualizer that renders a 3-stage pipeline with a toggle between single-purpose mode and monolithic mode, demonstrating the silent partial failure that monolithic chains exhibit. The constraint that makes the visualizer the right shape here is the static-export contract — live LLM calls would require leaving GitHub Pages, so precomputing the per-mode outputs at build time is the only path compatible with the deploy story.

### Part 2 — key points to remember

- **The carve test**: when you can name two distinct outputs the chain is producing, that's two chains. The naming test is the boundary.
- **The model routing**: each chain picks its own model. Classifiers go small (Haiku, GPT-4o-mini); generators go large (Sonnet, GPT-4o). Forcing one model across all subtasks is paying the large-model price on the cheap jobs.
- **The silent partial failure**: a mega-prompt can return schema-valid JSON with one field semantically wrong, and the application has no way to know. Single-purpose chains catch this at the per-chain validation step.
- **The reincodes shape**: implementation is Case B; the buildable target is a precomputed visualizer under `/ai/single-purpose-chains` with a mode toggle that demonstrates the failure mode of mixing jobs in one prompt.
- **The composition layer is code, not a prompt**: pipelines live in TypeScript at the application layer (`const tags = await tagEntry(...); const related = await findRelated(...)`), not inside a prompt template. The pipeline is readable in the IDE without opening any prompt files.

---

## Interview defense

### What an interviewer is really asking

Behind "how do you structure an LLM-powered feature?" the interviewer is probing whether the candidate has shipped enough LLM pipelines to have hit the multi-purpose chain failure mode. A junior answer describes single-purpose chains as a best practice ("you should have one prompt per task"). A senior answer describes the specific bug that made decomposition non-negotiable ("I shipped a mega-prompt feature that did tag + retrieve + summarize; the summarizer regressed silently because the JSON schema passed but the summary referenced the wrong entry's content; the bug surfaced in support tickets three weeks later and the fix was two days of bisecting prompt paragraphs"). The interviewer is checking whether the candidate distinguishes *demos* (mega-prompt is fine) from *production pipelines* (decomposition is hygiene).

### Likely questions

**Q (mid):** When do you split a prompt into multiple chains?

A: As soon as the prompt is doing two distinct jobs. The naming test: if I can name two outputs ("a list of tags" + "a paragraph summary"), that's two chains, even if both could fit in one prompt. The reason isn't aesthetic; it's that each chain gets its own model choice, its own eval set, its own schema, and its own debugging surface. The day the summarizer regresses, I want to bisect to the summarizer chain in fifteen minutes — not bisect to a paragraph in a 180-line mega-prompt over two days.

```
the carve test

  one output named?       → one chain
  two outputs named?      → two chains
  three+ outputs named?   → pipeline; compose at TS layer

  exception: if the two outputs are tightly coupled
  (e.g. "extract field A and field B from the same paragraph"),
  one chain with a structured-output schema is correct.
```

**Q (senior):** Walk me through the economics. Why is the 5-chain shape cheaper than the 1-chain shape?

A: Because each chain picks its own model. In a 5-chain pipeline, three of the chains are classifiers or extractors that run fine on Haiku at ~$0.001 per call. One is a retrieval-rerank step on Haiku at ~$0.001. The fifth is the generation chain that needs Sonnet at ~$0.010. Total: ~$0.014 per pipeline call. In the 1-chain shape, the whole thing runs on Sonnet (because the generation subtask needs it) at ~$0.040 per call. The 5-chain shape is roughly 1/3 the cost at scale, plus prompt caching applies per-chain prefix (the classifier prefix is stable across all journal entries, so it caches), which drops the cost further. The economic argument is *the reason* the pattern caught on — debuggability is the technical argument, but the CFO conversation is the model-routing one.

```
cost per pipeline call

 1-chain (all-Sonnet)         5-chain (per-job routing)
 ─────────────────────         ──────────────────────────
 Sonnet × 1                    Haiku × 4 + Sonnet × 1
   $0.040                        $0.004 + $0.010 = $0.014

 + no caching benefit          + per-chain prefix cache
   (prompt blob shifts          (stable per-chain prefixes
    every edit)                  cache, ~80% reduction on
                                 the cached subtotals)

 = ~$0.040/call                = ~$0.008/call after caching
                                 (80% saving vs 1-chain shape)
```

**Q (arch):** At 20 chains in a pipeline, does single-purpose still hold, or do you need an agent?

A: Single-purpose still holds for each chain — the carve test doesn't get weaker at scale; it gets stronger. What changes at 20 chains is the *composition layer*. Hand-composed TS at 3 chains is correct; at 20 chains, the orchestration becomes its own concern, and the right move is a workflow engine (LangGraph, Inngest, or a custom DAG runner) that handles retries, partial completion, parallel execution where possible, and tracing. Agent loops are a *different* shape — they're for problems where the *graph* itself needs to be decided at runtime by the model. If the graph is known ahead of time (which is true for most production features), it's a workflow, not an agent. The 20-chain answer is "workflow engine over single-purpose chains"; the agent answer is reserved for the small set of problems that genuinely need runtime planning.

```
3 chains                 20 chains              agent loop
─────────                ──────────             ──────────
hand-composed TS         workflow engine        runtime planning
                         (LangGraph/Inngest)    by the model itself

each chain still         each chain still       each tool the agent
single-purpose           single-purpose         calls is still
                                                single-purpose

composition lives        composition lives      composition is
in app code              in workflow defn       emergent per turn
```

### The question candidates always dodge

**Q:** Isn't this just over-engineering? My one-prompt version works fine. Why pay the decomposition cost?

A: The one-prompt version works fine *today*. The cost of the decomposition shows up at three specific events, each of which lands within a year of shipping: (1) the first time the prompt regresses and you need to bisect — single-purpose makes this 30× faster; (2) the first time a new cheaper model lands and you want to adopt it for one subtask only — single-purpose lets you A/B per chain instead of risking the whole pipeline; (3) the first time prompt caching becomes a real cost lever and you realize your monolithic prefix changes every edit, killing the cache hit rate — single-purpose preserves per-chain prefix stability. The honest framing isn't "over-engineering vs not"; it's "cost paid up front vs cost paid in three months under a deadline." The interview move is naming those three events specifically rather than defending "over-engineering" abstractly.

```
"works fine today" vs "works fine in 12 months"

 mega-prompt                          single-purpose
 ───────────                          ──────────────
 + ships in 1 hour                    + ships in ~half a day per chain
 + 1 file to read                     + N files + composition layer

 - first regression: 2-day bisect      + first regression: 15 min
 - new cheap model: all-or-nothing    + new cheap model: per-chain A/B
   adoption blocked by lowest         + adopt where it wins, stay
   subtask quality                      where it doesn't
 - prompt cache: prefix shifts        + prompt cache: per-chain prefix
   every edit, ~0% hit rate           stable, ~80% hit rate
 - eval signal: aggregate score       + eval signal: per-chain score
   muddles which subtask              is the job score
   regressed

 net at 12 months: slower             net at 12 months: faster
```

### One-line anchors

- "Single-purpose chains are the LLM-equivalent of single-responsibility components — one job, one schema, composed at the application layer."
- "The carve test: if you can name two outputs, that's two chains. The naming is the boundary."
- "The economic argument is model routing — small models for classifiers, large for generation. 30–60% cheaper per call."
- "Silent partial failure is the dominant failure mode of multi-purpose chains — schema passes, one field is wrong, support tickets surface the bug weeks later."
- "Composition lives in code, not in a prompt template. The pipeline is readable in TypeScript without opening any prompt files."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw the side-by-side single-purpose vs monolithic chain shape from memory. Label each chain's model, schema, eval set, and per-call cost in the single-purpose shape. Label the silent partial failure in the monolithic shape.

✓ Pass: three-box pipeline labeled with per-chain models + schemas; one-box monolith labeled with the partial-failure mode; per-call cost shown for both
✗ Fail: re-read the How it works diagram, wait 10 minutes, try again.

### Level 2 — Explain it out loud

Explain single-purpose chains to a colleague who has built one LLM feature with one mega-prompt. No notes. Under 90 seconds.

Checkpoints — did you:
- Apply the carve test ("if you can name two outputs, that's two chains")?
- Name the three benefits (debuggability, economics, eval signal)?
- Name the silent partial failure as the specific bug single-purpose prevents?
- Reference the buildable target (`/ai/single-purpose-chains` visualizer with mode toggle) as how you'd demonstrate the concept in reincodes?

If you skipped any: you described the structure, you didn't argue for it.

### Level 3 — Apply it to a new scenario

A new chain lands in the planned reincodes AI surface: a "narrate this DSA step" feature that takes the algorithm name, the current step index, the array state, and the recently-completed comparison, and returns three things: a one-sentence natural-language narration, a list of "key observations" (2-3 bullet points), and a "next step prediction" (what the algorithm will do next). Apply the carve test. How many chains? Which models? What's the composition layer?

Write your answer (3–5 sentences minimum). Then open `.aipe/study-prep-fundamentals-for-ai/03-ai-engineering/05-ai-features-in-this-app.md` and check whether your proposed pipeline respects the static-export contract (no live LLM at request time) — i.e., whether the precomputed-corpus pattern from that file's tradeoff analysis applies to your design.

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff from the Tradeoffs section. Answer in writing: "If I were starting the `/ai/single-purpose-chains` visualizer today with the same constraints (static export, no live LLM, GH Pages deploy), would I use the precomputed-failure-curation approach or would I run the precompute script 10× per input to *catch* real failures from the monolithic prompt? Why? If I'd curate, what's the honest caveat to disclose? If I'd catch real failures, what's the cost?"

Reference the actual code:
→ Point to `next.config.ts` L1–L17 to support the static-export constraint
→ Point to what would need to change if the precompute step moved to a serverless function — `next.config.ts` would lose `output: "export"`, the deploy target would shift off GH Pages

There is no right answer. The point is specificity.

### Quick check — code reference test

Without opening any files, answer:
- What file in reincodes controls the static-export contract that constrains how the visualizer ships?
- What field in `conceptsData.tsx` would need a new entry to register the visualizer in the home grid?
- What other concept file in this guide names the per-chain output contract that makes composition safe?

Then open the files and verify.

✓ Pass: `next.config.ts`, `CONCEPT_CATEGORIES`, `02-structured-outputs.md`
✗ Fail on details: that's fine — the shape is what matters. File and directory names should be recoverable.
