# Tokenization

**Industry name(s):** Byte Pair Encoding (BPE), SentencePiece, WordPiece, tokenization
**Type:** Industry standard

> The step where input text is split into the discrete units (tokens) an LLM actually processes; not yet built in this codebase — slated as a reincodes visualization.

**See also:** → [02-embeddings-geometrically](./02-embeddings-geometrically.md) · → [05-agent-loop](./05-agent-loop.md)

---

## Why care

You've asked ChatGPT "summarise this PDF" and watched it cut off at 8000 tokens. That cutoff isn't measured in words or characters — it's measured in *tokens*, and the gap between "characters" and "tokens" is where most LLM cost surprises and context-window panics come from. A single emoji can be 3 tokens; a long URL can be 30; the word "antidisestablishmentarianism" can be one. Knowing tokenization makes context budgets predictable.

This sits in the **LLM foundations** sub-discipline — the layer everything else depends on. Every prompt cache, context-window strategy, token-economics model assumes you can answer "how many tokens is this?" Same idea underlies BPE (used by GPT, Claude), SentencePiece (used by Llama, T5), and WordPiece (used by BERT).

---

## How it works

Picture a librarian indexing books not by chapter or sentence but by *frequency-merged subword units*. "Reading" is one unit because it's common; "antidisestablishmentarianism" is split into smaller pieces ("anti", "dis", "establish", "ment", "arian", "ism") because each piece is more common than the whole.

### Byte Pair Encoding in one paragraph

Start with every character as a unit. Find the most-frequent pair of adjacent units. Merge them into one unit. Repeat until the vocabulary reaches the target size (e.g., 50000 for GPT-2). The final merge list is the tokenizer. To tokenize new text: greedily replace pairs from the merge list.

### What this means in practice

```
Text:   "Hello, world!"
Tokens: ["Hello", ",", " world", "!"]
         (4 tokens — about 1.3 chars per token for English prose)

Text:   "🎉🎊🎈"
Tokens: ["🎉", "🎊", "🎈"]
         or even worse: ["\\xf0\\x9f", "\\x8e", ...]   (multi-byte split)

Text:   "user_id=abc123-def-456"
Tokens: ["user", "_id", "=", "abc", "123", "-", "def", "-", "456"]
         (~9 tokens for what looks like one identifier)
```

The boundary condition: emojis, code, URLs, and non-English text tokenize *worse* than English prose. A Japanese sentence is often 1 token per character; an English sentence is often 4 characters per token. Same text, different cost.

### Token-budget arithmetic

```
Claude Sonnet 4 input pricing:  $3 / 1M tokens
Average English prose:           ~4 chars/token

A 10000-character document:      ~2500 tokens → $0.0075 input
A 10000-character JSON dump:     ~3500 tokens → $0.0105 input  (more punctuation)
A 10000-character code file:     ~4500 tokens → $0.0135 input  (more symbols)
```

The variance matters at scale. For a RAG system retrieving 10 chunks per query, tokenization differences compound.

### The principle

This is what people mean by *tokens are the unit of currency in LLM systems*. Context windows, prompt cache breakpoints, latency, dollars — all measured in tokens. Building intuition for "how many tokens is this?" is foundational.

The full picture is below.

---

## Tokenization — diagram

```
Input string                  Tokenizer (BPE)              Token IDs
"Hello, world!"   ──────▶    ┌──────────────────┐    ──▶  [9906, 11, 1917, 0]
                              │ greedy merge    │
                              │ from vocab list  │
                              └──────────────────┘
                                                              │
                                                              ▼
                                                       LLM forward pass
                                                       (token IDs → embeddings → ...)

Counting tokens before sending:
  prompt + history (cached) + retrieved chunks + system prompt = total tokens
                                                              ▼
                                              ≤ model's context window?
                                                              ▼
                                              cost = total tokens × $/1M tokens
```

---

## In this codebase

**Not yet implemented.** The codebase has no AI surface today — no LLM calls, no tokenizers used. The curriculum's `[C1.1]` tokenization concept is **deferred for reincodes** until the planned tokenization viz lands (see `[reincodes Interview prep surface]` row in the curriculum).

Expected location when shipped: a new route `src/app/concepts/ai-engineering/tokenization/page.tsx` plus a small client-side BPE encoder (likely using `tiktoken` for fidelity to GPT/Claude tokenizers).

---

