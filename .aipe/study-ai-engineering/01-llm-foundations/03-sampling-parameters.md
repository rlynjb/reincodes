# Sampling parameters (temperature, top-p, top-k)

**Industry name(s):** Sampling parameters, decoding parameters, generation config
**Type:** Industry standard

> The levers that turn the model's emitted distribution into a chosen token. Temperature scales the logits, top-p and top-k truncate the candidate set. The reason "the model" sometimes feels stochastic and sometimes feels rigid lives entirely in these three numbers.

**See also:** → [01-what-is-an-llm](01-what-is-an-llm.md) · → [04-structured-outputs](04-structured-outputs.md) · → [06-token-economics](06-token-economics.md) · → [../00-overview.md](../00-overview.md)

---

## Why care

### Why care anchored to a frontend primitive

You have a `.map()` over an array of todos. Same array in, same DOM out, every render — that invariant is what makes React debuggable. Now imagine the same `.map()` whose output occasionally changed which `key` was on which element, even when the input array didn't change. You'd lose your mind. That's the default behaviour of an LLM call at `temperature=0.7` — the same prompt produces meaningfully different outputs across invocations because the sampler is drawing from a distribution. The non-determinism isn't a bug in the model; it's a parameter the caller controls. Most teams new to LLMs ship with the provider's default sampling parameters, hit reproducibility problems, and blame "the model" before realising there's a knob labelled `temperature` and they never touched it.

### Move 2 — Name the question

That knob has a name — *sampling parameters*. Specifically: `temperature` (scales the logits before softmax, controlling how flat or peaked the distribution is), `top_p` (nucleus sampling — keep the smallest set of tokens whose cumulative probability exceeds p), and `top_k` (hard cap on the number of candidate tokens regardless of distribution shape). These three parameters together determine which token gets sampled at each step of the autoregressive loop. The model emits the same logits given the same input; the sampler — driven by these three numbers — decides which token leaves the API. Every "same prompt, different output" surprise traces back to this sampling step.

### Move 3 — Why answering that question matters

**Why you need to answer that question at all:** because the choice of sampling parameters maps directly onto the chain's job. A classification chain wants `temperature=0` — deterministic, reproducible, no exploration. A caption generator that produces five variants wants `temperature=0.8 + top_p=0.95` — controlled variance, not chaos. A creative-writing assistant wants `temperature=1.0` — the model's full distribution. I have shipped a classification chain in 2024 where someone set `temperature=0.7` because that was "the default" in the framework's example code, and we spent a week investigating why the same todo got classified as "task" 70% of the time and "errand" 30% of the time. The fix was changing one number; the diagnostic took a week because the team didn't have a mental model of where non-determinism enters the pipeline. The sampling parameters are not knobs to twist randomly — they're a design decision about how much variance the chain tolerates.

### Move 4 — Concrete before/after

Without thinking about sampling parameters:

- Default `temperature=1.0` (OpenAI default) on a classifier; 30% of classifications are inconsistent across re-runs
- "We need to add retry logic because the model gives different answers" — true, but it's the sampler, not the model
- No `top_p` set, model occasionally emits a rare token chain that looks like a hallucination
- Eval results vary 5–10% between runs of the same eval suite because the model's outputs vary

With sampling parameters in the design:

- `temperature=0` for classification, structured output, deterministic answer extraction
- `temperature=0.7–0.8` for natural-language variation (captions, summaries, creative responses)
- `temperature=1.0+` only for genuinely creative tasks (brainstorming, variant generation)
- `top_p=0.9` as a default ceiling on the distribution's tail to keep outputs from drifting into rare-token chains
- Eval runs at `temperature=0` to make results comparable across runs

### Move 5 — The one-line summary

Sampling parameters are the levers that turn the model's emitted logit distribution into a chosen token — `temperature` scales the distribution's peakedness, `top_p` and `top_k` truncate the candidate set — analogous to how a query's `LIMIT` and `ORDER BY` turn a result set into a chosen row, except the choice is probabilistic and the parameters live on every API call. The full mechanics are below.

---

## How it works

### Move 1 — The mental model

At each step of the autoregressive loop, the model emits a logit vector — one real-valued score per token in the vocabulary, ~100k entries. To pick the next token, the sampler does three things in order: (1) apply `temperature` by dividing the logits, which sharpens (low T) or flattens (high T) the distribution after softmax; (2) apply `top_p` and/or `top_k` to truncate the candidate set down to the most plausible tokens; (3) sample one token from the truncated, temperature-scaled distribution. Everything else equal, varying only these three parameters changes the output. The model is identical; the sampler is the variable.

The strategy: think of sampling parameters as the *post-processing* layer on the model's emitted distribution, not as something the model itself does. The model is a function that produces a distribution; the sampler is a function that turns a distribution into a draw. The two are separate concerns.

