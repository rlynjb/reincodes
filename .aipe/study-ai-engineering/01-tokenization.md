# Tokenization

**Industry name(s):** Byte-pair encoding (BPE), SentencePiece, WordPiece — the family of sub-word tokenizers that sit between characters and words.
**Type:** Industry standard · Language-agnostic

> The unit conversion an LLM does before it sees text — characters in, integer IDs out, and the only number that actually matters for context windows and billing.

**See also:** → `02-embeddings-geometrically.md` · → `03-rag-pattern.md`

---

## Why care

You've got a textarea on screen and a button that calls an LLM. The user types `"Reincodes — a DSA visualizer"`. You call `.length` on the string — 30 characters. You call the API. The provider charges you for **9 tokens** on input, not 30. The em-dash alone is 2 tokens. The word `"visualizer"` is 1. The word `"DSA"` is 1. The leading space before `"a"` is part of the next token, not its own.

Your `string.length` is not the cost. Your `string.length` is not the budget. The cost is the token count, and you have no way to know it from the string itself without running it through the tokenizer.

That gap — between the characters the user sees and the integers the model bills you on — is what tokenization is. Not the embeddings. Not the prompt. Just the conversion: text in, a list of integer IDs out, and a fixed vocabulary that decides where the splits happen.

**Why you need to answer that question at all:** because every cost decision downstream — context window budget, prompt caching, chunking strategy for RAG, how much history to keep in an agent loop — is denominated in tokens, not characters. If you size a chunking strategy by `string.slice(0, 2000)`, you are sizing by characters and pretending it's tokens. For English text that's roughly a 4:1 ratio, so 2000 chars is ~500 tokens. For code or emoji-heavy strings it can be 2:1 or worse. The "I'll just slice the string" instinct quietly breaks the budget you thought you had.

Without tokenization awareness:
- You estimate "20 messages should fit in 8k tokens" using `.length` — and the third request 413s.
- You chunk RAG documents on character count — and chunks split mid-token, mid-word, mid-emoji.
- You report "average prompt size" in characters in your eval harness — and can't tell why the same prompt costs 3x on a different model.

With tokenization awareness:
- You log token count from the API response and budget against it.
- You chunk on tokenizer boundaries (or at least on sentence boundaries, which approximate them).
- You know your model's tokenizer is not your other model's tokenizer — Claude's BPE is not GPT-4's `cl100k_base` is not Llama's SentencePiece.

A token is a `JSON.stringify`-style cost unit: the thing you actually pay for, computed by a function the runtime owns, not by your intuition about the input.

---

## How it works

The tokenizer is a function. It takes a string. It returns a list of integers.

```
Input:  "Reincodes — a DSA visualizer"
         │
         ▼
┌──────────────────────────────────────────────────┐
│  Tokenizer (BPE, vocabulary of ~100k entries)    │
│  ────────────────────────────────────────────    │
│  1. Pre-tokenize: split on whitespace/punct      │
│  2. Apply merge rules from training corpus       │
│  3. Look up each sub-word in vocabulary          │
│  4. Emit integer IDs                             │
└──────────────────────────┬───────────────────────┘
                           │
                           ▼
Tokens: ["Re", "in", "codes", " —", " a", " D", "SA",
         " visual", "izer"]
IDs:    [2367, 258, 27392, 1432, 264, 422, 7934,
         9286, 3213]
Count:  9
```

The vocabulary is a fixed table built once during model training. BPE (byte-pair encoding) walks through training text and repeatedly merges the most-frequent adjacent pairs of bytes/characters into a single vocabulary entry. After enough merges, common words like `"the"`, `"visual"`, `"izer"` end up as single entries. Rare words get split into pieces. Emoji get split into multiple byte tokens. Whitespace is sticky — the leading space is usually part of the next token, not its own.

The frontend primitive that matches this shape is the `Array.prototype.map` you'd write yourself for a custom CSV parser: a function that walks a string, slices it on rules you defined once, and returns a list of records. The difference is the rules — BPE's split rules were learned from a trillion-token corpus, not hand-written.

Three properties that matter in practice:

1. **Deterministic per model.** Same string in, same IDs out, every time. Tokenization is not sampled.
2. **One vocabulary per model family.** GPT-4's tokenizer is not Claude's tokenizer. The same string produces different token counts across providers. This is why "cost per 1k tokens" comparisons across providers are slightly apples-to-oranges.
3. **Context windows are measured in tokens, not characters.** A "200k context window" is 200k tokens. The character equivalent depends on the content (English prose: ~800k chars; dense code: ~400k chars).

---

## Tokenization — diagram

```
                     ┌─ Model API call ──────────────┐
                     │                               │
  User text          │  Input tokens   →  Model      │
  ───────────        │                       │       │
  "Reincodes — a     │                       ▼       │
   DSA visualizer"   │                  Output tokens│
        │            │                       │       │
        ▼            └───────────────────────┼───────┘
   ┌──────────┐              billing line ───┘
   │Tokenizer │
   │ (BPE)    │            input_tokens:  9
   └────┬─────┘            output_tokens: 47
        │                  cost: $0.0003
        ▼
   [2367, 258, 27392,
    1432, 264, 422,
    7934, 9286, 3213]
   ──────────────────
   9 tokens (billed)
```

The string never reaches the model. The integer IDs do. The string is what the user types; the IDs are what gets billed.

---

## In this codebase

**Not yet implemented.** Deferred — reincodes is the interview-prep visualizer host per the curriculum (`Interview prep surface — vizzes for tokenization, embeddings, RAG, agents, ML metrics`); no AI visualizer pages exist in `src/app/` yet. The static-export contract (`output: "export"` in `next.config.ts`) means any tokenizer must run in the browser, so the build path is a tokenizer Web Worker plus a client page — no API route, no server runtime.

The slot for this page in the existing visualizer catalog is the `CONCEPT_CATEGORIES` array in `src/components/Home/conceptsData.tsx` (currently four categories: sorting, graphs, trees, recursion). A new `"ai-engineering"` category would sit alongside them and contain the tokenization tile.

---

## Elaborate

### Where this pattern comes from

Sub-word tokenization (BPE specifically) was adapted from a 1994 data-compression algorithm by Sennrich et al. in 2016 for neural machine translation. The motivation was a vocabulary problem: word-level tokenizers couldn't handle out-of-vocabulary words (typos, names, rare terms), and character-level tokenizers made sequences too long for the model to learn from. Sub-word tokenization split the difference — common words stay whole, rare words split into pieces, vocabulary stays bounded.

### The deeper principle

Lossy unit conversion as a contract boundary. The tokenizer is the only place the string-to-integers conversion happens, and once it's done, the model sees only integers. The principle is the same as a database column type: at the boundary, you commit to a representation, and everything downstream operates on the representation, not the source.

```
┌──────────────────────────────────────────────┐
│  String world          │   Integer world     │
│  (your code)           │   (model internals) │
│  ──────────────────    │   ───────────────── │
│  characters, regex,    │   IDs, embeddings,  │
│  `.length`, `.slice`,  │   attention, logits │
│  templating            │                     │
└──────────────────────────────────────────────┘
        ▲                          ▲
        │                          │
        └─── tokenizer is the ─────┘
              one-way bridge
```

### Where this breaks down

When the input is not text. Image tokens, audio tokens, and code tokens use different tokenizers with different vocabularies — and multi-modal models layer them. When the input is a language the tokenizer wasn't trained for: Korean and Thai often tokenize at 3–5x the character ratio of English, blowing up cost and shrinking effective context windows. When you need exact-character control: structured outputs that require precise whitespace or character counts (JSON with specific indentation, regex patterns) can be subtly mangled because the tokenizer treats whitespace as sticky.

### What to explore next

- Context windows and lost-in-the-middle → why token budget is not the only constraint; position matters too.
- Embeddings → the next conversion: tokens to vectors. Tokens are the input; embeddings are what the first model layer produces from them.
- Prompt caching → providers can cache prefixes by token-ID match. Identical prefix strings produce identical token IDs, which is why prefix caching works at all.

---

## Tradeoffs

### Comparison table — both costs in one frame

