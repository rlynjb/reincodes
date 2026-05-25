# Tokenization (BPE, subword)

**Industry name(s):** Tokenization, BPE (Byte-Pair Encoding), subword tokenization, WordPiece, SentencePiece
**Type:** Industry standard

> The boundary where strings become integers — the unit the model actually operates on. The tokenizer is opinionated, provider-specific, and the source of every "why is my prompt twice as expensive in Japanese" surprise.

**See also:** → [01-what-is-an-llm](01-what-is-an-llm.md) · → [06-token-economics](06-token-economics.md) · → [../02-context-and-prompts/](../02-context-and-prompts/) · → [../../study-prompt-engineering/04-token-budgeting.md](../../study-prompt-engineering/04-token-budgeting.md)

---

## Why care

### Why care anchored to a frontend primitive

You have a `<textarea>` in a React form. The user types "Hello, world!" — 13 characters, one DOM node, your `onChange` handler captures the string. From your perspective, that string is the input. From the LLM's perspective, that string doesn't exist; what exists is a sequence of integer IDs the tokenizer produced: `[9906, 11, 1917, 0]` under cl100k_base, four tokens, one for each meaningful chunk. The model's vocabulary, attention math, context window, and per-token billing all operate on those four integers, not on the 13 characters. The textarea you built shows characters; the cost ledger that hits your credit card shows tokens. The two units are different, the conversion ratio is non-uniform across languages and content types, and the boundary between them is where the tokenizer lives.

### Move 2 — Name the question

That boundary has a name — *tokenization*. Specifically, BPE (Byte-Pair Encoding) for OpenAI / Anthropic / Llama, or SentencePiece / WordPiece for various Google models. Tokenization is the deterministic mapping from a byte stream to a sequence of integer IDs drawn from a fixed vocabulary (typically 50k–200k entries). The choice of tokenizer is per-provider, per-model-family, and load-bearing: a tokenizer with poor coverage of Japanese will charge 2–4× as many tokens to encode the same Japanese text as one trained with Japanese in the training mix. The question is operational: what does the tokenizer give you, what does it cost you, and when do you need to care.

### Move 3 — Why answering that question matters

**Why you need to answer that question at all:** because tokenization sits underneath every other LLM cost and behaviour. The context window is sized in tokens. The price per call is computed in tokens. The model's attention math operates on tokens. "Lost in the middle" is measured in token positions. The prompt template you wrote in English will silently consume 4× as many tokens when a Spanish-speaking user pastes their content in Spanish. I have shipped a feature that worked beautifully in English-language QA and broke production cost projections by 3× the moment European users started using it, because nobody on the team had thought about the tokenization tax. The fix took half a day; the diagnostic took two days because the "cost regression" looked like a billing anomaly until we computed the per-language token ratios and the picture became obvious.

### Move 4 — Concrete before/after

Without thinking about tokenization:

- Prompt sized in characters ("system prompt is ~500 chars, no problem")
- Cost projections computed against English content only
- "Why is the Japanese version 3× slower" stays mysterious for weeks
- Truncating a string at character 4000 silently breaks a UTF-8 multi-byte character mid-encoding
- Code-heavy prompts blow through the context window because tabs, brackets, and rare identifiers tokenize poorly

With tokenization in the mental model:

- Prompt sized in tokens against the actual tokenizer (`tiktoken.encode(prompt).length`)
- Cost projections include a per-language multiplier (English: 1×, Spanish: ~1.3×, Japanese: ~3×, Chinese: ~2.5×)
- Truncation operates on token boundaries (`tokens.slice(0, max_tokens)` not `string.slice(0, max_chars)`)
- Code-heavy prompts get token-counted before submission; tokenizer-aware compression (collapse repeated whitespace, drop comments) becomes a real lever

### Move 5 — The one-line summary

Tokenization is the deterministic mapping from a byte stream to a sequence of integer IDs the LLM operates on, governed by a provider-specific BPE-trained vocabulary — analogous to how a fetch payload is encoded into bytes by the JSON serialiser before going on the wire, except the encoding is opinionated, costs money, and varies in cost per language. The full mechanics are below.

---

## How it works

### Move 1 — The mental model

A tokenizer is a function `string -> int[]` paired with its inverse `int[] -> string`. The encoding side learns a vocabulary during a training step (separate from training the model itself) by iteratively merging the most frequent adjacent byte pairs in the training corpus until the vocabulary reaches a target size. The inference-time tokenizer applies those merges greedily to convert input text into the shortest token sequence its vocabulary supports. The decoding side reverses the mapping — token IDs back to byte strings — and is exact (no information loss), provided you're decoding with the same tokenizer that encoded.

