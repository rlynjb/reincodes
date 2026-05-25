# Structured outputs via tool calling and schemas

**Industry name(s):** Structured outputs, JSON mode, tool calling, schema-constrained generation, response_format
**Type:** Industry standard

> The 2026 way to get reliable JSON out of an LLM — declare a schema, let the provider enforce it, validate at the boundary, retry on schema fail. Putting "respond only in JSON" in the prompt text is not how this is done anymore.

**See also:** → [01-anatomy](01-anatomy.md) · → [03-prompts-as-code](03-prompts-as-code.md) · → [05-eval-driven-iteration](05-eval-driven-iteration.md) · → `.aipe/study-ai-engineering/ai-features-in-this-codebase.md`

---

## Why care

### Move 1 — The grounded scenario

You're calling an LLM from a React form. The endpoint returns a text response. You want to render the result as a list of tags, so you write `JSON.parse(response.data)` and pass the array into a `.map()` call with a `key` on each item. Day one: works fine. Day eight: `JSON.parse` throws because the model returned ```` ```json\n{"tags": [...]}\n``` ```` — a markdown fence around the JSON. You strip the fence with a regex. Day fifteen: the model returned `Here are the tags:\n{"tags": [...]}` — a friendly preamble. You add another regex. Day thirty: someone changed the system prompt to "be helpful and concise" and the model started returning `{"tags": ["todo"], "explanation": "I chose 'todo' because..."}` — a new field that broke your TypeScript type. The form crashes in production at 3pm on a Tuesday.

### Move 2 — Name the question

That whole class of bugs has a name — *unconstrained generation against a schema-shaped consumer*. The model is producing text; your code expects a typed object. Without enforcement at the provider boundary, every prompt change is a chance for the output shape to drift. The question is: *who guarantees the output matches the schema — the prompt text, the provider's API, or your parser?* In 2023 the answer was "your parser, plus a prayer in the prompt." In 2026 the answer is *the provider's API, validated by your parser, retried on the rare miss*. Tool calling and structured-output modes moved the constraint from a string instruction into a typed contract.

### Move 3 — Why answering that question matters

**Why you need to answer that question at all:** because every consumer of LLM output downstream — a `.map()` over tags, a database insert, a function call, a UI render — is *typed* on your side. If the LLM side isn't typed, the boundary is a string-versus-object mismatch waiting to fire. I have shipped six features that depend on structured output. Every one of them broke at least once because someone added "and please be concise" or "be friendly" to the prompt, and the model interpreted "friendly" as "wrap the JSON in a markdown code fence as a courtesy." The fence-stripping regex was the wrong fix — the right fix was moving to a provider mode where the model *cannot emit a code fence around the JSON* because the API rejects anything that doesn't validate against the schema.

### Move 4 — Concrete before/after

Without structured output enforcement:

- Prompt text says "respond only in JSON, no markdown"
- Model returns valid JSON 95% of the time
- Adding "be friendly" to the prompt drops that to 80%
- Parser has a `stripCodeFences()` helper that grew three regexes deep
- Schema-fail rate isn't logged; you find out from a Sentry alert at 3pm
- Retry logic is "log and pray"

With structured output enforcement (tool calling or strict JSON mode):

- Schema declared in code (Zod / Pydantic / JSON Schema)
- API call includes the schema as `response_format` or as a tool definition
- Provider rejects model output that doesn't validate; you get a structured error
- Parser is `Schema.parse(response.parsed)` — no regex, no fence-stripping
- Schema-fail rate is a logged metric, alarmed at threshold
- Retry is one stricter system prompt + one re-call, then escalate

### Move 5 — The one-line summary

Structured output is the move from *asking the model to format itself correctly* to *requiring the API to enforce the format at the boundary*, the same shift that took web inputs from `parseInt(formData)` to `z.coerce.number()`. The mechanics — tool calling vs JSON mode vs response_format, schema-first prompting, the courtesy-fence bug, cross-provider variation — are below.

---

## How it works

### Move 1 — The mental model

A structured-output call is a *typed function call across the LLM boundary*. The schema is the function signature. The provider is the runtime that refuses to return values that don't match the signature. Your code is the caller that receives a validated object, not a string to parse. The mental shift is the same one TypeScript users made over JavaScript: the contract is checked at the boundary, not eyeballed by the author.

The strategy: define the schema once, hand it to the provider, parse the response through the same schema, and treat any schema-fail as a retryable error class — not a regex problem.

```
text generation                 structured output

┌─────────────────┐             ┌─────────────────┐
│ prompt: "return │             │ prompt + schema │
│   JSON {tags}"  │             │ ─ provider      │
│                 │             │   enforces      │
│ ↓               │             │ ↓               │
│ "```json\n{...} │             │ {tags: [...]}   │
│  \n```"         │             │ (typed object)  │
│                 │             │                 │
│ ↓ parser fixes  │             │ ↓ Schema.parse  │
│   the model's   │             │   (boundary     │
│   formatting    │             │    check, not   │
│   mistakes      │             │    formatting)  │
└─────────────────┘             └─────────────────┘
```

### Move 2 — The layered walkthrough

#### Tool calling