## Elaborate

### Where this pattern comes from
BPE was originally a compression algorithm (Gage, 1994). Adopted for NLP by Sennrich et al. (2015) to handle out-of-vocabulary words in machine translation. Now ubiquitous: GPT-4, Claude, Llama all use BPE variants.

### The deeper principle
*Subword tokenization is a compromise between character-level (fine-grained, long sequences) and word-level (coarse, lots of OOV tokens).* It's the engineering pragma that lets one model handle any input string.

### Where this breaks down
- Non-Latin scripts and emoji: each character can become multiple tokens.
- Numbers: digits often tokenize per-digit, blowing up costs for documents with many numbers.
- Code: identifiers split into many subword pieces.

### What to explore next
- BPE training: how the merge list is produced.
- SentencePiece: subword-regularised variant used by T5/Llama.
- [02-embeddings-geometrically](./02-embeddings-geometrically.md) — what tokens become inside the model.

---

## Tradeoffs

### Comparison table

```
┌──────────────────┬──────────────────────────┬──────────────────────────┐
│ Cost dimension   │ Subword (BPE)            │ Word-level               │
├──────────────────┼──────────────────────────┼──────────────────────────┤
│ Vocab size       │ ~50k (fixed)             │ Huge / OOV               │
│ OOV handling     │ Always tokenizable       │ <unk> tokens             │
│ Sequence length  │ Moderate                 │ Shorter                  │
│ Multilingual     │ Decent                   │ Bad (one vocab/lang)     │
│ Code/numbers     │ Splits awkwardly         │ Splits awkwardly         │
│ Reversibility    │ Lossless                 │ Lossless                 │
└──────────────────┴──────────────────────────┴──────────────────────────┘
```

### What we gave up

Predictable cost across languages and content types. English text is cheap; emoji-heavy chat is expensive; tabular data is mid. Production systems pre-count tokens (with `tiktoken` for GPT/Claude approximations) before sending.

### What the alternative would have cost

Word-level tokenization would simplify counting but explode the vocabulary for any non-English content and break entirely on novel terms.

### The breakpoint

The "is it worth caring?" breakpoint is: any time you pay per token, hit a context window, or cache prompts. For zero-LLM-cost apps, irrelevant.

---

## Tech reference (industry pairing)

### Tiktoken (OpenAI / Claude tokenizers)

- **Codebase uses:** Not currently. Expected when the viz ships.
- **Why it would be here:** to count tokens accurately matching what the API counts.
- **Leading today:** `tiktoken` — `adoption-leading` for OpenAI / Claude tokenization, 2026.
- **Why it leads:** official; matches API counts to the token; Rust core wrapped for JS.
- **Runner-up:** `@dqbd/tiktoken` (the npm-packaged version with the WASM build) — `innovation-leading` for browser-side token counting in 2026.

---

## Project exercises

This block is curriculum-driven. The exercise below is the **primary buildable target** for this Case B file — the curriculum names it as the reincodes deliverable that builds C1.1 understanding.

### Tokenization visualizer (curriculum reference: `Interview prep surface — reincodes`)