```
The sampler as the post-processing layer

  model emits logits over vocab
            │
            ▼
     ┌────────────────┐
     │ /temperature   │  ← reshape distribution
     └────────┬───────┘
              │
              ▼
     ┌────────────────┐
     │ top_p / top_k  │  ← truncate candidate set
     └────────┬───────┘
              │
              ▼
     ┌────────────────┐
     │ sample one     │  ← draw from truncated dist
     └────────┬───────┘
              │
              ▼
        chosen token
```

### Move 2 — The layered walkthrough

#### Temperature

The technical thing: `temperature` is a scalar that divides the logits before softmax. `softmax(logits / temperature)`. At `temperature=1.0`, the distribution is whatever the model emitted. At `temperature=0.5`, the logits get doubled in magnitude, which sharpens the softmax — high-probability tokens get more weight, low-probability tokens get less, the distribution peaks around the argmax. At `temperature=2.0`, logits get halved, the distribution flattens, low-probability tokens get more weight. At `temperature=0`, mathematically the softmax becomes degenerate (division by zero), so the implementation collapses to argmax — pick the highest-logit token, every time. If you've worked with a database query, temperature is the equivalent of how aggressively you rank by relevance score — `temperature=0` is "always pick the top-ranked result"; high temperature is "weight the ranking, but allow the lower-ranked results to sometimes win." Concrete consequence: `temperature=0` is the right default for any chain whose output should be reproducible — classification, extraction, structured output. `temperature=0.7` is the right default for any chain whose output should sound natural (real humans don't always pick the most likely word).

```
temperature visualised on a 5-token candidate distribution

  candidates  raw logits   T=0.5 (sharper)   T=1.0 (default)   T=2.0 (flatter)
  ─────────  ──────────   ───────────────   ───────────────   ───────────────
  "the"       5.0          0.82              0.55              0.36
  "a"         3.5          0.18              0.32              0.27
  "this"      2.0          0.00              0.10              0.18
  "that"      1.5          0.00              0.02              0.12
  "an"        1.0          0.00              0.01              0.07
                                              ▲                 ▲
                                              moderate variance  high variance
                                              
  At T=0 → always "the" (argmax)
  At T=0.5 → "the" almost always, "a" rarely
  At T=2.0 → "the" still favoured but real tail risk on rare tokens
```

#### Top-p (nucleus sampling)

The technical thing: `top_p` (nucleus sampling, Holtzman et al. 2019) sorts the candidate tokens by probability descending, then keeps the smallest set whose cumulative probability meets or exceeds `p`. The bridge from a frontend list: this is the same operation as "keep adding items to a cart until I've spent $p" — you stop at the first item that puts you over the threshold, and the size of the kept set varies with how the items are priced. Concrete consequence: `top_p=0.9` adapts to the distribution shape — if the model is confident (one token has 0.9 probability alone), only that one token is kept; if the model is uncertain (top 20 tokens are all ~0.05 probability each), 18 of them are kept. This is the *good* behaviour for natural-language generation, because it scales the truncation to the model's confidence. `top_p=1.0` is no truncation at all; `top_p=0.1` is aggressive truncation. The conventional default is `top_p=0.9` or `top_p=0.95`.

```
top_p truncation — adapts to distribution shape

  confident distribution                  uncertain distribution
  ─────────────────────                   ─────────────────────
  "the": 0.92 ←┐                          "a":    0.08 ←┐
  "a":   0.05  │ cumulative 0.97          "the":  0.07  │
  "this": 0.02 │ at p=0.9, keep first 1   "this": 0.07  │ cumulative grows slowly
  "that": 0.01 │                          "that": 0.06  │ at p=0.9, keep ~15 tokens
  ...          ▼                          "an":   0.06  │
                                          ...           ▼
  → only "the" survives top_p=0.9        → broad candidate set survives top_p=0.9
```

#### Top-k

The technical thing: `top_k` is a hard cap on the number of candidate tokens. After sorting by probability, only the top k survive. The bridge from a frontend primitive: this is `array.slice(0, k)` applied to the sorted candidates. Concrete consequence: `top_k` doesn't adapt to distribution shape the way `top_p` does — it always keeps exactly k tokens, even if the (k+1)-th token has nearly the same probability as the k-th. In practice, `top_p` has largely supplanted `top_k` for natural-language generation because of this adaptivity. `top_k=40` is a common default when used at all. Many providers no longer expose `top_k` directly (OpenAI doesn't on chat completions; Anthropic does). When you need a hard cap on diversity for cost or latency reasons, `top_k` is the simpler primitive. For most generation use cases, `top_p` is the right knob.

#### The interaction

The technical thing: when multiple parameters are set, they're applied in order. `temperature` first (reshapes the distribution), then `top_p` and `top_k` (truncate the candidate set), then sample. Common patterns: `temperature=0` short-circuits to argmax and ignores `top_p` / `top_k` entirely; `temperature=0.7 + top_p=0.9` is a common production default for natural-language generation; `temperature=1.0 + top_p=1.0` is "raw model output" — maximum exploration, used only when you want true sampling diversity (variant generation, brainstorming). Concrete consequence: setting `top_p=0.001` with `temperature=2.0` largely cancels out — the high temperature flattens the distribution and the aggressive `top_p` re-truncates it. Combinations interact, and the right approach is to set `temperature` for the chain's job and use `top_p` (default ~0.9) as a tail-guard against rare-token chains, not as a primary lever.

