# LLM caching

**Industry name(s):** Prompt caching, semantic caching, response caching, LLM cache
**Type:** Industry standard

> Provider-side prompt caching (90% input-token discount on cache hits) is the load-bearing economic lever for production LLM features. Semantic caching (cache by query similarity) is the second tier; exact-match response caching is the third. Each earns its place at a different scale.

**See also:** → [../01-llm-foundations/06-token-economics](../01-llm-foundations/06-token-economics.md) · → [02-llm-cost-optimization](02-llm-cost-optimization.md) · → [../05-evals-and-observability/04-llm-observability](../05-evals-and-observability/04-llm-observability.md)

---

## Why care

### Move 1 — The grounded scenario

You ship an LLM feature that runs 1,000 times a day. Each call has a 2K-token system prompt and a 200-token user message; the response is 500 tokens. Per-call cost: ~$0.02 input + $0.0075 output = $0.0275. Daily cost: $27.50. Annual: ~$10K. The feature takes off, and traffic 100x's to 100K/day. Annual cost is suddenly $1M. You go looking for the cheapest knob.

### Move 2 — Name the question

That cheapest-knob question is *caching* — specifically, what fraction of your input tokens are *the same across calls*, and can you make the provider stop billing for them? Modern providers (Anthropic, OpenAI) cache the static prefix of your prompt for ~90% off on cache hits. If your 2K-token system prompt is identical across all 100K daily calls, you pay full price for it once per cache window (~5 min for Anthropic, longer for OpenAI), then 10% for every subsequent call. The annual cost question collapses from $1M to ~$150K.

### Move 3 — Why answering that question matters

**Why you need to answer that question at all:** because the input-output cost ratio in LLM pricing is 5-20x — input tokens are cheap per token, but you send a lot of them, so they dominate. Caching the static prefix is the single biggest cost optimization available without changing the model, the prompt, or the response quality. Every team I've seen ship a serious LLM feature has hit the same wall: linear cost scaling at $X/call × Y users/day eventually crosses the "we need to optimize" threshold. The teams that hit it first reach for caching first; the teams that don't are paying 10x more than they need to.

### Move 4 — Concrete before/after

Without caching:

- 100K calls/day × 2200 input tokens × $0.003/1K (Sonnet 4 input) = $660/day input
- + 100K × 500 output tokens × $0.015/1K = $750/day output
- = $1,410/day = ~$510K/year

With prompt caching (assume 95% cache hit rate on the 2K static prefix):

- Static prefix: 100K × 2000 × $0.0003/1K (cache hit, 90% off) = $60/day
- Variable input: 100K × 200 × $0.003/1K = $60/day
- Cache write: 5% × 100K × 2000 × $0.00375/1K (cache write, 25% premium) = $37.50/day
- Output: $750/day (unchanged)
- = $907.50/day = ~$331K/year

Annual savings: ~$180K. Same model, same prompt, same response quality.

### Move 5 — The one-line summary

LLM caching is HTTP keep-alive for prompts — instead of paying the full input cost on every call, you pay it once per cache window and rebill at 10% for hits. The full mechanics are below.

---

## How it works

### Move 1 — The mental model

Modern LLM providers cache the prefix of your prompt. The prefix has to be byte-identical across calls. Anything dynamic (the user message, retrieved context, conversation history) breaks the cache from that point onward — but everything up to the breakpoint stays cached.

```
prompt caching — what's cached vs what's billed full price

┌─────────────────────────────────────────────┐
│ STATIC PREFIX (cached, 90% discount on hit) │  ← system prompt
│   "You are X. Your job is Y. Rules:..."     │  + few-shot examples
│   <examples>                                 │
│     example 1: input → output                │
│     example 2: input → output                │
│   </examples>                                │
└─────────────────────────────────────────────┘
                  ▲
                  │ cache breakpoint
                  ▼
┌─────────────────────────────────────────────┐
│ DYNAMIC SUFFIX (billed full price)          │  ← context + user
│   <context>retrieved docs</context>          │
│   user: actual input                         │
└─────────────────────────────────────────────┘
```

### Move 2 — The layered walkthrough

#### Prompt caching (provider-side, the load-bearing layer)

The technical thing: Anthropic and OpenAI both offer prefix caching. Anthropic uses explicit `cache_control` markers; OpenAI caches automatically based on prompt prefix matching. The bridge from frontend: this is like browser HTTP cache — the URL is the cache key, anything that changes between calls misses the cache. Concrete consequence: keeping your static prefix at the front of the prompt (system + few-shot + tool definitions) and dynamic content at the back is the most important structural decision for caching. Concrete condition where it breaks: any edit to the system prompt invalidates all cached prefixes; a feature flag that injects content into the system prompt per-user defeats caching entirely.