- **Exercise ID:** *[reincodes-viz: Tokenization visualizer]* — listed in `aieng-curriculum.md` at line 522. (No formal `[Bx.y]` ID assigned; the curriculum's "Interview prep surface — reincodes" section is the source.)
- **What to build:** A `/concepts/ai-engineering/tokenization` page that takes a textarea of input, runs it through `tiktoken` (Claude/GPT tokenizer of your choice), and renders the token boundaries inline — each token gets a coloured background and shows the token ID below. Live counter showing total tokens + estimated cost at Claude Sonnet pricing.
- **Why it earns its place:** the visual makes the gap between "characters" and "tokens" concrete — emojis blowing up, URLs fragmenting, code splitting badly. That's the foundational intuition every LLM-engineering interview tests.
- **Files to touch:** `src/app/concepts/ai-engineering/tokenization/page.tsx` (new), `src/components/AI/TokenView.tsx` (new), `package.json` (add `@dqbd/tiktoken`).
- **Done when:** Pasting "Hello, world!" shows `["Hello", ",", " world", "!"]` with token IDs and total = 4. Pasting an emoji shows token-fragmenting. Cost estimate live-updates and matches Anthropic's prompt token count when checked against the API.
- **Estimated effort:** `1–2 days`.

---

## Summary

### Part 1 — concept recap

Tokenization splits text into the subword units an LLM processes — BPE-style for GPT/Claude. reincodes does not yet implement this; the curriculum slates it as a `/concepts/ai-engineering/tokenization` visualizer that exposes the gap between characters and tokens. The constraint that makes the viz valuable is "intuition matters more than the algorithm details," and the cost is the build effort and the WASM tokenizer dependency.

### Part 2 — key points to remember

- BPE merges the most-frequent character pairs until vocab is full.
- Token count varies wildly: emojis ~3×, code ~2×, English prose ~1× the character count.
- Token budgets drive context windows and dollar costs.
- Production: always pre-count with the model's tokenizer before sending.
- The visualizer's value is making tokenization *visible*.

---

## Interview defense

### What an interviewer is really asking

When someone asks about tokenization, they want to hear that you understand it's not "splitting on spaces." Naming BPE, the subword unit, and a cost example (emoji = 3 tokens) demonstrates the practical mindset.

### Likely questions

**Q [mid]: Why is "Hello, world!" 4 tokens not 12 characters?**

A: GPT/Claude tokenizers use BPE. The vocabulary contains common subwords as single units — "Hello" is a single token because it appears often in training; the leading space on " world" makes it one unit; punctuation is its own. The tokenizer greedily picks the longest match from the vocab.

```
"Hello, world!"
   ↓ BPE merge
["Hello", ",", " world", "!"]
   IDs: [9906, 11, 1917, 0]
```

**Q [senior]: How do you keep a chat history under the context window over many turns?**

A: Three strategies, often combined. (1) Truncation: drop the oldest turns. Simple, but loses long-range coherence. (2) Summarisation: periodically replace old turns with an LLM-generated summary — saves tokens but adds latency and a summary-quality dependency. (3) Retrieval: store all turns in a vector DB, retrieve only relevant past turns per query. Best for long-running conversations; needs an embedding model + vector store. Pre-counting tokens (with `tiktoken`) before every API call is non-negotiable.

```
┌── Truncation ─────────────┐  ┌── Summarisation ──────────┐  ┌── Retrieval ──────────────┐
│  drop oldest               │ │  LLM-summarise every N     │ │  embed turns, top-k        │
│  O(1)                      │ │  Latency + cost            │ │  Vector DB                 │
│  Loses coherence           │ │  Loses fidelity            │ │  Most expensive            │
└───────────────────────────┘   └───────────────────────────┘   └───────────────────────────┘
```

**Q [arch]: A user pastes a 50K-char log file and asks for a summary. How does tokenization shape your design?**

A: 50K chars of structured log is probably ~15K tokens (logs are punctuation-heavy). Sonnet 4's 200K context fits it, but cost adds up. If this is frequent, three moves: (1) cache the file (Claude prompt caching saves 90% on cached input), (2) summarise in chunks if it exceeds context, (3) for repeat queries on the same file, embed + RAG to avoid sending the whole file each time. The tokenization step matters because it tells you which tier of context handling you need.

### The question candidates always dodge

**Q: You said this isn't in the codebase. Why is it in your study guide then?**

A: Because the curriculum names reincodes as the "interview prep surface" — the place where concepts I've built in other projects (loopd, aipe) get distilled into demonstrable vizzes. The tokenization visualizer is concretely planned (`aieng-curriculum.md:522`). The file's Case-B status doesn't mean abstract — it means "next thing to build, with the spec already written."

### One-line anchors

- "Tokens, not characters, are the currency of LLM systems."
- "BPE merges frequent character pairs into a fixed vocabulary."
- "Emojis, code, non-English text tokenize ~2–3× worse than English prose."
- "Always pre-count tokens before sending."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Draw the pipeline: input string → tokenizer → token IDs → LLM → output. Mark where token counting happens.

### Level 2 — Explain it out loud
"Why does an emoji become 3 tokens?"

### Level 3 — Apply it to a new scenario
"A user uploads a 100KB Python file for analysis. Estimate tokens and cost at Claude Sonnet pricing."

### Level 4 — Defend the decision you'd change
"Should reincodes implement its own BPE tokenizer or use `tiktoken`?"

### Quick check
- Currently implemented? → No, Case B.
- Curriculum target page path? → `/concepts/ai-engineering/tokenization`.
- Library suggested? → `@dqbd/tiktoken`.

✓ Pass: all three.
