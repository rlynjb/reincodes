# What an LLM is (operationally)

**Industry name(s):** Large Language Model, autoregressive transformer, next-token predictor, generative LM
**Type:** Industry standard

> The operational definition of an LLM — a stateless function from a token sequence to a probability distribution over next tokens, sampled in a loop. Not a database, not a reasoner, not a planner. Everything else is built on top.

**See also:** → [02-tokenization](02-tokenization.md) · → [03-sampling-parameters](03-sampling-parameters.md) · → [06-token-economics](06-token-economics.md) · → [../00-overview.md](../00-overview.md) · → [../../study-prompt-engineering/01-anatomy.md](../../study-prompt-engineering/01-anatomy.md)

---

## Why care

### Move 1 — The grounded scenario

You're building a todo list. The user types "buy milk" and hits enter. Your `.map()` iterates an array, renders each item with a `key`, and the DOM updates. The behaviour is deterministic — same input array in, same DOM out, every render. Now swap in an LLM call to auto-categorise the todo: send "buy milk" to Claude, get back `{category: "shopping"}`. Run it again with the same prompt and you get `{category: "errand"}`. Run it a third time and the model wraps the JSON in a markdown fence. The `.map()` invariant — same input, same output — is gone, and the team's mental model of the system is gone with it.

### Move 2 — Name the question

That gap has a name — *what is an LLM, operationally*. Not what it can do, not what it's trained on, not which provider you're calling. Just: what is the function signature, what is its memory model, where does non-determinism enter, and what does it cost to invoke. The operational definition is the contract you actually program against, and most LLM bugs in production reduce to a team treating the function as something it isn't — a database when it has no persistence, a planner when it has no plan, a reasoner when its "reasoning" is itself sampled next-token-by-next-token.

### Move 3 — Why answering that question matters

**Why you need to answer that question at all:** because every subsequent decision — caching strategy, retry policy, structured-output enforcement, evaluation harness, cost model — falls out of the operational definition. I watched a team at Series B spend three weeks debugging a "memory bug" in their agent before someone said out loud that the agent has no memory; it has a context window, the context window is per-request, and the team had been silently rebuilding state inside the prompt without noticing. The fix was four lines. The diagnostic took three weeks because nobody on the team had ever drawn the IO contract — input tokens go in, output tokens come out, the model is stateless between calls, full stop. If you can draw that diagram, you stop attributing magic to the model and start attributing behaviour to the system you built around it.

### Move 4 — Concrete before/after

Without the operational definition:

- Team treats the LLM as "knows things"
- Caches by user_id instead of by prompt hash
- Adds retry logic that retries the *same* prompt and expects different output (it can get different output, but only because of sampling, not because the retry "fixed" anything)
- Logs the "response" without logging the input tokens, so production failures aren't reproducible
- Estimates cost per active user with no model of input-vs-output token ratio

With the operational definition:

- LLM is a stateless function `(tokens) -> distribution over next tokens`
- Cache key is the full input token sequence (prefix-cache eligible on Anthropic / OpenAI)
- Retry on transport errors, not on output content — output content is sampling, not a transient failure
- Logs capture `{system, messages, sampling_params, model_id, output_tokens, finish_reason}` — every call is a reproducible record
- Cost model is `input_tokens × input_price + output_tokens × output_price`, computed per-chain

### Move 5 — The one-line summary

An LLM, operationally, is a stateless inference function that takes a token sequence and emits one next-token distribution at a time, sampled in a loop until a stop condition fires — analogous to `fetch()` with a per-call argument and no per-call memory of the previous call, except the response is generated token-by-token by sampling from a distribution. The full mechanics are below.

---

## How it works

### Move 1 — The mental model

An LLM is a pure function call with three inputs and one output. Inputs: the token sequence (system + history + user message, all concatenated into a single list of integer token IDs), the sampling parameters (temperature, top-p, max_tokens), and the model identifier. Output: a stream of token IDs, one at a time, each drawn from a probability distribution the model emits over its vocabulary. The function has no state between calls. If you want it to "remember" the previous turn, you have to include the previous turn in the input.

The strategy: treat the LLM as the world's most expensive `fetch()` — stateless, costly, non-deterministic, and the most powerful function call in your codebase as long as you stop pretending it's anything more than a function call.

