# Context window

**Industry name(s):** Context window, context length, context budget, attention window
**Type:** Industry standard

> The fixed token budget every LLM call has to fit inside — and why "200K tokens" is not the same number as "200K tokens you can actually use."

**See also:** → [02-lost-in-the-middle](02-lost-in-the-middle.md) · → [03-prompt-chaining](03-prompt-chaining.md) · → [../study-prompt-engineering/04-token-budgeting](../../study-prompt-engineering/04-token-budgeting.md) · → [../00-overview](../00-overview.md)

---

## Why care

### Move 1 — The grounded scenario

You've built a chat UI that talks to Claude. The user opens it, types a question, and your code does the obvious thing: build an array of messages, append the new user message, ship it to the API. Day one it works fine — the message array is 200 tokens. Week three the array is 4K tokens because you started prepending retrieved docs. Month two it's 12K tokens because the conversation history kept growing and nobody pruned it. Then one day a user sees the bottom of the model's reply cut off mid-sentence, or worse, the API throws a 400 — `Input is too long for requested model`. The conversation hit the ceiling.

### Move 2 — Name the question

That ceiling has a name — *the context window*. Not the model's intelligence, not the prompt's quality, not the network — just the fixed number of tokens the model can hold in its working memory for a single call. Every LLM has one. Claude Sonnet 4.7 ships with a 200K-token window, GPT-5 ships with a 1M-token window, Gemini 2 ships with 2M for some tiers. The window is the hard physical limit on what the model can see and what it can emit, combined.

### Move 3 — Why answering that question matters

**Why you need to answer that question at all:** because *the window is not just the input*. It is input + output, sharing the same budget. If your model's context is 200K and the input is 199K, the model has exactly 1K tokens left to respond. That's about 750 words — enough for a short paragraph, not enough for the structured JSON output your downstream parser expects. The parser fails. The retry logic fires. The retry uses the same bloated context and fails again. Production support ticket, three engineers paged, root cause is "we never budgeted for the output." I have shipped systems that worked fine in staging where every test case had short inputs, then degraded silently in production when a single power user pasted a 50K-token document into the chat. The failure mode was not "the model said something wrong" — it was "the model couldn't say anything at all" because there was no room left for it to speak.

### Move 4 — Concrete before/after

Without explicit window budgeting:

