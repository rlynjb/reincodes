# Token budgeting and context window management

**Industry name(s):** Token budgeting, context window management, prompt budgeting, context allocation, prefix caching
**Type:** Industry standard

> Counting tokens, allocating the context window across system/context/history/response, and treating the 80% mark as a danger line. Basic hygiene that distinguishes amateur from professional prompt work.

**See also:** → [01-anatomy](01-anatomy.md) · → [02-structured-outputs](02-structured-outputs.md) · → [05-eval-driven-iteration](05-eval-driven-iteration.md) · → `.aipe/study-ai-engineering/ai-features-in-this-codebase.md` · → `.aipe/study-ai-engineering/01-llm-foundations/02-tokenization.md`

---

## Why care

### Move 1 — The grounded scenario

You build a chat feature. One textarea, one submit button, conversation history rendered as a `.map()` over a `messages` array. The first few turns work fine — three messages, a few hundred tokens each, well under the model's 200k context window. Two weeks in, a power user has 80 turns of history. The chat starts taking 12 seconds to respond (instead of 2). A week later, the same user hits 150 turns and starts getting truncated responses — the model is hitting the response token limit because the input has consumed almost the whole window. A week after that, a different user pastes a 60KB document into the chat and the request fails with a 400 from the provider because the input plus the history exceeds the model's max context. You have no token-counting code; the chat was built on `messages.length` as the only size measure.

### Move 2 — Name the question

That failure mode has a name — *unmanaged context window*. Every LLM call has a budget — the model's context window in tokens — and that budget gets allocated across four claimants: the system prompt, the retrieved context (if any), the conversation history (if any), and the space reserved for the response. The question is: *for any given call, how many tokens are each of these consuming, and how close are you to the model's limit?* If you can't answer in seconds, you don't have token budgeting — you have token *roulette*, and the failure mode is invisible until a user trips over it.

### Move 3 — Why answering that question matters

**Why you need to answer that question at all:** because the model's response quality degrades long before the hard limit. At 80% of the window, the model is *technically fine* but starts losing the middle of the prompt — the lost-in-the-middle effect kicks in well before the truncation error fires. I shipped a RAG chain in 2024 that worked perfectly on small queries (3-5 retrieved chunks, ~4k tokens total) and started returning hallucinated answers at scale (15+ retrieved chunks, ~30k tokens total). The model wasn't refusing or truncating; it was *quietly producing wrong answers* because the most relevant chunk was in position 8 of 15 and the model paid less attention to it. The fix wasn't more tokens; it was *fewer chunks, better-ranked* — token budgeting in the form of "spend the window on quality, not quantity." Without a token counter on the chain, the regression was invisible to me; the user found it first.

### Move 4 — Concrete before/after

Without token budgeting:

- No tokenizer in the codebase; `string.length` is the only size measure
- Conversation history grows unbounded; truncates at provider limit, abruptly
- Retrieved context is "all top-K chunks where K=20" because nobody measured cost
- Response token reservation is implicit (model defaults to whatever)
- Failure mode: 400 error from provider on long inputs, or silent degradation from lost-in-the-middle, or unexplained latency spikes
- Debugging: "why is this call slow?" → no answer, no metric

With token budgeting:

- Tokenizer is a first-class dependency (`tiktoken` or `@anthropic-ai/tokenizer`)
- Every call's input is measured before sending; `chain_input_tokens` is a logged metric
- Context window allocation is explicit per chain: `{ system: 1k, retrieved: 8k, history: 4k, response: 2k }` — total budget enforced
- History compression triggers at threshold (sliding window, summarize-and-replace)
- Prefix-cache hits are tracked; static prefix kept stable to maximize cache hits
- Failure mode: hit a *soft* limit (own threshold) before the *hard* limit (provider's), with structured fallback

### Move 5 — The one-line summary

Token budgeting is the discipline of counting and allocating the LLM's context window the same way a frontend dev allocates a 200KB JavaScript bundle — by section, with a soft cap below the hard cap, with compression strategies for overflow, with a metric in production that fires before users hit the wall. The mechanics — tokenization, the four allocation slots, the 80% rule, compression strategies, lost-in-the-middle, prefix caching — are below.

---

## How it works

### Move 1 — The mental model

The context window is a *fixed-size buffer* that gets carved up across four sections per call. The model's `200k` window isn't 200k tokens of free space — it's 200k tokens *total* across system prompt, retrieved context, conversation history, *and* the response the model needs to write. If you spend 195k on inputs, you have 5k left for output, and the model will truncate at sentence 4 of a long answer. The mental shift: stop thinking "the window is big enough." Start thinking "the window is a budget, and every section has an allocation."

The strategy: count tokens at every chain boundary, allocate explicitly per chain, compress before you hit the wall, and treat the 80% mark as the alarm — not the 100% mark.

```
context window allocation — every call carves up the same budget

  ┌──────────────────────────────────────────────────────────┐
  │  System prompt  │ Retrieved   │ History   │ Response     │
  │   1k tokens     │  8k tokens  │ 4k tokens │ 2k tokens    │
  ├──────────────────────────────────────────────────────────┤
  │                                                          │
  │  Total used: 15k / 200k window (7.5% utilization)        │
  │  Safe — well below the 80% danger line                   │
  └──────────────────────────────────────────────────────────┘

  Same model, different chain:

  ┌──────────────────────────────────────────────────────────┐
  │ System │ Retrieved (chunks growing)        │ Hist │ Resp │
  │  1k    │  165k tokens (20 chunks @ 8k each)│ 4k   │ 2k   │
  ├──────────────────────────────────────────────────────────┤
  │                                                          │
  │  Total used: 172k / 200k window (86% utilization)        │
  │  ⚠ over the 80% line — lost-in-the-middle kicks in       │
  └──────────────────────────────────────────────────────────┘
```

### Move 2 — The layered walkthrough

#### Counting tokens

The technical thing: every model has a tokenizer that converts text to integer IDs. The model's "input length" is the count of these IDs, not the character length of the string. Tokens are roughly 3-4 English characters each but vary wildly by language (Japanese ~1.5 chars/token, code ~2-3 chars/token, markdown with structure ~5+ chars/token because whitespace and punctuation tokenize efficiently). If you're coming from frontend, this is the same as `Buffer.byteLength(str, 'utf8') !== str.length` — the human-visible length isn't the wire length. Concrete consequence: `tiktoken` for OpenAI models, `@anthropic-ai/tokenizer` for Claude, model-specific tokenizers for Llama / Gemini / etc. Wrong tokenizer = wrong count = budget that looks fine until it isn't.

```
tokenization is per-model, not universal

  text:        "The quick brown fox jumps over the lazy dog."
  chars:       44
  GPT-4o:      11 tokens
  Claude:      11 tokens (close, but uses different vocab)
  Llama 3:     12 tokens
  Japanese:    "The quick brown fox..." ↑ same English text
               "ザ・クイック・ブラウン..." translated → ~28 tokens
                                          (same content, 2.5x cost)
```

#### The four-slot allocation

The technical thing: every prompt call divides the window across four claimants — `system prompt`, `retrieved context`, `conversation history`, `response budget`. The system prompt is constant per chain (small, ~500-2000 tokens). Retrieved context is the RAG-style injection (variable, 0-50k+). History is the conversation transcript (variable, 0-100k+ in long chats). Response budget is the *reserved space* for the model to write into — usually `max_tokens` on the API call. Sum must fit under the model's window. The bridge from frontend: this is the same as CSS `flex` with `min-width` — each slot has a minimum, the total must fit, overflow has to be handled. Concrete consequence: the response budget is the silent killer. If you don't reserve it explicitly, the model uses what's left after inputs, which may be too small for a useful answer.

```
the four slots — sum cannot exceed window

  ┌────────────────┬─────────────────────────────────────┐
  │ Slot           │ Notes                               │
  ├────────────────┼─────────────────────────────────────┤
  │ system prompt  │ constant per chain, ~500-2000 tok   │
  │ retrieved ctx  │ variable, 0-50k+ (RAG chunks)       │
  │ history        │ variable, 0-100k+ (long chats)      │
  │ response budget│ RESERVED — set `max_tokens` !       │
  └────────────────┴─────────────────────────────────────┘

  budget = window - response_budget
  system + retrieved + history ≤ budget
```

#### The 80% rule

The technical thing: if your chain's typical call uses more than 80% of the model's window, you're one model change away from breaking. The 80% threshold isn't tied to a specific failure mode — it's the empirical line where the *combined* risks compound (lost-in-the-middle starts mattering, response space gets squeezed, latency spikes, prefix-cache invalidation matters more). From frontend, this is the equivalent of "if your JS bundle is over 80% of your perf budget, you have no slack for a feature add." The bridge: budgets need *headroom* to absorb growth. Concrete consequence: when a chain crosses 80%, the conversation is no longer "what model do we use?" but "what compression do we add?" The 80% line is the call to refactor, not the call to upgrade to a larger window.

```
the 80% line — empirical danger zone

  0% ────────────── 80% ────── 100% ────── 105%
   │                 │            │          │
   │                 │            │          └─ provider 400
   │                 │            └─ truncation
   │                 │
   │                 └─ alarm. compress, summarize, or shrink retrieval.
   │                    DO NOT upgrade to bigger model as the fix —
   │                    the next chain will hit the same wall.
   │
   └─ safe operating range
```

#### Compression strategies

The technical thing: when the input outgrows the budget, you compress. Three techniques are load-bearing: (1) *sliding window* — keep the last N turns of conversation, drop older. Cheap, lossy on long-context understanding. (2) *summarization* — periodically replace older history with an LLM-generated summary. Costs an extra call per summary, preserves "what we talked about" at lower fidelity. (3) *retrieval as compression* — instead of dumping all history or all docs, retrieve only the relevant slice. This is what RAG does, and it's the most powerful compression because relevance is the implicit filter. From frontend, these are tree-shaking, code-splitting, and lazy-loading — all variants of "don't ship what you don't need." Concrete consequence: every long-running chain ends up with at least one compression strategy in production. The chain that has none is the chain that hasn't scaled yet.

```
the three compression strategies

  sliding window           summarization              retrieval
  ──────────────           ─────────────              ─────────
  ┌─┬─┬─┬─┬─┐              ┌────┐ ┌─┬─┬─┐             ┌─────────┐
  │1│2│3│4│5│              │sum │ │3│4│5│             │ query   │
  └─┴─┴─┴─┴─┘              └────┘ └─┴─┴─┘             ├─────────┤
  drop 1,2 → keep last 3   1+2 → summary,             retrieve top-K
                            keep recent 3              relevant only

  cheap, lossy             1 extra LLM call           best signal, most
                           per summary cycle          architecture cost
```

#### Lost-in-the-middle

The technical thing: even when content fits in the window, the model's attention is *not uniform* across positions. Content at the start and end of the prompt is attended more strongly than content in the middle. The effect was named by Liu et al. (2023, "Lost in the Middle: How Language Models Use Long Contexts"); the curve looks like a U-shape — high attention at the edges, dip in the middle. Concrete consequence: position matters even when content fits. If your retrieved context has 15 chunks and the most relevant one is chunk 8, the model may *attend less to it* than to chunks 1 or 15. The mitigation is rerank-by-relevance and put the highest-signal chunks at the edges (start and end) of the context block, not the middle.

```
attention curve over prompt position — the lost-in-the-middle U-shape

  attention
    high │  ●                                                    ●
         │ ● ●                                                  ● ●
         │●   ●                                                ●   ●
         │     ●                                              ●
         │      ●                                            ●
         │       ●                                          ●
         │        ●●                                      ●●
         │          ●●●●                              ●●●●
         │              ●●●●●●●●●●●●●●●●●●●●●●●●●●●●
    low  │_____________________________________________________________
         start                  middle                              end
                              prompt position

  put your most important content here ↑               and here ↑
  not here ↑↑↑↑
```

#### Prefix caching

The technical thing: providers cache the prefix of a prompt across calls. If the first 10k tokens of every call to your chain are identical (same system prompt, same few-shot examples, same instructions), the provider caches the model's internal state for that prefix and reuses it on subsequent calls. Cost drops to ~10% of the cached portion; latency drops by ~80% on cache hit. The cache invalidates the moment the prefix changes (even one token of edit invalidates the whole prefix). From frontend, this is HTTP caching with `Cache-Control: immutable` — change the URL by one character and the cache is gone. Concrete consequence: keep the static prefix actually static. Don't interpolate dynamic timestamps, request IDs, or per-call variables into the system prompt section — they'll bust the cache. The dynamic stuff goes after the cached prefix.

```
prefix caching — keep the static parts at the front

  ┌──────────────────────────────────────┬────────────────┐
  │ STATIC PREFIX (cacheable)            │ DYNAMIC SUFFIX │
  │ system prompt + few-shot + docs      │ user message   │
  │ (kept identical across all calls)    │ (changes/call) │
  ├──────────────────────────────────────┼────────────────┤
  │                                      │                │
  │ cache hit: 90% cost reduction        │ paid per call  │
  │            80% latency reduction     │                │
  └──────────────────────────────────────┴────────────────┘

  anti-pattern: interpolating call timestamp into system prompt
                → invalidates cache on every call
                → cache savings: $0
```

### Move 3 — The principle

The principle that generalises: *every shared resource needs accounting*. The context window is a shared resource across four claimants. Without accounting, the claimants will collectively overcommit and one of them will silently lose (usually the response, which gets squeezed by inputs). The history of software engineering is full of this exact pattern — memory budgets, bandwidth budgets, latency budgets, bundle-size budgets. The discipline is the same: measure, allocate, alarm before the wall. The reason token budgeting feels new is that LLM developers spent 2022-2023 with windows so small (4k, 8k) that overflow was always a hard error you couldn't miss. The windows got bigger (128k, 200k, 1M) and the failure mode shifted from "error" to "silent degradation," which is harder to catch without instrumentation. Counting tokens is not optional — it's basic hygiene that distinguishes amateur from professional prompt work.

The full picture is below.

---

## Token budgeting — diagram

```
┌─ The token-budgeting loop for a single chain call ───────────────────┐
│                                                                      │
│  1. Compose the prompt sections                                      │
│     ┌──────────────────────────────────────────────┐                 │
│     │ system: 1k                                   │                 │
│     │ few-shot: 0.5k                               │                 │
│     │ retrieved context: K chunks × ~1k each       │                 │
│     │ conversation history: N turns × ~200 each    │                 │
│     │ user message: variable                        │                 │
│     └──────────────────────────────────────────────┘                 │
│                          │                                           │
│                          ▼   count with the model's tokenizer        │
│  2. Measure                                                          │
│     ┌──────────────────────────────────────────────┐                 │
│     │ total_input_tokens = tokenizer.encode(prompt)│                 │
│     │                       .length                │                 │
│     └──────────────────────────────────────────────┘                 │
│                          │                                           │
│                          ▼   check against budget                    │
│  3. Compare                                                          │
│     ┌──────────────────────────────────────────────┐                 │
│     │ utilization = total_input_tokens / window    │                 │
│     │             - reserved_response_budget       │                 │
│     │                                              │                 │
│     │ if utilization > 0.80:                       │                 │
│     │   trigger compression                        │                 │
│     │ if utilization > 0.95:                       │                 │
│     │   reject with structured error               │                 │
│     └──────────────────────────────────────────────┘                 │
│                          │                                           │
│                          ▼   compress if needed                      │
│  4. Compress (one or more strategies)                                │
│     ┌──────────────────────────────────────────────┐                 │
│     │ - sliding-window history (drop oldest turns) │                 │
│     │ - summarize older history into a digest      │                 │
│     │ - rerank retrieved chunks, drop low-relevance│                 │
│     └──────────────────────────────────────────────┘                 │
│                          │                                           │
│                          ▼   send to provider                        │
│  5. Call                                                             │
│     ┌──────────────────────────────────────────────┐                 │
│     │ call.max_tokens = reserved_response_budget    │                 │
│     │ provider returns response within budget       │                 │
│     │ log (chain_id, input_tokens, output_tokens,   │                 │
│     │      cache_hit, latency_ms)                   │                 │
│     └──────────────────────────────────────────────┘                 │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘

  the lost-in-the-middle consideration is layered on top:
  ↑ rerank step in (4) should put highest-signal chunks at
    edges of the retrieved-context block, not the middle
```

The boundary between step 3 (compare) and step 4 (compress) is where the 80% alarm fires. Crossing 80% is the trigger for compression; crossing 95% is the trigger for structured rejection (better than a 400 from the provider, because you can fall back gracefully).

---

## In this codebase

**Not yet implemented.** reincodes is a Next.js static-export DSA visualizer with no AI surface in production code — there are no LLM calls, no context windows, no tokenizers in `package.json`. The existing study guide (`.aipe/study-ai-engineering/ai-features-in-this-codebase.md`) frames reincodes as the *interview-prep visualizer host* — the place where AI concepts get *taught through visualizers*, not the place where AI runs for users. The existing `01-tokenization.md` in that same directory frames the tokenization visualizer that this concept builds on. The buildable target for *token budgeting* specifically is a `/ai/token-budget` page that renders the context window as a horizontal bar, segments colored by section (system / retrieved / history / response), with sliders for "history length" and "retrieved doc count" that recompute the bar in real time using a precomputed tokenizer. A second panel shows the lost-in-the-middle attention curve so the reader sees why middle-position content gets less attention even when it fits.

**Expected file paths** (when built):
- `src/app/ai/token-budget/page.tsx` — the visualizer page
- `src/components/TokenBudgetVisualizer/` — horizontal-bar window renderer, slider controls, attention-curve panel
- `src/workers/tokenizer.worker.ts` — shared WASM tokenizer worker (reused from the planned tokenization visualizer)
- `public/ai/token-budget/example-corpus.json` — precomputed text snippets for the four slots (system prompt examples, retrieved chunks, conversation history turns)
- `public/ai/token-budget/attention-curve.json` — precomputed lost-in-the-middle attention values across positions

---

## Elaborate

### Where this pattern comes from

Token budgeting as a discipline emerged in 2023 when context windows started getting big enough that "stuff everything in" became a tempting (and bad) strategy. The 8k → 32k → 128k → 200k → 1M progression across 2023-2024 changed the failure mode from "you can't fit" to "you can fit, but you shouldn't." The lost-in-the-middle paper (Liu et al., 2023) put a name to the silent-degradation pattern; the prefix-caching APIs (Anthropic in late 2024, OpenAI's prompt caching shortly after) gave teams a financial incentive to structure prompts with stable prefixes. By 2026 every serious LLM team has a token-counting library in their dependencies and a `chain_input_tokens` metric in their observability stack. The teams that don't are the teams that haven't been burned by a silent regression yet.

### The deeper principle

The deeper principle is that *attention is the scarce resource, not just window size*. The window is the budget; the attention is the *quality* of what the budget buys. Doubling the window doesn't double the model's ability to use the content — past a certain length, additional content competes for attention rather than supplementing it. The discipline is "spend the window on signal, not on bulk." A 50k-token prompt with five highly-relevant chunks beats a 150k-token prompt with twenty mostly-irrelevant ones, even though both fit. The history-of-software analogue: bigger RAM doesn't speed up the program; better data structures do. Bigger context window doesn't improve answers; better context selection does.

### Where this breaks down

Token budgeting gets harder in two cases. First, *multi-modal prompts* — images and audio tokenize at very different rates than text, and the rates vary by model. A single high-res image can consume 1500+ tokens on Claude, far more than its visual area suggests. The naive token-counter that treats everything as text underestimates. Second, *long-context chains where every turn adds tokens irreversibly* — agent loops, multi-turn refinement chains. The budget gets *consumed* by the chain itself, not just by user input; the four-slot allocation has to leave room for *future* turns the chain will need. These chains need a separate budgeting model (think of it as "amortized budget per turn over expected chain length") rather than per-call budgeting. Most production chains aren't this; the basic four-slot model handles them. But when it doesn't, the architecture needs more thought.

### What to explore next

- [01-anatomy](01-anatomy.md) → the four sections of the anatomy *are* the four budget claimants; anatomy makes budgeting possible
- [02-structured-outputs](02-structured-outputs.md) → the schema adds tokens to the request; usually small, but counted
- [05-eval-driven-iteration](05-eval-driven-iteration.md) → token budget is itself an eval metric (regressions in `chain_input_tokens` should fire alarms)
- `.aipe/study-ai-engineering/01-llm-foundations/02-tokenization.md` → the foundation: what a token *is*, how the tokenizer works, why character-count is wrong

---

## Tradeoffs

### Comparison table — both costs in one frame

```
┌──────────────────┬──────────────────────────┬─────────────────────────┐
│ Cost dimension   │ Path taken               │ Alternative             │
│                  │ (explicit budgeting)     │ ("we have a big window")│
├──────────────────┼──────────────────────────┼─────────────────────────┤
│ Build time       │ 2-4 hours per chain to   │ 0 minutes — just send   │
│                  │ wire tokenizer + budget  │ everything              │
│                  │ + compression            │                         │
│ Dependencies     │ Tokenizer in package.json│ None                    │
│                  │ (~1-3MB WASM bundle)     │                         │
│ Latency          │ Tokenization adds ~5-50ms│ "Fast" until the chain  │
│                  │ pre-call; compression    │ blows the window then   │
│                  │ adds variable ms         │ provider 400s           │
│ Failure mode     │ Soft cap → graceful      │ Hard cap → provider 400 │
│                  │ degradation + fallback   │ → user sees error       │
│ Cost per call    │ Predictable; cache hits  │ Unpredictable; varies   │
│                  │ are explicit             │ with input size         │
│ Lost-in-the-middle│ Rerank step keeps signal│ Random — depends on     │
│ exposure         │ at edges                 │ chunk order in array    │
│ Debugging        │ Token counts in logs;    │ "Why was this slow?"    │
│                  │ "this call used 12k"     │ → no answer             │
│ Cost as you scale│ Linear with input size,  │ Linear until you hit    │
│                  │ alarmed at threshold     │ the wall, then 100%     │
│                  │                          │ failure                 │
└──────────────────┴──────────────────────────┴─────────────────────────┘
```

### What we gave up (when planning the reincodes visualizer)

The first cost is the *WASM tokenizer bundle*. The visualizer needs an actual in-browser tokenizer to make the slider interactions feel real (count tokens as the reader drags the slider). Shipping `tiktoken-js` or a similar WASM tokenizer adds 1-3MB to the route bundle. The mitigation is the existing planned tokenization visualizer (`/ai/tokenization` in `01-tokenization.md`) already commits to this WASM dependency; the token-budget visualizer reuses it via `src/workers/tokenizer.worker.ts`. Cost is amortized across two visualizers, not paid twice.

The second cost is the *precomputed corpus*. The visualizer wants realistic content for each of the four slots — a real system prompt, several real retrieved chunks, a few real conversation turns — at varying sizes so the sliders sweep through interesting ranges. That corpus needs to be hand-authored or generated, then tokenized at build time to validate the slider ranges work. Roughly half a day of corpus work versus zero for a "draw your own text" version (which would feel less concrete).

The third cost is the *attention-curve panel*. The lost-in-the-middle curve is conceptually distinct from the budget bar and could be its own page. Folding it into one visualizer means the page does two things — budget allocation *and* attention distribution. The interaction risk is that the reader doesn't connect them. The mitigation is a clear narrative: the budget bar shows "what fits"; the attention curve shows "what matters even when it fits." Two charts, one story.

### What the alternative would have cost (skipping the visualizer)

If reincodes never builds `/ai/token-budget`, the cost is *zero* in the codebase. The pattern lives in production at the LLM-application projects, where token counters are wired into every chain. The reincodes site stays pure-DSA, and token-budget education happens by reading this guide and pointing the reader at `01-tokenization.md`'s WASM-tokenizer visualizer (which covers the foundation but not the budgeting layer).

The cost of *not* building it shows up when the interview asks "how do you handle long conversations without blowing the context window?" Without a visualizer that lets the interviewer slide "history length" up and watch the bar fill, the candidate has to *describe* the four-slot allocation abstractly. The description works, but the live demo is the stronger interview move — particularly because the lost-in-the-middle effect is *visually intuitive* in a way prose can't match.

### The breakpoint

The visualizer earns its place the day the candidate is preparing for an AI-focused interview and the portfolio's three-shape story needs a fourth shape: *visualizer-driven teaching artifacts on reincodes*. Specifically, this page is the *most operational* of the four planned AI-engineering visualizers — it pairs naturally with the existing tokenization visualizer (foundation) and the planned RAG visualizer (which depends on token budgeting being understood). The breakpoint is shipping this *third* in the sequence, after tokenization (which it depends on for the WASM worker) and after the prompt-anatomy/structured-outputs pair (which establish the AI-engineering category in `conceptsData.tsx`).

### What wasn't actually a tradeoff

Doing the token counting on the server (so reincodes wouldn't need the WASM bundle) was not a real option. Server-side calls would break the static-export contract, and the cost (an entire backend) far exceeds the bundle cost of WASM (1-3MB, loaded only on `/ai/*` routes). The WASM approach is the only one compatible with the deploy story; it's not a downgrade, it's the only path.

---

## Tech reference (industry pairing)

### tiktoken (and Anthropic's tokenizer)

- **Codebase uses:** not yet — the planned `/ai/token-budget` visualizer would use `tiktoken` (OpenAI's tokenizer) or `@anthropic-ai/tokenizer` as a WASM dependency loaded into `src/workers/tokenizer.worker.ts`. The worker runs the encode in a separate thread so slider interactions stay responsive even on large inputs.
- **Why it's here:** the *only* accurate way to count tokens is to use the model's actual tokenizer. Approximations (characters / 4, words × 1.3) are wrong by 10-30% depending on content type, and the wrongness is non-uniform across languages — code, English, Japanese all differ. Wrong counts = wrong budget = silent failure.
- **Leading today:** `tiktoken` — `adoption-leading` for OpenAI tokenization (cl100k_base, o200k_base encodings), 2026. `@anthropic-ai/tokenizer` — `adoption-leading` for Claude.
- **Why they lead:** maintained by the providers, accurate per model, have WASM builds for browser use. The competition (third-party approximators) is fast but wrong; for budgeting, "fast" without accuracy is worse than no counter at all.
- **Runner-up:** HuggingFace `tokenizers` (Rust + bindings) — `innovation-leading` cross-model tokenization library; relevant when the chain needs to handle multiple providers and one library covers all the tokenizers.

### Provider prompt-caching APIs (Anthropic, OpenAI)

- **Codebase uses:** not yet — would be referenced in the visualizer's "what the static prefix costs vs the dynamic suffix costs" panel, showing the read of caching as a budgeting consequence rather than a budgeting tool.
- **Why it's here:** prompt caching changes the cost arithmetic of the system-prompt slot. Without caching, a 5k system prompt costs 5k tokens × `input_price` on every call. With caching, the same 5k costs ~500 tokens-equivalent (~10% of full price) after the first call. This *frees up budget* for retrieved context and history without raising the total cost.
- **Leading today:** Anthropic prompt caching — `adoption-leading` for API-level prefix cache, 2026. OpenAI prompt caching — `adoption-leading` with automatic caching of prompts ≥ 1024 tokens.
- **Why they lead:** both providers expose explicit cache control (Anthropic's `cache_control` markers) or automatic caching (OpenAI's transparent layer). The price drops (~90% for cached tokens) are large enough that ignoring caching is a real money loss at scale.
- **Runner-up:** Google Gemini's context caching — `adoption-leading` for the Gemini ecosystem with explicit cache TTL.

### LangChain / LlamaIndex (for chain-level budgeting helpers)

- **Codebase uses:** not yet — neither library would land in reincodes (overkill for a visualizer). Cited because they're where production chains end up wiring token-budget logic.
- **Why it's here:** LangChain's `ConversationBufferWindowMemory` (sliding window) and `ConversationSummaryMemory` (summarization-based) are the canonical implementations of two of the three compression strategies. LlamaIndex's retrieval components implement the third (retrieval-as-compression). Naming them lets the reader know the strategies are first-class in the ecosystem, not homegrown ideas.
- **Leading today:** LangChain — `adoption-leading` for chain orchestration in Python/JS, 2026. LlamaIndex — `adoption-leading` for retrieval-heavy applications.
- **Why they lead:** both ship the compression patterns as off-the-shelf modules. Most production chains don't need to invent these.
- **Runner-up:** homegrown implementations of sliding window + summarization — innovation-leading when the chain has unusual requirements (multi-modal history, custom relevance criteria) that don't fit the framework abstractions.

### Hamel Husain (writing on evals — referenced in [05-eval-driven-iteration](05-eval-driven-iteration.md))

- **Codebase uses:** N/A — this is a literature reference, not a dependency. Cited here because Hamel's writing on evals frames `chain_input_tokens` as a first-class eval metric, not just a budget number.
- **Why it's here:** the discipline of treating token-count as something the eval suite *watches over time* (alarms on regressions in average input size) is part of the bridge between token budgeting (this concept) and eval-driven iteration ([05-eval-driven-iteration](05-eval-driven-iteration.md)). Hamel's hamel.dev posts on production ML evals are the canonical writing.
- **Leading today:** hamel.dev — leading voice on practical eval discipline, 2026.
- **Why it leads:** Hamel writes from production experience at scale, not from blog-post abstractions. The specific framing of "regression in `chain_input_tokens` is itself a chain regression" is hard to find anywhere else.
- **Runner-up:** Eugene Yan's writing on evals (eugeneyan.com) — `innovation-leading` for ML-eval-from-first-principles framing.

---

## Project exercises

### [B-reincodes-token-budget-viz] Build the token-budget visualizer

- **Exercise ID:** `[B-reincodes-token-budget-viz]` — curriculum reference: `[C1.2]` (Context windows and the lost-in-the-middle problem) + `[C1.6]` (Token economics). Aligns with the reincodes interview-prep surface in `.aipe/study-ai-engineering/ai-features-in-this-codebase.md` and depends on the planned `[B-reincodes-tokenization]` exercise's WASM-tokenizer worker.
- **What to build:** a page at `/ai/token-budget` with two coordinated panels. Panel 1 is a *horizontal-bar context window visualizer* — a bar representing the model's full window (200k tokens for the default model), color-segmented into the four slots (system / retrieved / history / response budget), with sliders for "history turns" (0–80) and "retrieved chunk count" (0–20). As the reader drags a slider, the corresponding segment grows in real time using the in-browser tokenizer worker to count actual tokens from the precomputed corpus. A 80% line is marked on the bar; when total utilization crosses it, the bar's background flashes amber and a "compression triggered" indicator appears. Panel 2 is an *attention-curve visualizer* — a line chart showing the lost-in-the-middle U-shape across prompt positions, with markers showing where the slider settings would place the highest-signal content. When the reader sets "history turns: 30, retrieved chunks: 15", the panel highlights that the most-relevant retrieved chunk (position 8 of 15) falls in the attention dip and warns "rerank to put this at the edges."
- **Why it earns its place:** the visualizer makes the two coupled phenomena (budget consumption + attention distribution) *visible together* in a way no separate explanation does. The reader slides the history up and watches both the bar fill *and* the attention curve flatten over middle content — the two failure modes that compound at high utilization. The interview signal is that the candidate understands token budgeting beyond "count and don't overflow" — they understand that *quality* of attention matters as much as *room* in the window.
- **Files to touch:** `src/app/ai/token-budget/page.tsx` (the page), `src/components/TokenBudgetVisualizer/` (window-bar component, slider controls, attention-curve chart), `src/workers/tokenizer.worker.ts` (reused from tokenization viz; loaded once across both pages), `public/ai/token-budget/example-corpus.json` (precomputed corpus for the four slots — at least 80 conversation turns and 20 retrieved chunks at varying sizes), `public/ai/token-budget/attention-curve.json` (precomputed attention values across positions, from the lost-in-the-middle paper's empirical curve). Add a row to `src/components/Home/conceptsData.tsx`'s `CONCEPT_CATEGORIES` under the `ai-engineering` category.
- **Done when:** the page loads at `/reincodes/ai/token-budget/` in production (GitHub Pages), both panels render, the sliders drive the bar in real time using the WASM tokenizer (< 100ms response to slider drag), the 80% line and amber-flash work, the attention-curve panel highlights the position of the most-relevant chunk and warns when it falls in the middle. `next build` passes under `output: "export"`. WASM worker loads within 500ms on first visit; subsequent route visits hit the cached bundle.
- **Estimated effort:** 2-3 days. Window-bar component + slider state + tokenizer-worker integration: 1 day. Attention-curve chart + position-to-attention mapping logic: half day. Precomputed corpus authoring + attention-curve JSON: half day. Polish (amber flash, "compression triggered" indicator, the warning when relevant content falls mid-prompt): half day.

---

## Summary

### Part 1 — concept recap

Token budgeting is the discipline of treating the context window as a four-slot budget (system / retrieved / history / response) where every call is measured against the limit, the 80% line is the alarm, and compression strategies (sliding window, summarization, retrieval) keep chains running as inputs grow. The lost-in-the-middle effect adds a quality dimension on top of the quantity one — even when content fits, position matters, and the model attends less to the middle of long prompts. Prefix caching changes the cost arithmetic by making static prefixes ~10x cheaper after the first call, which rewards prompt structures with stable upper bands. In reincodes the concept is Case B; the buildable target is a `/ai/token-budget` page with two coordinated panels (horizontal-bar window + attention-curve chart) driven by a real in-browser WASM tokenizer, demonstrating both how the budget fills and why position-within-budget also matters. The static-export constraint forces precomputed corpora plus client-side tokenization, which works because tokenization is a pure function — no API call needed.

### Part 2 — key points to remember

- **The four slots**: system prompt, retrieved context, conversation history, response budget. All four claim from the same window; their sum cannot exceed it.
- **The 80% rule**: utilization above 80% is the danger zone, not the 100% line. Lost-in-the-middle starts kicking in well before truncation.
- **The three compression strategies**: sliding window (cheap, lossy), summarization (extra LLM call, lower fidelity), retrieval (best signal, most architecture cost). Most long-running chains end up with at least one.
- **The lost-in-the-middle effect**: attention is U-shaped across prompt position. Put highest-signal content at the start and end of context blocks, not the middle.
- **Prefix caching**: keep the static prefix actually static. Dynamic interpolation in the system prompt invalidates the cache and forfeits ~90% cost savings.
- **The metric**: `chain_input_tokens` and `chain_output_tokens` are first-class logged metrics. Regressions in average token count are themselves chain regressions.
- **The reincodes shape**: implementation is Case B; the buildable target is a precomputed visualizer under `/ai/token-budget` with a real WASM tokenizer driving the bar in real time, plus an attention-curve panel showing why position matters.

---

## Interview defense

### What an interviewer is really asking

Behind "how do you handle long contexts?" the interviewer is checking whether the candidate has actually counted tokens in production or has only read about it. The junior answer is "the model has a big context window, so it fits." The mid answer is "I use sliding-window history and cap the input." The senior answer names the four-slot allocation, the 80% rule, the lost-in-the-middle effect, the choice between sliding window vs summarization vs retrieval, and the prefix-caching consequence — and ties them to a specific production scenario where token-counting was load-bearing for the diagnosis. The interviewer is probing for whether the candidate distinguishes "counting tokens" (anyone) from "*allocating* a token budget across competing claimants" (someone who's shipped a chain through scale).

### Likely questions

**Q (mid):** What library do you use to count tokens?

A: Depends on the model. For OpenAI, `tiktoken` with the right encoding (`o200k_base` for GPT-4o, `cl100k_base` for older models). For Claude, `@anthropic-ai/tokenizer`. The non-obvious thing is that you have to use the *model's actual* tokenizer — approximations like "characters divided by 4" are off by 10-30% depending on content type, and the error isn't uniform (code, English, Japanese all tokenize at different rates). The wrong count looks plausible right up until your budget logic miscalculates by 30% and a chain blows past the window. So the answer is: real tokenizer, wired into a worker thread so the count is fast, called at every chain boundary that needs to enforce a budget.

```
the rule: model-native tokenizer or no tokenizer

  ┌──────────────────┬─────────────────────────────────┐
  │ Model            │ Tokenizer                       │
  ├──────────────────┼─────────────────────────────────┤
  │ GPT-4o / o1      │ tiktoken (o200k_base)           │
  │ GPT-3.5 / older  │ tiktoken (cl100k_base)          │
  │ Claude 3+        │ @anthropic-ai/tokenizer         │
  │ Llama            │ HF tokenizers (llama vocab)     │
  │ Gemini           │ Google's tokenizer (countTokens)│
  └──────────────────┴─────────────────────────────────┘

  approximations (chars/4, words×1.3) are wrong enough
  to break budgeting. don't ship them.
```

**Q (senior):** Tell me about a context-window bug you debugged.

A: 2024, RAG chain over a 50k-doc knowledge base. The chain worked perfectly in dev (queries returned good answers) and slowly degraded in prod over two weeks. The clue was the *avg input tokens* metric was creeping up (from 4k to 28k) because the retriever was returning more chunks as the corpus grew — `top_k: 20` was fixed, but the chunk sizes were getting larger because the corpus update added longer documents. We were well under the model's 200k window, so no truncation. But the answers were getting worse — quietly hallucinating, citing the wrong chunks. The diagnosis was lost-in-the-middle: at 28k input tokens with 20 chunks, the most-relevant chunk was in position 8-12, the attention dip. The fix was *fewer chunks, better-ranked* — drop to `top_k: 5` and add a reranker step. Token cost went down, answer quality went up. The win was measuring `avg input tokens` per call from day one; without that, the regression would have been invisible.

```
the regression — invisible without instrumentation

  week 0:  avg input 4k,  avg chunks 20, answer quality 92% on eval
  week 1:  avg input 8k,  avg chunks 20, answer quality 89%
  week 2:  avg input 18k, avg chunks 20, answer quality 81%
  week 3:  avg input 28k, avg chunks 20, answer quality 68% ⚠
           ↓
           diagnosis: chunk sizes grew with corpus updates
           ↓
           fix: drop top_k to 5, add reranker
           ↓
  week 4:  avg input 5k,  avg chunks 5,  answer quality 94%
```

**Q (arch):** At 10x scale — a chat product with 100k MAU, each user with potentially thousands of turns of history — what does the token-budget architecture look like?

A: At that scale, history isn't kept as a flat array — it's a *tiered storage* with progressive compression. Most recent N turns kept verbatim (sliding window, ~10 turns). Mid-tier turns get summarized into rolling digests (one LLM-generated summary per chunk of 20 turns). Distant turns get embedded and stored as retrievable memories (vector DB; retrieved only when relevant to current turn). The budget per call becomes: system prompt + recent turns (verbatim) + relevant retrieved memories + current user message + reserved response. The whole conversation history *exists*, but the chain only loads the budget-fitting projection per call. Prefix caching aggressively applies to the system prompt and (when stable) the summarized digest. The compression pipeline runs in the background per user, not on every call. The architecture cost is real (embedding store, summarizer cron, tiered cache) but the alternative — flat history that grows unbounded — doesn't scale past a few hundred turns.

```
tiered history at 10x scale

  ┌─────────────────────────────────────────────────────────┐
  │ recent N turns (verbatim)         ~3-5k tokens          │
  ├─────────────────────────────────────────────────────────┤
  │ summarized digest (compressed)    ~1-2k tokens          │
  │   ↑ background summarizer cron                          │
  ├─────────────────────────────────────────────────────────┤
  │ retrieved memories (relevant)     ~2-4k tokens          │
  │   ↑ vector DB; retrieve by current-turn embedding       │
  └─────────────────────────────────────────────────────────┘

  per-call budget: ~10k input even on user with 5000-turn history
  prefix cache: hits on system + (often) digest
```

### The question candidates always dodge

**Q:** Why bother with all this budgeting machinery when context windows are 200k or 1M now? Just send everything.

A: Because the failure mode shifted from "doesn't fit" to "fits but degrades silently," which is the worse failure mode. At 200k or 1M tokens, you *can* dump everything in, the request succeeds, and the model produces an answer. The answer is just *worse* — lost-in-the-middle is real, attention dilution is real, and the model trained on shorter contexts doesn't get *better* at long contexts proportionally. The 1M-window models have been benchmarked extensively (needle-in-a-haystack tests, multi-document reasoning) and the result is consistent: putting 800k tokens in does not give you 800k tokens of effective attention. You also pay full cost for the full input — at $3/1M input tokens, a daily user with five "send everything" calls costs ~$15/year *for that one user*; at 100k MAU that's $1.5M/year for input alone. The cost ledger:

```
"just send everything"           explicit budgeting
─────────────────────            ──────────────────
+ feels simpler                  + harder up front
+ no compression code            + needs token counter
                                 + needs compression strategy
- silently worse answers         + answer quality preserved
  (lost-in-the-middle)             at scale
- 5-50x cost per call            + cost scales linearly with
  (paying for unused             intent, not input length
   attention)
- no metric to alarm on          + chain_input_tokens is
  when answers get worse           an eval metric
- prefix cache useless           + prefix cache is the
  (whole input changes              static-prefix design
   every call)                      payoff
```

The honest answer: "just send everything" feels modern and is the most-expensive lowest-quality option in the design space. The interview move is naming that the bigger window is *more rope*, not a free upgrade.

### One-line anchors

- "The window is a budget across four claimants: system, retrieved, history, response. All four cap to one number."
- "80% utilization is the alarm. Crossing it means compress, not upgrade to a bigger model."
- "Lost-in-the-middle is real. Put highest-signal content at the start and end, not in position 8 of 15."
- "Prefix caching rewards stable prefixes. One dynamic timestamp in the system prompt forfeits ~90% of the savings."
- "Counting tokens with the model's actual tokenizer is basic hygiene. Approximations are off by enough to break budgets."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw the token-budgeting loop from memory: compose → measure → compare → compress → call. Label the 80% threshold and where compression triggers. Then draw the lost-in-the-middle U-curve and mark where you'd place highest-signal content.

- Pass: 5 steps in order, 80% alarm correctly placed before compression step, U-curve drawn with edges-high middle-low, signal placement at edges noted
- Fail: re-read the primary diagrams, wait 10 minutes, try again.

### Level 2 — Explain it out loud

Explain token budgeting to a colleague who has shipped one LLM feature without ever counting tokens. No notes. Under 90 seconds.

Checkpoints — did you:
- Name the four slots (system / retrieved / history / response budget)?
- Name the 80% rule and what it triggers?
- Distinguish the three compression strategies and when each applies?
- Mention lost-in-the-middle as a quality (not quantity) failure mode?
- Reference prefix caching as the cost-saving consequence of stable upper-band design?
- Reference the buildable target (`/ai/token-budget` visualizer) as how you'd demonstrate the concept in reincodes?

If you skipped any: you described one piece of the puzzle, not the system.

### Level 3 — Apply it to a new scenario

A new chain lands in the planned reincodes AI surface: a "compare two DSA algorithms across history" chain that takes two algorithm names, a comparison criterion (time complexity, space complexity, ease of implementation), and a target audience level, plus 5-10 retrieved chunks from algorithm-textbook excerpts. It returns a paragraph-length comparison. Design the token-budget allocation for this chain on Claude Sonnet 4.7 (200k window). What goes in each slot? What's the response budget? At what utilization does compression trigger, and which compression strategy fits this chain best (sliding window doesn't apply — no history)?

Write your answer (3-5 sentences minimum). Then open `.aipe/study-ai-engineering/ai-features-in-this-codebase.md` and check whether your proposed allocation respects the static-export constraint (the budget calculation should happen at build time during precompute, since there's no runtime LLM call).

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff from the Tradeoffs section. Answer in writing: "If I were starting the `/ai/token-budget` visualizer today, would I ship the WASM tokenizer (1-3MB) or pre-tokenize the corpus at build time and ship only the integer counts (smaller bundle, less interactive)? Why? What does each choice cost?"

Reference the actual code:
→ Point to `next.config.ts` L1–L17 for the static-export contract
→ Point to what would need to change if the visualizer used pre-tokenized counts (the slider would still work, but "paste your own text" wouldn't — the interaction would feel less real)

There is no right answer. The point is specificity.

### Quick check — code reference test

Without opening any files, answer:
- What file in reincodes controls the static-export contract that forces in-browser tokenization?
- What's the four-slot allocation that every LLM call divides the window across?
- What threshold is the alarm for "compress now" — and what's the threshold for "reject the call"?
- Why does prefix caching reward keeping the system prompt actually static?

Then open the files and verify.

- Pass: `next.config.ts`, `system + retrieved + history + response`, 80% / 95%, dynamic interpolation in the prefix invalidates the cache and forfeits ~90% cost savings
- Fail on details: that's fine — the shape is what matters. The four slots and the 80% rule should be recoverable.

---
Updated: 2026-05-25 — cross-references refreshed for the new study-ai-engineering/ layout; companion-guides framing updated for v1.38.0 per-repo spec.