```
The LLM as a stateless function

         input tokens                output tokens
       ┌───────────────┐           ┌───────────────┐
       │ [12, 845, ...]│           │ [678, 91, ...]│
       └──────┬────────┘           └───────▲───────┘
              │                            │
              ▼                            │
   ┌─────────────────────────────────────────────┐
   │  LLM(tokens, sampling_params) -> next_token │
   │  loop until stop_token | max_tokens         │
   │  no memory between invocations              │
   └─────────────────────────────────────────────┘
```

### Move 2 — The layered walkthrough

#### The token sequence in

The technical thing: the input is a flat list of integer token IDs. The system prompt, the conversation history, the few-shot examples, the user message — all of it gets tokenised by the provider's tokenizer and concatenated into one sequence before the model sees it. If you've worked with a DB table, this is the equivalent of the request payload — one structured input per row of work, no implicit state from "the previous row". Concrete consequence: the model has no concept of "system message" versus "user message" at the math level; those are *roles* that the provider's chat-template formatter renders into special tokens (e.g. `<|im_start|>system\n...<|im_end|>`) inside the same flat sequence. The role boundary exists, but it exists as tokens, not as a separate input channel.

```
What the model actually sees — one flat token sequence

  role tokens (system)  prompt tokens  role tokens (user)  message tokens
  ┌──────────────────┐ ┌────────────┐ ┌────────────────┐ ┌─────────────┐
  │ <|s|> system <|e|>│ │ You are... │ │ <|s|> user <|e|>│ │ buy milk    │
  └──────────────────┘ └────────────┘ └────────────────┘ └─────────────┘
                                  ↓
                            flat sequence of ~30 token IDs
```

#### The next-token distribution

The technical thing: the model is a function `f(token_sequence) -> logits` where logits is a real-valued vector of size `vocab_size` (~50k for OpenAI's cl100k_base, ~100k for Anthropic's tokenizer, larger for newer multilingual models). Softmax turns logits into a probability distribution. The sampling step picks one token from that distribution. The bridge from frontend: this is the analog of a `Promise` that resolves not to a single value but to a *distribution* over values, and the sampler chooses which one to commit. Concrete consequence: the model is *deterministic* up to the distribution — given the same input, the logits are reproducible. The non-determinism is entirely in the sampling step, which is why `temperature=0` (greedy / argmax) gets you closer to reproducibility but never all the way (provider-side jitter, batch effects, and floating-point non-associativity all leak through).

```
Next-token decision — one step of the loop

  input token sequence
         │
         ▼
   ┌──────────────────┐
   │  LLM forward pass│
   └──────┬───────────┘
          │ logits: a vector of vocab_size floats
          ▼
   ┌──────────────────┐
   │  softmax + sample│
   └──────┬───────────┘
          │ token_id = one integer
          ▼
   append to sequence, recurse
```

#### The autoregressive loop

The technical thing: generation is the loop "predict next token → append it to the sequence → predict next token again → ..." until the model emits a stop token (`<|endoftext|>`, end-of-turn, etc.) or the caller's `max_tokens` budget is exhausted. The bridge from frontend: this is the equivalent of `.reduce()` over an unknown number of iterations — the loop body is the next-token prediction; the accumulator is the growing output sequence; the termination condition is dynamic. Concrete consequence: output cost is per-token-generated, and the model has no way to "know" how long its output will be in advance. A "summarise this" prompt that produces 50 tokens and a "write me a 2000-word essay" prompt go through the same loop; the latter just runs the loop 40× more times. This is why output tokens are 3–5× more expensive than input tokens at every major provider — input is one forward pass; output is N forward passes.

#### The statelessness invariant

The technical thing: there is no state carried between calls. None. Every "memory" the model appears to have is either (a) included in the input prompt this call, or (b) part of the model's frozen weights from training. The bridge from frontend: this is identical to a REST endpoint with no session — each request includes everything the handler needs to respond. Concrete consequence: "conversation history" is a client-side concern. You store the previous turns somewhere (your DB, your client, your agent state), and on the next call you concatenate them into the input. The model doesn't remember the previous turn; the client remembers and replays.

### Move 3 — The principle

The principle that generalises beyond any one model: an LLM is a *function*, not an *agent*. Every system built on top of an LLM that appears to remember, plan, reason, or learn is doing so by composing the stateless function inside a loop with external state — your database, your retrieval system, your agent harness, your context window management. The model itself is the same shape it was on the first call. The history of bugs in production LLM systems is dominated by teams attributing capabilities to the model that actually live in the surrounding system; the corresponding history of fixes is teams drawing the IO diagram and moving the responsibility back to the layer that owns it.