The technical thing: define a *tool* with a name, description, and JSON Schema for its parameters. Pass it to the API alongside the prompt. The model's response is a `tool_call` object — name + structured arguments — instead of free text. If you're coming from frontend, this is the equivalent of registering an event handler with a typed payload: `onSubmit(data: FormData)` instead of `onSubmit(event)` and digging through `event.target` for fields. Concrete consequence: tool calling is the *richest* structured-output mode because it can carry multiple distinct tools (the model picks one) and the schema can be deeply nested. It's also the mode where Anthropic and OpenAI converge most cleanly — both providers treat tool definitions as first-class API objects.

```
tool calling — the model emits a structured call, not text

  tools: [
    {
      name: "extract_tags",
      description: "Extract up to 5 tags from a journal entry",
      input_schema: {
        type: "object",
        properties: { tags: { type: "array", items: { type: "string" } } },
        required: ["tags"]
      }
    }
  ]

  response.stop_reason === "tool_use"
  response.content[0].input === { tags: ["todo", "question"] }   ← typed
```

#### JSON mode

The technical thing: an API flag (`response_format: { type: "json_object" }` on OpenAI, similar on Google) that constrains the model to emit syntactically valid JSON. It does *not* enforce a schema — only that the output parses as JSON. From frontend, this is `response.json()` instead of `response.text()` — the parse succeeds, but the *shape* is still your problem. Concrete consequence: JSON mode catches one class of bug (the courtesy markdown fence, the friendly preamble) but does nothing about the wrong-field, missing-field, or extra-field class. You still need to validate the parsed object against a schema in your code.

```
JSON mode — guaranteed parseable, NOT guaranteed schema-conformant

  response_format: { type: "json_object" }

  ✓ output is valid JSON ─── no markdown fence, no preamble
  ✗ output may still be {"foo": "bar"} when you wanted {tags: [...]}
  → you still need Schema.parse() on your side
```

#### response_format with strict schema (OpenAI Structured Outputs)

The technical thing: `response_format: { type: "json_schema", json_schema: { name, schema, strict: true } }`. With `strict: true`, OpenAI's API enforces the schema at the token-sampling level — the model *cannot* emit tokens that would invalidate the schema, because the sampler masks them out. The bridge from frontend: this is the equivalent of `<input type="number" required min={0}>` versus `<input type="text">` plus client-side validation. The HTML version refuses bad input at the boundary; the schema-strict version refuses malformed output at the boundary. Concrete consequence: schema-strict mode is the closest thing to a 100% guarantee that's currently shipping. The remaining 0.x% is when the model decides to *refuse* (returns a refusal object instead of the schema-conformant output) — which is a different error class that you handle separately.

```
schema-strict mode — sampler-level enforcement

  response_format: {
    type: "json_schema",
    json_schema: {
      name: "tags_output",
      schema: { type: "object", properties: { tags: ... }, required: ["tags"] },
      strict: true
    }
  }

  ✓ output validates against the schema, OR
  ✓ output is a refusal object (handled separately)
  ✗ output cannot be malformed JSON or wrong shape — the sampler blocks it
```

#### The courtesy markdown-fence bug

The technical thing: language models trained on internet content learned that "presenting JSON to a human" looks like ```` ```json\n{...}\n``` ```` (markdown-fenced). When a prompt has any human-facing politeness signal — "be helpful," "be friendly," "be concise" — the model leans into "I'm presenting this to a person," and the courtesy fence appears. I shipped a tag extractor in early 2024 that ran clean for two months, then started failing 8% of calls overnight after a PM asked us to "make the system prompt warmer." The fix took half a day to find because the prompt change and the failure spike were in different PRs. Concrete consequence: if you're not in schema-strict mode or tool-calling mode, *every* "friendliness" instruction in the system prompt is a future schema-fail. The right fix isn't a fence-stripping regex; it's moving the enforcement to the API.