- Message array is built by appending forever; nobody tracks total tokens
- Retrieved docs are inserted raw; one large doc consumes 80% of the window
- "Output budget" is implicit (whatever's left); silently degrades for long inputs
- Long-running conversations hit the ceiling unpredictably (depends on history)
- Failure mode is a 400 from the provider — opaque, hard to attribute

With explicit window budgeting:

- Every call has a budget allocation: system X tokens, retrieved Y tokens, history Z tokens, response W tokens, headroom H tokens
- Allocations are enforced before the call (truncation, summarization, retrieval-top-k)
- 80% utilization is the alarm threshold; calls above 80% emit a warning log
- Output token count is reserved explicitly (`max_tokens` set per chain to what the chain actually needs)
- Failure mode is "we truncated history" — observable, attributable, fixable

### Move 5 — The one-line summary

A context window is the LLM's `Content-Length` header — a fixed byte budget for the whole exchange, except it covers input *and* output together, and the units are tokens instead of bytes. The full mechanics are below.

---

## How it works

### Move 1 — The mental model

A context window is the model's RAM for a single inference call. It is a fixed array of token positions, each position holding one token, with the model's attention mechanism able to look across all of them. The number is set by the architecture (positional encodings, RoPE/ALiBi extrapolation, training-time attention support) and is a hard ceiling — the provider rejects any request whose total token count exceeds it.

The strategy: treat the window as a finite resource with named consumers, allocate per chain, measure per call, and never let any single consumer (history, retrieved docs, examples) grow unbounded.

```
Context window as a fixed array of token positions

position:  0          50K         100K        150K       200K
           │           │           │           │          │
           ▼           ▼           ▼           ▼          ▼
           ┌─────────────────────────────────────────────┐
           │ system │ retrieved │ history │ user │ resp  │
           │  10K   │    40K    │   30K   │  5K  │ 8K    │
           └─────────────────────────────────────────────┘
                                                  ▲
                                                  └─ headroom: 107K
                                                     (47% unused)
```

### Move 2 — The layered walkthrough

#### The provider's advertised window

The technical thing: each provider publishes a context window per model. Claude Sonnet 4.7 — 200K. Claude Sonnet 4.7 with the 1M beta header — 1M. GPT-5 — 1M. Gemini 2 Pro — 2M for select tiers. The number is in the API docs; the unit is tokens (provider-specific tokenization — Claude's tokens are not the same as GPT's). If you're coming from frontend, this is the `max-width` declared in CSS — a hard bound the layout engine respects. Concrete consequence: pick the model first, then design the chain to fit. Picking a 200K model and then trying to stuff 250K of retrieved context in is the same kind of bug as setting `max-width: 100px` and trying to fit a 400px image inside without scaling.

```
provider context windows (2026)

Claude Sonnet 4.7      ████████░░░░░░░░░░ 200K
Claude Sonnet 4.7+1M   ████████████████░░ 1M (beta header)
GPT-5                  ████████████████░░ 1M
Gemini 2 Pro           ████████████████░░ 2M (select tiers)
Llama 3.3 70B          ████░░░░░░░░░░░░░░ 128K
Mistral Large          ████░░░░░░░░░░░░░░ 128K
```

#### The effective window (where attention actually works)

The technical thing: the advertised window is the *physical* limit, but the *effective* limit is smaller. Liu et al. 2023 ("Lost in the Middle") showed that attention degrades at positions ~50% of the window — facts placed in the middle get retrieved less reliably than facts at the start or end. Newer long-context models (Claude 4.x, Gemini 2, GPT-5) have partially fixed this, but the curve is still U-shaped — bottoms in the middle, recovers at the ends. The bridge from frontend: this is the difference between a viewport's pixel dimensions and the *usable* area after the keyboard pops up on mobile. Concrete consequence: budgeting to 100% of the advertised window is a category error. The 80% rule is the working norm — keep total utilization under 80% of the advertised window, leave headroom for output, and put critical instructions at positions 0–20% or 80–100%, not the middle. Cross-reference: [02-lost-in-the-middle](02-lost-in-the-middle.md) is the deeper treatment.

```
attention quality vs position (qualitative, post-2023 long-context models)

quality
  ▲
  │ ╲                                          ╱
  │  ╲                                        ╱
  │   ╲___                                ___╱
  │       ╲___                        ___╱
  │           ╲___              ____╱
  │               ╲__________╱  ← attention floor (the "middle")
  │
  └─────────────────────────────────────────────────▶ position in window
    0%                       50%                  100%
```

#### Counting what's in the window

The technical thing: every consumer in the window — system message, retrieved docs, conversation history, user message, the model's response — costs tokens. Provider SDKs ship a tokenizer (Anthropic's `count_tokens`, OpenAI's `tiktoken`) you call before sending. If you're coming from React, this is the same instinct as `JSON.stringify(payload).length` before a fetch — a sanity check that the payload isn't unreasonable. Concrete consequence: write a `tokensFor(chain, payload)` helper early. Log it per call. Set a per-chain ceiling. The day the ceiling alarms, you know exactly which consumer grew (history, retrieved docs, system message bloat) before the chain fails in production.

```
budget allocation per chain (example)

┌──────────────────────────────────────┐
│ tag-extraction chain                 │
├──────────────────────────────────────┤
│ system prompt:         800 tokens    │ ← constant per chain
│ few-shot examples:   1,200 tokens    │ ← constant per chain
│ retrieved context:   8,000 tokens    │ ← per call, top-5 chunks
│ user message:        2,000 tokens    │ ← per call, capped
│ output budget:       1,000 tokens    │ ← max_tokens
│ headroom:            7,000 tokens    │ ← safety margin
├──────────────────────────────────────┤
│ total budget:       20,000 tokens    │
│ window size:       200,000 tokens    │
│ utilization:           10%           │
└──────────────────────────────────────┘
```

#### The headroom rule

The technical thing: never plan to use 100% of the window. Reserve at least 20% as headroom. The bridge from frontend: this is the same instinct as never sizing a container at exactly 100% viewport height because mobile browsers' chrome will eat 10% of it. Concrete consequence: when the chain's planned allocation hits 80% of the advertised window, the chain is over budget. Either retrieve less, summarize more, or pick a bigger model. The 80% threshold is not arbitrary — it's where attention quality typically degrades and where the output budget starts getting squeezed.

### Move 3 — The principle

The principle that generalises: *the window is the chain's hard physical constraint, not its design parameter*. Every chain has to be designed inside-out from the window — first you know what the model's window is, then you allocate slots to the consumers, then you build the chain. Designing the chain first and hoping the window fits is the same anti-pattern as designing a UI without knowing the viewport size. The senior move is to make the window allocation visible per chain (a table, a logged value, a config) so anyone reading the chain knows where the tokens go before they read the prompt. The full picture is below.

---

## Context window — diagram

```
┌─ The window as a budget, not a wall ────────────────────────────────────┐
│                                                                         │
│   Advertised window (provider-set, fixed per model)                     │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                          200K tokens                            │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│   Effective window (where attention works reliably)                     │
│   ┌─────────────────────────────────────────────────────────────┐      │
│   │                       ~160K tokens (80%)                    │      │
│   └─────────────────────────────────────────────────────────────┘      │
│                                                                         │
│   Per-call allocation                                                   │
│   ┌────┬─────────┬───────────┬──────┬──────┬────────────────────┐      │
│   │sys │ shots   │ retrieved │ hist │ user │ output │ headroom  │      │
│   │ 1K │  2K     │   40K     │ 30K  │  5K  │   8K   │   74K     │      │
│   └────┴─────────┴───────────┴──────┴──────┴────────┴───────────┘      │
│     ▲            ▲                          ▲          ▲                │
│     │            │                          │          │                │
│     │            │                          │          └─ safety        │
│     │            │                          │             margin        │
│     │            │                          └─ reserved via             │
│     │            │                             max_tokens               │
│     │            └─ middle-of-window risk zone                          │
│     │               (lost-in-the-middle applies)                        │
│     └─ prefix-cacheable region                                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼  per-call utilization metric
                          ┌────────────────────┐
                          │  utilization: 43%  │ ← log this, alarm at 80%
                          └────────────────────┘
```

The diagram shows three layers: the advertised window (what the API accepts), the effective window (where attention actually works), and the per-call allocation (how a specific chain divides up the effective window). The headroom band is what keeps the system from failing under load — when a user pastes a larger-than-expected document, the chain still has room to truncate gracefully instead of erroring.

---

## In this codebase

**Not yet implemented.** reincodes is a Next.js static-export DSA visualizer with zero AI surface in production code — there are no LLM calls, no context windows being budgeted, no chains running at request time. The existing study guide positions reincodes as the *interview-prep visualizer host* per the curriculum: a place to teach AI concepts through visualizers, not a place where AI runs for users. The buildable target for this concept is below in Project exercises — a `/ai/context-window` page that renders the window as a horizontal bar with toggleable segments (system / retrieved / history / response / headroom), so the reader can move sliders and see how allocations interact.

**Expected file paths** (when built):
- `src/app/ai/context-window/page.tsx` — the visualizer page
- `src/components/ContextWindowVisualizer/` — segmented bar component, sliders, warning band at 80%
- `public/ai/context-window/presets.json` — precomputed allocations for 4–6 common chain shapes (chat, RAG, agent, long-context summarization)
- `next.config.ts` — already enforces the static-export contract that defines what's possible inside `/ai/*`

---

## Elaborate

### Where this constraint comes from

Context windows are an artifact of the transformer architecture. The original attention mechanism (Vaswani et al. 2017) is O(n²) in sequence length — every token attends to every other token. At training time, that quadratic cost bounds how long a sequence the model can learn on. Early models (GPT-2, BERT) shipped with 512–2K token windows because that's what was feasible to train. The arms race since 2023 — Claude's 100K → 200K → 1M, GPT-4's 8K → 32K → 128K → 1M, Gemini's 1M → 2M — has been driven by architectural tricks (sliding window attention, sparse attention, RoPE extrapolation, ring attention) that make longer windows trainable without the quadratic blow-up. The fact that windows are still finite reflects that the quadratic cost has been *reduced*, not *eliminated*.

### The deeper principle

The deeper principle is that *the model's working memory is the most-contested resource in an LLM application*, and every other concept in this section ([02-lost-in-the-middle](02-lost-in-the-middle.md), [03-prompt-chaining](03-prompt-chaining.md), retrieval, reranking) exists to manage allocation inside it. RAG exists because the window is finite — you can't shove the whole corpus in, so you retrieve top-k. Reranking exists because the window is finite — even after retrieval, you want the best 5 chunks in the limited room. Chunking exists because the window is finite — documents don't fit whole. Every operational pattern in AI engineering reduces to "how do we use this fixed budget most effectively." The window is the budget.

### Where this breaks down

The window framing breaks down for *streaming* and *prefix caching*. Streaming changes the consumption model — the output tokens come back one-at-a-time, so the "output budget" isn't all consumed up front; it's consumed across the duration of the response. Prefix caching changes the cost model — the static prefix of the window (system message + few-shot) doesn't get re-processed on each call, only the dynamic suffix does, which changes the calculus of "how much can I afford to put in the system message." Both patterns are extensions of the window model, not exceptions to it, but they require thinking about *time* and *cost* alongside *token count*.

### What to explore next

- [02-lost-in-the-middle](02-lost-in-the-middle.md) → the position-dependent attention quality story — *where* in the window matters, not just *how much*
- [03-prompt-chaining](03-prompt-chaining.md) → when a single window isn't enough, chain calls into sequential windows with structured handoffs
- [../study-prompt-engineering/04-token-budgeting](../../study-prompt-engineering/04-token-budgeting.md) → the practitioner's allocation discipline, sibling concept from the prompt-engineering guide
- [../03-retrieval-and-rag/11-rag](../03-retrieval-and-rag/11-rag.md) → the canonical pattern for fitting more knowledge than the window can hold
- [../03-retrieval-and-rag/03-chunking-strategies](../03-retrieval-and-rag/03-chunking-strategies.md) → how documents get broken to fit the window

---

## Tradeoffs

### Comparison table — both costs in one frame

```
┌──────────────────┬──────────────────────┬─────────────────────────┐
│ Cost dimension   │ Path taken           │ Alternative             │
│                  │ (explicit budgeting) │ (implicit / unmanaged)  │
├──────────────────┼──────────────────────┼─────────────────────────┤
│ Engineering time │ 1 day per chain to   │ Zero — append and pray  │
│                  │ design allocation    │                         │
│ Observability    │ Per-call token log,  │ Discover the ceiling    │
│                  │ alarms at 80%        │ via 400 errors in prod  │
│ Failure mode     │ Graceful truncation, │ Hard 400, parser fails, │
│                  │ summarization        │ retries make it worse   │
│ Cost predictability│ Tokens per chain  │ Cost spikes when one    │
│                  │ are a known number   │ user's history blows up │
│ Model swap cost  │ Reallocate budget    │ Budget was implicit, so │
│                  │ for new window size  │ swap is a full re-test  │
│ Onboarding cost  │ New contributor      │ New contributor adds    │
│                  │ reads allocation     │ new consumer; window    │
│                  │ table per chain      │ silently overruns       │
│ Debugging        │ Token log says which │ "It worked yesterday;   │
│                  │ slot grew            │ now it 400s. why?"      │
└──────────────────┴──────────────────────┴─────────────────────────┘
```

### What we gave up (when planning the reincodes visualizer)

The first cost is *engineering time before the visualizer can ship*. A meaningful `/ai/context-window` page needs at least 4–6 preset allocations (a basic chat chain, a RAG chain, an agent loop, a long-context summarization chain, possibly a streaming variant) so the reader can compare them. Each preset is a JSON blob with the slot breakdown and a "what happens if you exceed this" narrative. Half a day of design work plus the page itself plus the bar-rendering component — roughly one full day of effort.

The second cost is *teaching surface confusion with the prompt-engineering guide's token-budgeting file*. That sibling file ([../study-prompt-engineering/04-token-budgeting](../../study-prompt-engineering/04-token-budgeting.md)) covers the practitioner's allocation discipline — how to count, how to budget per chain, how to enforce. This file covers the *constraint itself* — the window's mechanics, why it exists, what counts toward it. The split is real (one is the resource, one is the discipline) but the reader has to be told which file answers which question. The cross-reference at the top of this file (`See also`) is the seam.

The third cost is *static-export precompute load*. A useful visualizer wants to render *real* tokenizer counts, not made-up numbers. That means including a tokenizer in the bundle (WASM tiktoken ~ 2MB) or precomputing token counts for the preset texts at build time. The precompute path is the cleaner option under the static-export contract — it keeps the bundle small and the page snappy — but it means the page can't tokenize *user-typed input* live. The visualizer becomes a playback machine over precomputed presets, not an interactive tokenizer.

### What the alternative would have cost (skipping the visualizer)

If reincodes never builds `/ai/context-window`, the cost is zero in the codebase. The concept is documented here in writing; the practitioner discipline is documented in the prompt-engineering guide; the production application lives in other portfolio projects (loopd's chains, planned features at work). reincodes stays pure-DSA.

The cost of *not* building it shows up in the portfolio story. When an interviewer asks "how would you visualize the context window for a non-technical PM?" there's no concrete artifact to point at. The candidate has to describe it instead of demonstrating it. That's reasonable but it's weaker than "here's the visualizer, drag the slider and watch the headroom collapse."

### The breakpoint

The visualizer earns its place the day an interview round explicitly asks about context-window mechanics — usually phrased as "walk me through how you'd budget tokens for a RAG chain." Until that interview pressure exists, the buildable target stays in the backlog. The breakpoint is event-shaped: the moment an AI-focused recruiter wants a "show me the artifact" demo.

### What wasn't actually a tradeoff

Live tokenization in the visualizer was not a real option *at meaningful scale*. WASM tokenizers exist (tiktoken-wasm, tokenizers-wasm from HuggingFace) and would work, but the bundle cost (~2MB) is large relative to the rest of the reincodes home-page bundle (~200KB). The precompute-at-build-time approach for the preset allocations is the only path compatible with reincodes' bundle-size budget. A future revision could ship the WASM tokenizer code-split under `/ai/context-window` if interactive tokenization becomes a hard requirement.

---

## Tech reference (industry pairing)

### Anthropic `count_tokens` API

- **Codebase uses:** not yet — the planned `/ai/context-window` visualizer would use `anthropic.messages.countTokens()` at build time to compute the real token counts for each preset's text. Output committed to `public/ai/context-window/presets.json`.
- **Why it's here:** Anthropic was the first major provider to expose token counting as a first-class API endpoint rather than requiring you to ship the tokenizer client-side. The visualizer's "real numbers for real text" claim depends on it.
- **Leading today:** Anthropic `count_tokens` — `innovation-leading` for server-side tokenization with model-specific accuracy, 2026.
- **Why it leads:** removes the bundle cost of shipping a WASM tokenizer; guarantees the count matches what the model will actually see at inference time; updates automatically when Anthropic ships a new tokenizer version.
- **Runner-up:** OpenAI `tiktoken` (Python/JS port) — `adoption-leading` for client-side tokenization; the dominant choice in 2024–2025 production codebases that needed counts without a network call.

### `tiktoken` (OpenAI's tokenizer, JS/Python ports)

- **Codebase uses:** not yet — would be the fallback if the visualizer ever needs *live* tokenization (user types text, see token chips render). Code-split under `/ai/context-window` to keep it off the home page bundle.
- **Why it's here:** the canonical client-side tokenizer for the GPT family; the WASM port (`tiktoken-wasm`) runs in the browser without a server roundtrip. Useful for the `/ai/tokenization` sibling visualizer too.
- **Leading today:** `tiktoken` — `adoption-leading` for GPT-family tokenization, 2026.
- **Why it leads:** maintained by OpenAI, exact byte-for-byte match with the production tokenizer, comprehensive language bindings.
- **Runner-up:** `@anthropic-ai/tokenizer` — `innovation-leading` for Claude-family tokenization; gaining ground as Claude usage grows but still less mature than `tiktoken`.

### `@huggingface/tokenizers` (Rust/WASM)

- **Codebase uses:** not yet — would be the model-agnostic option if the visualizer ever needs to compare token counts across providers (same text, three different tokenizers, three different counts).
- **Why it's here:** supports any model on HuggingFace Hub via the model's `tokenizer.json`; the "compare tokenizers across providers" feature would lean on it.
- **Leading today:** `@huggingface/tokenizers` — `innovation-leading` for cross-model tokenization, 2026.
- **Why it leads:** the broadest tokenizer coverage (Claude, Llama, Mistral, Qwen, Gemma, ...); Rust core compiled to WASM keeps the bundle reasonable; the de-facto standard for open-model deployments.
- **Runner-up:** `sentencepiece` (Google) — `adoption-leading` for the Llama / T5 / Gemma family of models; still required when working with sentencepiece-trained models that the HF tokenizer can't load directly.

---

## Project exercises

### [B-reincodes-context-window-viz] Build the context-window visualizer

- **Exercise ID:** `[B-reincodes-context-window-viz]` — derived from the curriculum's reincodes "interview prep surface" entry; aligns with Phase 1 concept `[C1.2]` (context windows and the lost-in-the-middle problem).
- **What to build:** a page at `/ai/context-window` that renders a horizontal bar representing a 200K-token Claude window. Five labelled segments (system / retrieved / history / user / output) sized by token count, each draggable to resize. A floating "headroom" band fills the remaining space. A warning state activates when total utilization crosses 80%. A preset dropdown loads 4–6 precomputed allocations (basic chat, RAG, agent loop, long-context summarization) so the reader can compare shapes. Each preset includes a "what happens at this allocation" tooltip — "headroom is 4K, summarizing history would let you keep more retrieved context" etc.
- **Why it earns its place:** the visualizer makes the window *operable* — the reader doesn't just read about budgeting, they drag sliders and watch the response budget collapse when history grows. The interview signal is that the candidate can teach the concept visually under the static-export constraint, which is a recurring portfolio pattern.
- **Files to touch:** `src/app/ai/context-window/page.tsx` (visualizer page), `src/components/ContextWindowVisualizer/` (segmented bar with drag handles, 80% warning band, preset selector), `public/ai/context-window/presets.json` (precomputed allocations + tooltip narratives), `scripts/precompute-context-window.ts` (build-time script that calls `anthropic.messages.countTokens()` against each preset's text and writes the JSON). Add a row to `src/components/Home/conceptsData.tsx`'s `CONCEPT_CATEGORIES` under a new `ai-engineering` category.
- **Done when:** the page loads at `/reincodes/ai/context-window/` in production (GitHub Pages), 5 segments render with token counts, dragging any segment resizes others to maintain the 200K total, crossing 80% utilization flips the warning band on, 4+ presets load from the JSON without a network call. `next build` passes under `output: "export"`.
- **Estimated effort:** 1–2 days. Precompute script + JSON shape: half day. Page + segmented bar component with drag-resize: half to one day. Polish + preset narratives: half day.

---

## Summary

### Part 1 — concept recap

A context window is the fixed token budget every LLM call has to fit inside — input and output combined, measured in tokens, sized per model (Claude 200K, GPT-5 1M, Gemini 2M). The window is a *shared* budget across every consumer in the call: system prompt, few-shot examples, retrieved docs, conversation history, user message, model response. Treat it as a finite resource with named slots; allocate per chain; alarm at 80% utilization to leave headroom; never let any single consumer grow unbounded. In reincodes the concept is *planned* rather than implemented — there are no LLM calls in production code, and the buildable target is the `/ai/context-window` visualizer that renders the window as a draggable segmented bar with preset allocations precomputed at build time. The static-export contract is the constraint that shapes the implementation: live tokenization is too expensive in bundle terms, so the visualizer is a playback machine over precomputed `count_tokens` results.

### Part 2 — key points to remember

- **The window is shared**: input + output both consume the same budget. Reserve output explicitly via `max_tokens` or you'll discover the ceiling when the model stops mid-sentence.
- **Advertised vs effective**: 200K advertised is ~160K effective at high attention quality. The 80% rule is the operating norm.
- **Every consumer counts**: system, examples, retrieved, history, user, response. Log token counts per chain. Alarm at 80%.
- **The window is the budget every other pattern manages**: RAG exists because the window is finite; reranking exists because the window is finite; chunking exists because the window is finite.
- **The reincodes shape**: implementation is Case B; buildable target is `/ai/context-window` — a draggable segmented bar with 4–6 preset allocations precomputed via `anthropic.messages.countTokens()` at build time.

---

## Interview defense

### What an interviewer is really asking

Behind "how do you handle context limits?" the interviewer is probing whether the candidate has *operationalized* the window or just *encountered* it. A junior answer describes the window as a number ("Claude has 200K, so you have 200K to work with"). A senior answer describes the window as a *budget with named consumers* and names a specific failure they've debugged where the budget overran — usually a long-running chat hitting the ceiling, or a RAG chain where retrieved docs starved the output budget. The interviewer is checking whether the candidate has the muscle memory to design chains inside the window from day one, not discover the constraint at production scale.

### Likely questions

**Q (mid):** Why does the model's response sometimes get cut off mid-sentence?

A: Because the model ran out of room. The context window is shared between input and output — if the input consumes 195K of a 200K window, the response gets 5K tokens to work with, which is maybe 750 words. If the chain doesn't reserve output capacity explicitly via `max_tokens`, the response stops when it hits the wall and the API returns a `stop_reason: "max_tokens"` (or for Anthropic, `stop_reason: "length"`). The fix is to budget per chain: subtract a known output reservation from the window before allocating to the input consumers.

```
unbudgeted call                    budgeted call
────────────────────               ────────────────────
window: 200K                       window: 200K
input:  195K (grew over time)      reserved output: 8K
remaining for output: 5K           remaining for input: 192K
response truncates at 5K           input fits in 192K cap
stop_reason: "length"              stop_reason: "end_turn"
```

**Q (senior):** What's the difference between the advertised context window and the effective window?

A: The advertised window is the API's hard ceiling — the number above which the provider returns a 400 error. The effective window is the region where attention quality stays high. Liu et al. 2023 ("Lost in the Middle") showed that information at positions around 50% of the window gets retrieved less reliably than information at the start or end. Long-context models since 2024 have partially fixed this, but the U-shape is still present — quality dips in the middle, recovers at the ends. The operational consequence is the 80% rule: don't budget past 80% of the advertised window, and put critical instructions at positions 0–20% or 80–100%, not the middle. Cross-reference `02-lost-in-the-middle.md` for the deeper treatment.

```
advertised window (provider ceiling)
├────────────────────────────────────────────────────┤
│  200K tokens — request fails above this            │
└────────────────────────────────────────────────────┘

effective window (where attention works)
├──────────────────────────────────────────┤
│  ~160K tokens (80%)                      │
└──────────────────────────────────────────┘

attention quality across positions
█████ high    ░░░░░ medium    ▒▒▒▒▒ degraded
█████████████░░░░░░▒▒▒▒▒▒▒░░░░░░░█████████████
0%                  50%                    100%
```

**Q (arch):** At 10× scale — say, a conversation that has been running for 6 months across 50K messages — how do you keep the window from blowing up?

A: At that scale you stop treating history as a single linear consumer and start treating it as a tiered cache. Three layers: (1) the most-recent ~10 turns go in raw, as full message text; (2) the next ~50 turns get summarized into a short "recent context" block by a cheaper model (Haiku, GPT-5-nano); (3) everything older gets indexed into a vector store and retrieved on demand based on the current user message. The window allocation becomes: system (constant) + few-shot (constant) + raw-recent (10 turns, ~2K tokens) + summary (recent 50, ~3K tokens) + retrieved-historical (top-k chunks, ~5K tokens) + current user message + output reservation. The chain doesn't grow with conversation length; it grows with retrieval, which is bounded.

```
naive: window grows with history       tiered: window stays bounded

50K msgs × ~50 tokens = 2.5M tokens    raw recent:    ~2K  (10 msgs)
       ↓                                summary:       ~3K  (next 50)
   exceeds 200K                         retrieved:     ~5K  (top-k of rest)
   exceeds 1M                                          ───
   chain breaks                         total history: ~10K  (constant)
```

### The question candidates always dodge

**Q:** GPT-5 has a 1M-token window. Why not just throw everything in and let the model figure it out?

A: That argument is wrong in three places at once. First, cost: 1M tokens at input price (GPT-5: ~$1.25 per million tokens) is $1.25 per call before the model says a word. A chain that runs 10K times a day at that allocation is $4,500 a month for *input alone*. Second, latency: a 1M-token call takes substantially longer (5–30 seconds depending on provider load) than a 50K-token call, which kills user-facing chains. Third, quality: even at 1M, lost-in-the-middle still applies — information at position 500K is retrieved less reliably than information at position 50K or 950K, so dumping the whole corpus in is *worse* than running retrieval and shipping the top 5 chunks. The cost ledger:

```
dump everything in 1M window           retrieved top-5 chunks in 200K
──────────────────────                 ────────────────────────────
+ no retrieval system to build         + retrieval system: real eng cost
- $1.25 per call at GPT-5 input        + ~$0.06 per call (200K vs 1M)
- 5–30s latency                        + ~1–3s latency
- worse quality (middle dip)           + better quality (top-k focused)
- no telemetry on what mattered        + can log which chunks were used
- can't audit which fact the model     + chunks logged → reproducible
  drew on                                debugging
- model swap requires re-eval of       + retrieval is provider-agnostic;
  the whole dump                         only the generation step changes
```

The honest answer: "just use a bigger window" feels lazy-but-pragmatic and is much more expensive over a year. The interview move is naming all three failure modes (cost, latency, quality) rather than defending the simplicity.

### One-line anchors

- "The context window is the model's RAM for a single inference call — input + output, shared budget, fixed ceiling."
- "Advertised window is the hard ceiling; effective window is ~80% of that. Don't budget past the 80%."
- "Every chain has a per-call token budget broken out by consumer: system, examples, retrieved, history, user, response, headroom. Log it. Alarm at 80%."
- "Bigger windows don't replace retrieval — cost, latency, and lost-in-the-middle make 'just dump everything in' wrong on three axes at once."
- "Reserve the output budget explicitly. The chain hits the ceiling either way; budgeted hits it before the call, unbudgeted hits it mid-sentence in production."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw the window-as-budget diagram from memory: name the 5–6 consumers, label which are constant per chain vs per call, mark the 80% threshold, label the headroom band.

✓ Pass: 5+ consumers labeled (system, retrieved, history, user, output, headroom), constant/per-call split correct, 80% line drawn
✗ Fail: re-read the primary diagram, wait 10 minutes, try again

### Level 2 — Explain it out loud

Explain context windows to a colleague who has only used the ChatGPT web UI and treats "the AI" as a black box. No notes. Under 90 seconds.

Checkpoints — did you:
- Name input + output as a *shared* budget (not just an input limit)?
- Distinguish advertised window from effective window?
- Name at least one named consumer that consumes the budget per call?
- Reference the buildable target (`/ai/context-window` visualizer) as how you'd teach it in reincodes?

If you skipped any: you described the limit, you didn't argue for the budget framing.

### Level 3 — Apply it to a new scenario

A planned reincodes feature: a chain that reads the *entire user's homepage HTML* (their portfolio site) and outputs a structured JSON describing their skills, projects, and notable links. Average homepage is 50K tokens of HTML. Some users have static-export sites that are 300K+ tokens.

Lay out the window allocation for this chain against a Claude Sonnet 4.7 200K window. What gets clipped, summarized, or retrieved-against if the input is 300K? Where does the output budget land?

Write your answer (3–5 sentences minimum). Then open `next.config.ts` and confirm the static-export constraint that would force the precompute-at-build-time pattern if this feature ever shipped in reincodes.

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff from the Tradeoffs section. Answer in writing: "If I were starting the `/ai/context-window` visualizer today, would I still precompute the token counts at build time, or would I ship a WASM tokenizer for live interactive tokenization? Why? What does each choice cost?"

Reference the actual code:
→ Point to `next.config.ts` for the static-export contract that bounds the choice
→ Point to `src/components/Home/conceptsData.tsx` for where the new `/ai/context-window` row would land

There is no right answer. The point is specificity.

### Quick check — code reference test

Without opening any files, answer:
- What file in reincodes controls the static-export contract that bounds what the visualizer can do?
- What directory under `.aipe/` already contains the sibling concept file on token budgeting (the practitioner's discipline take, not this constraint take)?
- What `next.config.ts` field would the visualizer need set correctly for the `/ai/context-window` route to be reachable at production basePath?

Then open the files and verify.

✓ Pass: `next.config.ts`, `.aipe/study-prompt-engineering/`, `basePath`
✗ Fail on details: that's fine — the shape is what matters. File and directory names should be recoverable.