The full picture is below.

---

## What an LLM is — diagram

```
┌─ The inference function (stateless, pure between calls) ─────────────┐
│                                                                       │
│   ┌────────────────────────────────────────────────┐                 │
│   │ INPUT                                          │                 │
│   │   system prompt + history + user message       │                 │
│   │   → tokenize → flat list of token IDs          │                 │
│   │   + sampling params (temperature, top-p, ...)  │                 │
│   │   + model_id                                   │                 │
│   └────────────────────────────────────────────────┘                 │
│                          │                                            │
│                          ▼                                            │
│   ┌────────────────────────────────────────────────┐                 │
│   │ FORWARD PASS                                   │                 │
│   │   compute logits over vocab_size               │                 │
│   │   apply temperature, top-p, top-k              │                 │
│   │   sample one token                             │                 │
│   └────────────────────────────────────────────────┘                 │
│                          │                                            │
│                          ▼                                            │
│   ┌────────────────────────────────────────────────┐                 │
│   │ AUTOREGRESSIVE LOOP                            │                 │
│   │   append sampled token to input                │                 │
│   │   repeat until: stop_token | max_tokens        │                 │
│   └────────────────────────────────────────────────┘                 │
│                          │                                            │
│                          ▼                                            │
│   ┌────────────────────────────────────────────────┐                 │
│   │ OUTPUT                                         │                 │
│   │   sequence of token IDs                        │                 │
│   │   → detokenize → final string                  │                 │
│   │   + usage: {input_tokens, output_tokens}       │                 │
│   │   + finish_reason: stop | length | tool_use    │                 │
│   └────────────────────────────────────────────────┘                 │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
                              │
                              ▼   per-call cost = priced per token, in + out
┌─ Where the apparent "memory" actually lives ─────────────────────────┐
│                                                                       │
│   client-side: conversation history, agent state, retrieval results  │
│   model weights: frozen at training time, identical every call       │
│   provider infra: prompt cache (input-side, optional, opt-in)        │
│                                                                       │
│   nothing else is carried between calls. nothing.                    │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

The boundary between the upper band (the inference function, per-call, stateless) and the lower band (where "memory" actually lives) is what makes LLM systems debuggable: every observed behaviour traces to either the inputs to the call, the weights of the model, or the surrounding state the client is replaying into the prompt. There is no fourth source.

---

## In this codebase

**Not yet implemented.** reincodes is a Next.js static-export DSA visualizer with no AI surface in production code — there are zero LLM calls, no inference loop, no token logs, no provider client. The existing study guide (`.aipe/study-ai-engineering/`) positions reincodes as the *interview-prep visualizer host* per the curriculum: a place to *teach* AI concepts through visualizers, not a place where AI runs for users. The buildable target for this concept is below in Project exercises — a `/ai/what-is-an-llm` page that animates the autoregressive loop token-by-token over a precomputed example, with a probability-distribution side-panel showing the top-5 candidate tokens at each step so the reader sees the function shape, not just the final output.

**Expected file paths** (when built):
- `src/app/ai/what-is-an-llm/page.tsx` — the visualizer page
- `src/components/LLMLoopVisualizer/` — token-stream renderer + probability-side-panel component
- `public/ai/what-is-an-llm/example-traces.json` — 3 precomputed (prompt, output_tokens[], per_step_top5[]) traces captured at build time by `scripts/precompute-llm-trace.ts`

---

## Elaborate

### Where this pattern comes from

The autoregressive next-token formulation predates the transformer era. RNN language models in 2015–2018 had the same loop shape; what changed in 2017 with "Attention Is All You Need" was the forward-pass internals (parallel attention over the sequence instead of recurrent state), not the inference contract. GPT-1 (2018) productised the contract; GPT-2 (2019) demonstrated it scaled; GPT-3 (2020) proved few-shot prompting worked inside the same contract. The "stateless function in a loop" framing didn't have to be invented — every transformer LM has worked this way since the architecture landed. What changed in 2023–2026 is the *deployment* shape: chat completions APIs gave teams a high-level abstraction over the loop, and the abstraction made it easy to forget that the function underneath is still stateless.

### The deeper principle

The deeper principle is that *generative models are samplers from a learned distribution*. Pretraining shapes the distribution; instruction-tuning + RLHF reshape the distribution to align with human preferences; sampling chooses one realisation. Every LLM behaviour you observe at inference time is the sampler's choice from a distribution, conditioned on the input. There is no "the model decided" — there is "the model assigned high probability to this token, and the sampler picked it." Once you have that framing, "why did the model say X" becomes a tractable question (the distribution preferred X under this context) rather than a mystical one. This framing is also what makes evaluation work: you evaluate the *distribution* of outputs, not a single output, because the single output is one draw from a distribution.

### Where this breaks down

The stateless-function framing breaks down — or rather, leaks — at the infrastructure boundary. Providers run prompt caching: the first N tokens of your input are cached server-side, and re-using the same prefix triggers a discount (90% off at Anthropic, 50% off at OpenAI on the cached portion). This isn't statefulness in the model — the weights are still frozen — but it's statefulness in the *serving stack*, and it matters for the cost model. Similarly, "extended thinking" / "reasoning models" emit internal reasoning tokens that are partly hidden from the caller; the function shape is the same but the visibility contract changes. Both are real, both are recent (2024–2026), and both are worth knowing about, but neither contradicts the core framing: the model itself is stateless; the serving stack around it is not.

### What to explore next

- [02-tokenization](02-tokenization.md) → the boundary where strings become token IDs; the "what does the model actually see" question
- [03-sampling-parameters](03-sampling-parameters.md) → the levers that turn the distribution into a chosen token
- [05-streaming](05-streaming.md) → the autoregressive loop as user-visible UX
- [06-token-economics](06-token-economics.md) → the cost ledger of input vs output tokens

---

## Tradeoffs

### Comparison table — both costs in one frame

```
┌──────────────────┬──────────────────────┬─────────────────────────┐
│ Cost dimension   │ Path taken           │ Alternative             │
│                  │ (operational def)    │ (treat as black box)    │
├──────────────────┼──────────────────────┼─────────────────────────┤
│ Onboarding time  │ ~1 day to internalise│ 10 minutes to call API  │
│ Mental overhead  │ Hold the IO contract │ "It just answers things"│
│                  │ in your head         │                         │
│ Bug class avoided│ "Model has memory"   │ Three-week debugging    │
│                  │ never gets attempted │ sessions on phantom     │
│                  │                      │ stateful behaviour      │
│ Cost reasoning   │ Token-level model    │ "Why is this expensive?"│
│ Replay-ability   │ Every call is a      │ Calls are vibes; bugs   │
│                  │ deterministic-up-to- │ are not reproducible    │
│                  │ sampling record      │                         │
│ Team consistency │ One shared mental    │ Each engineer has their │
│                  │ model across team    │ own folklore            │
│ Caching strategy │ Prompt-prefix cache  │ Cache by user_id and    │
│                  │ aligned with model   │ hope for the best       │
│ Eval harness     │ Reproducible by      │ "It used to work"       │
│                  │ replaying inputs     │                         │
└──────────────────┴──────────────────────┴─────────────────────────┘
```

### What we gave up (when planning the reincodes visualizer)

The first cost is *engineering time to precompute the trace*. The `/ai/what-is-an-llm` visualizer can't be a live demo — the static-export contract forbids API keys at request time. Building a meaningful animation requires a build-time script that calls Claude (or GPT) for three example prompts, captures not just the output but also the *top-5 candidate tokens at each step* via the provider's `logprobs` parameter, and commits the result to `public/ai/what-is-an-llm/example-traces.json`. The `logprobs` capture is the load-bearing part — without it, the visualizer becomes a typewriter animation with no signal about what the model "considered." That's about a half-day of build-script work.

The second cost is *bundle size for the probability panel*. A useful three-trace example with per-step top-5 candidates is roughly 30–50 KB of JSON, larger than the home page's entire component graph. Code-splitting under `/ai/what-is-an-llm/` contains the cost to that route, but the route itself ships heavier than any existing visualizer in reincodes. The DSA visualizers ship pure algorithm code; this one ships a captured artifact alongside the visualizer code.

The third cost is *teaching surface clarity*. The site's existing concept categories are pure DSA — sorting, trees, graphs, recursion. Adding `ai-engineering` as a fifth category means the home page has to communicate "this is a DSA site *and* an AI-concepts site" without the second category overwhelming the first. The redesign spec (`reincodes-redesign-spec.md`) treats AI engineering as a parallel category, but the home grid's visual hierarchy needs to keep the DSA categories foregrounded since that's the site's identity.

### What the alternative would have cost (skipping the visualizer)

If reincodes never builds the `/ai/what-is-an-llm` visualizer, the cost is *zero* in the codebase. The operational framing of an LLM still lives in this written study guide, in the curriculum's Phase 1 reading list (Karpathy's "Let's build GPT", "Attention Is All You Need"), and gets exercised in loopd's five-chain implementation. The reincodes site stays pure-DSA and the AI-engineering education happens elsewhere — by reading this guide, by building the loopd chains, by working through the curriculum's flashcard track.

The cost of *not* building it shows up in the interview-prep story. When an interviewer asks "explain how an LLM produces output," there's no visualizer to point at — the candidate has to draw the autoregressive loop on a whiteboard. That's a survivable cost; whiteboarding is the medium of technical interviews. But the visualizer's pedagogical value is that it makes the *non-determinism visible* — without it, "sampling" is a word; with it, you can watch the top-2 candidate swap positions when temperature crosses a threshold.

### The breakpoint

The visualizer earns its place the moment the candidate is preparing for an AI-eng interview round that includes a "teach this concept" segment — usually principal+ rounds at companies hiring for AI tech leads. Until that round shows up on a schedule, the visualizer stays in the backlog. The breakpoint is event-shaped, not quantitative: a recruiter says "the loop includes a teaching exercise" and the visualizer becomes the demonstration artifact for that exercise.

### What wasn't actually a tradeoff

Live LLM calls at request time were never a real option. The static-export contract (`output: "export"` in `next.config.ts`) is what lets reincodes deploy to GitHub Pages with zero infrastructure cost. A live visualizer would require leaving GH Pages, paying for serverless compute, managing API keys in environment variables, and handling rate limits per visitor. The precompute-at-build-time approach isn't a downgrade from "real" LLM serving — it's the only architecture compatible with the deploy story.

---

## Tech reference (industry pairing)

### Anthropic Messages API

- **Codebase uses:** not yet — the planned `/ai/what-is-an-llm` visualizer would call `claude-sonnet-4-7` at build time to capture three example traces, including per-step logprobs for the probability-side-panel.
- **Why it's here:** Anthropic's API exposes the autoregressive loop cleanly — `stream: true` emits one token-level event at a time with usage metrics in the final event. The visualizer's data model maps 1-to-1 onto the streaming event shape.
- **Leading today:** Anthropic Messages API — `adoption-leading` for production LLM application work, 2026.
- **Why it leads:** explicit `system` parameter (separates anatomy from messages), prompt caching API with 5-minute TTL, extended thinking mode, and the cleanest separation of system/user/assistant roles among major providers.
- **Runner-up:** OpenAI Chat Completions — `adoption-leading` in raw deployments, broader ecosystem tooling, but the boundary between system and user messages is convention rather than typed contract.

### OpenAI Chat Completions

- **Codebase uses:** not yet — would be the secondary precompute target if the visualizer ships cross-provider traces to demonstrate that the autoregressive contract is the same regardless of vendor.
- **Why it's here:** the chat-completions API was the first widely-adopted productisation of the role-tagged token sequence. The `messages: [{role, content}]` shape is now industry-default and gets copied by every other provider.
- **Leading today:** OpenAI Chat Completions — `adoption-leading` for raw deployments and ecosystem libraries, 2026.
- **Why it leads:** broadest ecosystem (LangChain, LlamaIndex, every framework defaults to it), strict mode for structured outputs, batch API for offline workloads, and the most diverse model lineup (GPT-5, GPT-5-mini, o-series reasoning models).
- **Runner-up:** Google Gemini API — `innovation-leading` for long-context (1M+ tokens) and multimodal-from-the-start, but the developer experience and ecosystem support trail Anthropic and OpenAI.

### tiktoken (BPE tokenizer)

- **Codebase uses:** not yet — would run the WASM build (`tiktoken-wasm` or `js-tiktoken`) in the visualizer's browser context to show the reader the token IDs corresponding to the example prompt before the autoregressive loop begins.
- **Why it's here:** tokenization is the boundary where strings become the integers the model operates on. Showing the token IDs alongside the source text makes the "the model sees tokens, not characters" point operable in the visualizer.
- **Leading today:** tiktoken — `adoption-leading` for OpenAI tokenizer access in JS and Python, 2026.
- **Why it leads:** the only tokenizer that exactly matches OpenAI's server-side encoder. WASM build runs in browsers without requiring a backend. Anthropic does not publish their tokenizer, so cl100k_base is the de-facto teaching baseline.
- **Runner-up:** Anthropic's `count_tokens` API endpoint — `innovation-leading` for accurate Claude token counts but requires a network call, so not viable for the static-export visualizer context.

---

## Project exercises

### [B-reincodes-what-is-an-llm-viz] Build the LLM-loop visualizer

- **Exercise ID:** `[B-reincodes-what-is-an-llm-viz]` — derived from the curriculum's reincodes "interview prep surface" entry and Phase 1 concept `[C1.13]` (discriminative vs generative); the visualizer is the operable artifact behind the conceptual claim.
- **What to build:** a page at `/ai/what-is-an-llm` that renders three precomputed example traces. Each trace shows the prompt as token chips (using tiktoken-wasm to compute IDs in-browser), then animates the autoregressive loop: token-by-token, one new token appears in the output stream while a side-panel shows the top-5 candidate tokens with their probabilities at that step. A speed control (slow / medium / fast) reuses reincodes' existing `delayLoop` pattern. The reader sees, in one interaction, *that* the model emits one distribution per step and *that* the chosen token is one draw from a distribution that had other plausible candidates.
- **Why it earns its place:** the visualizer makes the stateless autoregressive function *observable* — the reader doesn't just read "the model samples one token at a time"; they watch each step and see the distribution. The interview signal is that the candidate built a teaching artifact for the most fundamental LLM concept, which most candidates describe verbally but never visualise.
- **Files to touch:** `src/app/ai/what-is-an-llm/page.tsx` (visualizer page), `src/components/LLMLoopVisualizer/` (token chip rendering, distribution side-panel, loop animation using `delayLoop`), `public/ai/what-is-an-llm/example-traces.json` (precomputed traces), `scripts/precompute-llm-trace.ts` (build-time script that calls Claude with `stream: true` + logprobs, captures per-step top-5, writes JSON). Add a row to `src/components/Home/conceptsData.tsx`'s category list under a new `ai-engineering` category.
- **Done when:** the page loads at `/reincodes/ai/what-is-an-llm/` in production (GitHub Pages), three example prompts each animate token-by-token with the probability side-panel updating in sync, speed control changes the `delayLoop` interval, `next build` passes under `output: "export"`. Build script runs against the actual Anthropic API locally and the captured JSON survives `git commit`.
- **Estimated effort:** 2 days. Precompute script with logprobs capture: half day. Token chip rendering + tiktoken-wasm integration: half day. Loop animation + side-panel: half day. Polish, mobile layout, three examples calibrated for teaching value: half day.

---

## Summary

### Part 1 — concept recap

An LLM, operationally, is a stateless function from a token sequence to a probability distribution over next tokens, sampled one token at a time in a loop until a stop condition fires. The function has no memory between calls; every appearance of memory is the surrounding system replaying state into the next input. The function is deterministic up to the sampler — given the same input and `temperature=0`, the logits are reproducible; non-determinism enters through sampling (and minor provider-side jitter). In this codebase the concept is *planned* rather than implemented: reincodes has no LLM surface in production code, and the buildable target is a `/ai/what-is-an-llm` visualizer that animates the autoregressive loop over precomputed example traces with a probability side-panel. The constraint that makes the visualizer this shape is the static-export contract — live model calls require a backend that reincodes doesn't have, so the visualizer is a *playback machine* over captured traces, not a *live* call.

### Part 2 — key points to remember

- **The function shape**: `(tokens, sampling_params) -> distribution over next_token`. Stateless between calls. No memory. Period.
- **The loop**: predict next token, append, predict again, until stop_token or max_tokens. Output cost is per-token-generated, which is why output is 3–5× the price of input.
- **The non-determinism source**: sampling. Not the model. `temperature=0` makes the logits reproducible but doesn't eliminate provider-side jitter and floating-point non-associativity.
- **Where "memory" lives**: client-side. Conversation history is replayed into the next prompt. The model never remembers. Every team that thinks otherwise has a bug coming.
- **The reincodes shape**: implementation is Case B; the buildable target is a precomputed visualizer under `/ai/what-is-an-llm` that animates the loop with per-step top-5 logprobs.

---

## Interview defense

### What an interviewer is really asking

Behind "explain how an LLM works" the interviewer is probing whether the candidate has internalised the *function shape* or is still parroting the marketing description ("trained on the internet, predicts what comes next"). A junior answer describes capabilities ("it can write essays, answer questions, summarise"). A senior answer describes the contract ("stateless function, tokens in, distribution out, sampled in a loop"). The interviewer is checking for the operational framing because every downstream architectural decision falls out of it — caching, retries, evals, cost models, observability. If the candidate can draw the IO diagram, the rest of the system-design conversation has somewhere to anchor.

### Likely questions

**Q (mid):** What's the difference between an LLM and a database?

A: An LLM is stateless; a database has persistent state. An LLM responds to a token sequence with another token sequence drawn from a learned distribution; a database responds to a query with deterministic rows. An LLM's "knowledge" is frozen in the weights at training time and can't be updated without retraining or fine-tuning; a database's data can be updated by writing to it. Every place a team treats an LLM as a database — caching by user_id and expecting personalised "memory," or assuming "the model knows" some current fact — is a bug waiting to ship. If the team needs persistent state, the state lives in the database; the LLM is the function that operates on the state when it's replayed into the prompt.

```
LLM                         Database
─────────────────────       ─────────────────────
stateless                   persistent
tokens in / tokens out      query in / rows out
per-call cost               near-zero per-call cost
sampling = non-determinism  ACID = determinism
weights frozen at training  data updates as written
```

**Q (senior):** Why is output 3–5× the cost of input on every major provider?

A: The autoregressive loop runs one forward pass per generated token, and a forward pass is the expensive operation. Input tokens go through the forward pass *once* — they're processed in parallel because the model's attention can attend to the full input simultaneously. Output tokens go through *N* forward passes, where N is the output length, because each token depends on the previous tokens that were just generated. Provider economics fall out of the math: serving an input token is ~1 unit of compute amortised across the input sequence; serving an output token is ~1 full forward pass. The 3–5× ratio is the providers' empirical pricing of that asymmetry, with some margin. Prompt caching shifts the input side further down (90% off cached input on Anthropic, 50% off on OpenAI) because cached input doesn't require a fresh forward pass over the prefix.

```
input (one forward pass over N tokens)    output (N forward passes, 1 token each)
─────────────────────────────────────     ──────────────────────────────────────
parallel attention over the whole seq     each step attends to all prior tokens
~O(N) total cost                          ~O(N^2) total cost (approx)
priced at ~$3/M tokens (Sonnet 4)         priced at ~$15/M tokens (Sonnet 4)
                                          (5× ratio matches the math)
