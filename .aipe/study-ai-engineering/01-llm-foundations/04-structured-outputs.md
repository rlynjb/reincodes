# Structured outputs (tool calling, schemas, strict mode)

**Industry name(s):** Structured outputs, JSON mode, tool calling, function calling, response_format, strict mode
**Type:** Industry standard

> The mechanism by which the LLM's free-text output gets constrained to a typed schema — JSON mode, tool calling, strict-mode schema enforcement, and the cross-provider variation that makes "structured output" mean three different things depending on which API you're talking to.

**See also:** → [01-what-is-an-llm](01-what-is-an-llm.md) · → [03-sampling-parameters](03-sampling-parameters.md) · → [../../study-prompt-engineering/02-structured-outputs.md](../../study-prompt-engineering/02-structured-outputs.md) (the prompt-engineering angle) · → [../../study-prompt-engineering/07-output-mode-mismatch.md](../../study-prompt-engineering/07-output-mode-mismatch.md)

**Cross-link note:** The prompt-engineering guide covers the *prompt authoring* angle on structured outputs ("how to write a prompt that produces clean JSON"). This file is the *operational* angle: cross-provider mechanics, strict mode vs JSON mode vs tool calling, the courtesy-markdown-fence bug, when NOT to use structured output. The two files complement each other; read both if you ship LLM features in production.

---

## Why care

### Why care anchored to a frontend primitive

You have a TypeScript interface `interface Todo { text: string; category: "task" | "errand" | "question" }`. Your `.map()` over an array of `Todo[]` works because the type is enforced at compile time — every element of the array has those three fields, those exact types, no surprises at runtime. Now an LLM produces todos by classifying free-text journal entries. The model's output is a string. You `JSON.parse()` it, hope the parse succeeds, hope the parsed object has the right shape, hope `category` is one of the three valid values. On the happy path, it works. In production, the model occasionally wraps the JSON in a markdown code fence (`\`\`\`json ... \`\`\``), the parse fails, the `.map()` throws on undefined fields, and your user-facing list breaks. The type system that protected your `.map()` ends at the LLM boundary, and structured outputs are the mechanism for extending the type system across that boundary.

### Move 2 — Name the question

That extension has a name — *structured outputs*. Specifically: the API-level machinery that constrains the LLM's generation to match a typed schema. Three flavors exist in production today: (a) JSON mode (the model is biased to emit valid JSON, but the schema is up to you to enforce), (b) tool calling (the model emits a structured tool-call payload matching a JSON schema you provided), (c) strict mode (provider-level grammar-constrained decoding that guarantees the output validates against the schema or refuses to generate). The question is operational: which mechanism does each provider offer, which one fits your chain's job, and what happens when the model "obeys the prompt" by adding helpful markdown that breaks the parser.

### Move 3 — Why answering that question matters

**Why you need to answer that question at all:** because structured outputs are the *primary* mechanism by which LLM chains compose into larger systems. A chain that outputs unstructured text is a leaf node; a chain that outputs typed JSON can feed another chain, hit a database, render a UI component, or trigger a downstream action. The shift from "the model wrote a paragraph" to "the model returned a typed object" is the shift from prototype to production. I have shipped a chain in 2024 that worked perfectly through three weeks of testing and broke on production day because a non-empty subset of users wrote journal entries with apostrophes that the model's "be helpful" instruction caused it to wrap in markdown for "readability." The parse failed silently, the chain returned `null`, and the UI rendered "Untitled" for ~12% of entries. The fix was migrating to OpenAI's strict mode. The diagnostic took half a day because nobody had run the chain against an adversarial corpus of inputs that included edge cases like apostrophes, quotes, and emoji. Structured outputs aren't a nice-to-have; they're the contract that makes the LLM boundary trustable.

### Move 4 — Concrete before/after

Without structured outputs:

- Free-text output, `JSON.parse()`-then-`try/catch`-then-pray
- "Be polite" instruction in the system prompt causes courtesy-markdown-fence wrapper around the JSON
- Schema drift detected by user complaints, not by the type system
- ~5-10% parse failure rate in production depending on input variety
- Retry logic that resends the same prompt and hopes for different output

With structured outputs:

- Schema defined in Zod / JSON Schema, passed to the provider with `strict: true`
- Provider guarantees the output validates the schema or refuses (returns a refusal payload)
- Parse always succeeds for non-refusal outputs
- Schema changes are diffable, tracked in git, enforced at the boundary
- Errors are categorisable: schema violation impossible by construction; refusal is an explicit signal

### Move 5 — The one-line summary

Structured outputs are the API-level machinery that constrains LLM generation to match a typed schema — JSON mode, tool calling, or strict-mode grammar-constrained decoding — analogous to how Zod validates a `fetch()` response body against a TypeScript type, except the validation happens at the model boundary rather than after the fact. The full mechanics are below.

---

## How it works

### Move 1 — The mental model

Structured outputs work in two stages. First, you define a schema — a JSON schema, a Zod schema (which compiles to JSON schema), or a tool definition with parameters. Second, you pass that schema to the provider, which uses it during generation to constrain the sampler's choices. The constraint mechanism differs by provider — some use prompt-engineering tricks (telling the model to emit JSON), some use grammar-constrained decoding (forcing the sampler to only consider tokens that keep the partial output valid), some use tool-calling-as-structured-output (the model emits a tool call whose parameters match the schema). From the caller's perspective, the API is similar across providers; from the implementation perspective, the guarantees are very different.