The strategy: think of the tokenizer as a JSON-encoder-like function that runs deterministically at the LLM boundary; once you have that framing, the choice of tokenizer becomes a vendor-locked dependency you measure rather than a mystery you accept.

```
The tokenizer as a deterministic encoder/decoder

         string                      int[]
       ┌──────────────┐           ┌──────────────┐
       │"Hello, world"│           │ [9906, 11,   │
       │              │           │  1917, 0]    │
       └──────┬───────┘           └──────▲───────┘
              │                          │
              │  encode (BPE)            │
              ▼                          │  decode
   ┌─────────────────────────────────────────────┐
   │  vocabulary table: 100k entries             │
   │  merge rules: applied greedily              │
   │  same tokenizer in, same tokens out         │
   └─────────────────────────────────────────────┘
```

### Move 2 — The layered walkthrough

#### The vocabulary

The technical thing: a fixed-size table mapping integer IDs to byte sequences. For OpenAI's cl100k_base (used by GPT-4, GPT-3.5-turbo, and earlier), the vocabulary is 100,256 entries. For OpenAI's o200k_base (used by GPT-4o and newer), it's 200,019. Anthropic's tokenizer is not publicly published in detail but is approximately the same scale. The vocabulary includes English words ("the" = one token), common subwords ("ing", "tion"), punctuation, whitespace patterns, and individual bytes for fallback. Concrete consequence: rare words and non-English text tokenize into multiple smaller pieces. The word "tokenizer" is one token in cl100k_base; the Japanese word "トークン" (also "token") is three tokens, because Japanese characters aren't in the training mix at the same frequency as English text.

```
Vocabulary entries — three representative slices

  ID      → bytes
  ─────────────────────
  220     → " "        (single space, very common)
  9906    → "Hello"    (whole common word)
  11      → ","        (single punctuation)
  100257  → "<|endoftext|>"  (special token, signals stop)
```

#### The BPE merge rules

The technical thing: BPE builds the vocabulary by iteratively finding the most frequent adjacent pair of tokens in the training corpus and merging them into a new token. Starting from the byte alphabet (256 entries), the algorithm performs N merges until the vocabulary reaches the target size. The bridge from frontend: this is the equivalent of how `parcel` or `webpack` build a chunk-merging strategy — start with the smallest possible units (bytes for BPE, individual modules for a bundler), iteratively merge the most frequent co-occurrences, end with a working vocabulary that minimises total sequence length on representative inputs. Concrete consequence: a tokenizer trained on a corpus that's 90% English will have learned merges for English subwords, which is why English text tokenizes efficiently and other languages don't. The merges are *learned*, not designed — there's no committee that decided "tion" should be one token; it's one token because "tion" appeared in enough merge iterations during BPE training.

```
BPE merge process — schematic

  initial vocab: 256 bytes
                    │
                    ▼
  iteration 1: most frequent pair is (" ", "the") → merge → " the" is one token
                    │
                    ▼
  iteration 2: most frequent pair is now ("ing", " ") → merge → "ing " is one token
                    │
                    ▼
  ... ~100k iterations later ...
                    │
                    ▼
  final vocab: 100,256 entries, optimised for the training corpus
```

#### The encoding pass

The technical thing: at inference time, the encoder applies the learned merges greedily to the input string. It starts with a byte-level representation and applies the highest-priority merge rule whose pair appears in the current sequence; repeats until no more merges apply. The bridge from a frontend primitive: this is structurally similar to how a SAX-style XML parser tokenizes a document — one pass over the input, applying recognition rules until the input is consumed. Concrete consequence: encoding is fast (typically faster than a `fetch()` round-trip) and deterministic. The same string produces the same token IDs every time with the same tokenizer. This is the property that makes prompt caching work — provider servers hash the token prefix, and the hash is stable because the encoding is stable.

#### The provider-specific tokenizer lock-in

The technical thing: every provider ships its own tokenizer, and the tokenizer is part of the model. You can't run OpenAI's tokenizer on a prompt and feed the IDs to Claude — Claude's vocabulary is different, the same ID means a different byte sequence, and the model would receive garbage. The bridge from a DB table: this is like a foreign-key constraint between an ID column and a lookup table; the ID is meaningful only relative to the table that defined it. Concrete consequence: every cross-provider migration involves re-tokenizing prompts to count tokens accurately, and every token-counting library you ship has to know which model the count is for. `tiktoken` only counts OpenAI tokens; Anthropic provides a `count_tokens` API endpoint for accurate Claude counts; counting Claude tokens with cl100k_base gives a rough estimate that's typically within 10% for English and very wrong for code and non-English text.

### Move 3 — The principle