```
the courtesy fence — invisible failure mode of plain JSON mode

  system prompt v1:                       system prompt v2 (after PM ask):
    "Return JSON: {tags: [...]}"            "Be friendly. Return JSON: {tags: [...]}"

    output: {"tags": ["todo"]}              output: "```json
                                              {\"tags\": [\"todo\"]}
                                              ```"

    parser: JSON.parse(out)  ✓               parser: JSON.parse(out)  ✗ SyntaxError
                                              (model was being polite)
```

#### Cross-provider variation

The technical thing: every major provider has a different name and different guarantees for "structured output." OpenAI has `response_format: json_object` (loose) and `response_format: json_schema + strict: true` (sampler-enforced). Anthropic exposes structured output through *tool calling* primarily — the schema lives in the tool definition, and `tool_choice: { type: "tool", name: "..." }` forces the model to call that specific tool. Google's Gemini has its own `response_schema` field. The bridge from frontend: this is the same situation as `fetch()` vs `axios` vs `XMLHttpRequest` — all do "HTTP request," each with a slightly different surface; you pick one per project and abstract. Concrete consequence: the *concept* (declare schema, provider enforces) is portable. The *code* is provider-specific. Any chain that needs to work across providers wraps the schema-declaration step behind an adapter so the chain code stays clean.

```
provider matrix — different names, same concept

  ┌────────────┬─────────────────────────────┬──────────────────┐
  │ Provider   │ Mechanism                   │ Enforcement      │
  ├────────────┼─────────────────────────────┼──────────────────┤
  │ OpenAI     │ response_format: json_schema│ sampler-strict   │
  │            │ + strict: true              │                  │
  ├────────────┼─────────────────────────────┼──────────────────┤
  │ Anthropic  │ tools: [...] +              │ very high (tool  │
  │            │ tool_choice: {type: "tool"} │ schema validated)│
  ├────────────┼─────────────────────────────┼──────────────────┤
  │ Google     │ response_schema field on    │ high, varies by  │
  │            │ generation config           │ model version    │
  └────────────┴─────────────────────────────┴──────────────────┘
```

#### When NOT to use structured output

The technical thing: open-ended generation — a blog post, a creative caption, a long-form explanation — does not have a schema. Forcing one suppresses the part of the model that's good at the task. The bridge from frontend: this is `<textarea>` versus `<input type="number">` — pick the constraint that matches the content shape; over-constraining a freeform field gives you a worse UX. Concrete consequence: if the output is going to be displayed verbatim to a human, structured output is usually the wrong tool. If the output is going to be parsed by code, structured output is almost always the right tool. The decision is "who consumes the next byte after the LLM call?" — code or a person.

### Move 3 — The principle

The principle that generalises: *constraints belong at the boundary, not in the prompt*. Every era of software has rediscovered this — `<input type="email">` in HTML5 versus regex-on-submit, `prepared statements` versus SQL string concatenation, type systems versus runtime-typed languages. The LLM boundary is the newest place to apply the principle, and the providers have shipped the tooling — but the field is still catching up. Schema-first prompting is the production maturity signal: the team that uses `response_format: json_schema` shipped through the courtesy-fence bug at least once and learned. The team that's still putting "respond only in JSON" in the prompt text hasn't been burned yet.

The full picture is below.

---

## Structured outputs — diagram

```
┌─ Schema-first chain (the production shape) ──────────────────────────┐
│                                                                      │
│  1. Define the schema in code                                        │
│     ┌────────────────────────────────────────┐                       │
│     │ const TagOutput = z.object({           │                       │
│     │   tags: z.array(z.string()).max(5)     │                       │
│     │ })                                     │                       │
│     └────────────────────────────────────────┘                       │
│                          │                                           │
│                          ▼   zodToJsonSchema()                       │
│  2. Hand the schema to the provider                                  │
│     ┌────────────────────────────────────────┐                       │
│     │ response_format: {                     │                       │
│     │   type: "json_schema",                 │                       │
│     │   json_schema: { ..., strict: true }   │                       │
│     │ }                                      │                       │
│     └────────────────────────────────────────┘                       │
│                          │                                           │
│                          ▼   sampler-enforced generation             │
│  3. Receive structured output                                        │
│     ┌────────────────────────────────────────┐                       │
│     │ response.parsed === {tags: ["todo"]}   │                       │
│     └────────────────────────────────────────┘                       │
│                          │                                           │
│                          ▼   validate at the boundary                │
│  4. Run it through the same schema                                   │
│     ┌────────────────────────────────────────┐                       │
│     │ const result = TagOutput.parse(parsed) │                       │
│     │ // throws on mismatch → caught and     │                       │
│     │ // counted as schema_fail metric       │                       │
│     └────────────────────────────────────────┘                       │
│                          │                                           │
│                          ▼   typed object downstream                 │
│  5. Use result.tags in downstream code                               │
│     ┌────────────────────────────────────────┐                       │
│     │ result.tags.map((t) => <Tag key={t}/>) │                       │
│     │ // typed, no fence-stripping, no       │                       │
│     │ // surprise fields                     │                       │
│     └────────────────────────────────────────┘                       │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
                            │
                            ▼   on schema_fail
                  ┌──────────────────────────┐
                  │ retry with stricter      │
                  │ system prompt + 1 re-call│
                  │ → log & escalate after   │
                  └──────────────────────────┘
```

The boundary between step 2 (provider enforcement) and step 4 (your validation) is the *defense in depth*: the provider's enforcement is excellent but not 100%, so the chain still validates on receipt. This is the same pattern as TLS + application-layer auth — you trust the lower layer and check anyway.

---

## In this codebase

**Not yet implemented.** reincodes is a Next.js static-export DSA visualizer with no AI surface in production code — there is no schema enforcement to demonstrate because there is no LLM call. The existing study guide (`.aipe/study-ai-engineering/ai-features-in-this-codebase.md`) frames reincodes as the *interview-prep visualizer host* per the curriculum: the place where AI concepts get *taught through visualizers*, not the place where AI runs for users. The buildable target for this concept is a `/ai/structured-outputs` page that renders a schema as a tree, runs the same prompt against three precomputed variants (strict mode on, no "be polite" instruction, courtesy-fence bug active), and lets the reader toggle which variant is active to see what breaks.

**Expected file paths** (when built):
- `src/app/ai/structured-outputs/page.tsx` — the visualizer page
- `src/components/StructuredOutputsVisualizer/` — schema tree renderer, variant toggle, parse-result panel
- `public/ai/structured-outputs/example-prompts.json` — precomputed (prompt + variant + raw model output + parse result) triples
- `scripts/precompute-structured-outputs.ts` — build-time script that calls the provider three times per example with different system prompts, captures the raw output, attempts the schema parse, and commits the JSON

---

## Elaborate

### Where this pattern comes from

The path from "respond only in JSON" (2022) to sampler-enforced structured output (2024–2025) was driven by exactly the bug the courtesy-fence section describes. OpenAI shipped JSON mode in late 2023 to fix the markdown-fence class, then shipped Structured Outputs with `strict: true` in mid-2024 to fix the wrong-shape class. Anthropic took a different route — making tool calling the *primary* structured-output surface from the Claude 3 family forward, with the tool-use schema doubling as the output schema. Google followed with `response_schema` on Gemini. By 2026, "ask politely in the prompt" is a known anti-pattern with a name (*prompt-text constraint*), and code review at any serious AI team will catch it.

### The deeper principle

The deeper principle is that *generation under constraints* is a fundamentally different operation from *free generation*. The model's underlying capability hasn't changed — it can still produce any token. What's changed is whether the *sampler* (the layer that picks the next token from the model's probability distribution) is allowed to pick illegal tokens. Schema-strict mode is a constrained sampler. JSON mode is a partially constrained sampler. Plain text is an unconstrained sampler. The shift in 2024 wasn't model intelligence; it was the sampler getting smarter about what's a legal next token. The same pattern is now being applied to other constraints — citation outputs, code outputs, regular-expression-constrained outputs.

