# Provider abstraction (switching, fallback, multi-provider)

**Industry name(s):** Provider abstraction, provider-agnostic chains, multi-provider fallback, model routing
**Type:** Industry standard

> The pattern of designing chains so the provider (Anthropic, OpenAI, Google) is swappable without rewriting application code. The right thing to do when you genuinely need to swap; the wrong thing to over-architect for hypothetical future flexibility.

**See also:** → [01-what-is-an-llm](01-what-is-an-llm.md) · → [04-structured-outputs](04-structured-outputs.md) · → [06-token-economics](06-token-economics.md) · → [../00-overview.md](../00-overview.md)

---

## Why care

### Why care anchored to a frontend primitive

You have a `fetch()` wrapper that posts to your backend's `/api/auth/login` endpoint. The wrapper is a thin function — `apiCall(endpoint, body)` — and every page that needs auth calls through it. The day your team decides to migrate from REST to GraphQL, you change the wrapper's implementation in one place; the rest of the codebase stays untouched because it always called through the wrapper, never directly. That's the value of an abstraction layer: the seam holds when the world behind it changes. Now apply the same logic to LLM calls. Your `getCaptionFromLLM(prompt)` calls Anthropic today. Six months from now, you need to route 80% of calls to Haiku for cost, fall back to OpenAI when Anthropic has an outage, and run 10% of calls through Gemini for an A/B test. Without an abstraction, you're rewriting every call site. With an abstraction, you're editing one factory function.

### Move 2 — Name the question

That seam has a name — *provider abstraction*. Specifically: an interface that defines what a chain needs from an LLM (a `complete()` method that takes a prompt and returns text, or a `tool_call()` method that takes a schema and returns structured output), and per-provider implementations that conform to the interface. Application code talks to the interface; the provider is a configuration choice. The question is operational: when does the abstraction earn its complexity (genuine need to switch, multi-provider redundancy, model routing) vs cost more than it saves (one-provider deployments, prototypes, where the abstraction adds friction without payoff). The architectural mantra is "don't abstract until you need to switch" — premature abstraction is the cardinal sin of provider design.

### Move 3 — Why answering that question matters

**Why you need to answer that question at all:** because LLM features are provider-locked to a degree most teams underestimate. A chain optimised for Claude's tool-use format, Anthropic's prompt caching contract, and Sonnet 4's specific behaviour will not run on GPT-5 without modification — and the modification isn't trivial. I have shipped a chain in 2024 that worked perfectly on Claude and broke in three different ways the day we tried to add OpenAI as a fallback: (a) the system prompt's negative-instruction pattern ("never wrap output in markdown fences") that worked on Claude was insufficient on GPT-4 and required strict mode; (b) the tool-use schema we'd written used JSON Schema features Anthropic supported but OpenAI's strict mode rejected; (c) the token-count logic was tiktoken-only and produced wrong counts for Claude. The migration took two weeks. If we'd designed the chain provider-agnostic from day one, it would have been one day. If we'd never needed to switch, the abstraction would have been wasted work. The senior call is recognising the *event* that justifies the abstraction (multi-provider need, outage redundancy, cost-driven routing) and building it then — not earlier, not later.

### Move 4 — Concrete before/after

Without provider abstraction:

- `anthropic.messages.create()` called directly in chain files
- Provider-specific tool-use schemas inline in the prompt
- Token counting with `count_tokens` API (Anthropic-only) inline
- Migration to a second provider requires touching every chain file
- A/B testing across providers is impossible without rewriting

With provider abstraction:

- `chain.invoke(input)` calls through a common interface
- The interface defines what chains need; implementations handle provider-specific details
- Per-provider schemas live in adapter files, not in chain code
- Migration touches the adapter factory + one config value
- A/B routing is a runtime flag, not a code change

### Move 5 — The one-line summary

Provider abstraction is the interface that hides per-provider API differences from application code — analogous to how a database driver abstraction (`pg`, `mysql2`, `sqlite3` all conforming to a generic query interface) hides per-database SQL dialect details from application code, except the abstraction is over LLM API surfaces and the cost of getting it wrong is rewriting every chain. The full mechanics are below.

---

## How it works

### Move 1 — The mental model

The abstraction is a typed interface. The chain code talks to the interface and never imports a provider's SDK directly. Behind the interface, an adapter per provider implements the contract — translating the interface's calls into the provider's specific API shape. A factory function selects which adapter to instantiate based on configuration (provider name, model tier, API keys). When you swap providers, you change the factory's selection; the chain code is unchanged.

The strategy: define the abstraction's *minimum viable interface* — only the methods chain code actually needs, no more — and resist the temptation to abstract over every provider feature. The abstraction's job is to hide cross-provider differences in the *common* operations; it can't hide differences in provider-specific features (extended thinking, prompt caching markers, strict mode), and trying to do so makes the abstraction unwieldy.