The principle that generalises beyond any one tokenizer: *the unit of measurement is the unit you have to optimise.* The LLM bills per token; the LLM's context window is sized in tokens; the LLM's attention math runs over tokens. The string-level view that feels natural in application code is a layer above the unit the model operates on, and at scale that layer hides the cost dynamics. Every team that ships LLM features at non-trivial scale ends up with a token-counting utility in their codebase, because the only way to budget, cache, and route is to measure in the unit the provider bills. The history of LLM tooling between 2023 and 2026 is the long story of teams discovering they need to think in tokens, not strings.

The full picture is below.

---

## Tokenization — diagram

```
┌─ Training-time (one-time per tokenizer) ─────────────────────────────┐
│                                                                       │
│   training corpus (terabytes of text, mostly English)                │
│                          │                                            │
│                          ▼                                            │
│   ┌────────────────────────────────────────────────┐                 │
│   │ BPE training algorithm                         │                 │
│   │   start with 256 bytes                         │                 │
│   │   iteratively merge most-frequent adjacent     │                 │
│   │   pair → new vocab entry                       │                 │
│   │   stop when vocab reaches target size          │                 │
│   └────────────────────────────────────────────────┘                 │
│                          │                                            │
│                          ▼                                            │
│   trained tokenizer: {vocab table, merge rules}                      │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
                              │
                              ▼   shipped with the model
┌─ Inference-time (every call) ────────────────────────────────────────┐
│                                                                       │
│   user input: "Hello, world!"                                        │
│                          │                                            │
│                          ▼                                            │
│   ┌────────────────────────────────────────────────┐                 │
│   │ encode (greedy merge application)              │                 │
│   │   "Hello"    → 9906                            │                 │
│   │   ","        → 11                              │                 │
│   │   " world"   → 1917                            │                 │
│   │   "!"        → 0                               │                 │
│   └────────────────────────────────────────────────┘                 │
│                          │                                            │
│                          ▼                                            │
│   token sequence: [9906, 11, 1917, 0]                                │
│                          │                                            │
│                          ▼                                            │
│   model forward pass uses these IDs to look up                       │
│   embedding vectors → attention math → next-token                    │
│   distribution                                                        │
│                          │                                            │
│                          ▼                                            │
│   model emits token IDs → decode reverses the mapping → string out   │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

The boundary between the upper band (training-time tokenizer construction, done once per model family) and the lower band (inference-time encode/decode, done every call) is what makes tokenization deterministic and provider-locked: the vocabulary is frozen when the model ships, and every prompt you send goes through that exact vocabulary's merge rules.

---

## In this codebase

**Not yet implemented.** reincodes is a Next.js static-export DSA visualizer with no AI surface in production code — there is no tokenizer integration, no token-counting utility, no LLM prompt that would need counting. The existing study guide (`.aipe/study-ai-engineering/`) positions reincodes as the *interview-prep visualizer host* per the curriculum: a place to *teach* AI concepts through visualizers, not a place where AI runs for users. The buildable target for this concept is below in Project exercises — a `/ai/tokenization` page that ships a WASM-compiled tokenizer in the browser bundle, lets the reader paste text and see it broken into colored token chips with their IDs, and toggles between OpenAI's cl100k_base and a proxy for Anthropic's tokenizer to show the cross-provider variance.

**Expected file paths** (when built):
- `src/app/ai/tokenization/page.tsx` — the visualizer page
- `src/components/TokenizerVisualizer/` — token chip rendering, language-comparison side panel, tokenizer toggle
- `public/ai/tokenization/tiktoken_bg.wasm` — the WASM-compiled tokenizer (loaded lazy under the `/ai/` route to avoid hitting the home-page bundle)
- `public/ai/tokenization/example-texts.json` — preset texts (English greeting, Spanish paragraph, Japanese sentence, code snippet, emoji burst) with per-language token counts precomputed for the cross-tokenizer comparison

---

## Elaborate

### Where this pattern comes from

BPE arrived in NLP from data compression. Sennrich, Haddow, and Birch's 2015 paper "Neural Machine Translation of Rare Words with Subword Units" was the first widely-cited application of BPE to language modelling, originally to handle the rare-word problem in machine translation. OpenAI's GPT-2 (2019) popularised byte-level BPE — the variant where the initial alphabet is the 256 bytes rather than Unicode characters — which made the tokenizer language-agnostic in principle (any byte sequence can be encoded) but still language-biased in practice (the merges were learned on a corpus that was 90%+ English). GPT-3 (2020) shipped with the same family of tokenizer, refined; GPT-4 (2023) introduced cl100k_base, GPT-4o (2024) introduced o200k_base with broader multilingual coverage. SentencePiece (Kudo & Richardson, 2018) is the variant Google uses for T5, mT5, and Gemini — slightly different merge strategy but functionally similar from the application engineer's perspective.

### The deeper principle

The deeper principle is that *every learned encoding reflects the distribution it was trained on*. BPE doesn't have universal knowledge of language; it has empirical knowledge of which byte sequences co-occurred in its training corpus. If the corpus was 90% English, the encoding is efficient for English and inefficient for everything else. This is the same dynamic as any other learned compression — Huffman coding is optimal only for the symbol frequencies it was trained on; tokenizers are optimal only for the languages and content types they were trained on. The "tokenization tax" on non-English languages is a *fairness* artifact of a *technical* choice, and as the industry has matured (2023 → 2026) newer tokenizers (o200k_base, Anthropic's tokenizer post-2024) have explicitly addressed it with broader multilingual training mixes. Cost dynamics for non-English users have measurably improved as the tokenizers have improved, which is worth tracking if you serve a global user base.

### Where this breaks down

The deterministic-encoder framing breaks down at three edges. First, code: tokenizers trained on natural language tokenize code awkwardly because operators, brackets, and rare identifiers don't appear in the merge-frequency distribution that English prose produces — a 1000-character Python file can take 400 tokens to encode where 1000 characters of prose takes 200. Second, structured outputs and tool calls: when a provider's `response_format` or `tool_use` machinery encodes schema constraints into the generation process, the relationship between "characters in the final string" and "tokens consumed" becomes harder to predict because special tokens and schema-induced tokens are not visible to the caller. Third, model-internal tokens for reasoning models: o-series models and Claude's extended-thinking mode generate internal reasoning tokens that count against the output budget but are partly hidden from the caller; the token-count contract gets fuzzier and the cost model has to widen.

### What to explore next

- [01-what-is-an-llm](01-what-is-an-llm.md) → tokenization is the boundary; the function inside operates on tokens
- [06-token-economics](06-token-economics.md) → tokens are the cost unit; this concept supplies the unit, that one supplies the price
- [../02-context-and-prompts/01-context-window.md](../02-context-and-prompts/01-context-window.md) → the context window is measured in tokens, not characters
- [../../study-prompt-engineering/04-token-budgeting.md](../../study-prompt-engineering/04-token-budgeting.md) → the prompt-engineering angle on token-aware allocation

---

## Tradeoffs

### Comparison table — both costs in one frame

```
┌──────────────────┬──────────────────────┬─────────────────────────┐
│ Cost dimension   │ Path taken           │ Alternative             │
│                  │ (WASM tokenizer in   │ (no tokenizer; show     │
│                  │  the browser)        │  precomputed only)      │
├──────────────────┼──────────────────────┼─────────────────────────┤
│ Bundle size      │ +1.2 MB WASM module  │ ~30 KB precomputed JSON │
│                  │  (lazy-loaded under  │  with fixed examples    │
│                  │  /ai/ route)         │                         │
│ Interactivity    │ Reader can paste     │ Reader limited to       │
│                  │ arbitrary text       │ preset examples         │
│ Teaching value   │ Surprise comes from  │ Surprise is static —    │
│                  │ reader's own input   │ same comparison every   │
│                  │ ("paste my CV!")     │ time                    │
│ Build complexity │ WASM loading, async  │ Pure JSON, simple fetch │
│                  │ init, error handling │                         │
│ Mobile perf      │ WASM init cost ~200ms│ Instant                 │
│                  │ on mid-range Android │                         │
│ Provider coverage│ OpenAI tokenizers    │ Whatever the precompute │
│                  │ exact; Anthropic     │ script captured at      │
│                  │ approximate (no      │ build time              │
│                  │ public tokenizer)    │                         │
│ Cache behaviour  │ WASM cached by SW    │ JSON cached as          │
│                  │ across visits        │ static asset            │
└──────────────────┴──────────────────────┴─────────────────────────┘
```

### What we gave up (when planning the reincodes visualizer)

The first cost is *bundle weight*. `tiktoken-wasm` is roughly 1.2 MB compressed, larger than the entire current reincodes home-page bundle. Code-splitting under `/ai/tokenization/` contains the cost to that route, and the WASM is service-worker-cacheable so the cost is paid once per visitor, but the route's first-load is heavier than any existing DSA visualizer. The DSA visualizers ship pure-JS algorithm code, KB-scale; this visualizer ships an MB-scale runtime. The tradeoff is worth it because the *interactivity* is the teaching value — a static "look at these precomputed token chips" is teaching by description; a "paste your own text and watch it tokenize" is teaching by participation.

The second cost is *provider asymmetry*. OpenAI publishes its tokenizers (`tiktoken` is open-source and exact); Anthropic does not publish theirs in a usable form. The visualizer can show OpenAI tokenization exactly, and can approximate Anthropic tokenization either by (a) using cl100k_base as a stand-in with a label that warns the count is approximate, or (b) calling Anthropic's `count_tokens` endpoint at build time for a fixed set of preset texts and shipping the counts as precomputed JSON. The honest approach is both: live OpenAI tokenization for arbitrary input, plus precomputed Anthropic counts for the preset examples, with the asymmetry called out in the UI.

The third cost is *teaching-surface narrowness*. The visualizer demonstrates exactly one thing — strings become token sequences, the ratio varies by language and content type. It does not demonstrate the model's internal use of the tokens, the embedding lookup, or the attention math. A reader who finishes the page knows what tokenization is but doesn't know what happens *after* tokenization. That's a deliberate scope choice — the `/ai/what-is-an-llm` visualizer handles the next step in the pipeline — but readers who don't visit both pages will leave with an incomplete picture.

### What the alternative would have cost (skipping the visualizer)

If reincodes never builds the `/ai/tokenization` visualizer, the cost is *zero* in the codebase. The concept still gets taught in this written study guide; Karpathy's "Let's build the GPT tokenizer" video covers the territory in depth and is on the curriculum's side track; the loopd project's token-counting utilities (when built) exercise tokenization in production code. The reincodes site stays pure-DSA and the AI-engineering education happens elsewhere.

The cost of *not* building it shows up in the interview-prep surface. The curriculum's "Interview prep — reincodes" section names the tokenization visualizer as a Phase 1 build item (`exercises C1.1`). Without it, the candidate's portfolio has no concrete tokenization demonstration; the talking point becomes "I read Karpathy's video" rather than "I shipped a visualizer that lets a reader paste their own text and see the per-language token cost." The latter is a stronger portfolio signal for a teaching-heavy interview round.

### The breakpoint

The visualizer earns its place the day the candidate ships their first multilingual or code-heavy LLM feature and the team needs a shared mental model of why "Japanese costs 3× more than English on the same content." Until that real product pressure exists, the visualizer is a polish item. The breakpoint is event-shaped: a cost regression in production, or an interview round that includes a "show me how you'd teach this" segment, makes the visualizer worth shipping.

### What wasn't actually a tradeoff

Live tokenization via API was not a real option. The static-export contract forbids API keys at request time. Even if a backend existed, sending user-pasted text to an external service for tokenization is the wrong privacy posture — the visualizer should keep the reader's input client-side. The WASM-in-browser path is the only architecture compatible with both the deploy story and the privacy posture, which means the bundle cost isn't a tradeoff against some lighter live-API alternative — it's the cost of the only viable architecture.

---

## Tech reference (industry pairing)

### tiktoken (OpenAI's BPE tokenizer)

- **Codebase uses:** not yet — the planned `/ai/tokenization` visualizer would lazy-load `tiktoken-wasm` under the `/ai/` route prefix and run the encoder client-side against user input.
- **Why it's here:** tiktoken is the only tokenizer that exactly matches OpenAI's server-side encoder. The WASM build (`@dqbd/tiktoken` or `js-tiktoken`) runs in browsers without a backend, which is the only architecture compatible with reincodes' static-export contract.
- **Leading today:** tiktoken — `adoption-leading` for OpenAI tokenizer access in JS/Python, 2026.
- **Why it leads:** open-source, exact match to server-side encoder, supports all OpenAI vocabularies (cl100k_base, o200k_base, p50k_base, r50k_base), WASM and pure-JS builds available. The ecosystem standard since GPT-3.5 launched.
- **Runner-up:** `gpt-tokenizer` — `innovation-leading` pure-JS implementation with no WASM dependency, smaller bundle footprint at the cost of slightly slower encoding speed.

### Anthropic `count_tokens` API

- **Codebase uses:** not yet — would be called at build time by `scripts/precompute-tokenization.ts` to capture accurate Claude token counts for the preset example texts, then shipped as `public/ai/tokenization/example-texts.json` for cross-tokenizer comparison.
- **Why it's here:** Anthropic does not publish its tokenizer for client-side use. The `count_tokens` endpoint is the only way to get exact Claude token counts. For a static-export visualizer, this means precomputing counts at build time rather than running the tokenizer in the browser.
- **Leading today:** Anthropic `count_tokens` API — `adoption-leading` for accurate Claude token counts, 2026.
- **Why it leads:** the only authoritative source. Free to call (no token cost). Stable contract since the Messages API stabilised in 2024.
- **Runner-up:** cl100k_base as approximation — `adoption-leading` for offline estimation, accuracy within ~10% for English prose, much worse for code and non-English text.

### SentencePiece (Google's tokenizer)

- **Codebase uses:** not yet — would be the tertiary tokenizer if the visualizer ships a three-way comparison (OpenAI cl100k_base, Anthropic precomputed, Gemini SentencePiece) to drive home the point that tokenization is provider-specific.
- **Why it's here:** SentencePiece is what Google's T5, mT5, and Gemini use; it represents a meaningfully different tokenization approach from BPE (it treats text as a raw byte stream with explicit space-handling, doesn't pre-split on whitespace). The visualizer's teaching value goes up when the reader can compare three approaches side-by-side.
- **Leading today:** SentencePiece — `adoption-leading` for Google models and the Hugging Face ecosystem, 2026.
- **Why it leads:** language-agnostic by design (no pre-tokenization step), supports both BPE and unigram-LM training algorithms, integrates with the Hugging Face `transformers` tokenizer interface.
- **Runner-up:** WordPiece — `adoption-leading` for BERT-family models, older approach, still used in production but losing ground to SentencePiece and BPE.

---

## Project exercises

### [B-reincodes-tokenization-viz] Build the tokenization visualizer

- **Exercise ID:** `[B-reincodes-tokenization-viz]` — derived from the curriculum's "Interview prep surface — reincodes" entry and Phase 1 concept `[C1.1]` (Tokenization).
- **What to build:** a page at `/ai/tokenization` that lets the reader paste arbitrary text (or pick from preset examples: English greeting, Spanish paragraph, Japanese sentence, Python code, emoji burst), and renders the text as colored token chips with their integer IDs. A header shows total character count vs total token count and the ratio. A side panel shows the same text through three tokenizers — OpenAI cl100k_base (exact, via WASM), Anthropic (approximate for arbitrary input, exact for presets via precomputed JSON), and Gemini SentencePiece (approximate via published vocabulary). The reader's takeaway in 30 seconds: tokenization is provider-specific, language-asymmetric, and visible.
- **Why it earns its place:** the visualizer makes the "tokenization tax" *observable* — paste an English paragraph, see 4 chars/token; paste the same content translated to Japanese, see 1.3 chars/token; understand viscerally why your cost projections need a per-language multiplier. The interview signal is that the candidate built a teaching artifact for the most under-explained LLM concept among new engineers.
- **Files to touch:** `src/app/ai/tokenization/page.tsx` (visualizer page), `src/components/TokenizerVisualizer/` (token chip rendering with stable color hash per ID, language-comparison panel, tokenizer toggle), `public/ai/tokenization/tiktoken_bg.wasm` (lazy-loaded WASM tokenizer), `public/ai/tokenization/example-texts.json` (preset texts + precomputed Anthropic/Gemini counts), `scripts/precompute-tokenization.ts` (build-time script that calls Anthropic's `count_tokens` for each preset). Add a row to `src/components/Home/conceptsData.tsx`'s category list under a new `ai-engineering` category.
- **Done when:** the page loads at `/reincodes/ai/tokenization/` in production (GitHub Pages), the WASM tokenizer initialises within 200ms on mid-range Android, paste-to-tokenize feels instant for inputs up to 10k characters, the language-comparison panel updates correctly for both arbitrary and preset inputs, `next build` passes under `output: "export"`. Build script runs against the actual Anthropic API locally and produces stable JSON.
- **Estimated effort:** 2 days. WASM loading + tokenizer integration: half day. Token chip rendering with stable colors: half day. Language-comparison panel + tokenizer toggle: half day. Precompute script + cross-browser polish + mobile layout: half day.

---

## Summary

### Part 1 — concept recap

Tokenization is the deterministic mapping from a byte stream to a sequence of integer IDs the LLM operates on, governed by a provider-specific BPE-trained vocabulary. The vocabulary is learned during a one-time training pass over a representative corpus; the inference-time encoder applies the learned merges greedily to produce the shortest token sequence the vocabulary supports. Tokenization is the unit of measurement for the LLM boundary — context windows, billing, and attention math all operate on tokens, not characters — and is provider-locked: the same string encodes to different token IDs across OpenAI, Anthropic, and Google, and the costs vary 2–4× per language because the merges were learned on English-heavy corpora. In this codebase the concept is *planned* rather than implemented: reincodes has no LLM surface, and the buildable target is a `/ai/tokenization` visualizer that loads a WASM tokenizer client-side and lets the reader paste text to see it broken into colored token chips with per-tokenizer comparison.

### Part 2 — key points to remember

- **The shape**: tokenizer is a deterministic encode/decode function, `string -> int[]` paired with `int[] -> string`. Same input + same tokenizer = same output, always.
- **The training**: BPE iteratively merges the most frequent adjacent pair in the training corpus until the vocab hits a target size. The merges are learned, not designed.
- **The lock-in**: tokenizers are provider-specific. cl100k_base for older OpenAI models, o200k_base for GPT-4o+, Anthropic's unpublished tokenizer for Claude, SentencePiece for Gemini. Cross-provider token counts require provider-native tools.
- **The asymmetry**: training corpora are mostly English, so English tokenizes efficiently (~4 chars/token) and other languages don't (Japanese ~1.5 chars/token, code ~2.5 chars/token).
- **The reincodes shape**: implementation is Case B; the buildable target is a WASM-tokenizer visualizer under `/ai/tokenization` with multi-language and multi-tokenizer comparison.

---

## Interview defense

### What an interviewer is really asking

Behind "what is a token?" the interviewer is checking whether the candidate has measured token counts in production or only used the word as marketing terminology. A junior answer says "a token is roughly a word, ~4 characters." A senior answer names the tokenizer ("OpenAI uses BPE; cl100k_base for GPT-4, o200k_base for GPT-4o"), names the asymmetry ("English ~4 chars/token, Japanese ~1.5 chars/token, code ~2.5 chars/token"), and names a specific bug they shipped because they didn't account for it (the multilingual cost regression). The interviewer is checking for the operational framing because token-level reasoning falls out of it — context-window allocation, prompt caching, cost projections per geography.

### Likely questions

**Q (mid):** Why don't models just operate on characters? Wouldn't that be simpler?

A: Character-level models exist, but they're impractical at scale for two reasons. First, sequence length: a 2000-character document is 2000 character tokens but only ~500 BPE tokens; the attention math is O(N²) in sequence length, so a 4× longer sequence is 16× the compute. Tokenization compresses the input by 3–5× for most languages, which makes scaling tractable. Second, vocabulary efficiency: with characters, the model has to learn that "ing" tends to follow verbs and "tion" tends to follow latin-derived roots from scratch; with subword tokens, those patterns are pre-encoded in the vocabulary, and the model gets to use its parameters for higher-level patterns. The subword level is a deliberate compromise between character-level (slow, low prior) and word-level (huge vocabulary, no OOV handling). BPE in particular handles OOV by falling back to bytes, so every possible input is encodable.

```
character-level                    BPE subword                    word-level
─────────────────                 ─────────────                  ────────────
"hello" → 5 tokens                "hello" → 1 token              "hello" → 1 token
seq length scales with chars      seq length compressed 3–5×     huge vocab, OOV breaks
slow at scale, low prior          fast, learned prior            fragile encoding
```

**Q (senior):** A teammate proposes truncating a long prompt by slicing the string at 4000 characters. What goes wrong?

A: Two things break. First, multi-byte characters: UTF-8 encodes non-ASCII characters as 2-4 byte sequences. Slicing a string at 4000 characters in JS slices at UTF-16 code units, not bytes; if you're encoding to bytes for sending and you slice mid-code-point, you get an invalid UTF-8 sequence and the tokenizer either fails or produces garbage tokens. Second, character-based truncation has no relationship to token count: 4000 characters of English is ~1000 tokens, 4000 characters of Japanese is ~2700 tokens, 4000 characters of code is ~1600 tokens. If your goal is to fit under a token budget (say, 2000 input tokens), character-based truncation either over-shoots (you wasted budget) or under-shoots (you blow the budget). The correct truncation is at the token level: `tiktoken.encode(text).slice(0, budget)`, then decode back to a string. The math is the same one line; the result is bug-free across content types and languages.

```
character-based truncation         token-based truncation
─────────────────────────         ─────────────────────────
text.slice(0, 4000)               const tokens = tokenizer.encode(text);
↓                                 const truncated = tokens.slice(0, 2000);
might cut multi-byte char         const result = tokenizer.decode(truncated);
no token-budget guarantee         ↓
                                  always under budget,
                                  always valid UTF-8