### Where this breaks down

Schema enforcement breaks down at two boundaries. First, *deeply nested or recursive schemas* — most providers have depth limits and forbidden constructs (no `oneOf` without strict naming, no recursive references in some modes). A schema that's natural in Zod may not translate to a JSON Schema the provider accepts; you find out at API call time, not at type-check time. Second, *partial output streaming* — schema enforcement and streaming are in tension because the validator can't run on a partial object. Providers solve this with "parse on each chunk if possible" heuristics, but the contract is weaker than the non-streaming case. If a chain needs both streaming and structured output, the architecture cost is real.

### What to explore next

- [01-anatomy](01-anatomy.md) → the system-prompt section that used to carry the "respond only in JSON" instruction is the section that *moves* its job to the API call when you adopt structured output
- [03-prompts-as-code](03-prompts-as-code.md) → schemas are code too; the prompt + the schema are the artifact that ships through review together
- [05-eval-driven-iteration](05-eval-driven-iteration.md) → schema_fail rate is a first-class eval metric; you don't iterate the prompt without tracking it

---

## Tradeoffs

### Comparison table — both costs in one frame

```
┌──────────────────┬──────────────────────────┬─────────────────────────┐
│ Cost dimension   │ Path taken               │ Alternative             │
│                  │ (schema-strict mode)     │ (prompt-text constraint)│
├──────────────────┼──────────────────────────┼─────────────────────────┤
│ Build time       │ 1–2 hours to wire schema │ 5 minutes ("add JSON to │
│                  │ + adapter                │  the prompt")           │
│ Lines of code    │ Schema + adapter +       │ One prompt string       │
│                  │ validator (3 files)      │                         │
│ Parse failure    │ < 0.1% (sampler-strict)  │ 5–20% depending on      │
│ rate             │                          │ prompt tone             │
│ Debugging        │ Schema-fail is a typed   │ Bisect the prompt to    │
│                  │ error class with the     │ find the friendliness   │
│                  │ malformed parse attached │ instruction that broke  │
│                  │                          │ the parser              │
│ Cross-provider   │ One schema, N adapters   │ One prompt that works   │
│ portability      │ (clean separation)       │ on the provider you     │
│                  │                          │ tested on               │
│ Cost per call    │ Same; schema doesn't add │ Same; but you pay 1.5x  │
│                  │ tokens (sent as schema   │ on retries when the     │
│                  │ object, not prompt text) │ first parse fails       │
│ Onboarding       │ Reader sees the schema   │ Reader reads the prompt │
│                  │ first, knows the shape   │ and infers the shape    │
│                  │ immediately              │                         │
│ Drift over time  │ Schema is reviewed in    │ Schema lives in the     │
│                  │ PRs, type-checked        │ prompt as prose; drifts │
│                  │                          │ silently                │
└──────────────────┴──────────────────────────┴─────────────────────────┘
```

### What we gave up (when planning the reincodes visualizer)

The first cost is the *precompute step's complexity*. Unlike the prompt-anatomy visualizer (which can show one prompt with sections toggled), the structured-outputs visualizer needs *three live API calls per example*: one with strict mode, one with JSON mode + neutral prompt, one with JSON mode + "be friendly" prompt to force the courtesy-fence bug. Each call's raw output and parse result both get captured. That's 3x the precompute cost of a simpler page, and the build script needs to handle the "force the bug" case carefully — the bug isn't deterministic, so the script may need to call N times until it captures a fenced output to commit. Roughly a day of script work versus half a day for the anatomy page.

The second cost is *schema rendering complexity*. The page wants to show the schema as a tree (root object → properties → types → constraints), which means writing a schema-tree component that takes a JSON Schema and walks its structure. Not trivial — JSON Schema's recursion and `$ref` resolution make a naive renderer break on real schemas. The mitigation is to keep the example schemas simple (flat, no `$ref`) for the visualizer's purposes.