┌──────────────────┬─────────────────────────┬─────────────────────────┐
│ Cost dimension   │ Use the tokenizer       │ Estimate from `.length` │
├──────────────────┼─────────────────────────┼─────────────────────────┤
│ Accuracy         │ Exact (matches billing) │ ±30% off, often worse   │
│ Build time       │ ~200KB WASM in browser  │ Zero                    │
│ Latency          │ <5ms for 10k chars      │ <0.01ms                 │
│ Bundle size      │ +200KB on first load    │ 0                       │
│ Debuggability    │ Token IDs are inspectable│ Guessing about cost    │
└──────────────────┴─────────────────────────┴─────────────────────────┘

### Sub-block 1 — what running the tokenizer costs

200KB of WASM-shipped vocabulary plus encoder code, loaded into the browser on the tokenization page. Visible in the lighthouse bundle report; would not be in the home-page bundle because the static-export build chunks by route. The first time a user lands on `/ai/tokenization`, they wait ~150ms longer than an empty page while the worker boots.

A Web Worker boundary to keep tokenization off the main thread. That's one extra file (`src/workers/tokenizer.worker.ts`) and one `new Worker()` setup in the page, plus a message-passing layer for input/output. A new contributor has to know the worker exists to debug it.

### Sub-block 2 — what estimating from `.length` would cost

Wrong numbers on every visualization. A user pastes 200 characters of code, the page says "~50 tokens," but the actual tiktoken-equivalent count is 87. The interview point of the visualizer — *the gap between characters and tokens* — disappears the moment the page shows estimates instead of real counts.

For a visualizer, the rounding error is the bug. The whole reason the page exists is to make the gap visible; faking the count defeats the surface.

### Sub-block 3 — the breakpoint

Fine while the visualizer is the only AI surface and bundle size on `/ai/tokenization` is the only concern. The moment the bundle becomes a perf problem on the home page (because the worker is somehow eagerly imported), inline the count from a server endpoint — except reincodes has no server, so the actual breakpoint is "stop trying to share tokenizer code across pages and keep it strictly per-route."

---

## Tech reference (industry pairing)

### tiktoken (or @dqbd/tiktoken WASM build)