#### Why `temperature=0` isn't truly deterministic

The technical thing: at `temperature=0`, the sampler degenerates to argmax — pick the highest-logit token. On paper this is deterministic. In practice, provider-side jitter creeps in from three sources. First, batch effects: the model runs in batches on the GPU, and floating-point operations are not associative — `(a + b) + c ≠ a + (b + c)` for floats, so the order operations execute in a batch can produce tiny logit variations. Second, hardware non-determinism: matrix multiplication on GPUs uses non-deterministic reduction order by default for performance. Third, server-side routing: providers route requests across model-server instances that may be running slightly different versions (canary deployments, A/B tests). Concrete consequence: even at `temperature=0`, you should expect 1–3% variance in output across identical prompts. Reproducibility is approximate, not absolute. For eval reproducibility, fix `temperature=0`, pin the model version (`claude-sonnet-4-7-20260301` not `claude-sonnet-4-7`), and accept that small variance is in the noise floor of the system.

### Move 3 — The principle

The principle that generalises beyond any one parameter: *non-determinism is the sampler, not the model.* Every observed difference between two runs of the same prompt traces back to the sampling step (or, more weakly, to provider-side jitter at the infrastructure layer). The model's emitted distribution is reproducible given the input; the choice of which token to draw from that distribution is where variance enters. Once you have this framing, "make the chain reproducible" becomes a clear engineering operation — set `temperature=0`, pin the model version, log the sampling params. And "make the chain natural-sounding" becomes the inverse — raise the temperature deliberately, set `top_p` as a tail guard, accept the variance as a feature of the chain's job, not a bug.

The full picture is below.

---

## Sampling parameters — diagram