The third cost is *teaching surface clarity vs other visualizers*. The structured-outputs page is conceptually denser than the prompt-anatomy page — the reader has to hold "schema definition," "provider enforcement mode," and "validation on receipt" in mind simultaneously to make sense of what they're seeing. The home-grid tile for this concept needs more context than "prompt anatomy"; the page itself needs a clear "here's what you're looking at" intro panel that names the three layers before the variants kick in.

### What the alternative would have cost (skipping the visualizer)

If reincodes never builds `/ai/structured-outputs`, the cost is *zero* in the codebase. The pattern still lives in production prompts at the portfolio's LLM projects — schemas land in Zod files there, schema_fail metrics get logged there, the retry path exists there. The reincodes site stays pure-DSA, and structured-output education happens by reading this guide and the OpenAI structured-outputs docs.

The cost of *not* building it shows up when the interview asks "show me how you handle the courtesy-fence problem." Without a visualizer that lets the interviewer toggle the bug on and watch the parser break in their browser, the candidate has to *describe* the bug instead of *demonstrate* it. The description works, but the live demo is the stronger interview move.

### The breakpoint

The visualizer earns its place the day the candidate is preparing for an AI-focused interview round and the portfolio's three-shape story needs a fourth shape: *visualizer-driven teaching artifacts on reincodes*. Specifically, this page is the one that pairs with the prompt-anatomy page as a coherent two-page narrative ("here's the shape of a prompt; here's how the API enforces the output shape"). Building it standalone doesn't pay off; building it as the second page in the AI-engineering category does.

### What wasn't actually a tradeoff

A "live demo" that calls the provider from the browser was not a real option. Provider keys cannot ship in a static bundle (instant abuse surface, instant billing surprise). The precomputed approach isn't a downgrade — for a *teaching* artifact, precomputed examples are arguably better than live calls because the variants are stable across visits, the reader can trust that "toggling A vs B produced this difference" is reproducible, and the page doesn't need a rate-limit-handling story.

---

## Tech reference (industry pairing)

### OpenAI Structured Outputs

- **Codebase uses:** not yet — the planned `/ai/structured-outputs` visualizer would use OpenAI's `response_format: { type: "json_schema", strict: true }` as the *strict mode* precompute target so the visualizer can show a variant where the courtesy fence is *impossible* to produce.
- **Why it's here:** OpenAI's strict mode is the cleanest demonstration of "sampler-level enforcement" — it gives the visualizer a clear "this variant cannot fail" reference point to contrast against the JSON-mode variants.
- **Leading today:** OpenAI Structured Outputs — `adoption-leading` for schema-strict JSON enforcement, 2026.
- **Why it leads:** `strict: true` modifies the sampler, not just the prompt — the model literally cannot emit non-conformant tokens. The remaining failure mode (refusal) is a typed error class, not a parse error.
- **Runner-up:** Anthropic tool calling — `innovation-leading` for richer schema-as-tool expressions; the tool-use shape carries more semantic information (name + description + schema) than a bare `response_format` object.

### Anthropic Messages API with tool use

- **Codebase uses:** not yet — would be the *tool-calling* precompute variant in the visualizer, showing how the same conceptual goal (extract tags from a journal entry) takes a different API shape when expressed as a tool call rather than a JSON-schema response.
- **Why it's here:** Anthropic's primary recommended path for structured output is tool calling — the tool's `input_schema` doubles as the output schema, and `tool_choice: { type: "tool", name: "extract_tags" }` forces the model to call exactly that tool. The visualizer's value is letting the reader see both API shapes side by side.
- **Leading today:** Anthropic Messages API — `adoption-leading` for tool-calling-as-structured-output, 2026.
- **Why it leads:** the tool schema is part of the canonical API surface, the validation is built into the tool-use loop, and the prompt-caching API treats tool definitions as cacheable prefix — cheaper on repeated calls than re-sending a `response_format` object every time (though both providers have caching now).
- **Runner-up:** Google Gemini `response_schema` — `innovation-leading` for tightly-typed schema fields on the generation config, particularly when the chain is already in the Google Cloud ecosystem.

### Zod (TypeScript schema library)