The strategy: pick the provider mechanism that gives the strongest guarantee for the price (strict mode > tool calling > JSON mode > unstructured), and treat the schema as a first-class artifact (live in code, diff-able, version-tracked, shared between the LLM call and the TypeScript types).

```
The structured-output pipeline

         schema definition (Zod / JSON Schema)
                       │
                       ▼
            ┌──────────────────────┐
            │  pass to provider    │
            │  with strict: true   │
            └──────────┬───────────┘
                       │
                       ▼
            ┌──────────────────────┐
            │  provider constrains │
            │  generation to       │
            │  schema-valid output │
            └──────────┬───────────┘
                       │
                       ▼
            ┌──────────────────────┐
            │  typed object out    │
            │  or refusal payload  │
            └──────────────────────┘
```

### Move 2 — The layered walkthrough

#### JSON mode

The technical thing: the weakest of the three mechanisms. The caller adds a parameter (`response_format: { type: "json_object" }` for OpenAI; `tool_use` with a schema for Anthropic) telling the provider "emit JSON." The provider biases the model toward JSON-shaped output but doesn't enforce a schema. The output is *probably* JSON; *probably* matches your expectation; you still have to parse-and-validate after the fact. The bridge from frontend: this is the equivalent of `Content-Type: application/json` on a `fetch()` response — it tells you the *format* but not the *shape*. Concrete consequence: JSON mode prevents the most common bug (model emits prose instead of JSON), but doesn't prevent shape violations (missing fields, wrong types, extra fields). Use JSON mode when the schema is simple and you have a Zod parse step downstream; don't use it as a substitute for schema enforcement.

```
JSON mode — output shape vs schema validation

  prompt: "return JSON with the user's intent"
                       │
                       ▼
          ┌────────────────────────┐
          │ JSON mode: bias to JSON│  ✓ probably valid JSON
          │ no schema check        │  ✗ shape unverified
          └──────────┬─────────────┘
                     │
                     ▼
          {"intent": "todo"}      ← happy path
          {"intent": "todo",       ← extra field nobody asked for
           "vibe": "neutral"}      
          {"intnet": "todo"}       ← typo in key, parse passes,
                                     downstream code fails on .intent
```

#### Tool calling (function calling)

The technical thing: the model emits a structured tool-call payload — a name (which tool to call), arguments (matching the JSON schema you provided for that tool's parameters), and a unique ID. The bridge from a DB primitive: this is structurally identical to an INSERT statement with strongly-typed columns — the provider's tool-call interface is the type contract, and the model's job is to produce a row that fits. Concrete consequence: tool calling is the most flexible mechanism because it supports multiple "tools" per call (the model can choose which schema to emit) and can return *no* tool call (the model responded with text instead). It's also the most explicit — you're not asking for "JSON," you're asking for "a tool call matching this schema." Use tool calling when (a) the chain has multiple possible output shapes, (b) you need the model to decide between structured output and free-text response, or (c) you're integrating with an agent loop that expects tool-call shapes.

```
tool calling — the model picks which schema to emit

  tool definitions:
    classify_todo:    { intent: "task"|"errand"|"question" }
    flag_unclear:     { reason: string }
                            │
                            ▼
            model decides which tool to call:
              → classify_todo({intent: "task"})
              or → flag_unclear({reason: "ambiguous wording"})
              or → text response (no tool call)
```

#### Strict mode (grammar-constrained decoding)

The technical thing: the strongest of the three mechanisms. OpenAI introduced strict mode (`strict: true` on structured outputs or tool calls) in 2024; Anthropic has similar functionality via tool-use with strict schema enforcement. The provider compiles the JSON schema to a grammar (a finite-state machine over tokens) and modifies the sampling step at each token — only tokens that keep the partial output valid against the grammar are sampled. The model *cannot* produce schema-violating output. The bridge from a frontend primitive: this is the equivalent of TypeScript's type system at the function boundary — invalid shapes can't compile. Concrete consequence: strict mode eliminates the parse-failure class of bugs entirely. The model either emits valid output or refuses (returns a `refusal` field with the reason). The cost: strict mode is more expensive (a small per-call premium), schemas have to be compatible with the provider's grammar compiler (no recursive types on OpenAI strict mode; some keywords aren't supported), and the schema becomes a load-bearing artifact that the chain depends on. Use strict mode by default for any chain whose output is consumed by code rather than by humans.

```
strict mode — grammar-constrained sampling

  at each token position:
  ┌─────────────────────────────────────┐
  │ raw next-token distribution         │  thousands of candidates
  └──────────┬──────────────────────────┘
             │
             ▼
  ┌─────────────────────────────────────┐
  │ apply grammar mask:                 │
  │   "after \"intent\": only tokens    │
  │    that start a valid value string  │
  │    are allowed"                     │
  └──────────┬──────────────────────────┘
             │
             ▼
  ┌─────────────────────────────────────┐
  │ truncated distribution: only        │  small number of candidates,
  │ schema-valid tokens                 │  all schema-valid
  └──────────┬──────────────────────────┘
             │
             ▼
       sample → guaranteed valid
```

#### The courtesy-markdown-fence bug