```

**Q (arch):** At 10× scale — a multilingual product serving 500k users across 20 languages — how does tokenization show up in your architecture?

A: Three places. First, the cost model becomes per-locale, not per-user. The forecasting spreadsheet has a column for each language with its empirical chars-per-token ratio; budgeting at "$X per active user" without that breakdown over-charges English-only users and under-charges Japanese and Arabic users by 2–3×. Second, the prompt design has to account for the budget asymmetry: instructions that are reasonable for English may not fit in the context window when re-rendered in Japanese, which means truncation logic has to use token counts (not character counts) and the system prompt itself may need shrinking. Third, the cache hit rate varies by locale: if the system prompt is English and the user content is the variable part, the cache prefix is the same length everywhere, but the *user* content length in tokens varies 3× by language, so the per-call cost variance is dominated by the user part for non-English locales — which changes how you think about caching ROI.

```
cost model at 10× scale            architecture implications
─────────────────────             ─────────────────────────
per-locale token rate              per-locale truncation logic
per-locale truncation budgets      per-locale system prompt sizing
per-locale cache hit profile       per-locale cost-per-active-user metric
```

### The question candidates always dodge

**Q:** Doesn't this whole tokenization thing go away once models start operating directly on bytes? Why care about BPE at all?

A: Byte-level models exist (Mamba-byte, ByT5, models that operate on raw UTF-8 bytes), and they're genuinely interesting — they handle code, multilingual text, and noise more robustly than BPE because there's no vocabulary mismatch. But they're not winning at frontier-scale yet because the sequence-length penalty (5× longer sequences than BPE) makes them expensive to train and serve at GPT-4 / Claude scale. As of 2026, every production-frontier model is still BPE or SentencePiece-based. The right answer is: "tokenization is a 2026 concern that may be a 2028 non-concern, but the cost dynamics and the multilingual asymmetry are real today on the models you're actually using, so the optimisation work is worth doing." The candidate who dismisses tokenization as "an implementation detail that'll go away" loses the cost-engineering conversation; the candidate who tracks both the current state and the long-term trajectory is the one staff engineers want to hire.

```
2026 state                         possible 2028 state
─────────────────                  ──────────────────────
BPE / SentencePiece dominant       byte-level frontier model
3–5× cost variance per language    minimal language asymmetry
tokenization is load-bearing       tokenization is invisible
                                   (sequence length issues remain)
