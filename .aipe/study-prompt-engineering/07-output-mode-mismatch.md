# Output mode mismatch

**Industry name(s):** Output mode mismatch, chain interface drift, schema boundary bug, producer/consumer schema skew
**Type:** Industry standard

> Every chain has one output mode declared in its schema. Every consumer expects exactly one mode. When the modes drift apart, the parser breaks — quietly, weeks later, in production.

**See also:** → [02-structured-outputs](02-structured-outputs.md) · → [03-prompts-as-code](03-prompts-as-code.md) · → [06-single-purpose-chains](06-single-purpose-chains.md) · → [13-forbidden-patterns](13-forbidden-patterns.md)

---

## Why care

### Move 1 — The grounded scenario

You have a chain that classifies user input and returns JSON: `{label: "todo" | "question" | "vent"}`. Downstream, a React component calls the chain, parses the JSON, and renders the label as a colored chip. It works for nine months. One Tuesday, a PM asks "can the classifier also explain its reasoning so we can show it in a tooltip?" You edit the chain's prompt to add "include a short rationale," update the schema to `{label: "...", rationale: string}`. You ship. The classifier now returns the new shape. The chip renders fine — but the *backend job* that consumes the classifier output to update an analytics table breaks, because it was reading the raw JSON string and doing `Object.keys()` on it, and now there are two keys instead of one, and the analytics row gets `label, rationale` as two separate column values instead of one. Nobody notices for three weeks because the failure is silent — analytics rows just have nulls in places where data should be.

### Move 2 — Name the question

That failure has a name — *output mode mismatch*. The chain has one declared output mode (whatever its current schema says); every consumer expects exactly one mode (whatever the consumer was last updated to). When the producer's mode changes and any consumer wasn't updated in lockstep, the modes drift apart. The question this concept answers is *how do you spot mode mismatches before they ship and how do you architect chains so the mismatch is loud, not silent*. It's the LLM-chain version of an API contract bug, with the added wrinkle that the model is non-deterministic so the bug surfaces probabilistically rather than every call.

### Move 3 — Why answering that question matters

**Why you need to answer that question at all:** because every chain in a production system has at least two consumers — the immediate caller and an analytics/logging sink — and most have three or four. I shipped a chain that returned `JSON.parse(response)` without error handling — six months later we found it was failing 8% of the time and silently falling through to the catch-all "default behavior" because someone had added a sentence to the system prompt that made the model occasionally wrap the JSON in a markdown code fence as a courtesy. The chain's *declared* output mode was JSON; the *actual* output mode was "JSON or markdown-fenced JSON depending on which examples the model latches onto this call." The consumers all assumed the declared mode. The mismatch was invisible until the regression metric caught it.

### Move 4 — Concrete before/after

Without output-mode discipline:

- Chain output mode is "whatever the model produced last time you looked"
- Consumers assume the model's output is parseable however they're parsing it
- `JSON.parse(response)` in three different consumers, each with a different fallback behavior on parse error
- Mode drift surfaces as "the chain is broken sometimes" customer reports
- Debugging is "read the prompt, read the response, guess which consumer is failing"
- Mean time to detect a mode regression: 2–4 weeks (whenever the next analytics review happens)

With output-mode discipline:

- Chain output mode is declared as a Zod schema; the chain validates its own output against the schema before returning
- Consumers consume the typed shape, not the raw string
- A single parse failure is logged with the raw response, the expected schema, and the failure mode (parse error, schema validation error, semantic check error)
- Mode mismatches surface at the producer boundary, not at the consumer
- Mean time to detect a mode regression: minutes (the chain's own validator catches it on the first failing call)

### Move 5 — The one-line summary

Output mode mismatch is the chain-interface bug where the producer's output mode and the consumer's expected mode drift apart — the LLM-chain equivalent of an unversioned REST API contract change. The fix is to declare the chain's output mode as a schema, validate at the producer boundary, log mismatches loudly, and force consumers to consume the typed shape rather than the raw string. The full mechanics are below.

---

## How it works

### Move 1 — The mental model

A chain is a typed function. Its output mode is its return type. Calling the chain without checking the return type is the LLM-equivalent of `(response as any).label` in TypeScript — it compiles, it runs, it crashes at the first input that doesn't match the producer's assumed shape. The discipline is to make the return type explicit, validate it at the call boundary, and treat a mode mismatch as a *loud* error (throw, retry, log) rather than a *quiet* fallback (default value, empty array, silent skip).

The strategy: every chain declares its output schema in the same file as the prompt. Every consumer imports the schema type, not the raw string. The producer validates before returning; the consumer trusts the validated value.

```
output-mode mismatch as a typed-function bug

  declared output         actual output            consumer expects
  ───────────────         ─────────────            ────────────────

  {label: string}    →    "```json\n{label:...}"   {label: string}
                           (markdown-fenced)             ↓
                                                    JSON.parse fails
                                                    fallback runs silently
                                                    analytics column = null
                                                    customer reports: "broken"
                                                    bug surfaces: 3 weeks later
```

### Move 2 — The layered walkthrough

#### The chain's declared output mode

The technical thing: every chain has exactly one declared output mode at any given time. That mode is expressed as a schema (Zod, Pydantic, JSON Schema), lives in the same file as the prompt, and is part of the chain's source-controlled artifact. Bridge from frontend: this is the TypeScript return type of a function — `function classify(input: string): Promise<{label: Label}>` — except the return value is non-deterministic and the schema is the runtime contract enforcing what the function *claims* to return. Concrete consequence: when the prompt changes, the schema review is the gate. Any prompt edit that *could* affect output shape (adding a "be helpful" instruction, adding a few-shot example with a different shape, switching the model version) gets checked against the schema as part of the PR review.

```
chain file shape — prompt + schema co-located

 // tagEntry.ts
 export const tagEntrySchema = z.object({
   tags: z.array(z.string()).max(5),
 })
 export type TagEntryOutput = z.infer<typeof tagEntrySchema>

 const SYSTEM = `You are a tag extractor...
                 Return JSON matching {tags: string[]}.`

 export async function tagEntry(entry: string): Promise<TagEntryOutput> {
   const raw = await llm.call(SYSTEM, entry)
   return tagEntrySchema.parse(raw)   // throws on mismatch — loud, not silent
 }
```

#### The consumer's expected mode

The technical thing: every consumer imports the chain's *type*, not the raw string. The consumer's code says `const { tags } = await tagEntry(entry)` and operates on `tags` as a typed array. If the chain changes its return shape, the consumer's code stops compiling. Bridge from frontend: this is `import type { ApiResponse } from './api'` — the consumer's type-check is the early-warning system for producer-side schema changes. Concrete consequence: a chain author who changes the schema gets immediate compile errors in every consumer, which forces an explicit decision about how to handle the version skew (update all consumers, or version the chain).

```
consumer-side shape

 // entryRoute.tsx
 import { tagEntry, type TagEntryOutput } from '@/chains/tagEntry'

 const { tags } = await tagEntry(entry)
 //       ↑
 //       typed; compiler catches schema changes
 //       no Object.keys() on raw response
 //       no JSON.parse with try/catch fallback
```

#### The producer-side validator

The technical thing: the chain's last step before returning is `schema.parse(raw)`. If the model returned something the schema rejects (markdown fence, wrong field name, extra fields, wrong type), the parse throws. The chain catches the throw, optionally retries with a stricter system prompt ("the previous response was not valid JSON; respond only with the schema-conformant JSON"), and re-throws if the retry also fails. Bridge from frontend: this is form validation at submit time — the error message is shown to the user, the form is not submitted with bad data. Concrete consequence: every chain call that succeeds is *guaranteed* to be schema-conformant. The consumer's typed view is honest.

```
producer-side validation loop

 raw model output
   │
   ▼
 schema.parse(raw)
   │
   ├── ✓ valid    → return typed value
   │
   └── ✗ invalid  → log {chain, input, raw, schema, error}
                    retry with stricter system message
                      │
                      ├── ✓ valid → return typed value
                      └── ✗ invalid → throw SchemaFailError
                                       (consumer's call rejects)
```

#### The silent-fallback anti-pattern

The technical thing: the most common output-mode bug isn't the parse error itself — it's the *catch block that hides it*. `try { return JSON.parse(raw) } catch { return { label: 'unknown' } }` looks defensive; it's actually the worst pattern in the space because it converts a producer-side mode mismatch into a consumer-side default value with no telemetry. The chain *appears* to work; the analytics show 8% "unknown" labels; nobody investigates because "unknown" looks like a legitimate label. Bridge from frontend: this is `try { JSON.parse(localStorage.foo) } catch { return {} }` — the same anti-pattern in the same place. Concrete consequence: the right shape is "log loudly, throw, let the consumer's error boundary handle it" — never silently fall through to a default value that looks like a legitimate output.

```
the silent-fallback anti-pattern (banned in production)

 try { return JSON.parse(raw) }
 catch { return { label: 'unknown' } }
                  └────────────────┘
                  looks defensive — actually
                  the worst pattern. converts:
                    parse-failure (observable)
                  into:
                    "unknown" label (invisible)
```

#### The hard-error pattern

The technical thing: every mode-mismatch surfaces as a logged event with the raw response, the failing schema, and a chain identifier. The chain throws; the consumer catches at a well-defined boundary (the route handler, the worker job's error handler); the user sees an explicit error state ("we couldn't classify this entry — try again") rather than a wrong-but-plausible classification. Concrete consequence: mode mismatches show up in the error dashboard within minutes of the first failing call, which means the mean time to detect a regression drops from weeks to minutes.

### Move 3 — The principle

The principle that generalises beyond LLM chains: *make the contract loud at the boundary, not silent at the consumer*. This is the same principle as TypeScript's strict mode, REST API versioning, database migrations that fail-fast on schema drift, and form validation at submit time. The LLM boundary is just the newest place to apply it. The reason mode mismatches are uniquely dangerous in LLM chains is that the model is non-deterministic — the mismatch surfaces probabilistically, which lets it lurk in the 5% tail until the cumulative damage is too big to ignore. Every place you have a non-deterministic producer and a deterministic consumer, you have the same shape of bug; LLM chains are just the most common case in 2026.

The full picture is below.

---

## Output mode mismatch — diagram

```
┌─ Producer side: the chain ────────────────────────────────────────────┐
│                                                                       │
│   chain file: classifyEntry.ts                                        │
│   ─────────────────────────────                                       │
│   prompt:    "...return JSON matching {label: string}"                │
│   schema:    z.object({ label: z.enum([...]) })                       │
│   model:     claude-haiku-4-7                                         │
│                                                                       │
│   producer flow:                                                      │
│      llm.call → raw                                                   │
│             → schema.parse(raw)                                       │
│                  ├── ✓ → typed value → return                         │
│                  └── ✗ → log + retry + (re-throw on 2nd fail)         │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
                              │
                              ▼   typed value crosses the boundary
┌─ Consumer side: every caller of the chain ────────────────────────────┐
│                                                                       │
│   consumer A (route handler):                                         │
│     const { label } = await classifyEntry(text)                       │
│     return Response.json({ label })                                   │
│                                                                       │
│   consumer B (analytics sink):                                        │
│     const { label } = await classifyEntry(text)                       │
│     await db.insert('classifications', { input: text, label })        │
│                                                                       │
│   consumer C (UI chip):                                               │
│     const { label } = await classifyEntry(text)                       │
│     return <Chip variant={label} />                                   │
│                                                                       │
│   every consumer imports the schema type, not the raw string.         │
│   any schema change breaks compile across all consumers — loud.       │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
                              │
                              ▼   schema regression?
┌─ When the producer drifts ────────────────────────────────────────────┐
│                                                                       │
│   prompt edit adds "and a short rationale"                            │
│   schema NOT updated                                                  │
│   model returns {label, rationale}                                    │
│   schema.parse rejects → throws → consumer sees explicit error        │
│                                                                       │
│   contrast: silent-fallback version                                   │
│   ────────────────────────────────                                    │
│   model returns {label, rationale}                                    │
│   JSON.parse succeeds (no schema check)                               │
│   consumer reads .label, ignores .rationale                           │
│   analytics column = null on rationale field                          │
│   nobody notices for 3 weeks                                          │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

The boundary between the producer and the consumer is the only place a mode mismatch can be caught early. The diagram's lower band is the failure mode the discipline prevents.

---

## In this codebase

**Not yet implemented.** reincodes is a Next.js static-export DSA visualizer with no AI surface in production code — there are zero LLM chains in the repo and therefore zero output-mode contracts to mismatch. The buildable target for this concept is below in Project exercises — a `/ai/output-mismatch` page that renders a 2-chain pipeline where the output type of chain A and the input type of chain B are visible as labels, and lets the reader change one chain's output mode (JSON → markdown → tool call) and watch the parser crash and the silent-fallback path light up.

**Expected file paths** (when built):
- `src/app/ai/output-mismatch/page.tsx` — the visualizer page
- `src/components/OutputMismatchVisualizer/` — chain boxes, mode-label badges, mismatch animation, fallback-path highlight
- `public/ai/output-mismatch/scenarios.json` — precomputed scenarios: matched mode (happy path), unmatched mode with hard-error handling (loud), unmatched mode with silent fallback (quiet), each with chain A's raw output + the resulting consumer behavior

---

## Elaborate

### Where this pattern comes from

The output-mode-mismatch failure mode predates LLMs by decades — it's the standard producer/consumer schema-drift bug that's been written about in distributed systems literature since at least the early 2000s (Werner Vogels on Amazon's API versioning, Sam Newman on microservices contracts). What's new is the *non-deterministic producer*. In a REST API contract bug, the producer always returns the same wrong shape; you detect it on the first call, fix it, ship. In an LLM-chain mode mismatch, the producer returns the wrong shape *some of the time*, depending on the input, the model version, the temperature, and which few-shot examples the model latched onto this call. That intermittency is what lets the bug hide. The discipline of "validate at producer boundary, log loudly, never silently fall through" arrived in production LLM systems in 2023–2024 as teams hit the failure mode for the second and third time and decided the silent-fallback pattern was a banned anti-pattern.

### The deeper principle

The deeper principle is that *non-determinism is a contract problem, not a model problem*. You don't fix a non-deterministic producer by making it deterministic (you can't, at least not at the level LLMs operate); you fix it by making the contract enforced at the boundary, so the non-determinism is caught and either retried or surfaced as an error rather than silently consumed. This is the same shape as the database-write retry pattern (the network is non-deterministic; the contract is "the write either succeeded or you'll get an error"), or the optimistic-UI rollback pattern (the user input is non-deterministic; the contract is "the local state matches the server state or you'll see a rollback"). LLM chains are the newest non-deterministic producer in software systems, and the contract-at-the-boundary fix is the canonical one.

### Where this breaks down

The pattern breaks down when the consumer needs to handle *multiple* valid output modes — e.g., a chain that can return either a structured JSON answer or a "I don't know" string, and the consumer needs to handle both shapes differently. In that case, the schema is `z.union([structuredAnswerSchema, z.literal("I don't know")])`, the consumer pattern-matches on the discriminator, and the "mismatch" framing weakens because there's no single expected mode — there's a small enumerated set of valid modes. The discipline still applies (the schema enforces *which* set of valid modes), but the "one chain, one mode" framing has to expand to "one chain, one enumerated discriminated union of modes." Most production chains *don't* need this; the multi-mode case is rare enough that defaulting to single-mode is the right starting point.

### What to explore next

- [02-structured-outputs](02-structured-outputs.md) → the schema-enforcement primitive that makes mode validation possible at the API layer
- [03-prompts-as-code](03-prompts-as-code.md) → the practice of versioning the chain's schema alongside its prompt so the two evolve together
- [06-single-purpose-chains](06-single-purpose-chains.md) → why every chain has *one* output mode (single-purpose chains naturally have single output modes)
- [13-forbidden-patterns](13-forbidden-patterns.md) → the silent-fallback `try { ... } catch { return defaultValue }` is on the banned-patterns list

---

## Tradeoffs

### Comparison table — both costs in one frame

```
┌──────────────────┬─────────────────────────┬─────────────────────────┐
│ Cost dimension   │ Path taken              │ Alternative             │
│                  │ (schema + hard-error)   │ (silent fallback)       │
├──────────────────┼─────────────────────────┼─────────────────────────┤
│ Build time       │ +1 hour per chain       │ 0 — just JSON.parse     │
│                  │ (schema + validator)    │                         │
│ User-visible     │ "we couldn't classify   │ Looks fine; data is     │
│ error rate       │ this — try again"       │ silently wrong          │
│ Time to detect   │ Minutes (chain throws,  │ 2–4 weeks (analytics    │
│ regression       │ shows up in dashboards) │ review or customer      │
│                  │                         │ complaint)              │
│ Cost of running  │ +1 retry on mismatch    │ 0 retries — fallback    │
│ chain            │ (~2x cost on mismatch   │ costs nothing per call  │
│                  │ calls, ~0% baseline)    │                         │
│ Cleanup cost     │ Fix at producer when    │ Backfill weeks of bad   │
│ when bug hits    │ first call fails        │ analytics data          │
│ Consumer code    │ Typed import; compile   │ Untyped JSON.parse;     │
│                  │ breaks on schema change │ runtime breaks silently │
│ Team experience  │ "the chain told us      │ "we found this in the   │
│ of finding bug   │ immediately"            │ analytics review"       │
└──────────────────┴─────────────────────────┴─────────────────────────┘
```

### What we gave up (when planning the reincodes visualizer)

The first cost is *the visualizer needs three modes to render*, not just two. The teaching surface is "happy path vs unmatched-loud vs unmatched-quiet" — three scenarios, not two. The unmatched-quiet path is the most important to show (it's the failure that hides), but it requires the visualizer to animate something *not happening* — the parse falling through, the default value being returned, the analytics row being silently null. That's a harder visual to render than the loud-error path because the loud version has an explicit "ERROR" badge to point at and the quiet version has *the absence of an error* as its tell. The visualizer has to make absence observable.

The second cost is *the scenario corpus*. To make the mismatch real, the precomputed scenarios need to include actual model output that drifts from the declared schema — e.g., a chain that's supposed to return `{label: "todo"}` but returns `{"label": "todo", "confidence": 0.9}` because the precompute script added "include a confidence score" to one variant of the prompt. Building that corpus means writing a precompute script that runs each chain in two configurations (matched prompt, drifted prompt) and captures the outputs honestly. The drifted-prompt outputs are the load-bearing teaching material; cooking them by hand instead of capturing them from the real model is dishonest because the teaching is "this happens for real, not just in theory."

The third cost is *the chain B animation*. The visualizer's headline interaction is "change chain A's output mode and watch chain B's parser crash." Implementing that crash visually means the visualizer has a `parser` state machine that runs whichever mode-handling code the chain B mode declares — a small parse-and-handle simulator embedded in the page. That's not a trivial component; it has at least three modes (JSON, markdown, tool-call) and at least two error states (parse error, schema validation error) per mode. The component is the most behaviorally complex element in any of the planned `/ai/*` visualizers.

### What the alternative would have cost (skipping the visualizer)

If reincodes never builds the output-mismatch visualizer, the cost is zero in this codebase. The pattern still gets exercised in loopd (per the curriculum, with B1.1 adding Zod schemas to every AI chain) and the discipline still gets named in this written guide. The reincodes site stays pure-DSA.

The cost of *not* building it shows up in the portfolio story: the silent-fallback anti-pattern is one of the most common production LLM bugs and one of the hardest to *demonstrate* in a code repo because the bug is "the absence of an error report." A reader looking at loopd's Zod-validated chains might think "ok, you wrote schemas, that's just being thorough" — without seeing what the no-schema version would have looked like and failed at over weeks. The visualizer is the only way to put both shapes side-by-side and animate the silent failure as a tangible event.

### The breakpoint

The visualizer earns its place the day the candidate is preparing for an AI-focused interview round and the interview specifically probes "tell me about a production LLM bug you found late." The visualizer becomes the demo answer: "here's the shape of the bug; flip this mode toggle to see how it stays invisible in the silent-fallback path." Until that interview pressure exists, the buildable target stays in the backlog. The breakpoint is event-shaped, not quantitative.

### What wasn't actually a tradeoff

Live LLM calls in the visualizer were not a real option. The static-export contract (`output: "export"`) is load-bearing — adding a live API call would mean leaving GitHub Pages, configuring secrets, paying for compute, and probably needing a queue because the visualizer's "change the mode and watch what happens" interaction would generate too many calls if it triggered the model on every toggle. The precomputed-scenarios approach is the only path compatible with the deploy story, and it's also pedagogically better because the silent-failure mode can be *guaranteed* to show up in a precomputed scenario whereas a live model would have to be coaxed into the failure on every demo.

---

## Tech reference (industry pairing)

### Zod (TypeScript schema library)

- **Codebase uses:** not yet — would define each chain's output schema in the visualizer's precompute script (`const chainASchema = z.object({label: z.enum([...])})`) and the consumer types (`type ChainAOutput = z.infer<typeof chainASchema>`). The visualizer's parser state machine would use `schema.safeParse()` to demonstrate both success and failure paths.
- **Why it's here:** Zod is the producer-side validator that turns a chain's declared output mode into a runtime enforcement. Without it, the chain has *aspirational* type safety and *actual* untyped JSON.
- **Leading today:** Zod — `adoption-leading` for TS-first schema validation, 2026.
- **Why it leads:** `z.infer<>` gives compile-time types from runtime schemas; `safeParse` returns a discriminated union (success | failure) that maps cleanly to the chain's validation loop; ecosystem support (zod-to-json-schema, openai's structured outputs integration) means one schema works across the LLM boundary, the API boundary, and the TS type system.
- **Runner-up:** Valibot — `innovation-leading` modular schema validator with a smaller bundle footprint; also Pydantic for the Python side of the same problem.

### Anthropic Messages API (with tool use)

- **Codebase uses:** not yet — the visualizer's precompute step would use Claude's tool-use mode to demonstrate the *structured-output* mode of chain A (vs the *JSON-in-text* mode and the *markdown-fenced-JSON* mode). The three modes are the three buttons in the visualizer's mode toggle.
- **Why it's here:** Anthropic's tool-use schemas are the strongest enforcement of output mode at the API level — when the chain is configured to use a tool, the model *cannot* return a markdown fence; the API rejects non-tool output. That's the strongest mode-mismatch prevention available in 2026.
- **Leading today:** Anthropic Messages API — `adoption-leading` for tool-use schema enforcement, 2026.
- **Why it leads:** the tool-use mechanism is the API-level guarantee that the output matches the declared schema; the chain author doesn't have to validate at the application layer because the API already did.
- **Runner-up:** OpenAI Structured Outputs (with `strict: true`) — `adoption-leading` for JSON-schema enforcement; the strict mode is the OpenAI equivalent of Anthropic's tool-use guarantee, and the two are essentially feature-parity for this use case in 2026.

### Hamel Husain on evals (blog + course)

- **Codebase uses:** not yet — the visualizer's "show failure" mode demonstrates the failure type that Hamel's eval-driven-development writing names as the canonical case for why you need an eval set per chain. The visualizer's scenario corpus is structured the way Hamel's "golden set + regression set" pattern recommends — happy path + the known failure modes added back as test cases.
- **Why it's here:** Hamel Husain's writing on LLM evals is the canonical citation for *why* schema validation and per-chain eval sets aren't optional in production. The output-mismatch failure mode is the first example most of his case studies open with.
- **Leading today:** Hamel Husain's blog + the "Mastering LLMs" course materials — `adoption-leading` for production eval discipline, 2026.
- **Why it leads:** Hamel writes from production experience at multiple companies and his framing of "evals as the senior/junior dividing line" maps directly to the output-mismatch failure mode (juniors ship without evals and find mode bugs in production; seniors ship with evals that catch mode bugs in CI).
- **Runner-up:** Eugene Yan's writing on LLM application patterns — `innovation-leading` for the broader pattern catalog; also Simon Willison's bug reports on real LLM-application failures as a parallel reference.

---

## Project exercises

### [B-reincodes-output-mismatch-viz] Build the output-mismatch visualizer

- **Exercise ID:** `[B-reincodes-output-mismatch-viz]` — derived from the curriculum's reincodes "interview prep surface" entry; aligns with Phase 1 concept `[C1.12]` (output mode mismatch) and the "AI engineering" category planned in `src/components/Home/conceptsData.tsx`.
- **What to build:** a page at `/ai/output-mismatch` that renders a 2-chain pipeline (chain A: classifier → chain B: router/handler) as connected boxes. Each chain has a visible "output mode" badge (JSON / markdown / tool call) and chain B has an "expected input mode" badge. A mode-toggle dropdown on chain A lets the reader change its output mode; a mode-toggle dropdown on chain B lets the reader change its expected mode. When the two modes match, the visualizer animates the happy path — chain A produces output, chain B parses, the handler runs, the UI shows the result. When the modes mismatch, the visualizer animates one of two paths based on a "fallback policy" toggle: *hard-error* (chain B's parser throws, the error bubbles up as an explicit error state in the UI) or *silent-fallback* (chain B's parser falls through to a default value, the UI shows a wrong-but-plausible result, a tiny "what got logged" panel reveals the analytics row got null in a field). The reader sees, in one interaction, *why* the silent-fallback pattern is banned — flip to silent, mismatch the modes, watch the UI look fine while the analytics panel shows null data.
- **Why it earns its place:** the visualizer makes the silent-failure mode *visible* — most teaching of output-mode mismatch describes it abstractly; this page lets the reader see the wrong-but-plausible UI rendering side-by-side with the broken analytics, and watch the bug hide. The interview signal is that the candidate built a tool that demonstrates the most common production LLM bug as a tangible animated event.
- **Files to touch:** `src/app/ai/output-mismatch/page.tsx` (visualizer page), `src/components/OutputMismatchVisualizer/` (chain boxes + mode badges + parser state machine + fallback animation + analytics-row panel), `public/ai/output-mismatch/scenarios.json` (precomputed scenarios — at least 3 mode combinations × 2 fallback policies = 6 scenarios, each with the raw chain A output, the parser outcome, the consumer outcome, and the analytics-row outcome), `scripts/precompute-output-mismatch.ts` (build-time script that runs chain A with each of the three modes — JSON, markdown-fenced JSON, tool-call — through Claude and captures the raw output). Add a row to `src/components/Home/conceptsData.tsx`'s `CONCEPT_CATEGORIES` under the new `ai-engineering` category.
- **Done when:** the page loads at `/reincodes/ai/output-mismatch/` in production (GitHub Pages), the 6 mode/fallback scenarios all animate correctly, the silent-fallback path shows the wrong-but-plausible UI while the analytics panel shows null, the hard-error path shows the explicit error state immediately. `next build` passes under `output: "export"`. Precompute script runs successfully against the actual Anthropic API locally (three mode configurations × one chain), captures real raw outputs, commits the JSON.
- **Estimated effort:** 2 days. Precompute script + scenarios JSON: half day. Page + visualizer component including the parser state machine and the dual-policy animation: full day. Polish + cross-browser testing of the mode toggles and the analytics panel: half day.

---

## Summary

### Part 1 — concept recap

Output mode mismatch is the chain-interface bug where the producer's declared output mode and the consumer's expected mode drift apart — the LLM-chain equivalent of an unversioned REST API contract change, made uniquely dangerous by the non-determinism of the producer (the mismatch surfaces probabilistically, hiding in the 5–10% tail). The fix is to declare the chain's output mode as a schema co-located with the prompt, validate at the producer boundary (`schema.parse(raw)` before returning), log mismatches loudly with the raw response and the failing schema, and treat consumer-side silent-fallback patterns (`try { JSON.parse(raw) } catch { return defaultValue }`) as banned anti-patterns. In this codebase the pattern is *planned* rather than implemented: reincodes has no AI surface in production code, and the buildable target is a `/ai/output-mismatch` visualizer with mode toggles on both chains and a fallback-policy toggle, demonstrating the silent-fallback bug as a tangible animated event. The constraint that makes the visualizer the right shape here is the static-export contract — live LLM calls would require leaving GitHub Pages, so precomputing the per-mode chain outputs at build time is the only path compatible with the deploy story.

### Part 2 — key points to remember

- **The contract is the schema, not the prompt**: the prompt says what the chain *asks* the model to do; the schema says what the chain *guarantees* the output is. The schema is the load-bearing artifact for the consumer.
- **The silent-fallback is banned**: `try { JSON.parse(raw) } catch { return defaultValue }` looks defensive and is actually the worst pattern in the space — it converts an observable parse failure into an invisible wrong-default outcome.
- **The producer validates; the consumer trusts**: every chain validates its own output before returning. Every consumer imports the chain's type and operates on the validated value. The compile boundary is the early-warning system for schema drift.
- **Mode mismatch is intermittent**: the non-determinism of the model means the mismatch surfaces only sometimes — typically 3–10% of calls — which is why it hides for weeks without a producer-side validator.
- **The reincodes shape**: implementation is Case B; the buildable target is a precomputed visualizer under `/ai/output-mismatch` with mode toggles on both chains and a fallback-policy toggle that demonstrates both the hard-error path and the silent-failure path side-by-side.

---

## Interview defense

### What an interviewer is really asking

Behind "tell me about a production LLM bug" the interviewer is probing whether the candidate has hit the silent-failure failure mode and learned from it. A junior answer describes a one-off bug ("the model returned bad JSON once and we added a try/catch"). A senior answer describes the *pattern* and the *discipline change* ("I shipped a chain that did `JSON.parse(response)` without error handling — six months later we found it was failing 8% of the time and silently falling through to the default behavior because someone had added a sentence to the system prompt that made the model occasionally wrap JSON in a markdown code fence — the fix wasn't more try/catch, it was schema validation at the producer boundary with hard errors instead of silent fallback"). The interviewer is checking whether the candidate names the silent-fallback as a banned anti-pattern, not just a bad implementation.

### Likely questions

**Q (mid):** What's the difference between a producer-side validator and a consumer-side try/catch?

A: A producer-side validator is `schema.parse(raw)` inside the chain function, before the chain returns. If the parse fails, the chain logs the raw response, the failing schema, and the input, and either retries with a stricter prompt or throws. The consumer never sees a malformed value. A consumer-side try/catch is `try { JSON.parse(response) } catch { return defaultValue }` at the call site. If the parse fails, the consumer silently uses the default and the rest of the system has no idea anything went wrong. The first pattern surfaces mode mismatches in the producer's logs within minutes; the second pattern hides them for weeks until an analytics review or a customer complaint surfaces the cumulative damage. The two patterns look superficially similar — both handle parse errors — but they have opposite operational consequences.

```
producer-side validator        consumer-side try/catch
─────────────────────          ─────────────────────────
schema.parse(raw)              try { JSON.parse(raw) }
  → throws on mismatch           catch { return default }
  → logs raw + schema            → silently substitutes
  → retries with strict          → no log, no metric
    system prompt                → consumer thinks it
  → re-throws if retry fails       got valid data

surfaces in minutes            hides for weeks
```

**Q (senior):** Why is the silent-fallback so common if it's so bad?

A: Three reasons. First, it *feels* defensive — every JS-developer instinct is to wrap an unsafe parse in a try/catch. Second, it makes the user-visible error rate look low — the chain "works" 100% of the time because the catch always returns *something*. Third, it removes the need to design what the error UI looks like — the default value renders fine in the existing UI, so you don't have to add an "error state" to the component. All three are the wrong incentives. The right framing is "the user-visible error rate doesn't matter; the *correctness* rate matters" — and the silent-fallback is hiding correctness failures behind a plausible-looking output. The fix is cultural as much as technical: ban the pattern in code review, treat any `catch { return X }` near an LLM boundary as a red flag, replace with explicit error states in the UI.

```
why teams reach for silent-fallback

 + feels defensive             but: converts observable
                                 errors into invisible bugs
 + low user-visible             but: high correctness-failure
   error rate                     rate, invisible
 + no error-UI design           but: the error UI is the
   needed                         load-bearing observable
                                 signal that the chain works
```

**Q (arch):** Your chain returns `{label, confidence}`. A downstream consumer needs the label as a stringified single-line "label (confidence%)" — e.g., `"todo (87%)"`. Where do you format that — in the chain, in the consumer, or somewhere else?

A: In the consumer, not the chain. The chain's job is to produce the structured output (`{label, confidence}`) and validate it against the schema. The presentation format (`"label (confidence%)"`) is a consumer concern — different consumers might want different formats (the chip wants the label only, the analytics row wants the structured tuple, the export-to-CSV wants the formatted string). If the chain does the formatting, every new consumer either has to parse the formatted string back to structured data (regression to untyped) or you have to add a new chain output mode (multi-mode chain, smells bad). Keep the chain's output structured and minimal; let each consumer format. The architectural rule: *chains produce structured data; consumers project to presentation*. This is the same shape as keeping API responses raw and letting the UI layer format.

```
chain output            consumer projections
─────────────           ─────────────────────
{label: "todo",   →     <Chip>{label}</Chip>
 confidence:0.87}       →     db.insert({label, confidence})
                        →     `${label} (${Math.round(confidence*100)}%)`
                              for the CSV export

(structured, minimal)   (per-consumer formatting, no
                         re-parsing of formatted strings)
```

### The question candidates always dodge

**Q:** Why can't you just make the model deterministic with `temperature: 0` and skip the schema validation?

A: Because `temperature: 0` doesn't make the model deterministic; it makes the model *more* deterministic, which is a different claim. The model still has provider-side stochasticity (the API can return slightly different outputs for the same input across calls — this is well-documented for both OpenAI and Anthropic), the model can still be upgraded under you (Sonnet 4 → Sonnet 5 can change the output shape distribution for the same prompt), and the input space is unbounded (your user can type something you didn't anticipate, and the model can produce a shape you didn't see in testing). Schema validation is the contract that survives all three. `temperature: 0` is a useful tool for reducing the *frequency* of mode mismatches; it doesn't eliminate them, and treating it as if it does is the same category of error as treating a green CI run as proof of correctness. The interview move is naming the three failure sources `temperature: 0` doesn't address.

```
"temperature: 0 should be enough"

 reduces frequency of mismatch?   yes
 eliminates it?                    no
   → provider-side stochasticity  (~1-3% of calls vary)
   → model upgrade drift          (Sonnet 4 → 5 changes
                                    distribution; eval-set
                                    regressions follow)
   → input-space surprises        (user inputs you didn't
                                    train against)

 schema validation is the         temperature: 0 is the
 contract that survives all       knob that reduces noise
 three.                           inside the contract.
```

The honest answer: temperature is a hyperparameter; schema validation is a contract. They sit at different layers and you need both.

### One-line anchors

- "Every chain has one output mode. Every consumer expects one. Drift between them is the bug."
- "Validate at the producer boundary. Throw on mismatch. Never silently fall through to a default value."
- "The silent-fallback `try { JSON.parse } catch { return defaultValue }` is the most common LLM-chain anti-pattern in the wild. Ban it in code review."
- "Mode mismatches are intermittent because the model is non-deterministic — they hide in the 5% tail without a producer-side validator."
- "temperature: 0 reduces the frequency of mismatches; it doesn't eliminate them. Schema validation is the contract; temperature is the knob inside the contract."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw the producer-side validation loop from memory — the LLM call, the schema.parse, the retry, the re-throw. Then draw the silent-fallback anti-pattern next to it. Label what's observable in each.

✓ Pass: both diagrams drawn, validation loop has retry + log + re-throw, silent-fallback shows the catch-and-default with "no observability" labeled
✗ Fail: re-read the producer-side validator + silent-fallback diagrams, wait 10 minutes, try again.

### Level 2 — Explain it out loud

Explain output mode mismatch to a colleague who has built one LLM-powered feature with `JSON.parse(response)` + a try/catch fallback. No notes. Under 90 seconds.

Checkpoints — did you:
- Name the silent-fallback as the anti-pattern (not just a missing-feature gap)?
- Explain why the non-determinism makes mismatch intermittent and therefore hidden?
- Name producer-side validation (`schema.parse` + retry + throw) as the fix?
- Reference the buildable target (`/ai/output-mismatch` visualizer with the fallback-policy toggle) as how you'd demonstrate the concept in reincodes?

If you skipped any: you described the bug, you didn't argue for the fix.

### Level 3 — Apply it to a new scenario

A new chain lands in the planned reincodes AI surface: a "suggest the next algorithm to study" chain that takes the user's recently-viewed algorithms and returns a recommended next one with a short reason. The chain's declared output mode is `{algorithm: string, reason: string}`. The consumer renders the algorithm as a clickable card with the reason as hover text. Three weeks after shipping, the prompt is edited to "include a difficulty rating to help the user calibrate" — the schema is not updated. What happens in each of these implementations? (a) producer-side validator + hard error, (b) producer-side validator + retry, (c) silent-fallback try/catch.

Write your answer (3–5 sentences minimum). Then open `.aipe/study-ai-engineering/ai-features-in-this-codebase.md` and check whether your proposed handling respects the static-export contract (the chain runs at precompute time, not at user-request time) — i.e., whether the failure mode would surface at *build time* in CI rather than in production.

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff from the Tradeoffs section. Answer in writing: "If I were starting the `/ai/output-mismatch` visualizer today with the same constraints (static export, no live LLM, GH Pages deploy), would I make the silent-fallback path the *default* mode of the visualizer (so the reader sees the bug first), or would I make the hard-error path the default (so the reader sees the correct shape first)? Why? What's the teaching cost of each ordering?"

Reference the actual code:
→ Point to `next.config.ts` L1–L17 to support the static-export constraint
→ Point to what would need to change if the visualizer ran live — every mode-toggle interaction would generate an LLM call, the cost of which would be measurable per page load

There is no right answer. The point is specificity.

### Quick check — code reference test

Without opening any files, answer:
- What file in reincodes controls the static-export contract that constrains how the visualizer ships?
- What field in `conceptsData.tsx` would need a new entry to register the visualizer in the home grid?
- What other concept file in this guide names the schema enforcement primitive (Zod / tool use) that makes producer-side validation possible?
- What other concept file names the silent-fallback as a banned pattern?

Then open the files and verify.

✓ Pass: `next.config.ts`, `CONCEPT_CATEGORIES`, `02-structured-outputs.md`, `13-forbidden-patterns.md`
✗ Fail on details: that's fine — the shape is what matters. File and directory names should be recoverable.

---