The technical thing: a class of failure where the model "obeys" your prompt by emitting helpful formatting (typically a markdown code fence around the JSON) that breaks downstream parsers. The bridge from frontend: this is structurally similar to a `Content-Type` header that promises JSON but ships with a UTF-8 BOM at the start of the body — the response *contains* valid JSON, but the parser bails because the bytes outside the JSON aren't expected. Concrete consequence: in non-strict modes (JSON mode, prompt-only "return JSON"), the model occasionally — depending on system prompt phrasing, model version, and inputs — wraps the JSON in a fence. The user-friendly instruction "be helpful and clearly formatted" in the system prompt actively encourages this. Mitigations: (1) strict mode prevents it entirely (the grammar excludes ` characters); (2) post-process strip ` blocks before parsing; (3) explicit prompt instruction "Do not wrap output in markdown code fences"; (4) eval suite that includes inputs known to trigger the courtesy-fence behaviour. Don't rely on prompt instruction alone — the model can still drift.

#### Cross-provider variation

The technical thing: the same conceptual operation ("return a JSON object matching this schema") has different APIs across providers. OpenAI: `response_format: { type: "json_schema", json_schema: { schema, strict: true } }` on chat completions, or `tools: [{ type: "function", function: { ..., strict: true } }]` for tool calling. Anthropic: `tools: [{ name, description, input_schema }]` in the Messages API; structured outputs work via tool use; the equivalent of strict mode is enabled by default for tool-use schemas. Google Gemini: `response_schema` parameter with `response_mime_type: "application/json"`. The schemas themselves are JSON Schema in all three, but each provider supports a different subset of JSON Schema features. Concrete consequence: cross-provider migrations are not free even when the conceptual contract is the same. The schemas have to be tested against each provider's compiler; some valid JSON Schema isn't supported in strict mode on OpenAI (no `$ref` to recursive types; restrictions on `oneOf` and `anyOf`). Plan for the schema to be the migration unit, not the prompt.

### Move 3 — The principle

The principle that generalises beyond any one provider: *the LLM boundary needs a type contract or it isn't trustable.* Every team that ships LLM-powered features at non-trivial scale ends up with schemas at every chain boundary. The question is whether the schema is enforced at the API level (strict mode), enforced at the application level (Zod-after-parse), or not enforced at all (parse-and-pray). The strength of the guarantee maps directly onto the failure mode the chain can have in production: strict mode → only refusal-class failures; Zod-after-parse → schema-violation failures show up as caught exceptions; no enforcement → silent shape drift that surfaces as downstream bugs. The cost of stronger enforcement is small per call and large in operational sanity over months.

The full picture is below.

---

## Structured outputs — diagram