```
┌─ The sampling pipeline (every token, every call) ────────────────────┐
│                                                                       │
│   raw logits from model forward pass                                 │
│     (one real-valued score per vocab token, ~100k entries)           │
│                          │                                            │
│                          ▼                                            │
│   ┌────────────────────────────────────────────────┐                 │
│   │ TEMPERATURE                                    │                 │
│   │   logits / temperature → reshaped distribution │                 │
│   │   T=0    → argmax (greedy)                     │                 │
│   │   T=0.7  → moderate variance (production)      │                 │
│   │   T=1.0  → raw model distribution              │                 │
│   │   T=2.0  → flattened (exploration)             │                 │
│   └────────────────────────────────────────────────┘                 │
│                          │                                            │
│                          ▼                                            │
│   ┌────────────────────────────────────────────────┐                 │
│   │ TOP-P (nucleus sampling)                       │                 │
│   │   sort by prob, keep smallest set with         │                 │
│   │   cumulative prob ≥ p                          │                 │
│   │   p=0.9  → keep tokens until 90% mass covered  │                 │
│   │   adapts to distribution confidence            │                 │
│   └────────────────────────────────────────────────┘                 │
│                          │                                            │
│                          ▼                                            │
│   ┌────────────────────────────────────────────────┐                 │
│   │ TOP-K (hard cap)                               │                 │
│   │   keep at most k candidates                    │                 │
│   │   k=40   → common default if used at all       │                 │
│   │   doesn't adapt — fixed k regardless of dist   │                 │
│   └────────────────────────────────────────────────┘                 │
│                          │                                            │
│                          ▼                                            │
│   ┌────────────────────────────────────────────────┐                 │
│   │ SAMPLE                                         │                 │
│   │   draw one token from the truncated,           │                 │
│   │   temperature-scaled distribution              │                 │
│   └────────────────────────────────────────────────┘                 │
│                          │                                            │
│                          ▼                                            │
│   chosen token → append to sequence, loop back to model              │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
                              │
                              ▼   parameters set per call by caller
┌─ Common parameter combinations ──────────────────────────────────────┐
│                                                                       │
│   classification / extraction:   T=0, top_p=1.0 (irrelevant at T=0)  │
│   structured output:             T=0, top_p=1.0                      │
│   production conversational:     T=0.7, top_p=0.9                    │
│   creative generation:           T=1.0, top_p=0.95                   │
│   variant generation:            T=0.8–1.2 across N calls            │
│   eval suite (reproducibility):  T=0, pin model version              │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

The boundary between the upper band (per-token sampling pipeline) and the lower band (per-chain parameter choices) is what makes sampling parameters operational rather than mysterious: the pipeline is the same on every call; what varies is the parameter set the caller passes, and that set is a design decision tied to the chain's job.

---

## In this codebase

**Not yet implemented.** reincodes is a Next.js static-export DSA visualizer with no AI surface in production code — there are zero LLM calls, no sampling parameters, no temperature variance. The existing study guide (`.aipe/study-ai-engineering/`) positions reincodes as the *interview-prep visualizer host* per the curriculum: a place to *teach* AI concepts through visualizers, not a place where AI runs for users. The buildable target for this concept is below in Project exercises — a `/ai/sampling` page that shows the same prompt run at five temperatures (0, 0.3, 0.7, 1.0, 1.4) with precomputed outputs, plus a per-token distribution side-panel that shows the top-5 candidates at each step so the reader can see *which* token survived sampling and which alternatives lost.

**Expected file paths** (when built):
- `src/app/ai/sampling/page.tsx` — the visualizer page
- `src/components/SamplingVisualizer/` — five-column output renderer, distribution side-panel, temperature selector
- `public/ai/sampling/example-runs.json` — precomputed (prompt, [(temperature, output_tokens[], per_step_top5[])]) records captured at build time by `scripts/precompute-sampling.ts`

---

## Elaborate

### Where this pattern comes from

Temperature as a logit-scaling parameter predates LLMs by decades — it's borrowed from statistical mechanics (the Boltzmann distribution) and was applied to neural networks in the 1980s for simulated annealing and probabilistic output sharpening. Nucleus sampling (`top_p`) was introduced by Holtzman, Buys, Du, Forbes, Choi in their 2019 paper "The Curious Case of Neural Text Degeneration," which demonstrated that pure greedy decoding produced repetitive degenerate output and pure random sampling produced incoherent output; nucleus sampling was the principled middle. `top_k` is older still and has largely been supplanted by `top_p` because of the adaptivity argument. OpenAI's chat completions API exposed `temperature` and `top_p` from day one; Anthropic followed; every modern provider exposes the same three parameters with similar semantics, with minor variations in defaults (OpenAI defaults to `temperature=1.0`; Anthropic defaults to `temperature=1.0` for the Messages API but with documentation emphasising explicit choice).

### The deeper principle

The deeper principle is that *generation is sampling from a distribution, and the sampler is a design surface, not a constant.* This is structurally identical to how a database's `ORDER BY ... LIMIT` clause is a design surface — the query's job determines how strictly you rank and how many rows you keep. The model's emitted distribution is the "result set"; temperature reshapes it; top_p truncates it; the sampler picks. Once you have that framing, "the model is inconsistent" becomes "the chain's sampling parameters don't match the chain's job," and the fix is in the parameters, not in retry logic or prompt engineering. Most teams ship without articulating this; the senior move is articulating it.

### Where this breaks down

The temperature framing breaks down at three edges. First, structured-output mode: when a provider enforces a JSON schema via `response_format` or strict tool-use mode, the sampling is constrained by the schema — the model can only sample tokens that keep the partial output valid. Temperature still matters but its effect is filtered through the schema constraints, and the relationship between temperature and output variance becomes less direct. Second, reasoning models (o-series, Claude extended thinking): these models generate internal reasoning tokens that are partially hidden, and the providers have published guidance discouraging non-default temperature on these models — the reasoning process is sensitive to logit reshaping in ways that don't apply to standard models. Third, frequency_penalty and presence_penalty: these are additional sampling-adjacent parameters that adjust logits for tokens already in the output (to reduce repetition); they interact with temperature in ways that aren't fully orthogonal and need to be set together rather than in isolation.

### What to explore next

- [01-what-is-an-llm](01-what-is-an-llm.md) → the sampler operates on the distribution the model emits; this concept is the post-processing layer on that
- [04-structured-outputs](04-structured-outputs.md) → structured mode constrains sampling further; temperature still matters but with reduced effect
- [06-token-economics](06-token-economics.md) → temperature doesn't affect cost directly, but affects output length variance and therefore cost variance
- [../05-evals-and-observability/](../05-evals-and-observability/) → eval reproducibility requires `temperature=0` + pinned model version

---

## Tradeoffs

### Comparison table — both costs in one frame

```
┌──────────────────┬──────────────────────┬─────────────────────────┐
│ Cost dimension   │ Path taken           │ Alternative             │
│                  │ (explicit temp per   │ (use provider defaults  │
│                  │  chain's job)        │  everywhere)            │
├──────────────────┼──────────────────────┼─────────────────────────┤
│ Reproducibility  │ Classifiers always   │ Classifiers 70% stable  │
│                  │ deterministic        │ retry logic everywhere  │
│ Eval stability   │ Eval runs identical  │ ±5% variance run-to-run │
│                  │ across runs          │ no rigor on results     │
│ Code complexity  │ Per-chain config     │ One default everywhere  │
│                  │ block, named values  │ "it's the default"      │
│ Debugging        │ Variance localised   │ Variance globalised —   │
│                  │ to deliberate chains │ every chain might vary  │
│ Onboarding       │ New engineer reads   │ New engineer sees no    │
│                  │ "temperature: 0" and │ config, assumes the     │
│                  │ knows it matters     │ model is just stochastic│
│ Output quality   │ Natural-sounding for │ Natural for everything; │
│                  │ generation, rigid    │ irritatingly random for │
│                  │ for classification   │ classification          │
│ Cost variance    │ Output length stable │ Output length varies    │
│                  │ at T=0; controlled   │ unpredictably           │
│                  │ at T=0.7             │                         │
└──────────────────┴──────────────────────┴─────────────────────────┘
```

### What we gave up (when planning the reincodes visualizer)

The first cost is *capturing per-step logprobs for the side-panel*. The visualizer's teaching value is the side-panel showing top-5 candidate tokens at each step, which requires the build-time script to request `logprobs: true` (OpenAI) or use the equivalent Anthropic mechanism. The logprobs API surface costs more per call (the provider has to return more data) and produces meaningfully larger output JSON. For five temperatures × three prompts × ~80 tokens of output × top-5 candidates per step, the precomputed JSON is roughly 60-90 KB. That's still manageable under the `/ai/` route's bundle budget but it's the largest precomputed artifact across the planned visualizer family.

The second cost is *teaching scope*. The visualizer demonstrates temperature most clearly because temperature's effect is visible in the output (T=0 always emits the same tokens, T=1.4 produces wild variance). `top_p` is harder to visualise — its effect is on the candidate set, not the emitted token, and the side-panel showing top-5 isn't enough to make `top_p` visible. The visualizer foregrounds temperature and treats `top_p` as a secondary parameter with a tooltip explaining what it does, rather than a primary interactive lever. That's a deliberate scope choice; teaching all three parameters with equal emphasis would require a richer visualisation (probability bars per token, animated truncation) and would double the build time.

The third cost is *the misleading reproducibility narrative*. At `temperature=0`, the precomputed traces will show identical outputs across captures because the visualizer captures one run per temperature. The reader might come away thinking "T=0 is fully deterministic" when in fact production T=0 has 1-3% provider-side jitter. The visualizer's accompanying text needs to call out the jitter, or the reader's mental model will be slightly wrong about reproducibility in real systems. This is the kind of teaching nuance the visualizer makes harder, not easier, and the surrounding prose has to carry the load.

### What the alternative would have cost (skipping the visualizer)

If reincodes never builds the `/ai/sampling` visualizer, the cost is *zero* in the codebase. The concept gets taught in this written study guide and gets exercised in loopd's caption chain (curriculum task `[B1.3]`: temperature variance per variant as a deliberate sampling experiment). The reincodes site stays pure-DSA and the AI-engineering education happens elsewhere.

The cost of *not* building it shows up in the teaching ladder. Of the nine concepts in this sub-section, sampling is the one where seeing a side-by-side comparison delivers the largest "oh, that's what that means" moment. A textual description of "at T=0 you always get the same output; at T=1.4 you get wild variance" doesn't convince in the way that watching the variance happen at three different temperatures on the same prompt does. Without the visualizer, the candidate has to defend the concept verbally; with it, they can show.

### The breakpoint

The visualizer earns its place during the interview round where the candidate is asked "why don't I just set temperature to 1 and let the model be creative?" Without a visual to point at, the answer is theoretical; with the visualizer, the candidate can say "I built a side-by-side and at T=1.4 the classifier hallucinated entire token sequences that weren't in the schema, watch." The breakpoint is event-shaped: an interview round that pushes on the "why care about sampling parameters" question hard enough that a verbal answer feels insufficient.

### What wasn't actually a tradeoff

Live LLM calls in the visualizer were not a real option. The static-export contract forbids API keys at request time. Even if a backend existed, running five LLM calls per visualizer load (one per temperature) would be both expensive and slow, and the variance across visits would undercut the teaching value (the reader can't compare "my T=0.7 output" to "your T=0.7 output" if they're different captures). Precomputed traces are not just compatible with the architecture; they're the right architecture for this specific teaching surface.

---

## Tech reference (industry pairing)

### Anthropic Messages API (sampling parameters)

- **Codebase uses:** not yet — the planned `/ai/sampling` visualizer would call `claude-sonnet-4-7` at build time with five different temperature values and `logprobs` capture enabled (where supported), persisting the traces to `public/ai/sampling/example-runs.json`.
- **Why it's here:** Anthropic's Messages API exposes `temperature`, `top_p`, and `top_k` as named parameters with documented defaults and ranges. The visualizer's data model maps onto the API's parameter shape directly.
- **Leading today:** Anthropic Messages API — `adoption-leading` for production prompt engineering work, 2026.
- **Why it leads:** explicit parameter ranges (temperature 0-1, top_p 0-1, top_k integer), clear documentation on when each matters, and consistent behaviour across model versions. The default of `temperature=1.0` is documented with caveats encouraging explicit choice per chain.
- **Runner-up:** OpenAI Chat Completions — `adoption-leading` for raw deployments. Same parameter set (`temperature`, `top_p`) but no `top_k` exposed; `frequency_penalty` and `presence_penalty` are OpenAI-specific.

### OpenAI logprobs API

- **Codebase uses:** not yet — would be the primary source for the per-step top-5 candidates in the visualizer's side-panel. Calling with `logprobs: true, top_logprobs: 5` returns the top-5 candidate tokens with their log-probabilities at each step.
- **Why it's here:** the visualizer's teaching value depends on showing not just the chosen token but also the runner-up candidates. logprobs is the canonical mechanism for capturing those candidates from the inference call.
- **Leading today:** OpenAI logprobs — `adoption-leading` for inspection-grade access to model internals, 2026.
- **Why it leads:** the only major provider that exposes per-step token-level logprobs in a structured, documented way on the chat completions endpoint. Critical for evals, calibration, and teaching artifacts like this visualizer.
- **Runner-up:** Anthropic does not currently expose token-level logprobs on the Messages API. The visualizer's Anthropic traces would have to approximate the top-5 via Claude's own self-report or use OpenAI traces exclusively for the logprobs side-panel.

### Generation config (Hugging Face transformers)

- **Codebase uses:** not yet — irrelevant for the reincodes visualizer since the visualizer captures provider API outputs, not local model inference. Named here because the Hugging Face `GenerationConfig` class is the canonical reference for what parameters exist and how they compose.
- **Why it's here:** the Hugging Face ecosystem is the de-facto standard for understanding what parameters exist in the broader generation-config space — `temperature`, `top_p`, `top_k`, `repetition_penalty`, `num_beams`, `length_penalty`, `do_sample`. Any provider's parameter set is a subset of this.
- **Leading today:** Hugging Face transformers `GenerationConfig` — `adoption-leading` for open-source local inference and the canonical reference for sampling parameter taxonomy, 2026.
- **Why it leads:** the broadest parameter coverage, the most thorough documentation, used as a teaching reference even by engineers who only call provider APIs (the parameter names match across the ecosystem).
- **Runner-up:** vLLM's sampling params — `innovation-leading` for high-throughput inference; similar parameter set with optimisations for batched decoding.

---

## Project exercises

### [B-reincodes-sampling-viz] Build the sampling visualizer

- **Exercise ID:** `[B-reincodes-sampling-viz]` — derived from the curriculum's "Interview prep surface — reincodes" entry and Phase 1 concept `[C1.3]` (Sampling parameters).
- **What to build:** a page at `/ai/sampling` that renders the same prompt run at five temperatures (0, 0.3, 0.7, 1.0, 1.4) in five parallel columns, with each column's output rendered as token chips appearing one at a time using reincodes' existing `delayLoop` animation pattern. A side-panel that follows the user's cursor shows the per-step top-5 candidates at that token position across all five temperatures, so the reader can see how the truncation and reshaping play out. The prompt is selectable from three precomputed examples (a classification prompt, a caption prompt, a creative prompt) to drive home that temperature appropriateness depends on the chain's job. Provider toggle (OpenAI/Anthropic) for cases where both are captured.
- **Why it earns its place:** the visualizer makes the *non-determinism source* observable — the reader sees, in one interaction, that the same prompt at T=0 produces the same output every time and at T=1.4 produces wildly different output. The "where does variance come from" question becomes answerable by pointing at the temperature column. The interview signal is that the candidate built a teaching artifact for the single most misunderstood LLM parameter.
- **Files to touch:** `src/app/ai/sampling/page.tsx` (visualizer page), `src/components/SamplingVisualizer/` (five-column renderer using `delayLoop`, distribution side-panel, prompt selector, provider toggle), `public/ai/sampling/example-runs.json` (precomputed traces with logprobs), `scripts/precompute-sampling.ts` (build-time script that calls OpenAI with `logprobs: true, top_logprobs: 5` for each (prompt, temperature) pair, writes JSON). Add a row to `src/components/Home/conceptsData.tsx`'s category list under a new `ai-engineering` category.
- **Done when:** the page loads at `/reincodes/ai/sampling/` in production (GitHub Pages), five columns animate token-by-token at the user's selected speed, side-panel updates correctly as the user hovers over token positions, `next build` passes under `output: "export"`. Build script runs against the actual OpenAI API locally and produces stable JSON. Mobile layout collapses the five columns into a scrollable strip without losing the comparison.
- **Estimated effort:** 2 days. Precompute script with logprobs: half day. Five-column renderer + delayLoop integration: half day. Distribution side-panel with hover state: half day. Prompt selector + provider toggle + mobile layout: half day.

---

## Summary

### Part 1 — concept recap

Sampling parameters are the levers that turn the model's emitted logit distribution into a chosen token. `temperature` divides the logits before softmax, sharpening (low T) or flattening (high T) the distribution; `top_p` (nucleus sampling) keeps the smallest set of tokens whose cumulative probability covers p; `top_k` is a hard cap on the candidate set. The choice of parameters is a design decision tied to the chain's job — classification wants `temperature=0` for reproducibility, natural-language generation wants `temperature=0.7 + top_p=0.9` for controlled variance, creative tasks want `temperature=1.0+` for full exploration. Even at `temperature=0`, provider-side jitter (batch effects, hardware non-determinism, server-side routing) introduces 1-3% variance, so "deterministic" is approximate. In this codebase the concept is *planned* rather than implemented: reincodes has no LLM surface, and the buildable target is a `/ai/sampling` visualizer that renders the same prompt across five temperatures with precomputed traces and a per-step top-5 side-panel.

### Part 2 — key points to remember

- **The pipeline order**: temperature scales the logits, then top_p / top_k truncate the candidate set, then the sampler draws one token. Applied in that order, every token, every call.
- **The job→parameter mapping**: T=0 for classification / extraction / structured output. T=0.7 + top_p=0.9 for production conversational. T=1.0+ for genuinely creative tasks. T fixed for eval reproducibility.
- **The non-determinism source**: sampling, not the model. The model's logits are reproducible; the draw from the distribution isn't (unless T=0, and even then there's residual jitter).
- **Top_p vs top_k**: top_p adapts to distribution confidence (keeps fewer tokens when the model is confident, more when it's uncertain); top_k is fixed. Top_p has largely supplanted top_k for natural-language generation.
- **The reincodes shape**: implementation is Case B; the buildable target is a five-temperature side-by-side visualizer under `/ai/sampling` with logprobs-driven per-step distribution side-panel.

---

## Interview defense

### What an interviewer is really asking

Behind "what does temperature do?" the interviewer is checking whether the candidate has shipped a chain whose temperature was wrong and felt the cost. A junior answer says "higher temperature is more creative." A senior answer names the mechanism (logit scaling before softmax), names the per-job defaults (T=0 for classification, T=0.7 for natural generation), and names a specific bug they shipped because they didn't think about it (the classifier with T=0.7 that produced 30% inconsistent classifications). The interviewer is checking for the operational framing because every team that ships LLM features at non-trivial volume hits the sampling-parameter regression at least once.

### Likely questions

**Q (mid):** What's the difference between temperature and top_p?

A: They operate on the distribution at different stages. Temperature *reshapes* the entire distribution — at low T the high-probability tokens get more weight, at high T the distribution flattens and rare tokens get more weight. Top_p *truncates* the candidate set — it sorts by probability and keeps the smallest set whose cumulative probability exceeds p. Temperature is about the *shape* of the distribution; top_p is about *which tokens* are in the candidate set. In practice they're used together: temperature sets the overall variance, top_p prevents the tail from being explored. T=0 makes top_p irrelevant (only one token survives). T=1.0 with top_p=0.9 is the canonical production combination for natural-language generation.

```
temperature                       top_p
─────────────────                ──────────────────
reshapes the distribution         truncates the candidates
T=0 → degenerate (argmax)         p=1.0 → no truncation
T=0.7 → moderate variance         p=0.9 → standard tail-guard
T=2.0 → flattened, exploratory    p=0.1 → aggressive truncation
applied first                     applied second
```

**Q (senior):** Why isn't `temperature=0` fully deterministic in production?

A: Three sources of jitter, all infrastructure-side. First, GPU floating-point non-associativity — `(a+b)+c ≠ a+(b+c)` for floats, and matrix multiplications batch operations in non-deterministic order for performance. Second, batch effects — the model serves multiple requests in a batch, and the position your request occupies in the batch affects the floating-point accumulation order. Third, server-side routing — providers route requests across model instances that may run slightly different binary versions (canary deployments, A/B tests). The result: even at T=0, expect ~1-3% variance in outputs across identical prompts. For eval reproducibility, pin the model version (`claude-sonnet-4-7-20260301`, not `claude-sonnet-4-7`), set T=0, and accept that residual variance is in the noise floor. You can't engineer it away from the application layer.

```
sources of T=0 jitter            mitigations
─────────────────────            ────────────────
FP non-associativity             accept ~1-3% variance
batch position effects           pin model version (full timestamp)
server-side routing              run evals N times, report median
                                 log temperature explicitly per call
```

**Q (arch):** At 10× the eval volume — running a 500-test golden set 20× per CI run — how does temperature show up in the eval architecture?

A: Two architectural decisions. First, the eval suite runs at T=0 with pinned model versions to keep run-to-run variance under 1% (the noise floor of provider jitter). Anything above that variance signals a real regression. Second, for chains whose production deployment uses T>0, the eval has to handle the variance — either by running N samples per test and reporting metrics like "P95 quality score across N=10 samples" or by using a separate "deterministic-mode" eval that runs at T=0 alongside the "production-mode" eval at production T. The deterministic eval catches model-version regressions; the production-mode eval catches sampling-induced quality drift. The CI gate is the deterministic version; the dashboard tracks both. At 500×20×10k = 100M tokens of evals per CI run, this is also a measurable cost line and the team has to decide whether the deterministic eval alone is enough to gate deployment, with the production-mode eval running nightly rather than per-PR.

```
eval layer 1: deterministic       eval layer 2: production-mode
─────────────────────────         ─────────────────────────────
T=0, pinned model version         T=production_value, pinned model
1 sample per test                 N=10 samples per test
gates PR merge                    runs nightly, reports trend
catches model-version regression  catches sampling-induced drift
~5 minutes runtime                ~50 minutes runtime
```

### The question candidates always dodge

**Q:** Why not just always use `temperature=1.0`? It's the default, the model was trained to be useful at that temperature, why second-guess the provider?

A: The default is a *generic* default, not a *your chain's* default. Provider defaults are calibrated for the broadest possible use case (a chat assistant for arbitrary user questions); your chain has a specific job, and the right temperature for that job is almost never the generic default. A classifier at T=1.0 is wrong because classification wants reproducibility; a creative-writing chain at T=0 is wrong because it'll produce the most likely (read: most generic) output every time. The cost ledger of "use the default everywhere":

```
defaults everywhere                   per-chain explicit choice
──────────────────────                ─────────────────────────
+ less code                           + more lines of config
+ "the provider knows best"           + each chain documented and reviewed
- classifier inconsistency            + classifier deterministic
- eval noise floor ~5-10%             + eval noise floor ~1-3%
- creative output stays generic       + creative variance is deliberate
- bug attribution is hard             + bugs trace to a specific config
```

The honest answer: "the default is fine" is a junior answer disguised as a pragmatic one. The senior move is naming the per-job parameter and defending it. Anthropic's own documentation discourages relying on the default temperature for production use cases — they encourage explicit choice. The candidate who defers to the default loses the architectural conversation.

### One-line anchors

- "Non-determinism is the sampler, not the model. The logits are reproducible; the sampling step isn't."
- "T=0 for classification, extraction, structured output. T=0.7 for natural generation. T=1.0+ for creative."
- "Top_p adapts to distribution confidence; top_k doesn't. For natural generation, top_p has supplanted top_k."
- "T=0 isn't fully deterministic — provider jitter introduces 1-3% variance. Pin the model version and accept the residual."
- "Sampling parameters are a design surface tied to the chain's job, not a knob to twist randomly."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw the sampling pipeline from memory: raw logits in, temperature scaling, top_p/top_k truncation, sample one token, append to sequence. Label which parameters are caller-controlled (all three) and which step the model is responsible for (the logits, not the sampling).

✓ Pass: pipeline ordered correctly, model boundary marked, all three parameters labelled with their effect
✗ Fail: re-read the primary diagram, wait 10 minutes, try again.

### Level 2 — Explain it out loud

Explain sampling parameters to a colleague who has called the OpenAI API but never set anything besides the prompt. No notes. Under 90 seconds.

Checkpoints — did you:
- Name the three parameters (temperature, top_p, top_k) and what each does?
- Map at least three parameter combinations to chain jobs (classification, conversational, creative)?
- Name one concrete bug parameter-blindness causes (the inconsistent classifier, the eval noise floor, the rare-token hallucination)?
- Reference the buildable target (`/ai/sampling` visualizer) as how you'd demonstrate the concept in reincodes?

If you skipped any: you described what the parameters are, you didn't argue for explicit per-job choice.

### Level 3 — Apply it to a new scenario

A teammate is building a "rephrase this in three different ways" feature. They're calling the same prompt three times back-to-back and getting nearly-identical outputs each time. They blame the prompt. Lay out the sampling-parameter diagnosis: why is the output repetitive, what parameters need to change, and what's the right combination to get genuine variance across the three calls while keeping the rephrasings coherent?

Write your answer (3–5 sentences minimum). Then check whether your proposed parameter set matches the constraints `00-overview.md` names for any planned AI feature in reincodes (static-export contract, precomputed corpus, no live LLM at request time).

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff from the Tradeoffs section. Answer in writing: "If I were starting the `/ai/sampling` visualizer today with the same constraints (static export, no live LLM, GH Pages deploy), would I still capture per-step top-5 logprobs for the side-panel? Why or why not? If I'd change the data model, what would I do instead — fewer temperatures? fewer prompts? top-3 instead of top-5? — and what would that cost in teaching value vs storage?"

Reference the actual code:
→ Point to `next.config.ts` L7 (`output: "export"`) to support the static-export constraint
→ Point to what would need to change if the visualizer ran live — `next.config.ts` loses `output: "export"`, deploy target shifts, API keys live somewhere

There is no right answer. The point is specificity.

### Quick check — code reference test

Without opening any files, answer:
- What file in reincodes controls the static-export contract that constrains how the visualizer ships?
- Which provider API exposes per-step token-level logprobs at the time of writing (2026)?
- What field in `conceptsData.tsx` would need a new entry to register the sampling visualizer in the home grid?

Then open the files and verify.

✓ Pass: `next.config.ts`, OpenAI chat completions (logprobs: true, top_logprobs: 5), `ConceptCategory[]` (the exported array)
✗ Fail on details: that's fine — the shape is what matters. File and library names should be recoverable.