```

The honest answer: tokenization is an operational concern *now*. Whether it disappears in two years doesn't change the cost ledger you ship against today.

### One-line anchors

- "Tokenization is the deterministic mapping from strings to integers the LLM operates on. The unit you bill, attend, and budget in."
- "BPE merges the most frequent adjacent byte pairs iteratively. The vocabulary is learned, not designed."
- "Tokenizers are provider-locked. cl100k_base for old OpenAI, o200k_base for GPT-4o, unpublished for Anthropic, SentencePiece for Gemini."
- "Multilingual tax: English ~4 chars/token, Japanese ~1.5 chars/token, code ~2.5 chars/token. The asymmetry is empirical and at-scale."
- "Truncate by tokens, not characters. Character truncation under or over-shoots the token budget and breaks on multi-byte characters."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw the tokenization diagram from memory: training-time BPE merge construction, inference-time encode/decode, the integer-ID sequence going into the model. Label where the vocabulary lives (shipped with the model) and where the merge rules live (alongside the vocabulary).

✓ Pass: training vs inference separation labelled, encode/decode symmetry shown, model boundary marked
✗ Fail: re-read the primary diagram, wait 10 minutes, try again.

### Level 2 — Explain it out loud

Explain tokenization to a colleague who has only ever called the OpenAI API at the string level. No notes. Under 90 seconds.

Checkpoints — did you:
- Name BPE as the algorithm?
- Distinguish encoding from decoding (both deterministic, both shipped with the model)?
- Name one concrete bug tokenization-blindness causes (the multilingual cost regression, the character-truncation bug, the cache-prefix shift)?
- Reference the buildable target (`/ai/tokenization` visualizer) as how you'd demonstrate the concept in reincodes?

If you skipped any: you described what tokenization is, you didn't argue for why it matters.

### Level 3 — Apply it to a new scenario

A teammate proposes a "context auto-compress" feature that drops parts of the conversation history when the prompt gets long. They want to trigger compression "when the prompt exceeds 8000 characters." Lay out what's wrong with the character-based trigger and how you'd reshape it to be token-aware. What does the implementation look like? What's the cost of getting the trigger wrong (compress too early or too late)?

Write your answer (3–5 sentences minimum). Then check whether your proposed approach matches the constraints `00-overview.md` names for any planned AI feature in reincodes (static-export contract, precomputed corpus, no live LLM at request time).

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff from the Tradeoffs section. Answer in writing: "If I were starting the `/ai/tokenization` visualizer today with the same constraints (static export, no live LLM, GH Pages deploy, mobile-first), would I still ship the WASM tokenizer in the bundle? Why or why not? If I'd change it, what would I do instead — precomputed-only? Server-fronted preview API? — and what would that cost in bundle size, interactivity, or deploy complexity?"

Reference the actual code:
→ Point to `next.config.ts` L7 (`output: "export"`) for the static-export constraint
→ Point to what would need to change for a server-fronted variant — `next.config.ts` loses `output: "export"`, deploy target shifts off GH Pages, a serverless function takes the tokenize request

There is no right answer. The point is specificity.

### Quick check — code reference test

Without opening any files, answer:
- What file in reincodes controls the static-export contract that constrains how the visualizer ships?
- What WASM library is the canonical OpenAI tokenizer for browser use?
- What field in `conceptsData.tsx` would need a new entry to register the tokenization visualizer in the home grid?

Then open the files and verify.

✓ Pass: `next.config.ts`, `tiktoken-wasm` (or `js-tiktoken`), `ConceptCategory[]` (the exported array)
✗ Fail on details: that's fine — the shape is what matters. File and library names should be recoverable.