```
The provider abstraction shape

  chain code
       │
       ▼
   ┌────────────────────────┐
   │ LLMClient interface    │
   │   .complete(prompt)    │
   │   .toolCall(schema)    │
   │   .countTokens(text)   │
   └─────────┬──────────────┘
             │
             ▼
   ┌────────────────────────┐
   │ factory(config)        │
   │   "anthropic" →        │
   │   "openai" →           │
   │   "google" →           │
   └────────┬───────────────┘
            │
            ▼
   per-provider adapter implementations
```

### Move 2 — The layered walkthrough

#### The interface definition

The technical thing: the abstraction is a TypeScript interface (or Python protocol, or whatever language's contract mechanism) listing the operations chain code needs. Minimum: `complete(prompt, params)` for text generation, `toolCall(prompt, schema)` for structured output. Optionally: `countTokens(text)`, `stream(prompt, params)`, `embed(text)`. The bridge from frontend: this is the equivalent of declaring an interface for a data store — `interface UserStore { getUser(id), createUser(data), deleteUser(id) }` — without committing to whether it's backed by Postgres, DynamoDB, or in-memory. Concrete consequence: the interface should cover what chains *actually use*, not every operation the providers offer. A small interface is easier to implement across providers and easier to maintain. Resist the urge to expose provider-specific features through the interface; those features either belong outside the abstraction (handled per-provider in the adapter layer) or break the abstraction's "swappable" promise.

```
minimum viable LLMClient interface

  interface LLMClient {
    complete(prompt: string, params?: CompletionParams): Promise<string>
    toolCall<T>(prompt: string, schema: ZodSchema<T>): Promise<T>
    countTokens(text: string): Promise<number>
  }
  
  CompletionParams: {
    temperature?: number
    maxTokens?: number
    stopSequences?: string[]
  }
```

#### The adapter implementations

The technical thing: per-provider adapter classes (or modules) implement the interface by translating to the provider's specific API shape. The Anthropic adapter calls `anthropic.messages.create()`; the OpenAI adapter calls `openai.chat.completions.create()`; the Google adapter calls Gemini's `generateContent()`. The bridge from a DB driver: this is the same pattern as ORM adapters — `pgAdapter`, `mysqlAdapter`, `sqliteAdapter` all implement the same `Database` interface, each translating to its database's wire protocol. Concrete consequence: the adapters handle two things at once — (1) translating method signatures (e.g., Anthropic's `system` parameter vs OpenAI's system message in the array), and (2) normalising responses (e.g., extracting the text from Anthropic's `content[0].text` vs OpenAI's `choices[0].message.content`). The adapters are 50-200 lines each; they're where the per-provider knowledge lives, isolated from the chain code.

```
adapter pattern — one file per provider

  /providers/anthropic.ts:
    class AnthropicClient implements LLMClient {
      async complete(prompt, params) {
        const response = await this.client.messages.create({
          model: this.model,
          system: this.systemPrompt,
          messages: [{ role: "user", content: prompt }],
          temperature: params?.temperature ?? 0.7,
          max_tokens: params?.maxTokens ?? 1024,
        });
        return response.content[0].text;
      }
      // ... toolCall, countTokens ...
    }

  /providers/openai.ts:
    class OpenAIClient implements LLMClient {
      async complete(prompt, params) {
        const response = await this.client.chat.completions.create({
          model: this.model,
          messages: [
            { role: "system", content: this.systemPrompt },
            { role: "user", content: prompt }
          ],
          temperature: params?.temperature ?? 0.7,
          max_tokens: params?.maxTokens ?? 1024,
        });
        return response.choices[0].message.content;
      }
      // ... toolCall, countTokens ...
    }
```

#### The factory

The technical thing: a `getLLMClient(provider, model)` function returns the right adapter instance based on configuration. The factory typically reads from environment variables or a config object. The bridge from frontend: this is the same pattern as React's `createContext` providers — application code asks for a service through `useContext()`, the provider higher up the tree decides which implementation to give. Concrete consequence: the factory is the single point of provider selection. If you need to add multi-provider routing (10% of calls to Provider A, 90% to Provider B), the routing logic lives in the factory or a thin wrapper above it. If you need fallback ("try Anthropic; if it fails, try OpenAI"), it lives in the factory too. The chain code is unchanged.

#### The provider-specific features problem

The technical thing: providers offer features that aren't universal — Anthropic's prompt caching markers (`cache_control`), Anthropic's extended thinking mode, OpenAI's strict-mode tool calls, Google's huge context windows. The abstraction has two options for each: (1) ignore them entirely, treating the lowest common denominator as the interface — simplest but loses meaningful provider-specific capability; or (2) expose them through optional fields the adapters either honour or ignore — richer but the abstraction starts leaking provider concepts. The bridge from frontend: this is the equivalent of trying to abstract over CSS Grid and Flexbox under one component API — they have overlapping concepts but unique features, and the abstraction either covers the intersection (lowest common denominator) or becomes a leaky pile. Concrete consequence: most production abstractions take a hybrid approach — the core interface is lowest-common-denominator (covers the 80% case), and chains that need provider-specific features bypass the abstraction for those calls. The honest design names this explicitly: "this abstraction is for chains that can run on any provider; chains that need extended thinking are Anthropic-only and import the SDK directly."

#### The fallback pattern

The technical thing: a wrapper around the factory that implements primary/secondary provider selection — try Anthropic first; if it fails (transient error, rate limit, schema rejection), retry the same call against OpenAI. The bridge from a frontend primitive: this is the same as retry-with-different-server logic — if the primary endpoint fails, try the secondary. Concrete consequence: fallback only works when the providers produce semantically equivalent outputs for the same prompt. For free-text outputs (summaries, captions), fallback works well — both providers produce reasonable text. For structured outputs, the schemas have to be cross-provider compatible (no Anthropic-specific JSON Schema features, no OpenAI strict-mode-only constraints). The fallback pattern adds operational complexity (two API keys, two SDK initialisations, two cost lines) but gives outage resilience.

#### The "don't abstract until you need to switch" rule

The technical thing: the abstraction has real cost — interface definition, two-or-more adapter implementations, factory logic, the friction of any new feature having to land in multiple adapters. For a one-provider deployment with no foreseeable need to switch, the abstraction is wasted work. The bridge from frontend: this is the same logic as "don't introduce a framework until you have three implementations to extract" — abstraction over one thing is just indirection; abstraction over multiple things is leverage. Concrete consequence: the right time to introduce provider abstraction is the day you have a concrete need (cost-driven routing, outage redundancy, A/B testing across providers). Before that day, abstracting is premature optimisation. The architectural mantra holds: build for one provider until you have a reason to support two.

### Move 3 — The principle

The principle that generalises beyond any one abstraction: *abstractions are warranted by the variability they hide, not by the variability they might one day hide.* The history of LLM-application code in 2023-2026 is full of teams that built provider abstractions on day one, never used a second provider, and paid the maintenance cost for years. It's also full of teams that didn't build abstractions, hit a real need to switch, and paid two weeks of rewriting. The senior move is recognising the event that triggers the abstraction (a real second provider, a real cost-routing need, a real outage that justified redundancy) and building it *then* — informed by what you've learned about your real chain shapes, not what you guessed at the start.

The full picture is below.

---

## Provider abstraction — diagram

```
┌─ The single-provider path (no abstraction needed) ───────────────────┐
│                                                                       │
│   chain code  ──── imports anthropic SDK directly ────▶  Anthropic API│
│                                                                       │
│   when this works:                                                   │
│     - one provider for the foreseeable future                        │
│     - no cost-routing need                                           │
│     - no outage redundancy                                           │
│     - prototype / early-stage product                                │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
                              vs
┌─ The abstracted path (when switching becomes real) ──────────────────┐
│                                                                       │
│   chain code                                                         │
│        │                                                             │
│        ▼                                                             │
│   ┌──────────────────────────────────┐                              │
│   │ LLMClient interface              │                              │
│   │   .complete(prompt, params)      │                              │
│   │   .toolCall(prompt, schema)      │                              │
│   │   .countTokens(text)             │                              │
│   └──────────┬───────────────────────┘                              │
│              │                                                       │
│              ▼ getLLMClient(config)                                  │
│   ┌──────────────────────────────────┐                              │
│   │ factory + optional fallback     │                              │
│   └─┬────────┬─────────┬──────┬─────┘                               │
│     │        │         │      │                                     │
│     ▼        ▼         ▼      ▼                                     │
│   Anthropic OpenAI  Google  Ollama                                  │
│   adapter   adapter adapter adapter                                 │
│     │        │         │      │                                     │
│     ▼        ▼         ▼      ▼                                     │
│   Anthropic OpenAI  Gemini   local                                  │
│   API       API     API      model                                  │
│                                                                       │
│   when this earns its place:                                         │
│     - multi-provider routing for cost                                │
│     - outage fallback                                                │
│     - cross-provider A/B testing                                     │
│     - migration in progress                                          │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

The boundary between the upper diagram (single-provider, no abstraction) and the lower diagram (abstracted with multiple adapters) is the architectural decision: introduce the lower shape only when you have a *real* need that the upper shape can't meet.

---

## In this codebase

**Not yet implemented.** reincodes is a Next.js static-export DSA visualizer with no AI surface in production code — there are zero LLM calls, no providers, no abstraction layer. The existing study guide (`.aipe/study-ai-engineering/`) positions reincodes as the *interview-prep visualizer host* per the curriculum: a place to *teach* AI concepts through visualizers, not a place where AI runs for users. The buildable target for this concept is below in Project exercises — a `/ai/provider-abstraction` page that renders two precomputed chain implementations side-by-side (one Anthropic-specific, one OpenAI-specific) with a toggle showing which is "active," plus a third panel showing the abstraction layer code that would let either be swappable.

**Expected file paths** (when built):
- `src/app/ai/provider-abstraction/page.tsx` — the visualizer page
- `src/components/ProviderAbstractionVisualizer/` — code-side-by-side renderer, toggle, abstraction-layer reveal panel
- `public/ai/provider-abstraction/example-chains.json` — two precomputed (provider, code_snippet, simulated_output) records and the abstraction-layer code as static strings (since the visualizer doesn't execute code, only renders it for comparison)

---

## Elaborate

### Where this pattern comes from

Provider abstraction in the LLM world inherits from decades of database-driver and HTTP-client abstraction work. The specific framing landed in LangChain (2023) which positioned its `BaseChatModel` as the cross-provider interface — chain code calls `model.invoke()`, the provider-specific adapter (`ChatAnthropic`, `ChatOpenAI`) translates. LlamaIndex offers similar abstractions. Vercel AI SDK takes the abstraction further with a TypeScript-first interface that integrates with Next.js streaming. The pattern is industry-default for production deployments that span providers; it's debated for single-provider deployments, where the cost of the abstraction sometimes exceeds the benefit.

### The deeper principle

The deeper principle is that *abstractions encode the variability you've actually observed*. The right time to introduce an abstraction is *after* you have multiple implementations to extract — the abstraction is then informed by the real variability, not your guess about future variability. The reverse is the cardinal sin: building an abstraction before you have multiple implementations, getting the interface wrong because you imagined the wrong variability, and being stuck with an abstraction that doesn't fit either of the two real implementations when they arrive. Provider abstraction is one instance of this general pattern; the same logic applies to database abstractions, queue abstractions, deployment-target abstractions. Build for the case in front of you, abstract when the second case arrives, refactor when the third case reveals what the abstraction got wrong.

### Where this breaks down

The abstraction framing breaks down at four edges. First, provider-specific features: Anthropic's prompt caching, OpenAI's structured outputs strict mode, Google's huge context windows, Anthropic's extended thinking. The abstraction can either expose these as optional fields (and force every adapter to either honour or ignore them) or hide them (and prevent chains from using provider-specific capabilities). Both approaches have costs. Second, error handling: providers return different error shapes (rate limit responses, schema-rejection errors, refusal payloads). The abstraction has to normalise these, and the normalisation involves judgment calls about which provider errors are equivalent. Third, cost reporting: token counts and cost calculations need per-provider rate cards; the abstraction either includes a cost layer (more complexity) or pushes cost calculation outside the abstraction (less encapsulated). Fourth, streaming: each provider's streaming event shape differs, and a streaming abstraction needs per-provider parsers; the cleanliness of the abstraction degrades when streaming is part of the interface.

### What to explore next

- [01-what-is-an-llm](01-what-is-an-llm.md) → the function shape that the abstraction wraps
- [04-structured-outputs](04-structured-outputs.md) → cross-provider schema variation is the most common abstraction-breaking point
- [06-token-economics](06-token-economics.md) → provider routing for cost is a primary reason to build the abstraction
- [../06-production-serving/](../06-production-serving/) → fallback patterns, retry, circuit breakers all live above the abstraction

---

## Tradeoffs

### Comparison table — both costs in one frame

```
┌──────────────────┬──────────────────────┬─────────────────────────┐
│ Cost dimension   │ Path taken           │ Alternative             │
│                  │ (provider abstraction│ (direct SDK imports;    │
│                  │  + adapters)         │  one provider)          │
├──────────────────┼──────────────────────┼─────────────────────────┤
│ Engineering time │ 2-3 days to set up   │ Zero                    │
│                  │ interface + 2 adapters│                         │
│ Maintenance      │ Every feature needs  │ Single provider's       │
│ overhead         │ landing in 2+ adapters│ feature works directly │
│ Switching cost   │ Change factory       │ Rewrite every chain     │
│                  │ selection            │                         │
│ Provider lock-in │ Low                  │ High                    │
│ Provider-specific│ Hidden or leaks      │ Used directly           │
│ features         │ through interface    │                         │
│ Lines of code    │ +200-500             │ +0                      │
│ Cognitive load   │ Read interface + 2   │ Read provider SDK only  │
│                  │ adapters             │                         │
│ Migration on day │ 1 day                │ 2 weeks                 │
│ 200 if needed    │                      │                         │
│ Premature        │ High if never need   │ N/A (no abstraction)    │
│ optimisation    │ to switch            │                         │
│ risk             │                      │                         │
└──────────────────┴──────────────────────┴─────────────────────────┘
```

### What we gave up (when planning the reincodes visualizer)

The first cost is *the visualizer being a comparison of code rather than behaviour*. Other concepts in this sub-section (tokenization, sampling, streaming) animate the model's behaviour visually. Provider abstraction is fundamentally a code-architecture concept — the demonstration is "here's how the two implementations differ" rather than "watch this number change." The visualizer is a side-by-side code renderer with a third panel showing the abstraction layer, which is teaching-effective but visually quieter than the other visualizers. The honest framing is that this concept lives more naturally in the written file than in an interactive UI; the visualizer's value is the *concrete comparison* that prose alone can't quite achieve.

The second cost is *the visualizer not actually running the code*. The static-export contract forbids API keys, so the visualizer can't run either implementation live. The "outputs" rendered alongside the code are precomputed examples captured at build time. The reader sees the code and the outputs but doesn't see the *act* of running the code — which is fine for teaching the architecture but limits the visualizer's interactivity compared to the other entries in the sub-section.

The third cost is *teaching the "when to abstract" decision*. The visualizer can show *what* the abstraction looks like; it's harder to show *when* to build it. The "don't abstract until you need to switch" rule is the most subtle teaching point in this concept, and the visualizer's UI doesn't naturally surface it. The accompanying prose has to carry that load — naming the breakpoint (genuine second provider need) and the failure mode of premature abstraction.

### What the alternative would have cost (skipping the visualizer)

If reincodes never builds the `/ai/provider-abstraction` visualizer, the cost is *zero* in the codebase. The concept gets taught in this written study guide, in the curriculum's Phase 1 build items (`[B1.6]`: provider-swap eval — all 5 loopd chains on Claude → OpenAI on same 10 fixtures, document divergences), and gets exercised in production at loopd. The reincodes site stays pure-DSA.

The cost of *not* building it shows up in the interview-prep surface. Provider abstraction is the concept where a *code-shaped artifact* communicates the architectural decision more effectively than prose. A candidate who can point at a visualizer with two adapter implementations and the unifying interface has a more credible story than one who describes the pattern verbally. The interview cost of not having the visualizer is modest (verbal explanation is usually fine for this concept) but non-zero.

### The breakpoint

The visualizer earns its place during interview rounds where the candidate is asked about multi-provider architecture or migration strategies. The verbal answer is correct; the visual answer with concrete adapter code is more credible. The breakpoint is event-shaped: an interview that pushes on the architectural choice of provider abstraction hard enough that code samples become the supporting evidence.

### What wasn't actually a tradeoff

Live provider switching in the visualizer was not a real option. The static-export contract forbids API keys. Even if a backend existed, running live calls against two providers per visualizer load would be expensive and introduce variance into the "outputs" rendered alongside the code. The precomputed-outputs-plus-static-code-comparison approach is the only architecture compatible with the deploy story, and for this concept the static comparison is actually the right teaching shape — the architecture is what's being taught, not the runtime behaviour.

---

## Tech reference (industry pairing)

### Vercel AI SDK

- **Codebase uses:** not yet — uniquely relevant because reincodes is a Next.js app, and Vercel's AI SDK is the canonical cross-provider abstraction for Next.js applications.
- **Why it's here:** the Vercel AI SDK exposes a single `generateText({ model, ... })` API that takes a provider model identifier and handles per-provider translation. Switching providers is one config change. The SDK is the reference implementation of the provider-abstraction pattern in the TypeScript ecosystem.
- **Leading today:** Vercel AI SDK — `adoption-leading` for cross-provider abstraction in Next.js applications, 2026.
- **Why it leads:** Next.js-native, supports all major providers under one API (Anthropic, OpenAI, Google, Mistral, Groq, Cohere, etc.), streaming-aware, integrated with React Server Components, batteries-included for tool use and structured outputs.
- **Runner-up:** LangChain.js — `adoption-leading` for chain-composition abstractions across frameworks; heavier abstraction with more features but larger bundle and steeper learning curve.

### LangChain (BaseChatModel)

- **Codebase uses:** not yet — would be the abstraction option if the chain ecosystem grew complex enough to benefit from LangChain's full chain-composition story (in which case provider abstraction is one of many abstractions LangChain provides).
- **Why it's here:** LangChain was the first widely-adopted LLM framework to make provider abstraction a first-class concept. The `BaseChatModel` interface and the `ChatAnthropic`, `ChatOpenAI`, `ChatGoogleGenerativeAI` implementations are the most-cited reference design for the pattern.
- **Leading today:** LangChain — `adoption-leading` for cross-provider work in Python; second to Vercel AI SDK in JS/TS, 2026.
- **Why it leads:** broad provider coverage, integrated with LangSmith for observability, comprehensive ecosystem (RAG, agents, eval), the de-facto Python framework for LLM applications.
- **Runner-up:** LlamaIndex — `adoption-leading` for retrieval-heavy applications; offers similar provider abstraction with stronger RAG primitives.

### Provider SDKs (Anthropic, OpenAI, Google)

- **Codebase uses:** not yet — provider SDKs are what the adapter layer wraps. The Anthropic adapter imports `@anthropic-ai/sdk`; the OpenAI adapter imports `openai`; the Google adapter imports `@google/generative-ai`.
- **Why it's here:** the provider SDKs are the lowest layer of the stack. Provider abstractions are layered on top of them; understanding the abstraction requires understanding what's being abstracted over.
- **Leading today:** Provider-native SDKs — `adoption-leading` for direct integration; preferred when the abstraction layer is more friction than benefit, 2026.
- **Why it leads:** SDK-native code has access to every provider-specific feature; no friction from interface limitations; optimal when the deployment is single-provider with no foreseeable need to switch.
- **Runner-up:** Litellm — `innovation-leading` Python proxy that normalises 100+ providers behind the OpenAI API shape; relevant for Python teams that want minimal-change provider swapping.

---

## Project exercises

### [B-reincodes-provider-abstraction-viz] Build the provider-abstraction visualizer

- **Exercise ID:** `[B-reincodes-provider-abstraction-viz]` — derived from the curriculum's "Interview prep surface — reincodes" entry and Phase 1 concept `[C1.8]` (Provider-agnostic chain design).
- **What to build:** a page at `/ai/provider-abstraction` that renders three panels. Panel A: code for a chain calling Anthropic's SDK directly (with system prompt, model selection, tool-use schema). Panel B: code for the same chain calling OpenAI's SDK directly (different method signatures, different schema shape, different response extraction). Panel C: code for the abstraction layer — an `LLMClient` interface and two adapters — that lets the chain code be provider-agnostic. A toggle at the top lets the reader swap between "show me the differences" (highlights cross-provider variance) and "show me the abstraction" (highlights how the interface unifies them). Below the code panels: precomputed outputs from both providers showing they produce semantically equivalent results for the same input.
- **Why it earns its place:** the visualizer makes the *architectural decision* observable — the reader sees the per-provider code differences side by side and sees how the abstraction layer hides them. The interview signal is that the candidate built a teaching artifact for the most architectural of the foundational LLM concepts.
- **Files to touch:** `src/app/ai/provider-abstraction/page.tsx` (visualizer page), `src/components/ProviderAbstractionVisualizer/` (three-panel code renderer with syntax highlighting and diff highlighting, output cards, toggle), `public/ai/provider-abstraction/example-chains.json` (precomputed (provider, code_snippet, sample_outputs) records, plus the abstraction-layer code as static strings). Add a row to `src/components/Home/conceptsData.tsx`'s category list under a new `ai-engineering` category.
- **Done when:** the page loads at `/reincodes/ai/provider-abstraction/` in production (GitHub Pages), three code panels render with syntax highlighting (a small lightweight syntax highlighter like `react-syntax-highlighter`), the toggle correctly shows variance highlighting vs abstraction view, mobile layout collapses the three panels into a scrollable strip, `next build` passes under `output: "export"`. The chain code in the panels uses realistic, runnable shapes (matches the actual SDK signatures, not pseudocode).
- **Estimated effort:** 2 days. Code-renderer with syntax highlighting: half day. Diff / variance highlighting logic: half day. Precompute the example outputs from both providers (build-time): half day. Toggle + mobile polish + accompanying prose: half day.

---

## Summary

### Part 1 — concept recap

Provider abstraction is the interface pattern that hides per-provider API differences (Anthropic Messages API, OpenAI Chat Completions, Google Gemini) from application code. A minimum-viable interface — `complete()`, `toolCall()`, `countTokens()` — is implemented by per-provider adapters; chain code talks to the interface; the factory selects which adapter to instantiate. The pattern earns its place for multi-provider routing (cost optimisation, A/B testing), fallback (outage redundancy), and migration scenarios. It costs interface complexity, per-feature implementation across multiple adapters, and the maintenance overhead of keeping the abstraction's contract honest. The "don't abstract until you need to switch" rule names the breakpoint: build for one provider until you have a real reason to support two. In this codebase the concept is *planned* rather than implemented: reincodes has no LLM surface, and the buildable target is a `/ai/provider-abstraction` visualizer that renders two adapter implementations and the unifying interface as side-by-side code.

### Part 2 — key points to remember

- **The pattern**: typed interface + per-provider adapters + factory. Chain code talks to the interface; provider selection is a config choice.
- **The minimum interface**: `complete(prompt, params)`, `toolCall(prompt, schema)`, `countTokens(text)`. Add streaming/embeddings only if chains use them.
- **The lock-in problem**: chains optimised for one provider's tool-use schema, prompt caching, or strict mode don't run on a second provider without modification.
- **The rule**: don't abstract until you have a real second provider, fallback need, or routing requirement. Premature abstraction is a 2-3 day cost with no payoff.
- **The reincodes shape**: implementation is Case B; the buildable target is a code-side-by-side visualizer under `/ai/provider-abstraction` showing two adapters and the unifying interface.

---

## Interview defense

### What an interviewer is really asking

Behind "how would you design a multi-provider LLM system?" the interviewer is checking whether the candidate has migrated a chain across providers and felt the cost. A junior answer says "use LangChain, it handles that." A senior answer names the interface design (minimum viable surface), names what does and doesn't get abstracted (lowest common denominator core + provider-specific bypasses), names the "don't abstract early" rule, and names a specific migration they've done. The interviewer is checking for the architectural framing because provider abstraction is the most common over-engineering trap in LLM application code — teams that abstract too early waste weeks; teams that abstract too late waste more weeks on migration.

### Likely questions

**Q (mid):** When should I introduce a provider abstraction?

A: When you have a concrete need that the single-provider implementation can't meet. Three triggering events: (1) cost-driven model routing — you need to send some calls to a cheap provider and others to an expensive one; (2) outage fallback — a single-provider deployment can't survive provider outages and the SLA requires it; (3) genuine multi-provider deployment — you're shipping to enterprise customers who require provider choice, or you're A/B testing across providers as part of an eval discipline. Without one of these triggers, the abstraction is wasted work — it's complexity that hides nothing real. The senior move is naming the trigger and building the abstraction at that moment, informed by the real chain shapes you've shipped, rather than building it speculatively at the start.

```
no abstraction needed              build the abstraction
─────────────────                   ─────────────────────
single provider                     cost-routing across providers
no outage SLA requirement           outage fallback required
no multi-provider customer          enterprise customer requires choice
prototype / early product           A/B testing eval discipline
```

**Q (senior):** What goes inside the abstraction and what stays outside?

A: Inside: the operations every chain uses (text completion, structured output, token counting). The interface covers the lowest common denominator of provider capabilities — what every supported provider can do. Outside: provider-specific features. Anthropic's prompt caching markers stay outside (they're meaningful only for chains running on Anthropic); the chain that uses prompt caching is explicitly Anthropic-bound. OpenAI's strict mode for structured outputs is partially inside (the abstraction's `toolCall()` enforces strict-mode-style schemas, and the OpenAI adapter passes `strict: true`; the Anthropic adapter uses tool-use which is strict by default). The principle: the abstraction is a *swappable* contract — chains using only the abstraction's interface should run on any supported provider. Chains using provider-specific features are explicitly provider-bound, and the abstraction shouldn't pretend otherwise. Leakage in either direction (provider-specific features sneaking in, or chains using the abstraction failing on a second provider) is a design failure.

```
inside the abstraction               outside the abstraction
─────────────────────────           ─────────────────────────────
complete(prompt, params)             prompt caching markers
toolCall(prompt, schema)             extended thinking mode
countTokens(text)                    provider-specific batch APIs
stream(prompt, params) [optional]    image/audio multimodal
                                     fine-tuned model deployment
```

**Q (arch):** At 10× the chain count — a chain ecosystem with 20 chains, half on Anthropic for prompt caching, half on a cheaper provider — how does the abstraction compose?

A: Two architectural decisions at 20 chains. First, the abstraction is per-chain, not global — each chain declares which providers it's compatible with (a chain using prompt caching is "Anthropic-only"; a chain using only the abstraction's core interface is "any provider"). The compatibility metadata travels with the chain definition. Second, the routing layer above the abstraction does the actual provider selection per call — based on chain compatibility, cost optimisation, and runtime conditions (provider health, rate limit headroom). The factory becomes a router. The chain code's mental model is "I declare what I need; the framework picks the provider." At 10 chains × 2 providers × 5x daily cost variance, the routing layer is worth millions of saved tokens per month; without it, the single-provider deployment costs 2-3× what it needs to.

```
single-chain abstraction            20-chain ecosystem at scale
─────────────────────────          ─────────────────────────────
one chain, two adapters             20 chains, N adapters
factory picks provider              router + compatibility metadata
swap with config change             per-call routing by chain shape
                                    cost-aware provider selection
                                    health-aware fallback
```

### The question candidates always dodge

**Q:** If LangChain (or Vercel AI SDK) provides this abstraction for free, why ever build your own?

A: Sometimes you should use the framework's abstraction; sometimes you should build your own. Use the framework's abstraction when (a) your chain shapes are typical (text generation, tool use, structured output, simple agents) — the framework covers these well; (b) you accept the framework's ecosystem and bundle cost; (c) you're prototyping or shipping fast and the framework's batteries-included features save more time than they cost. Build your own when (a) you have non-typical chain shapes (custom streaming integrations, custom prompt-caching markers, provider-specific features the framework doesn't expose); (b) bundle size matters and the framework's footprint is too heavy (Vercel AI SDK is reasonable; LangChain.js is heavy); (c) you want explicit control over what's abstracted and what isn't, to avoid leaks in the framework's abstraction. The honest answer: "use the framework until you outgrow it, build your own when you have specific needs that the framework's abstraction can't meet." The candidate who reflexively chooses the framework misses the cost; the candidate who reflexively rejects the framework misses the leverage.

```
framework's abstraction              custom abstraction
─────────────────────────           ─────────────────────────
+ batteries-included                 + tailored to your chain shapes
+ widely understood                  + smaller bundle
+ ecosystem (eval, observability)    + explicit control over leaks
- bundle cost (large for LangChain)  + provider-specific features as
- ecosystem assumptions              first-class
- abstraction leaks in some places   - building and maintaining
- harder to extract if you outgrow   - smaller community
```

The senior answer: name the breakpoint where each is the right call.

### One-line anchors

- "Don't abstract until you need to switch. Premature abstraction costs 2-3 days for no payoff."
- "Minimum interface: complete(), toolCall(), countTokens(). Everything else is provider-specific."
- "Provider-specific features stay outside the abstraction. Chains using them are explicitly provider-bound."
- "Triggers for the abstraction: cost routing, outage fallback, multi-provider customer requirement, A/B eval discipline."
- "Use the framework's abstraction (Vercel AI SDK, LangChain) until you outgrow it. Build your own when you have specific needs."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw the single-provider path (chain → SDK → API) and the abstracted path (chain → interface → factory → adapter → SDK → API). Label what triggers the abstraction (cost routing, fallback, A/B). Label what stays outside the abstraction (provider-specific features).

✓ Pass: both shapes drawn, triggers labelled, outside-the-abstraction features named
✗ Fail: re-read the primary diagram, wait 10 minutes, try again.

### Level 2 — Explain it out loud

Explain provider abstraction to a colleague who has shipped a single-provider chain and is now wondering if they should "make it provider-agnostic just in case." No notes. Under 90 seconds.

Checkpoints — did you:
- Name the interface + adapter pattern?
- Name the "don't abstract until you need to switch" rule?
- Name a concrete trigger that justifies the abstraction (cost routing, fallback, A/B)?
- Reference the buildable target (`/ai/provider-abstraction` visualizer) as how you'd demonstrate the concept in reincodes?

If you skipped any: you described the pattern, you didn't tell the colleague when to build it.

### Level 3 — Apply it to a new scenario

A teammate proposes adding provider abstraction to a 3-chain ecosystem currently using Anthropic. They have no plans to switch providers and no cost-routing requirements. They argue "it's good practice." Lay out the diagnosis: why is the abstraction wrong *now*, what would make it right, and what's the cost of building it speculatively?

Write your answer (3–5 sentences minimum). Then check whether your proposed architecture matches the constraints `00-overview.md` names for any planned AI feature in reincodes (static-export contract, precomputed corpus, no live LLM at request time).

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff from the Tradeoffs section. Answer in writing: "If I were starting the `/ai/provider-abstraction` visualizer today with the same constraints (static export, no live LLM, GH Pages deploy, mobile-first), would I still ship a three-panel code-comparison view? Why or why not? If I'd change it, what would I do instead — a single panel with a provider toggle? An animated transition between the two? — and what would that cost in teaching clarity?"

Reference the actual code:
→ Point to `next.config.ts` L7 (`output: "export"`) to support the static-export constraint
→ Point to what would need to change for the visualizer to actually run the code — `next.config.ts` loses `output: "export"`, deploy target shifts, two sets of API keys live somewhere

There is no right answer. The point is specificity.

### Quick check — code reference test

Without opening any files, answer:
- What file in reincodes controls the static-export contract that constrains how the visualizer ships?
- What's the canonical TypeScript-first abstraction library for Next.js applications calling multiple LLM providers?
- What field in `conceptsData.tsx` would need a new entry to register the visualizer in the home grid?

Then open the files and verify.

✓ Pass: `next.config.ts`, Vercel AI SDK, `ConceptCategory[]` (the exported array)
✗ Fail on details: that's fine — the shape is what matters. File and library names should be recoverable.