```
┌─ Three enforcement levels, three failure modes ──────────────────────┐
│                                                                       │
│   LEVEL 1: unstructured (prompt-only "return JSON")                  │
│   ┌────────────────────────────────────────────────┐                 │
│   │ caller: prompt + "return JSON"                 │                 │
│   │ provider: emits text                           │                 │
│   │ caller: JSON.parse(text) — might throw         │                 │
│   │ failure modes:                                 │                 │
│   │   - markdown code fence wrapper                │                 │
│   │   - missing field, wrong type                  │                 │
│   │   - prose preamble before JSON                 │                 │
│   │   - parse failure rate ~5-15% production       │                 │
│   └────────────────────────────────────────────────┘                 │
│                                                                       │
│   LEVEL 2: JSON mode (provider biases toward JSON, no schema check)  │
│   ┌────────────────────────────────────────────────┐                 │
│   │ caller: response_format: json_object           │                 │
│   │ provider: biases sampler toward JSON tokens    │                 │
│   │ caller: still JSON.parse-then-Zod-validate     │                 │
│   │ failure modes:                                 │                 │
│   │   - schema violation (extra/missing fields)    │                 │
│   │   - parse failure rate ~1-3%                   │                 │
│   └────────────────────────────────────────────────┘                 │
│                                                                       │
│   LEVEL 3: strict mode (grammar-constrained decoding)                │
│   ┌────────────────────────────────────────────────┐                 │
│   │ caller: response_format: json_schema           │                 │
│   │         + strict: true                         │                 │
│   │ provider: compiles schema to grammar,          │                 │
│   │           constrains sampler per token         │                 │
│   │ caller: output validates by construction       │                 │
│   │ failure modes:                                 │                 │
│   │   - refusal (explicit, signalled in payload)   │                 │
│   │   - schema unsupported feature (caught at      │                 │
│   │     compile time)                              │                 │
│   │   - parse failure rate ~0%                     │                 │
│   └────────────────────────────────────────────────┘                 │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
                              │
                              ▼   pick based on the chain's job
┌─ Provider matrix (2026) ─────────────────────────────────────────────┐
│                                                                       │
│   OpenAI Chat Completions:                                           │
│     response_format: { type: "json_schema", strict: true }           │
│     tools: [{..., strict: true}]                                     │
│                                                                       │
│   Anthropic Messages API:                                            │
│     tools: [{name, description, input_schema}]                       │
│     strict by default for tool-use schemas                           │
│                                                                       │
│   Google Gemini API:                                                 │
│     response_schema + response_mime_type: application/json           │
│                                                                       │
│   All use JSON Schema; supported subsets vary                        │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

The boundary between the upper band (enforcement levels and their failure modes) and the lower band (provider-specific APIs) is what makes structured outputs operationally tractable: pick the level for the chain's risk profile, then translate the schema across providers as needed for migration or fallback.

---

## In this codebase

**Not yet implemented.** reincodes is a Next.js static-export DSA visualizer with no AI surface in production code — there are zero LLM calls, no schemas, no structured-output requirements. The existing study guide (`.aipe/study-ai-engineering/`) positions reincodes as the *interview-prep visualizer host* per the curriculum: a place to *teach* AI concepts through visualizers, not a place where AI runs for users. The buildable target for this concept is below in Project exercises — a `/ai/structured-outputs` page that renders a Zod schema as a tree and runs a precomputed prompt against three variants: (1) strict mode on, (2) JSON mode with no "be polite" instruction, (3) JSON mode with a "be helpful and clearly formatted" instruction that triggers the courtesy-fence bug. The reader sees, in one toggle, what changes when the enforcement level shifts.

**Expected file paths** (when built):
- `src/app/ai/structured-outputs/page.tsx` — the visualizer page
- `src/components/StructuredOutputsVisualizer/` — schema tree renderer, three-variant output panel, enforcement-level toggle
- `public/ai/structured-outputs/example-outputs.json` — precomputed (prompt, variant_id, raw_output, parse_result, schema_valid) records captured at build time by `scripts/precompute-structured-outputs.ts`

**Cross-link note (repeated for emphasis):** the prompt-engineering guide's `02-structured-outputs.md` covers this concept from the *prompt authoring* angle (how to write the system prompt). This file covers it from the *operational* angle (cross-provider API surface, strict-mode mechanics, courtesy-fence bug). The two are complementary; both visualisers (if built) would link to each other.

---

## Elaborate

### Where this pattern comes from

JSON mode arrived in OpenAI's API in late 2023 as a response to widespread parse-failure complaints from developers. Tool calling (originally "function calling") arrived earlier — June 2023 — and was the first widely-adopted mechanism for getting structured output out of GPT-4. Strict mode arrived in August 2024 and represented a fundamental shift: instead of biasing the model toward JSON-shaped output via prompt engineering, the provider modifies the sampling process at the token level. The technique borrowed from open-source work on grammar-constrained decoding (Outlines, llama.cpp's GBNF grammars, Microsoft's guidance library) but productised it behind the standard chat completions API. Anthropic's Messages API has had strict tool-use schemas since launch; the explicit-strict-mode-flag pattern is more OpenAI-centric, but the underlying mechanism is now industry-standard.

### The deeper principle

The deeper principle is that *generation is a search problem over the space of valid outputs, and the schema is the constraint on the search space.* Without the schema, the model searches over the full distribution at each token. With the schema, the model searches only over the schema-valid subset. This is structurally the same idea as constraint satisfaction in any other search problem — the unconstrained search is more expensive (because the search space is huge) and less reliable (because the model can wander into invalid regions); the constrained search is cheaper per-result and more reliable per-result. The framing also explains why strict mode is more reliable than prompt-engineered JSON output: prompt engineering constrains the model's *intent* (it "wants" to emit JSON); strict mode constrains the model's *choices* (it can't emit invalid tokens). Intent is fragile under distribution shift; constraint is not.

### Where this breaks down

The strict-mode framing breaks down at four edges. First, schema expressiveness: not all valid JSON Schema works under strict mode on every provider. OpenAI's strict mode disallows recursive types via `$ref`, has restrictions on `oneOf` / `anyOf`, and requires every object to have all properties marked required. These restrictions are documented but caught at runtime if you violate them. Second, model capability: strict mode forces the model to produce schema-valid output, but doesn't guarantee the output is *semantically* correct. A model can return `{"intent": "task"}` for an input that's clearly a "question" — strict mode constrains the *shape*, not the *quality*. Third, partial outputs in streaming: strict-mode JSON streams emit valid partial JSON, but parsing partial JSON requires a streaming JSON parser (jsonparse, partial-json libraries). Standard `JSON.parse()` requires the complete object. Fourth, refusal handling: strict mode adds a refusal mechanism — the model can refuse to emit any output if it can't comply, and the response includes a refusal field with the reason. The application has to handle this branch; it's a new failure class that didn't exist with unstructured outputs.

### What to explore next

- [01-what-is-an-llm](01-what-is-an-llm.md) → strict mode modifies the sampling step in the autoregressive loop
- [03-sampling-parameters](03-sampling-parameters.md) → temperature still matters under strict mode, but the truncation step is grammar-mask-first then top_p/top_k
- [../../study-prompt-engineering/02-structured-outputs.md](../../study-prompt-engineering/02-structured-outputs.md) → the prompt-engineering view of how to write the system prompt
- [../../study-prompt-engineering/07-output-mode-mismatch.md](../../study-prompt-engineering/07-output-mode-mismatch.md) → the deeper failure mode when output mode and chain job don't align

---

## Tradeoffs

### Comparison table — both costs in one frame

```
┌──────────────────┬──────────────────────┬─────────────────────────┐
│ Cost dimension   │ Path taken           │ Alternative             │
│                  │ (strict mode + Zod   │ (prompt-only "return    │
│                  │  schema)             │  JSON" + parse-and-pray)│
├──────────────────┼──────────────────────┼─────────────────────────┤
│ Parse failures   │ ~0% (grammar-        │ ~5-15% depending on     │
│                  │ constrained)         │ input variety           │
│ Schema drift     │ Caught at boundary   │ Discovered in prod by   │
│                  │                      │ downstream null-errors  │
│ Per-call cost    │ Small premium        │ Standard pricing        │
│                  │ (~$0.0001/call extra)│                         │
│ Schema expressive│ JSON Schema subset   │ Arbitrary (whatever the │
│                  │ (provider-specific)  │ model emits)            │
│ Cross-provider   │ Schema needs porting │ Schema needs porting +  │
│                  │ but contract is same │ retry tuning per model  │
│ Onboarding       │ New eng reads schema │ New eng reads prompt    │
│                  │ to understand output │ and guesses             │
│ Refusal handling │ Explicit branch in   │ Refusal looks like      │
│                  │ code                 │ failure                 │
│ Streaming        │ Partial JSON parser  │ Wait for complete       │
│                  │ required             │ response                │
│ Debugging        │ Schema diff in git   │ "the model decided to   │
│                  │ history              │ format it differently"  │
└──────────────────┴──────────────────────┴─────────────────────────┘
```

### What we gave up (when planning the reincodes visualizer)

The first cost is *precomputing three variants of every example*. The visualizer's teaching value is the side-by-side comparison of strict-mode-on, JSON-mode-with-clean-prompt, and JSON-mode-with-courtesy-prompt outputs. That means the precompute script has to call the provider three times per example (once per variant) and capture both the raw output and the parse result. For three example prompts × three variants = nine API calls per build. The captures need to be re-run when the model version updates because the courtesy-fence behaviour is version-sensitive. The build script gets longer and the CI pipeline gets more API calls; budget ~$0.50 per build at current pricing for the precompute step.

The second cost is *triggering the courtesy-fence bug reliably*. The bug is *probabilistic* — the model emits the markdown fence often but not always at the same temperature and prompt. To make the visualizer's teaching point land, the precompute script has to either (a) run multiple captures and pick the one that demonstrates the bug, or (b) use an explicit prompt that maximises the chance of the bug (e.g., "Please format your response nicely with proper indentation and code blocks where appropriate"). The honest move is (b) — the visualizer's job is to teach the failure mode, and a deliberately-tuned prompt makes the failure reproducible. The accompanying text has to call out that the prompt is adversarial.

The third cost is *teaching scope ambiguity*. There are already two structured-output study files — this one and `../../study-prompt-engineering/02-structured-outputs.md`. Readers who follow both guides see overlapping content with different emphasis. The visualizer's teaching scope has to be clearly the *operational* angle (cross-provider mechanics, enforcement levels) and not duplicate the prompt-engineering angle (how to write the system prompt). The visualizer's navigation has to link prominently to the prompt-engineering file so readers find the complementary content.

### What the alternative would have cost (skipping the visualizer)

If reincodes never builds the `/ai/structured-outputs` visualizer, the cost is *zero* in the codebase. The concept gets taught in this written study guide, in the prompt-engineering guide, in the curriculum's Phase 1 build items (`[B1.1]`: Zod schemas for every loopd chain), and gets exercised in production code at loopd. The reincodes site stays pure-DSA.

The cost of *not* building it shows up in the interview-prep surface. Of the nine concepts in this sub-section, structured outputs is the one that *most* benefits from a "watch what breaks" visualizer — the courtesy-fence bug is so subtle that describing it verbally rarely lands. A reader who has seen the markdown-fence wrapper appear in a side-by-side at the moment they toggle the "be polite" instruction on understands the bug *immediately*; a reader who has only read about it forgets within a week.

### The breakpoint

The visualizer earns its place during interview rounds where the candidate is asked "how do you handle the LLM's structured output reliability problem?" The verbal answer ("strict mode, Zod schema, refusal handling") is the senior answer but doesn't demonstrate insight; the visual answer ("watch this — same prompt, three enforcement levels, here's the failure mode at each level") demonstrates that the candidate has internalised the failure modes by building them. The breakpoint is event-shaped: an interview round that pushes hard on the reliability question.

### What wasn't actually a tradeoff

Live LLM calls in the visualizer were not a real option. The static-export contract forbids API keys at request time. Even if a backend existed, running three API calls per visitor per example load would be expensive and slow, and the courtesy-fence bug's probabilistic nature means visitors would see different failures on different visits, undercutting the teaching consistency. Precomputed examples are the only architecture that gives consistent teaching value, and they're compatible with the deploy story.

---

## Tech reference (industry pairing)

### OpenAI Structured Outputs (strict mode)

- **Codebase uses:** not yet — the planned `/ai/structured-outputs` visualizer would call `gpt-4o` or `gpt-5` at build time with `response_format: { type: "json_schema", json_schema: { ..., strict: true } }` for the strict-mode variant of each example.
- **Why it's here:** OpenAI's strict mode is the canonical reference implementation of grammar-constrained decoding via a public API. The `strict: true` flag is the operational lever that turns parse-failures from "the model's behaviour" into "by-construction impossible."
- **Leading today:** OpenAI Structured Outputs — `adoption-leading` for production LLM applications that need shape-guaranteed output, 2026.
- **Why it leads:** the first widely-deployed grammar-constrained API. Wide ecosystem support (LangChain, LlamaIndex, every framework integrates with it). Clear documentation on supported JSON Schema subset. The default choice for any new chain whose output is consumed by code.
- **Runner-up:** Anthropic tool-use with strict schemas — `adoption-leading` for production work with Claude. Stricter schema enforcement than non-strict OpenAI, but no explicit `strict: true` flag because it's enabled by default for tool-use.

### Anthropic Messages API (tool use)

- **Codebase uses:** not yet — would be the cross-provider comparison target. The visualizer might capture the same prompt under Anthropic's tool-use mode to show that the conceptual contract is the same but the API surface differs.
- **Why it's here:** Anthropic's Messages API treats structured output through the tool-use lens — the model emits a tool call whose `input` matches the tool's `input_schema`. There's no separate "JSON mode" or "strict mode" flag because the tool-use shape is itself structured.
- **Leading today:** Anthropic Messages API tool use — `adoption-leading` for production prompt engineering with Claude, 2026.
- **Why it leads:** schema enforcement is enabled by default for tool-use; the contract is explicit (tool name + input schema); the framing aligns with agent-loop work where structured outputs and tool calls are the same primitive.
- **Runner-up:** Anthropic's `extended_thinking` mode + tool use — `innovation-leading` for reasoning-heavy structured outputs; the model can reason internally before emitting the tool call.

### Zod (TypeScript schema library)

- **Codebase uses:** not yet — would define the schemas for the visualizer's example outputs. The schemas would live in code as Zod definitions, get compiled to JSON Schema via `zod-to-json-schema`, and feed both the OpenAI structured-outputs call and the TypeScript types the visualizer uses to render results.
- **Why it's here:** the value proposition of structured outputs collapses without a runtime validator on the application side. Zod is the canonical TS-first option; the schema-once-use-twice pattern (`z.infer<>` for compile-time types, `.parse()` for runtime validation, `zodToJsonSchema()` for the LLM boundary) is the standard production pattern.
- **Leading today:** Zod — `adoption-leading` for TS-first schema validation, 2026.
- **Why it leads:** `z.infer<>` gives compile-time types from runtime schemas. Ecosystem support (zod-to-json-schema, OpenAI's structured-outputs integration accepts Zod directly, LangChain's structured-output chains use it). Bundle size is acceptable; alternatives (Yup, Joi) are heavier or less TS-first.
- **Runner-up:** Valibot — `innovation-leading` modular schema validator with a smaller bundle footprint. Relevant for the reincodes visualizer specifically because the `/ai/` route bundle budget cares about every KB.

---

## Project exercises

### [B-reincodes-structured-outputs-viz] Build the structured-outputs visualizer

- **Exercise ID:** `[B-reincodes-structured-outputs-viz]` — derived from the curriculum's "Interview prep surface — reincodes" entry and Phase 1 concept `[C1.4]` (Structured outputs).
- **What to build:** a page at `/ai/structured-outputs` that renders a Zod schema (for a todo classifier with `{intent: "task"|"errand"|"question"|"vent", confidence: number, tags: string[]}`) as a clickable tree. Below the schema, three output panels show the same prompt run against three enforcement levels: (1) OpenAI strict mode on, (2) OpenAI JSON mode with clean system prompt, (3) OpenAI JSON mode with "be helpful, format nicely, use markdown where appropriate" courtesy prompt. Each panel shows the raw model output, the JSON-parse result (success/fail), and the schema-validation result (pass/fail). A toggle at the top switches between three example prompts to demonstrate variance in courtesy-fence behaviour across input types.
- **Why it earns its place:** the visualizer makes the *enforcement level → failure mode* mapping observable — the reader sees, in one toggle, that strict mode never fails parse, JSON mode rarely fails parse but sometimes fails schema, and courtesy-prompted JSON mode dramatically fails parse via markdown wrapper. The interview signal is that the candidate built a teaching artifact for the most ship-blocking LLM reliability concept.
- **Files to touch:** `src/app/ai/structured-outputs/page.tsx` (visualizer page), `src/components/StructuredOutputsVisualizer/` (schema-tree renderer, three-panel output comparison, prompt selector), `public/ai/structured-outputs/example-outputs.json` (precomputed (prompt, variant_id, raw_output, parse_result, schema_valid) records), `scripts/precompute-structured-outputs.ts` (build-time script that calls OpenAI with three enforcement levels for three example prompts, validates each output against the Zod schema, persists the result JSON). Add a row to `src/components/Home/conceptsData.tsx`'s category list under a new `ai-engineering` category. Cross-link prominently to `../../study-prompt-engineering/02-structured-outputs.md`.
- **Done when:** the page loads at `/reincodes/ai/structured-outputs/` in production (GitHub Pages), schema tree renders interactively with each field's type visible, three output panels show the precomputed comparisons for three example prompts, parse + schema-validation results are clearly labelled (✓/✗ with the failure mode), `next build` passes under `output: "export"`. Build script runs against the actual OpenAI API locally and captures stable outputs for the strict-mode variant; for the JSON-mode variants, runs multiple captures and selects the one that best demonstrates the failure mode for teaching value.
- **Estimated effort:** 2-3 days. Schema-tree renderer (with type-aware UI): half day. Three-panel output comparison + parse/validate visualisation: half day. Precompute script with three enforcement levels + retry logic for triggering courtesy-fence: 1 day. Prompt selector + provider toggle + mobile layout + cross-link to prompt-engineering guide: half day.

---

## Summary

### Part 1 — concept recap

Structured outputs are the API-level machinery that constrains LLM generation to match a typed schema. Three enforcement levels exist in production today: (1) prompt-only "return JSON" — weakest, most failure-prone (5-15% parse failures); (2) JSON mode — provider biases sampling toward JSON shape, no schema enforcement (1-3% parse failures, schema violations still possible); (3) strict mode — grammar-constrained decoding, schema-valid by construction (~0% parse failures, explicit refusal mechanism). The courtesy-markdown-fence bug — where the model wraps JSON in a markdown code fence because of a "be helpful, format nicely" instruction — is the most common failure mode in non-strict modes and is fully prevented in strict mode. Cross-provider APIs differ (OpenAI's `response_format` + `strict: true`, Anthropic's `tools` with default-strict schemas, Google's `response_schema`) but the conceptual contract is the same. In this codebase the concept is *planned* rather than implemented: reincodes has no LLM surface, and the buildable target is a `/ai/structured-outputs` visualizer that shows the same prompt across three enforcement levels with precomputed outputs and parse/schema-validation results.

### Part 2 — key points to remember

- **The three enforcement levels**: unstructured (prompt-only), JSON mode (format biasing), strict mode (grammar-constrained). Failure rates drop ~5x at each level.
- **The courtesy-fence bug**: model wraps JSON in markdown ` ```json ... ``` ` because of "be helpful" instructions. Strict mode prevents it; non-strict modes don't.
- **The provider matrix**: OpenAI uses `response_format` + `strict: true`. Anthropic uses tool-use with default-strict schemas. Google uses `response_schema`. All consume JSON Schema with provider-specific supported subsets.
- **The Zod pattern**: define schema in Zod, infer TS type with `z.infer<>`, compile to JSON Schema with `zod-to-json-schema`, pass to provider, validate result at the application boundary. Schema-once-use-twice.
- **The reincodes shape**: implementation is Case B; the buildable target is a three-panel side-by-side visualizer under `/ai/structured-outputs` with strict mode vs JSON mode vs courtesy-prompted JSON mode comparisons. Cross-link to the prompt-engineering structured-outputs file.

---

## Interview defense

### What an interviewer is really asking

Behind "how do you reliably get structured output from an LLM?" the interviewer is checking whether the candidate has shipped a chain that broke because of a parse failure. A junior answer says "use JSON mode and parse the result." A senior answer names the three enforcement levels, names the courtesy-fence bug, names strict mode as the default for code-consumed output, and names a specific production incident where the absence of strict mode caused a regression. The interviewer is checking for the operational framing because structured-output reliability is the single biggest production risk for LLM chains, and teams that haven't internalised it are teams that will be paged at 3 AM.

### Likely questions

**Q (mid):** What's the difference between JSON mode and strict mode?

A: They're different enforcement levels of the same goal. JSON mode tells the provider "bias your sampler toward emitting JSON-shaped tokens" — the model is more likely to produce JSON but isn't constrained to. The output might still be invalid JSON (closing brace missing, key typo), might still violate your schema (wrong type, missing field), might still get wrapped in a markdown fence. Strict mode tells the provider "compile this JSON schema to a grammar and only sample tokens that keep the partial output valid against the grammar." The model can't produce invalid output by construction. The cost difference is small (strict mode has a small per-call premium); the reliability difference is enormous (parse failures drop from ~3% to ~0%). For any chain whose output is consumed by code, strict mode is the right default.

```
JSON mode                          strict mode
─────────────                      ─────────────
biases sampling toward JSON        constrains sampling per schema
schema not enforced                schema enforced by construction
~1-3% parse failures               ~0% parse failures
courtesy-fence bug possible        courtesy-fence impossible
shape violations possible          shape violations impossible
slightly cheaper per call          slightly more expensive per call
```

**Q (senior):** A chain in production starts emitting JSON wrapped in markdown code fences after a model upgrade. Walk me through the diagnosis and fix.

A: The diagnosis is almost certainly the courtesy-markdown-fence bug — a system prompt instruction like "be helpful, format nicely, use markdown where appropriate" caused the model to wrap JSON in ` ```json ... ``` ` for "readability." The model isn't broken; the model is following instructions, and the new model is more diligent about following them than the previous version. Three fixes, in order of robustness: (1) migrate to strict mode — `response_format: { type: "json_schema", json_schema: { ..., strict: true } }` on OpenAI, or use tool-use on Anthropic. This prevents the fence entirely because the grammar excludes ` characters. (2) Add an explicit negative instruction to the system prompt: "Do not wrap output in markdown code fences." This works most of the time but isn't bulletproof under future model upgrades. (3) Post-process to strip fences before parsing. This works but accumulates technical debt and doesn't catch other format drift. The senior answer is (1); the pragmatic short-term fix is (2) + (3) until (1) ships. And the eval suite gets a new test case that includes inputs known to trigger the fence behaviour, so this regression can't ship undetected again.

```
diagnosis order                      fix order
──────────────────────              ──────────────────────
1. did the model version change?     1. migrate to strict mode
2. did the system prompt change?     2. add negative instruction
3. did inputs change?                3. post-process strip
4. is this courtesy-fence bug?       4. add eval test case
```

**Q (arch):** At 10× scale — a chain ecosystem with 30 different schemas across 8 chains — how does structured outputs architecture compose?

A: Three architectural decisions. First, schemas as first-class artifacts: every schema lives in a single source file (Zod definitions), imported by both the chain code and the eval suite. Schema changes get reviewed in PRs; no inline schema definitions inside the chain logic. Second, strict mode by default with explicit opt-out: every chain calls the provider with `strict: true` unless a documented reason requires otherwise (open-ended generation, exploratory chains, evals that need to capture free-text). The opt-out lives in a code comment with a reason. Third, schema-aware provider abstraction: if the chain might run on Claude or GPT, the provider-abstraction layer translates the Zod schema to the appropriate provider-specific call shape. Each provider's strict-mode supported subset is documented; the abstraction layer fails fast at compile time (via TypeScript types) if a schema uses a feature not supported on every target provider. At 10× scale, the schemas become the documentation of the chain ecosystem — a new engineer reads `chains/schemas.ts` and understands what every chain emits before reading any prompt.

```
single chain                        30-schema ecosystem at 10x scale
─────────────────                   ────────────────────────────────
schema inline in chain file         schemas in dedicated module
strict mode optional                strict mode default, opt-out reviewed
one provider                        provider abstraction with schema translator
eval covers happy path              eval covers happy path + courtesy-fence
                                      + refusal + cross-provider parity
```

### The question candidates always dodge

**Q:** Why not just use JSON mode and add good prompt engineering? Strict mode adds complexity, and a well-tuned prompt produces clean JSON anyway.

A: This argument is wrong in a way that becomes painful only after a few months. A well-tuned prompt produces clean JSON *for the inputs you tested against and the model version you tested against.* The day the model upgrades or the input distribution shifts (new user segment, different language, edge-case content), the prompt's reliability degrades and you don't know until production breaks. Strict mode is a *constructional* guarantee — the model literally cannot produce invalid output — while prompt engineering is an *empirical* observation — the model produced valid output in your test set. The cost difference is small; the reliability difference is operationally enormous. The candidate who defends prompt-engineering-only is the candidate who hasn't been paged at 3 AM for a parse failure that the eval suite missed. The cost ledger:

```
JSON mode + good prompts             strict mode
──────────────────────              ─────────────
+ slightly simpler code              + structurally guaranteed valid
+ marginally cheaper per call        + zero parse-failure class of bugs
- reliability empirical, not          + survives model upgrades
  constructional                     + survives input distribution shift
- model upgrades can regress          + refusal is explicit, debuggable
- input distribution shifts can       - small per-call premium
  regress                            - schema-supported subset varies
- eval suite has to cover every       - migration to a new provider
  possible courtesy-fence trigger      requires schema retest
- ~1-3% parse failures in prod
```

The honest answer: "JSON mode + good prompts is fine for prototypes, strict mode is the default for production." The interview move is naming the breakpoint (prototype → production) rather than defending the lighter option as universally correct.

### One-line anchors

- "The LLM boundary needs a type contract or it isn't trustable. Strict mode is the contract."
- "Three enforcement levels: unstructured (~5-15% fail), JSON mode (~1-3% fail), strict mode (~0% fail). The cost difference is small."
- "The courtesy-markdown-fence bug is the most common failure mode in non-strict modes. Strict mode prevents it by construction."
- "Cross-provider variation: OpenAI's `response_format` + `strict: true`, Anthropic's `tools` with default-strict, Google's `response_schema`. Same contract, different shapes."
- "Zod for the schema, `z.infer<>` for the TS type, `zodToJsonSchema()` for the LLM boundary. Schema-once-use-twice."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw the three enforcement levels (unstructured / JSON mode / strict mode) from memory: what each does at the API surface, what the failure mode is, what the parse-failure rate looks like. Label which level prevents the courtesy-markdown-fence bug.

✓ Pass: three levels ordered by enforcement strength, failure modes named, strict mode marked as preventing the fence bug
✗ Fail: re-read the primary diagram, wait 10 minutes, try again.

### Level 2 — Explain it out loud

Explain structured outputs to a colleague who has called the OpenAI API but only ever asked for free-text output. No notes. Under 90 seconds.

Checkpoints — did you:
- Name the three enforcement levels and what each does?
- Name the courtesy-fence bug and which level prevents it?
- Reference at least two providers' specific API shapes (OpenAI, Anthropic, Google)?
- Reference the buildable target (`/ai/structured-outputs` visualizer) as how you'd demonstrate the concept in reincodes?

If you skipped any: you described the mechanism, you didn't argue for strict mode as the default.

### Level 3 — Apply it to a new scenario

A teammate proposes a chain that classifies user feedback into 12 categories with a free-text "reasoning" field explaining the choice. They're seeing 8% parse failures in their JSON-mode implementation and want to add retry logic. Lay out the structured-outputs diagnosis: why is retry logic the wrong fix, what enforcement level should they use, and what does the migration path look like?

Write your answer (3–5 sentences minimum). Then check whether your proposed architecture matches the constraints `00-overview.md` names for any planned AI feature in reincodes (static-export contract, precomputed corpus, no live LLM at request time).

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff from the Tradeoffs section. Answer in writing: "If I were starting the `/ai/structured-outputs` visualizer today with the same constraints (static export, no live LLM, GH Pages deploy, mobile-first), would I still ship all three enforcement levels in the comparison? Why or why not? If I'd narrow the scope, what would I drop and what would that cost in teaching clarity?"

Reference the actual code:
→ Point to `next.config.ts` L7 (`output: "export"`) to support the static-export constraint
→ Point to what would need to change for a live visualizer — `next.config.ts` loses `output: "export"`, deploy target shifts, API keys live somewhere

There is no right answer. The point is specificity.

### Quick check — code reference test

Without opening any files, answer:
- What file in reincodes controls the static-export contract that constrains how the visualizer ships?
- What is the OpenAI API parameter that enables grammar-constrained decoding?
- What field in `conceptsData.tsx` would need a new entry to register the visualizer in the home grid?

Then open the files and verify.

✓ Pass: `next.config.ts`, `strict: true` on `response_format` or tool definition, `ConceptCategory[]` (the exported array)
✗ Fail on details: that's fine — the shape is what matters. File and parameter names should be recoverable.