- **Codebase uses:** not yet imported. Intended target for `src/workers/tokenizer.worker.ts` is `@dqbd/tiktoken` (the WASM/JS port of OpenAI's tiktoken) since it ships a browser bundle and no Node runtime.
- **Why it's here:** would do the actual string→IDs conversion the visualizer renders. Without it the page would estimate, which makes the visualization a lie.
- **Leading today:** `tiktoken` — adoption-leading for GPT-family BPE tokenization, 2026.
- **Why it leads:** ships the exact vocabulary OpenAI uses, so token counts in the visualizer match what users would pay. Rust-backed WASM is fast enough for real-time.
- **Runner-up:** Anthropic's official token counter API — innovation-leading because it's the only way to get Claude's exact tokenizer, but requires a network call so it doesn't fit a static-export site without a proxy.

### Web Workers (browser primitive)

- **Codebase uses:** not yet — would be the first worker in reincodes. Existing visualizers use the main thread because `delayLoop` is the bottleneck, not compute.
- **Why it's here:** keeps the 200KB tokenizer WASM init and per-keystroke encoding off the main thread so the textarea stays responsive.
- **Leading today:** Web Workers — adoption-leading for off-main-thread compute in the browser, 2026.
- **Why it leads:** native browser primitive, no library needed, deterministic message-passing API. Every modern browser supports it.
- **Runner-up:** SharedArrayBuffer + AudioWorklet — innovation-leading for low-latency audio/realtime workloads, but overkill for tokenization.

---

## Project exercises

### [B-reincodes-tokenization] Tokenization visualizer

- **Exercise ID:** Curriculum reference: `[C1.1]` + the "Interview prep surface" entry `Tokenization visualizer [exercises C1.1]`.
- **What to build:** A page at `/ai/tokenization` with a textarea, a "tokenize" button, and a rendered list of token chips below. Each chip shows the token string, its integer ID, and its byte length. Chips are color-coded by token type (word, sub-word, punctuation, whitespace). Live token count + estimated cost (at one provider's rate) displayed at the top.
- **Why it earns its place:** the gap between `string.length` and token count is the single most common bug in early LLM work. Building a visualizer that makes the gap visible — and seeing your own name get split into three sub-word pieces — converts "I read about BPE" into "I can sketch the tokenizer's job on a whiteboard."
- **Files to touch:**
  - `src/app/ai/tokenization/page.tsx` (new — the `"use client"` page)
  - `src/workers/tokenizer.worker.ts` (new — wraps `@dqbd/tiktoken`)
  - `src/components/TokenChipList/TokenChipList.tsx` (new — the chip-rendering visualizer)
  - `src/components/Home/conceptsData.tsx` (add an `"ai-engineering"` category + tile)
- **Done when:** the page loads, accepts paste/typing, encodes within 200ms, and the displayed token count matches `tiktoken.encode(text).length` exactly. Build passes `next build` under `output: "export"`.
- **Estimated effort:** 1–2 days.

---

## Interview defense

### What an interviewer is really asking

When an interviewer asks about tokenization, they're not asking you to recite the BPE algorithm. They're asking: did you ever actually look at what gets sent to the model? Or do you treat the API as a black box that takes strings and returns strings? The candidates who have stared at token IDs in a debugger know the answer to "why does this prompt cost 3x more on Llama than on GPT-4" without having to think. The candidates who haven't, can't.

### Likely questions

[mid] Q: Why is `string.length` not a good estimate of token count?

A: Because the tokenizer's vocabulary is sub-word, not character. Common English words like `"the"` are one token (3 characters); rare words like `"reincodes"` split into multiple tokens; emoji can be multiple tokens for a single visible character. The ratio varies from ~1:4 for English prose to ~1:1 for code with lots of symbols. For budgeting, the only reliable count is what the tokenizer actually returns — which is why the visualizer exists.

Diagram:
```
"the cat sat"     → 3 chars→tokens: 1:1 in this region
   11 chars       → [464, 3797, 3332]   3 tokens

"reincodes"       → 9 chars→tokens: ~1:3
   9 chars        → [3354, 1090, 19815] 3 tokens

"🚀"               → 1 visible char → 4 bytes → 2 tokens
```

[senior] Q: Why does the same string cost different amounts on different providers?

A: Each model family ships its own tokenizer with its own vocabulary. GPT-4 uses `cl100k_base`; Claude uses an Anthropic-specific BPE; Llama uses a SentencePiece variant. The same string produces different token counts on each — usually within ±20% but sometimes more for code or non-English text. So "cost per 1k tokens" comparisons across providers are not directly comparable until you tokenize the same input under each one and check the actual counts.

Diagram:
```
Same input: "import { useState } from 'react';"

┌───────────────┬──────────┬──────────┐
│ Tokenizer     │ Tokens   │ Cost*    │
├───────────────┼──────────┼──────────┤
│ cl100k_base   │   10     │  $X      │
│ Claude BPE    │   12     │  $Y      │
│ Llama SP      │    9     │  $Z      │
└───────────────┴──────────┴──────────┘
*at each provider's posted rate
```

[arch] Q: At what scale does it stop being okay to tokenize client-side, and what changes?

A: As long as the visualizer is the only consumer and the WASM bundle is route-chunked, client-side is fine — the cost is one 200KB worker load per session. If reincodes ever added bulk operations (tokenize an entire repo, batch-cost-estimate 1000 prompts), the WASM init and per-call latency would become a bottleneck and pushing tokenization to a Cloudflare Worker or edge function would be the move. But the static-export contract here means there's no server to push to, so the breakpoint is also the moment reincodes stops being a static site.

Diagram:
```
Current shape (static export):

  Browser                            
    │                                 
    ▼                                 
  [tokenizer.worker.ts] ◀── 200KB WASM
    │                                 
    ▼                                 
  Token IDs rendered                  

If batch sizes grow:                  

  Browser ── HTTP ──▶ [Edge Worker]   
                          │           
                          ▼           
                     tokenizer (CDN-cached)
                          │           
                          ▼           
                     Token IDs returned
                                      
  (reincodes is no longer static at that point)
```

### The question candidates always dodge

Q: If your visualizer uses tiktoken's `cl100k_base`, and the user pastes a prompt they intend to send to Claude, isn't your visualization actively wrong?

A: Yes, partially. The page would show GPT-4's tokenization, which is not what Claude's API would bill. The honest version of the visualizer either: (a) labels itself as "GPT-4-family tokenization" prominently so the user knows what they're looking at, or (b) ships multiple tokenizer backends and lets the user pick. The interview move isn't to pretend the visualizer is universal — it's to know which tokenizer's vocabulary you shipped and to surface that fact in the UI. Most public tokenizer visualizers do exactly (a) because the GPT-4 tokenizer is the most-deployed reference; Anthropic doesn't ship a browser-runnable tokenizer, so showing Claude's exact counts requires their API.

Diagram:
```
What we picked        vs   The "universal tokenizer" claim
──────────────              ─────────────────────────────
cl100k_base                  ✗ doesn't exist —
(GPT-family BPE,             tokenizers ARE the model
 labelled in UI)             family's vocabulary.
                             Pretending otherwise
                             shows ignorance, not
                             generality.
```

### One-line anchors

- "Tokens are the cost unit; characters are the input — and the gap between them is what budgets break on."
- "Sub-word tokenization is the bridge: common words stay whole, rare words split, vocabulary stays bounded."
- "Each model family ships its own tokenizer; cross-provider cost comparisons need the same input run through each one."
- "Tokenization is deterministic — same string, same IDs, every time. The randomness in LLM output starts after tokenization, not before."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw the tokenization flow from memory — user input on the left, the model on the right, the tokenizer in the middle. Label what's a string, what's a list of integers, and where the billing meter sits.

Open the file. Compare.

- Did you show that the string never reaches the model — only the IDs do?
- Did you put the billing meter on the IDs, not the string?
- Did you label the vocabulary as fixed per model?

### Level 2 — Explain it out loud

Explain tokenization to a frontend colleague who just asked "why can't I just use `.length` to budget for an LLM call?" No notes. Under 90 seconds.

Checkpoints — did you:
- Name the BPE family by name (or at least "sub-word")?
- Give a concrete ratio (e.g. "~4 characters per token for English prose")?
- Mention that emoji, code, and non-English text break the ratio?
- Say that each model has its own tokenizer?

If you skipped any: you described it, you didn't understand it.

### Level 3 — Apply it to a new scenario

Answer this without looking at the file:

"You're building a chunking strategy for a RAG system over 10MB of mixed English + JavaScript code. You want chunks ≤ 1000 tokens each. You write `text.slice(i, i + 4000)` because the docs say '1 token ≈ 4 chars for English.' What goes wrong, and what do you do instead?"

Write your answer. 3–5 sentences minimum. Then check whether your answer matches the file's framing.

### Level 4 — Defend the decision you'd change

The Project exercise above proposes shipping a 200KB WASM tokenizer in the browser. Answer in writing:

"If you were starting `/ai/tokenization` today with the same static-export constraint, would you ship the WASM tokenizer client-side, or would you precompute tokenizations server-side at build time for a fixed set of example strings? Why? What would each cost?"

Reference the actual code path:
- Point to `next.config.ts` (the static-export constraint).
- Point to the conceptsData tile slot where the page would land.

### Quick check — code reference test

Without opening any files, answer:
- What file would the tokenizer worker live in?
- What category in `conceptsData.tsx` would the visualizer tile go into?
- What's the constraint in `next.config.ts` that decides "browser, not server"?

Then open the files and verify.

- Pass: you named `src/workers/tokenizer.worker.ts` (or close).
- Pass: you named a new `"ai-engineering"` category in `CONCEPT_CATEGORIES`.
- Pass: you named `output: "export"`.

---

## Summary

Tokenization is the lossy unit conversion an LLM does before it sees text. It is the only place string-world meets integer-world, and it is the unit your bill is denominated in. For reincodes specifically, it is the first AI visualizer slated for the curriculum — and the visualizer's whole job is to make the gap between `string.length` and token count visible to the reader on the page.