```

**Q (arch):** At 10× scale — a chain that runs 100k times/day across 10 LLM calls each — what does the cost-engineering shift look like?

A: At 100k×10 = 1M calls/day, three levers matter. First, prompt caching: pull every constant prefix (system prompt, few-shot examples, schema definitions) into a cached prefix and structure the chain so the cache hits on every call. At 90% discount on cached input, this collapses the input-side cost by an order of magnitude. Second, model routing: cheap classifier model on cheap calls, expensive frontier model only on the calls that need it. Heuristic-before-LLM eliminates 60–90% of calls entirely. Third, batch API for anything that isn't user-facing — at 50% discount on Anthropic and OpenAI batch APIs, offline jobs cost half. The math at 1M/day says the bill goes from ~$30k/month at naive serving to ~$3-5k/month with all three levers, which is the difference between "operational expense" and "line item the CFO asks about." The architecture shift isn't in the LLM call itself; it's in the routing layer above the LLM.

```
naive serving (1M calls/day, all frontier)        cost-engineered serving
─────────────────────────────────────────         ─────────────────────────────────
all calls hit Sonnet 4 / GPT-5                    heuristic-before-LLM filters 70%
no prompt caching                                 cached prefix on every call (-90%)
synchronous, real-time                            batch API for offline (-50%)
~$30k/month                                       ~$3-5k/month
```

### The question candidates always dodge

**Q:** If LLMs are just next-token predictors, how do they "reason"? Isn't that just a category error?

A: Reasoning, as the model performs it, is itself sampled next-token-by-next-token. The "reasoning trace" you see when a model produces step-by-step chain-of-thought is the same autoregressive function emitting one token at a time; the appearance of reasoning is that the *learned distribution* assigns high probability to tokens that, in sequence, form coherent step-by-step problem-solving. Whether this is "real" reasoning is a philosophical question; whether it produces correct answers is an empirical one. The functional answer is: chain-of-thought prompting and reasoning-mode models (o-series, Claude extended thinking) get measurably better performance on multi-step problems, because the autoregressive process is generating tokens that condition the model toward correct continuations. The category-error worry is real at the philosophical level and irrelevant at the engineering level — the function emits tokens that, when interpreted as reasoning, behave as if they're reasoning, and the downstream system benefits from the behaviour regardless of how you label it.

```
"reasoning" as marketing             reasoning as the function actually performs it
──────────────────────────           ──────────────────────────────────────────────
model "thinks"                       model emits tokens that read as thought
model "plans"                        model emits tokens that condition next tokens
model "solves"                       model emits tokens whose joint probability is
                                       higher when the path resembles solving