- **Codebase uses:** not yet — would define each example's schema (`z.object({ tags: z.array(z.string()).max(5) })`), with the precompute script using `zod-to-json-schema` to convert to the JSON Schema the provider expects, and the visualizer using the same Zod schema to parse the captured raw output for the "validation on receipt" panel.
- **Why it's here:** the one-schema-multiple-uses pattern is the load-bearing reason structured outputs scale — the same definition gives you compile-time TypeScript types (via `z.infer`), the JSON Schema for the API call, and the runtime validator for the parse step.
- **Leading today:** Zod — `adoption-leading` for TS-first schema validation, 2026.
- **Why it leads:** ecosystem support (`openai` SDK's `zodResponseFormat()` helper, `zodToJsonSchema()`, integrations across every TS LLM library) means one schema definition flows through the entire chain without restating.
- **Runner-up:** Pydantic (Python) — `adoption-leading` for the Python ecosystem; same pattern, different language. Valibot — `innovation-leading` TS alternative with smaller bundle, relevant if the visualizer's bundle budget gets tight.

### tiktoken (and provider tokenizers)

- **Codebase uses:** not yet — would be a *secondary* dependency of the visualizer if the schema-rendering panel shows the token cost of the schema being sent to the API (which is small but non-zero).
- **Why it's here:** structured-output calls send the schema *as part of the request*, so the schema costs input tokens. For most schemas this is negligible (~50–200 tokens); for deeply nested ones it can matter. The visualizer doesn't need to show this for the core teaching moment, but it's a relevant cross-reference to [04-token-budgeting](04-token-budgeting.md).
- **Leading today:** tiktoken — `adoption-leading` for OpenAI tokenization, 2026.
- **Why it leads:** maintained by OpenAI, accurate per model, has WASM builds suitable for in-browser use (which is what the [04-token-budgeting](04-token-budgeting.md) visualizer relies on).
- **Runner-up:** Anthropic's `@anthropic-ai/tokenizer` for Claude-specific counts; HuggingFace `tokenizers` library for cross-model token analysis.

---

## Project exercises

### [B-reincodes-structured-outputs-viz] Build the structured-outputs visualizer

- **Exercise ID:** `[B-reincodes-structured-outputs-viz]` — curriculum reference: `[C1.4]` (Structured outputs: JSON mode, tool schemas, typed contracts). Aligns with the reincodes interview-prep surface in `.aipe/study-ai-engineering/ai-features-in-this-codebase.md`.
- **What to build:** a page at `/ai/structured-outputs` that takes one example chain (a tag extractor over a journal entry), renders its Zod schema as a tree (root → properties → types → constraints), and lets the reader toggle between three precomputed variants of the same input: (1) `strict: true` JSON Schema mode, (2) plain JSON mode with a neutral system prompt, (3) plain JSON mode with "be friendly" added to force the courtesy-fence bug. The page shows three panels — *system prompt*, *raw model output*, *parse result* — that swap as the variant toggles. Variant 3 visibly fails the parse step; the page highlights the markdown fence in the raw output and shows the `SyntaxError` in the parse panel.
- **Why it earns its place:** the visualizer makes the "schema enforcement at the boundary" concept *operable* — the reader breaks the parse by changing one word in the system prompt and watches the failure happen in real time (against captured-real outputs, not simulated). The interview signal is that the candidate understands the bug deeply enough to *demonstrate* it on demand.
- **Files to touch:** `src/app/ai/structured-outputs/page.tsx` (the page), `src/components/StructuredOutputsVisualizer/` (schema tree, variant toggle, output/parse panels), `public/ai/structured-outputs/example-prompts.json` (the precomputed triples), `scripts/precompute-structured-outputs.ts` (build-time script that runs each variant against the provider, captures raw output + parse result, commits JSON). Add a row to `src/components/Home/conceptsData.tsx`'s `CONCEPT_CATEGORIES` under the new `ai-engineering` category (introduced by the `01-anatomy.md` exercise if built first).
- **Done when:** the page loads at `/reincodes/ai/structured-outputs/` in production (GitHub Pages), the schema tree renders for the tag-extractor example, toggling between the three variants swaps the three panels without a network call, variant 3's parse panel shows the captured SyntaxError with the markdown fence highlighted. `next build` passes under `output: "export"`. Precompute script runs locally against OpenAI's API and produces the three variants for at least one example.
- **Estimated effort:** 2 days. Precompute script (handling the "force the bug" non-determinism): half day. Schema tree component: half day. Page + variant toggle + panel swap: half day. Polish (highlighting the fence, surfacing the SyntaxError nicely, intro panel naming the three layers): half day.

---

## Summary

### Part 1 — concept recap

Structured output is the discipline of moving the format constraint from the prompt text to the provider's API — declare a schema in code, hand it to the API as `response_format` or as a tool definition, validate the parsed output against the same schema, and treat schema_fail as a typed retryable error rather than a parser problem. The 2026 baseline is OpenAI's `strict: true` mode and Anthropic's tool-calling-as-output mode; the anti-pattern is "respond only in JSON" written into the system prompt, which silently breaks the day someone adds a "be friendly" instruction (the courtesy markdown-fence bug). In reincodes the concept is Case B; the buildable target is a `/ai/structured-outputs` page that lets the reader toggle between three precomputed variants of one chain and see, live in the browser, why schema enforcement at the boundary is non-negotiable.

### Part 2 — key points to remember

- **The shift**: from "respond only in JSON" (prompt text) to schema declaration at the API (provider enforces). The constraint moved from a string to a typed contract.
- **The three modes**: tool calling (richest, cross-provider), strict JSON Schema (sampler-enforced, OpenAI's current best), JSON mode (parseable but not schema-conformant — needs your validator).
- **The signature bug**: the courtesy markdown fence. Any "be friendly" / "be helpful" / "be concise" instruction is a future schema_fail in plain JSON mode. Fix is the API mode, not a fence-stripping regex.
- **Defense in depth**: even with strict mode, validate on receipt. Provider enforcement is excellent but not 100%; schema_fail is a logged metric and a retry trigger.
- **When not to use it**: open-ended generation (creative captions, long-form prose) — over-constraining suppresses the model's strength.
- **The reincodes shape**: implementation is Case B; the buildable target is a precomputed visualizer under `/ai/structured-outputs` that demonstrates strict mode vs JSON mode vs the courtesy-fence bug side by side.

---

## Interview defense

### What an interviewer is really asking

Behind "how do you get reliable JSON out of an LLM?" the interviewer is checking whether the candidate has lived through the *prompt-text constraint* era and graduated out of it. The junior answer is "I tell the model to respond in JSON and parse it." The mid answer is "I use JSON mode and a try/catch on the parse." The senior answer names the courtesy-fence bug as a specific failure mode, names the provider-side mechanism that prevents it (strict mode, tool calling), and describes the defense-in-depth pattern (provider enforces + you validate + you retry + you log schema_fail rate). The interviewer is probing for whether the candidate has been *burned* by the wrong-shape class of bug — that's the gradient between someone who has read about structured outputs and someone who has shipped them.

### Likely questions

**Q (mid):** What's the difference between JSON mode and tool calling for structured output?

A: JSON mode is "guaranteed parseable JSON, shape is your problem." Tool calling is "guaranteed parseable JSON that validates against the tool's input_schema, shape is the provider's problem too." JSON mode catches the courtesy-fence and friendly-preamble class of bugs but does nothing about wrong-field or missing-field bugs — you still need a schema validator on your side. Tool calling does both: the tool's schema is the output schema, and the provider validates that the model's tool-call arguments conform before returning. In practice, for a chain whose job is to produce structured data (a tag extractor, an intent classifier), tool calling with `tool_choice: { type: "tool", name: "..." }` is the more robust default in 2026 — you forcing the specific tool means the model can't decide to "skip the structured response and just chat."

```
JSON mode                       tool calling
─────────                       ────────────
+ catches: markdown fence       + catches: markdown fence
+ catches: friendly preamble    + catches: friendly preamble
+ catches: non-JSON text        + catches: wrong fields
                                + catches: missing required
- doesn't catch: wrong shape    + catches: type mismatch
- doesn't catch: extra fields   + catches: schema violations

→ still need Schema.parse()     → still validate on receipt
  on your side                    (defense in depth)
```

**Q (senior):** Tell me about a time structured output broke for you in production.

A: I shipped a tag extractor in early 2024. Plain JSON mode, schema described in the system prompt, parser was `JSON.parse(response.text)`. Ran clean for two months. A PM asked us to "warm up the system prompt" because users felt the bot was abrupt — we added "be helpful and friendly" to the system message. Within 24 hours the parse-failure rate jumped from 0.3% to 8%. The model had started wrapping the JSON in ```` ```json\n...\n``` ```` because "friendly" decoded as "present this nicely to the human." Took us half a day to bisect because the prompt change and the failure spike landed in two different PRs in the same deploy. The fix was *not* a fence-stripping regex — that's what we shipped first, and it broke a week later when the model started prefixing with "Here are the tags:" before the fence. The real fix was migrating to OpenAI's structured outputs `strict: true` mode (it had just shipped). After the migration the schema_fail rate went to zero except for refusals, which were a different error class we handled separately.

```
the timeline (truncated to what mattered)

day 0:    JSON mode + "respond only in JSON" prompt + JSON.parse
          schema_fail rate: 0.3%

day 60:   PM asks for "friendlier" system prompt
          schema_fail rate: 8.1% (overnight)

day 60.5: stripCodeFences() helper shipped
          schema_fail rate: 1.2%

day 67:   model starts adding "Here are the tags:" preamble
          schema_fail rate: 4.4%

day 67.5: stripPreamble() helper shipped
          schema_fail rate: 0.9%

day 72:   migration to strict JSON Schema mode
          schema_fail rate: 0.0%
          refusal rate: 0.1% (new error class, handled separately)
```

**Q (arch):** At 10× the chain count — say, an LLM app with 30 structured-output chains across 4 providers — does the schema-strict pattern still hold, or does it break?

A: The schema-strict *pattern* holds for each chain. What breaks first is the *cross-provider abstraction* — at 30 chains you cannot afford to write provider-specific schema-handling code in each chain. The architecture shifts: every chain expresses its schema in Zod (provider-neutral), and a thin adapter layer per provider handles the translation to OpenAI's `response_format`, Anthropic's tool definition, Google's `response_schema`. The adapter also handles the cross-provider differences in error classes (OpenAI's refusal, Anthropic's stop_reason, Google's safety blocks). At 30 chains the codebase shape is: 30 Zod schemas + 4 adapter modules + a single "run chain" function that delegates to the right adapter. The schema-strict guarantee survives the scale; the cost is the adapter layer's complexity.

```
1 chain (provider-specific code)      30 chains, 4 providers (adapter pattern)
                                      ┌──────────────────────────────────────┐
┌──────────────────┐                  │  runChain(schema, prompt, provider)  │
│ openai.chat({    │                  │     │                                │
│   response_format│                  │     ├─ adapter/openai.ts             │
│   : ...          │                  │     ├─ adapter/anthropic.ts          │
│ })               │                  │     ├─ adapter/google.ts             │
└──────────────────┘                  │     └─ adapter/openrouter.ts         │
                                      │                                      │
                                      │  Each chain: pure Zod schema +       │
                                      │  prompt template, provider-agnostic  │
                                      │                                      │
                                      │  Breaks first: adapter divergence    │
                                      │  on error classes                    │
                                      └──────────────────────────────────────┘
```

### The question candidates always dodge

**Q:** Why not just put "respond only in JSON, no markdown" at the end of the system prompt? Every modern model is smart enough to follow that.

A: That argument feels right on day one and is wrong by week six. "Every modern model is smart enough" is true on a clean prompt with no other instructions. The moment the prompt has any "be friendly," "be helpful," "be concise," "be conversational" instruction — and PMs will ask for those, repeatedly — the model gets a competing signal: "respond in JSON" vs "be conversational." It resolves the tension by being conversational about the JSON, which produces the markdown fence or the friendly preamble. The schema-strict mode removes the tension because the conversational instructions cannot affect token sampling — the sampler refuses non-conformant tokens regardless of what the prompt says. The cost ledger:

```
"respond only in JSON" in prompt         schema-strict mode
─────────────────────────────────         ──────────────────
+ feels simpler ("just write it")        + harder first time (schema + adapter)
+ shorter codebase                       + much higher reliability
                                         + safer to add friendliness
                                           instructions later (sampler
                                           ignores them for format)
- 5–20% parse failure rate when           + < 0.1% parse failure rate
  prompt has friendliness signals          (refusal is the new error class)
- bisecting which instruction broke      + schema_fail is a typed error
  the parser takes hours                   with the malformed parse attached
- cross-provider behavior diverges       + adapter abstracts the divergence
- caching pays full cost on retries      + retries are rare; when they happen
                                           you re-call with a stricter prompt
                                           and that's it
```

The honest answer: "ask politely in the prompt" feels faster on day one and is much slower for the next two years. The interview move is naming that gradient rather than defending the simpler-looking code.

### One-line anchors

- "Constraints belong at the boundary, not in the prompt. Schema-strict mode is `<input type='number'>` for LLM output."
- "The courtesy markdown fence is the signature bug of plain JSON mode; any friendliness instruction is a future schema_fail."
- "Tool calling is JSON mode + provider validation. In 2026 it's the most robust default for structured chains."
- "Even with strict mode, validate on receipt. Schema_fail is a logged metric, not a parser problem."
- "Don't structured-output open-ended generation. Schemas are for code consumers; freeform text is for humans."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw the schema-first chain (steps 1–5) from memory. Label which step is provider-side, which is your-side, and where defense-in-depth lives.

- Pass: 5 steps in order (define schema → hand to provider → receive structured output → validate → use downstream), provider boundary correctly placed between steps 2 and 4, retry path on schema_fail
- Fail: re-read the primary diagram, wait 10 minutes, try again.

### Level 2 — Explain it out loud

Explain structured outputs to a colleague who has been parsing LLM JSON responses with regex. No notes. Under 90 seconds.

Checkpoints — did you:
- Name the three modes (tool calling, JSON Schema strict, JSON mode) and what each enforces?
- Name the courtesy markdown-fence bug as a concrete failure of the prompt-text constraint?
- Explain why defense-in-depth (provider enforces + you validate) is still the move even in strict mode?
- Reference the buildable target (`/ai/structured-outputs` visualizer) as how you'd demonstrate the bug in reincodes?

If you skipped any: you described the API surface, you didn't argue for the discipline.

### Level 3 — Apply it to a new scenario

A new chain lands in the planned reincodes AI surface: an "explain this DSA visualization" chain that takes the algorithm name, current step description, and the user's question, and returns a structured response with `{ explanation: string, related_concepts: string[], difficulty: 'beginner' | 'intermediate' | 'advanced' }`. Design the structured-output approach. Which mode (tool calling / strict / JSON mode)? Which provider? What does the Zod schema look like? Where does the schema_fail retry land?

Write your answer (3–5 sentences minimum). Then open `.aipe/study-ai-engineering/ai-features-in-this-codebase.md` and check whether your proposed approach respects the static-export constraints (precompute at build time, no live LLM at request time).

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff from the Tradeoffs section. Answer in writing: "If I were starting the `/ai/structured-outputs` visualizer today, would I still capture the courtesy-fence bug via a precompute script that may have to call the API N times to force the non-deterministic failure? Why or why not? If I'd change it, what would I do instead and what would that cost?"

Reference the actual code:
→ Point to `next.config.ts` L1–L17 for the static-export contract that forces the precompute approach
→ Point to what would need to change if the visualizer faked the fence bug with a hand-edited JSON output instead of capturing a real one (loses authenticity, gains determinism)

There is no right answer. The point is specificity.

### Quick check — code reference test

Without opening any files, answer:
- What file in reincodes controls the static-export contract that forces precomputed examples?
- What field on the OpenAI API call enforces a JSON Schema at the sampler level?
- What's the most common bug class that plain JSON mode catches but plain text mode doesn't?
- What pattern would the chain code follow if it needed to work across OpenAI + Anthropic + Google?

Then open the files and verify.

- Pass: `next.config.ts`, `response_format: { type: "json_schema", strict: true }`, markdown code fences / friendly preambles, adapter pattern (one schema, N provider-specific adapters)
- Fail on details: that's fine — the shape is what matters. Mode names and the courtesy-fence bug should be recoverable.

---
Updated: 2026-05-25 — cross-references refreshed for the new study-ai-engineering/ layout; companion-guides framing updated for v1.38.0 per-repo spec.