```
cache hit vs miss — what triggers each

CACHE HIT:
  call N: system="X" + user="abc" → cache miss, pays full + write
  call N+1 (within 5 min): system="X" + user="xyz"
                          → first part hits cache, 90% off
                          → "xyz" billed normally

CACHE MISS:
  call N+1 with system="X (edited)" + user="xyz"
                          → prefix changed, fresh cache write
                          → full cost on the whole prefix

CACHE EXPIRATION:
  - Anthropic: ~5 min sliding TTL
  - OpenAI: longer, automatic LRU eviction
```

#### Semantic caching (app-side, the second tier)

The technical thing: cache responses by embedding-similarity rather than exact-match. Hash the embedding of the input; if a previous input's embedding is within 0.95 cosine similarity, return the cached response. The bridge from frontend: this is like a CDN that serves the same response for "essentially the same" requests. Concrete consequence: works for FAQ-shaped traffic where users ask "the same question in different words"; doesn't work for chains where the user message is highly variable or where freshness matters. Concrete condition where it breaks: the similarity threshold is high stakes — too tight and you miss cache opportunities, too loose and you serve wrong responses; calibrate against an eval set.

#### Exact-match response caching (third tier, narrow applicability)

The technical thing: hash the entire prompt (system + user + everything), store the response, return on exact-match. The bridge from frontend: this is HTTP cache with `Cache-Control: max-age` — same input, same output, no API call. Concrete consequence: useful for deterministic chains (low temperature) running over a fixed corpus where the same query repeats; useless for any chain with a unique user input or non-determinism in the response. Concrete condition where it breaks: any randomness or per-user personalization defeats it; combine with semantic caching to cover near-matches.

### Move 3 — The principle

The principle that generalises beyond any one provider: *what's static deserves to be cached; what's dynamic doesn't*. This is the same principle as edge caching, CDN behavior, browser HTTP cache, prepared statements, query caches. The LLM-side novelty is that the "request" is just a prompt string, so the caching is naturally structural — keep the static at the front, the dynamic at the back, and the cache works.

The full picture is below.

---

## LLM caching — diagram

```
┌─ App layer ───────────────────────────────────────────────────────┐
│                                                                   │
│   request ──► semantic cache lookup (embedding similarity)        │
│                  │                                                │
│                  ├─ HIT (0.95 sim) ──► return cached response     │
│                  │                       (zero API cost)           │
│                  └─ MISS ──► continue to provider                 │
│                                                                   │
└──────────────────────────────────│────────────────────────────────┘
                                   │
                                   ▼  prompt with cache_control markers
┌─ Provider layer (Anthropic / OpenAI) ─────────────────────────────┐
│                                                                   │
│   prompt prefix matching:                                         │
│     ┌─ static prefix ─┐    ┌─ dynamic suffix ─┐                   │
│     │ system + shots  │    │ context + user   │                   │
│     └─────────────────┘    └──────────────────┘                   │
│              │                       │                            │
│       cache lookup             always billed full                 │
│              │                                                    │
│        ┌─────┴─────┐                                              │
│        ▼           ▼                                              │
│      HIT          MISS                                            │
│   90% off    full + cache write                                   │
│   on prefix   (25% premium on first write)                        │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─ Response ────────────────────────────────────────────────────────┐
│   {                                                               │
│     "content": "...",                                             │
│     "usage": {                                                    │
│       "input_tokens": 200,           ← dynamic suffix             │
│       "cache_read_input_tokens": 2000, ← static prefix cached     │
│       "cache_creation_input_tokens": 0, ← no fresh write          │
│       "output_tokens": 500                                        │
│     }                                                             │
│   }                                                               │
└───────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼  optionally
┌─ App layer ───────────────────────────────────────────────────────┐
│   write response to semantic cache (keyed by embedding of input)  │
└───────────────────────────────────────────────────────────────────┘
```

The labeled bands separate app-side caching (semantic, optional) from provider-side caching (prompt, the load-bearing layer).

---

## In this codebase

**Not yet implemented.** reincodes is a Next.js static-export DSA visualizer with no LLM calls — there are no prompts to cache, no responses to deduplicate. The buildable target is below — a `/ai/llm-caching` visualizer that renders a stream of 100 precomputed requests against the same chain, toggles three cache modes (none / prompt-cache / semantic-cache), and shows cost-over-time + cache-hit-rate.

**Expected file paths** (when built):
- `src/app/ai/llm-caching/page.tsx`
- `src/components/CachingVisualizer/` — request stream, mode toggle, cost graph
- `public/ai/llm-caching/request-stream.json` — 100 precomputed (input, expected-cost-per-mode) entries