```

The honest answer: "the model reasons by generating reasoning-shaped token sequences" is not a dodge — it's the operational truth, and it lets you predict where the model will fail (problems where the training distribution didn't have step-by-step solutions to similar problems) and where it'll succeed (problems where it did).

### One-line anchors

- "An LLM is a stateless function from tokens to a distribution over next tokens, sampled in a loop. Everything else is built on top."
- "The model never remembers. Every appearance of memory is the surrounding system replaying state."
- "Non-determinism is the sampler, not the model. The logits are reproducible; the sampling step isn't."
- "Output is 3–5× the cost of input because input is one forward pass and output is N forward passes."
- "Reasoning is sampled next-token-by-next-token, same function. The reasoning shape is a property of the distribution, not a separate capability."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw the LLM-as-function diagram from memory: inputs (token sequence + sampling params + model_id), forward pass producing logits, sampler picking one token, autoregressive loop until stop condition. Label where "memory" lives (it doesn't — only on the client side).

✓ Pass: function shape, autoregressive loop, statelessness invariant all labelled
✗ Fail: re-read the primary diagram, wait 10 minutes, try again.

### Level 2 — Explain it out loud

Explain what an LLM is, operationally, to a colleague who has used ChatGPT but hasn't built with the API. No notes. Under 90 seconds.

Checkpoints — did you:
- Name the function signature (tokens in, distribution out, sampled in a loop)?
- Distinguish the model from the surrounding system (where "memory" actually lives)?
- Name the source of non-determinism (sampling, not the model itself)?
- Reference the buildable target (`/ai/what-is-an-llm` visualizer) as how you'd demonstrate the concept in reincodes?

If you skipped any: you described what the model does, you didn't explain what the model *is*.

### Level 3 — Apply it to a new scenario

A teammate proposes adding "memory" to a chat feature so the assistant remembers what users told it across sessions. They suggest "fine-tuning the model on each user's chat history." Lay out the operational analysis: why is "fine-tuning per user" the wrong answer, what is the right architecture, and what does the IO contract look like for the right answer?

Write your answer (3–5 sentences minimum). Then check whether your proposed architecture matches the constraints `00-overview.md` names for any planned AI feature in reincodes (static-export contract, precomputed corpus, no live LLM at request time).

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff from the Tradeoffs section. Answer in writing: "If I were starting the `/ai/what-is-an-llm` visualizer today with the same constraints (static export, no live LLM, GH Pages deploy), would I still capture the per-step top-5 logprobs at build time? Why or why not? If I'd change the data model, what would I do instead and what would that cost in storage / bundle size / teaching clarity?"

Reference the actual code:
→ Point to `next.config.ts` L7 (`output: "export"`) to support the static-export constraint
→ Point to what would need to change if the precompute step moved to a serverless function — `next.config.ts` would lose `output: "export"`, deploy target shifts off GH Pages, bundle architecture changes

There is no right answer. The point is specificity.

### Quick check — code reference test

Without opening any files, answer:
- What file in reincodes controls the static-export contract that constrains how the visualizer ships?
- What directory under `.aipe/` contains the existing AI-engineering study guide files?
- What field in `conceptsData.tsx` would need a new category entry to register an `/ai/*` visualizer in the home grid?

Then open the files and verify.

✓ Pass: `next.config.ts`, `.aipe/study-ai-engineering/`, `ConceptCategory[]` (the array exported by `conceptsData.tsx`)
✗ Fail on details: that's fine — the shape is what matters. File and directory names should be recoverable.