---

## Elaborate

### Where this pattern comes from

Prompt caching as a first-class provider feature arrived in 2024 (Anthropic was first with explicit cache_control markers; OpenAI followed with implicit prefix caching). Before that, "caching LLM responses" meant app-side semantic or exact-match caches, which had narrow applicability. The provider-side shift made caching default-on for any production chain with static prefixes.

### The deeper principle

The deeper principle: *cost optimization follows the same rules as performance optimization — measure before you cut, cache what's hot, leave what's cold alone*. LLM caching is the LLM-shaped expression of edge caching, prepared statements, and memoization. The novelty isn't the technique; it's the cost gradient (90% off on cache hits) that makes it economically load-bearing rather than a nice-to-have.

### Where this breaks down

Caching breaks down when the prompt is genuinely dynamic per user (personalized system prompts), when the cache TTL is shorter than the call interval (low-traffic chains don't accumulate hits), or when the static prefix is small enough that caching's overhead exceeds its savings (sub-500-token prefixes barely benefit). For those cases, the right answer is to skip caching and accept linear cost scaling.

### What to explore next

- [02-llm-cost-optimization](02-llm-cost-optimization.md) — the broader cost-optimization stack; caching is the first layer
- [../01-llm-foundations/06-token-economics](../01-llm-foundations/06-token-economics.md) — input/output cost math + why caching is the cheapest knob
- [../05-evals-and-observability/04-llm-observability](../05-evals-and-observability/04-llm-observability.md) — tracking `cache_read_input_tokens` as the operational metric

---

## Tradeoffs

### Comparison table

```
┌──────────────────┬──────────────────────┬─────────────────────────┐
│ Cost dimension   │ With prompt caching  │ No caching              │
├──────────────────┼──────────────────────┼─────────────────────────┤
│ Cost per call    │ 10-30% of full       │ 100% of full            │
│ Setup effort     │ Add cache_control    │ Zero                    │
│                  │ markers (1 line)     │                         │
│ Constraint       │ Static prefix MUST   │ None                    │
│                  │ be byte-identical    │                         │
│                  │ across calls         │                         │
│ Cache miss cost  │ 1.25x normal write   │ 1.0x normal             │
│                  │ on first call        │                         │
│ Cache TTL        │ ~5 min (Anthropic)   │ N/A                     │
│ Best hit rate    │ 90%+ for high-       │ N/A                     │
│                  │ traffic chains       │                         │
│ Worst hit rate   │ ~0% for chains       │ N/A                     │
│                  │ with per-user prefix │                         │
│ Maintenance      │ Watch for prompt     │ None                    │
│                  │ edits invalidating   │                         │
└──────────────────┴──────────────────────┴─────────────────────────┘
```

### What we gave up

Setup is cheap (one `cache_control` marker), but the *constraint* is real: anything that varies in the system prompt (a feature-flag-driven instruction, a per-user role, an A/B-tested phrasing) defeats the cache. The discipline of keeping the system prompt static across all calls becomes a maintenance norm — every PR that touches the system prompt invalidates all caches across all users for ~5 minutes after deploy.

### What the alternative would have cost

Skipping caching costs 5-10x more per call at scale. For a chain serving 100K/day, that's the difference between $30K/year and $300K/year (illustrative). The cost isn't visible at low traffic; it's invisible until the chain takes off, then it dominates the LLM budget.

### The breakpoint

Caching earns its place the day daily LLM cost crosses $50-100/day, OR the day the chain ships to production and won't be re-deployed frequently. Below that, the optimization complexity isn't worth the savings.

---

## Tech reference (industry pairing)

### Anthropic prompt caching

- **Codebase uses:** not yet — the visualizer's precompute would call Anthropic with explicit `cache_control` markers on the static prefix.
- **Why it's here:** Anthropic was first with explicit cache control and is the most-deployed provider for production LLM features in 2026.
- **Leading today:** Anthropic Messages API with `cache_control` — `adoption-leading` for explicit cache control, 2026.
- **Why it leads:** explicit markers give app developers control over what's cached; the `usage` field returns `cache_read_input_tokens` separately so cost analysis is trivial.
- **Runner-up:** OpenAI prompt caching — `adoption-leading` for automatic prefix matching; less explicit but works without marker placement.

### Semantic cache (Redis + vector similarity)

- **Codebase uses:** not yet — for the visualizer's semantic-cache mode, would use a precomputed embedding index of past requests.
- **Why it's here:** semantic caching is the app-side complement to provider-side prompt caching; catches FAQ-shaped repeat traffic that prompt caching alone misses.
- **Leading today:** Redis + Redisearch — `adoption-leading` for OSS semantic cache, 2026.
- **Why it leads:** Redis is everywhere; Redisearch adds vector similarity; combined latency is sub-10ms.
- **Runner-up:** Upstash Vector — `innovation-leading` serverless-native vector store with built-in semantic cache primitives.

### Zod

- **Codebase uses:** not yet — would define the request shape used as the semantic-cache key.
- **Why it's here:** typed inputs make the cache key derivation reliable; ad-hoc string concatenation drifts.
- **Leading today:** Zod — `adoption-leading` for TS schemas, 2026.
- **Why it leads:** ubiquitous in TS ecosystems, integrates with Anthropic + OpenAI SDKs.
- **Runner-up:** Valibot — `innovation-leading` smaller bundle.

---

## Project exercises

### [B-reincodes-llm-caching-viz] Build the LLM-caching visualizer

- **Exercise ID:** `[B-reincodes-llm-caching-viz]` — aligns with Phase 5 production-serving concepts in the curriculum.
- **What to build:** a page at `/ai/llm-caching` that renders a stream of 100 precomputed requests against the same chain. A mode toggle at the top swaps between no-cache, prompt-cache, and semantic-cache modes. A cost-over-time graph updates as the user steps through the stream; a hit-rate gauge shows cache effectiveness per mode. The pedagogical payoff: the reader sees the cost curve flatten dramatically when caching turns on.
- **Why it earns its place:** the visualizer makes the cost-gradient between modes *visceral* — a flat cost line vs a linearly-growing one, side by side.
- **Files to touch:** `src/app/ai/llm-caching/page.tsx`, `src/components/CachingVisualizer/`, `public/ai/llm-caching/request-stream.json`, `scripts/precompute-llm-caching.ts`. Register in `conceptsData.tsx` under `ai-engineering`.
- **Done when:** page loads, 100-request stream renders, mode toggle works, cost graph updates correctly per mode, hit-rate gauge accurate. `next build` passes under `output: "export"`.
- **Estimated effort:** 1–2 days.

---

## Summary

### Part 1 — concept recap

LLM caching is the technique of paying for input tokens *once per cache window* instead of once per call, by structuring prompts so the static prefix is byte-identical across calls and using provider-side prompt caching (Anthropic's `cache_control`, OpenAI's automatic prefix matching). The cache hit reduces input cost by ~90%; for chains where input dominates (long system prompt + few-shot + tool definitions, short user message), this is a 5-10x cost reduction at no quality cost. In reincodes this is Case B — no LLM calls exist — but the buildable target is a `/ai/llm-caching` visualizer that demonstrates the cost-curve flattening when caching turns on. The constraint is that the static prefix must be truly static; any feature flag or per-user injection into the system prompt defeats the cache.

### Part 2 — key points to remember

- **The shape**: static prefix at the front (cached), dynamic suffix at the back (always billed full).
- **The number**: 90% off on cache hits (Anthropic + OpenAI both). 25% premium on cache writes.
- **The constraint**: byte-identical prefix; any edit invalidates all cached versions.
- **The TTL**: ~5 minutes (Anthropic); longer for OpenAI's automatic mode.
- **The breakpoint**: ~$50-100/day total LLM cost. Below that, complexity exceeds savings.
- **The reincodes shape**: Case B; the `/ai/llm-caching` visualizer demonstrates the cost-flattening effect.

---

## Interview defense

### What an interviewer is really asking

Behind "how do you optimize LLM costs?" the interviewer is checking whether the candidate has shipped LLM features past launch week. Junior answer: "use a cheaper model." Senior answer: "prompt caching first (~90% off input), then model-tier routing (Haiku for easy cases, Sonnet for hard), then batch API for offline workloads."

### Likely questions

**Q (mid):** What's the difference between prompt caching, semantic caching, and exact-match caching?

A: Prompt caching is provider-side — the LLM provider stores the prefix of your prompt and reuses it on subsequent calls at ~10% the input cost. Semantic caching is app-side — you embed the user input and return a cached response if a similar past input is found. Exact-match caching is also app-side — hash the entire prompt, return the cached response on exact match. Use all three at different layers: prompt caching always (cheapest), semantic for FAQ-shaped traffic, exact-match for deterministic chains over fixed inputs.

```
caching layers

┌─ app-side ────────────────┐
│ exact-match → semantic    │  ← layered fallback
└──────────│────────────────┘
           ▼  miss
┌─ provider-side ───────────┐
│ prompt cache              │  ← 90% off input
└───────────────────────────┘
```

**Q (senior):** What invalidates a prompt cache, and how do you keep cache hit rate high?

A: Any edit to the cached prefix invalidates it. Static prefix means byte-identical: same system prompt, same few-shot examples, same tool definitions. Three things that silently invalidate the cache: (1) injecting per-user data into the system prompt (use the user message instead); (2) feature-flag-driven prompt edits (gate the edit behind a deploy, not behind a runtime flag); (3) timestamp interpolation in the prompt ("Today is {date}" defeats the cache every day). The mitigation is *cache hygiene as a code review item* — every PR touching a system prompt gets flagged for cache invalidation review.

```
cache invalidation sources

what invalidates              what doesn't
─────────────────────────     ─────────────────────────
edit system prompt            change user message
add feature flag → prompt     add retrieved context
inject {date}                 add conversation history
add per-user role             change tool args
add A/B variant               change response_format
```

**Q (arch):** At 10x scale (1M calls/day), what changes about caching strategy?

A: At 1M/day, prompt cache hit rates of 90%+ become load-bearing for the budget. Three things matter at that scale: (1) cache-write distribution — if cache writes pile up at deploy time (everyone hits a new cache miss simultaneously), you spike 5x cost for 5 minutes; mitigate with gradual deploys; (2) cache-warming for predictable traffic patterns — pre-call the cache before high-traffic windows so users hit warm caches; (3) per-tenant cache isolation — if you serve multiple customers, ensure tenant A's cached prefix doesn't leak to tenant B (different prompts per tenant means different cache keys, but verify).

```
at 10x scale: where caching breaks first

scale →   100/day      10K/day    1M/day
─────     ────────    ────────   ─────────
cost      $0.02/call  $0.02/call $0.02/call
yearly    ~$7K        ~$700K     ~$7M
caching   nice-to-    necessary  load-bearing
status    have                   (budget collapse without it)
```

### The question candidates always dodge

**Q:** What if your prompt changes frequently in development? Doesn't that defeat caching entirely during iteration?

A: Yes — during iteration, every prompt edit invalidates the cache, so the cost-savings of caching only kick in once the prompt is stable. The honest answer is that caching is a *production* optimization, not a *development* one. During iteration, you eat the full cost; once the chain ships and stops being edited frequently, caching kicks in. Teams that don't appreciate this gap see "we deployed caching but cost didn't drop" — because they're still iterating on the prompt. The mitigation is to treat the system prompt as a *deploy-gated artifact* (PRs reviewed for cache impact, deploys synced with cache-warming) once the chain is in production.

```
dev vs prod caching reality

dev (iterating):                  prod (stable):
  prompt edit every commit          prompt edit every quarter
  cache invalidated each time       cache hits 95%+
  full cost                         10-30% of full cost
  budget: small (dev usage)         budget: large (real users)
```

### One-line anchors

- "Static prefix at the front, dynamic suffix at the back. The cache lives in the prefix."
- "90% off input on cache hit. The single biggest LLM cost optimization at no quality cost."
- "Any feature flag that injects into the system prompt invalidates the cache. Move dynamic content to the user message."
- "Cache breakpoint is ~$50-100/day. Below that, complexity exceeds savings."
- "Semantic cache catches FAQ-shaped repeats; exact-match cache catches deterministic chains; prompt cache catches everything else."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw the static-prefix / dynamic-suffix model from memory. Label the cache hit and cache miss paths. Mark which provider parameter controls the cache.

### Level 2 — Explain it out loud

Explain LLM caching to a colleague about to ship a chain with a 3K-token system prompt and 100K daily calls but no caching. No notes. Under 90 seconds.

Checkpoints — did you:
- Name the 90% input discount?
- Name the static-prefix-at-front constraint?
- Name the 5-min TTL (Anthropic)?
- Name one thing that invalidates the cache?

### Level 3 — Apply it to a new scenario

A new chain lands: a daily-digest generator that takes a user's recent activity (variable per user, per day) and returns a one-paragraph summary. The system prompt is 1.5K tokens. The user input is ~500 tokens. The chain runs once per user per day for 10K users. Calculate the annual cost without caching, then with caching, then propose where to position the prompt sections for maximum cache benefit.

Write your answer. Then open `.aipe/study-ai-engineering/01-llm-foundations/06-token-economics.md` to verify the per-token cost math.

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff. Answer: "If I were building this visualizer, would I demonstrate only prompt caching, or all three caching layers? What does each add?"

### Quick check — code reference test

- What file in reincodes controls the static-export contract?
- What array in `conceptsData.tsx` registers the visualizer in the home grid?
- What JSON file carries the precomputed request stream?
