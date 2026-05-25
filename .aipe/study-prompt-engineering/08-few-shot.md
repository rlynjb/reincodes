# Few-shot prompting

**Industry name(s):** Few-shot prompting, in-context learning, exemplar-based prompting, n-shot prompting
**Type:** Industry standard

> The lever that constrains output more than any instruction can — three to five worked examples beats twenty mediocre ones, and the right example beats the right paragraph of instructions every time.

**See also:** → [01-anatomy](01-anatomy.md) · → [02-structured-outputs](02-structured-outputs.md) · → [04-token-budgeting](04-token-budgeting.md) · → [09-chain-of-thought](09-chain-of-thought.md)

---

## Why care

### Move 1 — The grounded scenario

You build a classifier chain that takes a journal entry and labels it as `todo`, `question`, `vent`, or `note`. The system prompt says "classify the entry into one of these four labels: todo, question, vent, note." The model starts producing labels you never asked for — `task` instead of `todo`, `feeling` instead of `vent`, `idea` instead of `note`. You add a stronger instruction: "respond ONLY with one of these four labels: todo, question, vent, note." The model still drifts — now it returns `todo` 90% of the time and `task` 10% of the time. You add a *negative* instruction: "do not respond with 'task' or 'feeling' or 'idea.'" The model produces `task` slightly less often. You're now four sprints in and the chain still misclassifies one in twenty entries with a label that isn't in your enum. The root cause is that you've been adding *instructions* when the lever you needed was *examples*.

### Move 2 — Name the question

That pattern has a name — *few-shot prompting*. The question this concept answers is *when do examples constrain output more than instructions, and how many examples is the right number*. Not "should the prompt have examples?" — that's the wrong framing. The right framing is "for this specific chain shape (classifier, extractor, format-sensitive generator), is the constraining job better done by instructions or by exemplars?" The answer for most production chains is *exemplars first, instructions second* — the opposite of how most people start.

### Move 3 — Why answering that question matters

**Why you need to answer that question at all:** because the gap between "the chain works fine in my five test cases" and "the chain works fine in production traffic" is, more often than not, the absence of few-shot examples. I have tuned classifier prompts dozens of times. The pattern is consistent: adding a fourth instruction barely moves the needle; adding the *third example* moves it more than the previous nine instructions combined. The mechanism isn't mysterious — language models are pattern matchers; you've given them three patterns to match against. Three concrete patterns beat any number of abstract instructions because the patterns *are* the rule the model is supposed to follow.

### Move 4 — Concrete before/after

Without few-shot:

- System prompt: "Classify the entry as one of: todo, question, vent, note. Respond ONLY with the label. Do not respond with 'task', 'feeling', 'idea', or any other word."
- Model outputs: `todo` (90%), `task` (5%), `feeling` (3%), other (2%)
- Iteration loop: add more instructions, watch the drift continue, add negative instructions, watch the drift continue
- Time spent: 2 weeks of prompt edits with marginal improvement
- Final accuracy: ~92% (long tail of drift labels)

With few-shot:

- System prompt: "Classify the entry as one of: todo, question, vent, note. Respond ONLY with the label."
- Few-shot examples (3-5 worked pairs):
  - Input: "buy milk" → Output: `todo`
  - Input: "why am I tired" → Output: `question`
  - Input: "i hate mondays" → Output: `vent`
  - Input: "interesting podcast about sleep" → Output: `note`
- Model outputs: `todo` (98%), `question` (1%), other (1%)
- Iteration loop: when an edge case fails, add it as an example
- Time spent: half an afternoon
- Final accuracy: ~99% (drift labels nearly eliminated)

### Move 5 — The one-line summary

Few-shot prompting is the practice of giving the model 3-5 worked input/output pairs as part of the prompt; examples constrain output more strongly than instructions because the model is pattern-matching against the examples rather than parsing the instructions for intent. Analogous to how a React component's prop-type definition constrains usage more than a paragraph of documentation in a README. The full mechanics are below.

---

## How it works

### Move 1 — The mental model

A language model is a pattern matcher first and an instruction-follower second. When you give it three examples in the prompt, you've given it three patterns; it will match the next input against the closest of those patterns and produce an output shaped like that pattern's output. When you give it only instructions, you've asked it to parse English and infer the rule — a strictly harder problem with more failure modes (ambiguity, model interpretation drift, edge cases the instruction didn't anticipate).

The strategy: use examples to define the *shape* of the right answer; use instructions for the *role* and the *meta-rules*. The instructions tell the model what kind of work it's doing; the examples show it what the work looks like.

```
instructions-only           few-shot-augmented
─────────────────           ──────────────────

system: "Classify as          system: "Classify as
         one of: A, B, C.              one of: A, B, C."
         Respond ONLY with             
         the label. Do NOT             examples:
         use other labels.               input: "..."  → A
         Do NOT add prose.               input: "..."  → B
         Do NOT explain."                input: "..."  → C
                                       
user: <new input>             user: <new input>

model: parses English         model: pattern-matches
       instructions, infers          against examples,
       the rule, sometimes           produces same shape
       drifts to "feeling"
       or "task"
```

### Move 2 — The layered walkthrough

#### Why examples constrain more than instructions

The technical thing: language models are trained on text where examples *follow patterns* and instructions *describe patterns*. The model is better at the former than the latter because the former is the more common training signal — most of the model's training data contains worked examples (Q&A pairs, before/after code, prompt/response transcripts) rather than abstract rule descriptions. Bridge from frontend: this is the same reason TypeScript generics are easier to learn from `Array<string>` than from the spec text — the example carries the constraint more efficiently than the description. Concrete consequence: when an instruction-only chain drifts, the fix that works is usually adding an example that includes the edge case, not adding a stronger instruction prohibiting the drift.

```
how the model uses examples vs instructions

 instruction:  "Respond with one of: todo, question, vent, note."
               ↓
               model interprets: "OK, the output is a label.
                                  What labels did the training
                                  data use for similar inputs?
                                  Maybe 'task'? Maybe 'feeling'?"

 examples:     buy milk         → todo
               why am I tired   → question
               i hate mondays   → vent
               ↓
               model interprets: "The pattern is: short input,
                                  one-word lowercase label,
                                  drawn from this specific set.
                                  Next input → match this pattern."
```

#### When to use few-shot (vs when not)

The technical thing: few-shot is the right tool for *format-sensitive* and *enumeration-bounded* chains — classifiers, structured extractors, format-constrained generators (chain-of-thought scratchpads with a specific shape, JSON outputs with specific field naming). It's the *wrong* tool for *open-ended generation* — long-form summaries, creative writing, exploratory chains where the variety of acceptable outputs is too large to enumerate with 3-5 examples. Bridge from frontend: this is the same intuition as choosing between an enum prop (`type Status = 'idle' | 'loading' | 'error'`) and a free-form string prop. Concrete consequence: when you're deciding whether to add few-shot to a chain, ask "how many distinct output shapes are valid?" If it's a small number, few-shot wins; if it's a large number, few-shot wastes tokens for marginal benefit and may even bias the model toward producing outputs that look like the examples rather than the actual best response.

```
few-shot decision tree

  How many distinct output shapes are valid?
    ↓
  Small (≤ 10)                      Large (open-ended)
    ↓                                 ↓
  USE few-shot                      SKIP few-shot
  - 3-5 examples covering           - examples bias the model
    the output space                  toward example-like outputs
  - examples ARE the rule           - waste of context tokens
  - cheaper than instructions       - instructions + rubric
    at constraining drift             work better here
```

#### The 3-5 rule

The technical thing: the empirical sweet spot for few-shot examples in production classifiers is 3-5. Below 3, the model doesn't have enough patterns to generalize (or it overfits to the one or two examples). Above 5, you hit diminishing returns — the sixth example rarely adds signal, but it does add ~50-200 tokens of context budget per call. The literature here is consistent (the original GPT-3 few-shot paper, Brown et al. 2020; multiple follow-up studies; OpenAI's cookbook recommendations). Concrete consequence: design the example set as a careful three-to-five, not a careless ten-to-twenty. The first three should cover the most common output shapes; the fourth and fifth should cover known edge cases.

```
n-shot returns chart (qualitative)

  n=0   |               base rate, model guesses
  n=1   | ▓              one-shot, brittle
  n=2   | ▓▓             two-shot, still narrow
  n=3   | ▓▓▓▓▓          THE INFLECTION — model
                          generalizes from 3 patterns
  n=4   | ▓▓▓▓▓▓         marginal improvement
  n=5   | ▓▓▓▓▓▓▓        marginal improvement, last
                          real signal for most chains
  n=6   | ▓▓▓▓▓▓▓        no improvement; tokens wasted
  n=10  | ▓▓▓▓▓▓▓        no improvement; 200-500 extra
                          tokens of context per call
  n=20  | ▓▓▓▓▓▓░        often DEGRADES — model
                          starts treating the example
                          set as the entire enum,
                          ignoring novel valid outputs
```

#### Three good examples vs twenty mediocre ones

The technical thing: example *quality* matters more than example *quantity*. Three carefully chosen examples that cover (a) the most common case, (b) a tricky edge case, and (c) the negative space (an input that *isn't* a positive case but looks like one) constrain the model far better than twenty randomly selected examples. The selection criterion is *coverage of the decision boundary*, not coverage of the input space. Bridge from frontend: this is the same intuition as choosing test cases — you don't write twenty tests for the happy path and zero for the edge cases; you write three for the happy path and seven for the edges. Concrete consequence: build the example set by enumerating the decision boundaries the chain has to handle, then pick one example per boundary.

```
example-set design — coverage of decision boundary, not input space

  Common case:        input: "buy milk"         → todo
  ─────────────────────────────────────────────────────
  Edge: vent that     input: "i hate that I    → vent
       reads like           keep forgetting           (NOT todo, even
       a todo               to buy milk"                though it mentions
                                                       a todo)
  ─────────────────────────────────────────────────────
  Edge: question      input: "why am I always   → question
       in vent voice        so tired"                 (NOT vent, even
                                                       though the tone is
                                                       venty)
```

#### The interaction with structured output

The technical thing: when the chain is using structured-output mode (JSON Schema, tool calls), the few-shot examples should themselves be in the structured form — show the model the exact JSON shape it should produce, not a free-text approximation. This is doubly important because structured-output mode at the API level already constrains the output shape; the few-shot examples reinforce *which values* should appear in which fields. Bridge from frontend: this is the same as Storybook stories — the stories show the component in its actual rendered state, not in a description of its rendered state. Concrete consequence: format the few-shot examples as actual JSON blocks (or actual tool-call signatures) matching the chain's declared schema, not as English descriptions of what the output should contain.

```
structured-output few-shot — show the JSON shape directly

  ✗ wrong: free-text description
    Example: when the input is "buy milk", classify as todo.
    Example: when the input is "i hate mondays", classify as vent.

  ✓ right: structured JSON matching the schema
    Example:
      Input: "buy milk"
      Output: {"label": "todo"}
    Example:
      Input: "i hate mondays"
      Output: {"label": "vent"}
```

#### The cost: examples consume context tokens

The technical thing: every example sits in the chain's prefix and consumes context tokens on every call. A 5-shot classifier might add 100-300 tokens of context per call (depending on the examples' length and the model's tokenizer). At 1000 calls/day, that's 100-300k tokens of extra context per day. The good news: those tokens sit in the chain's *static prefix*, which means they're eligible for prompt caching at most major providers (Anthropic, OpenAI). The cached prefix typically costs 10-25% of the uncached rate. Concrete consequence: few-shot examples are *cheap when cached, expensive when not*. The prompt structure (static prefix containing system + few-shot, dynamic suffix containing user input) is load-bearing for the caching to work; mixing per-call data into the example block kills the cache.

### Move 3 — The principle

The principle that generalises beyond LLM chains: *show, don't tell, scales better than tell, don't show*. This is the same principle as code examples in documentation, screenshots in design specs, demo videos in product launches. Language is high-bandwidth for humans and low-bandwidth for instruction-following; examples are the inverse. The day you stop trying to write a perfect instruction and start curating a perfect example set is the day your classifier accuracy goes from 92% to 99%. Few-shot isn't a clever trick; it's the load-bearing teaching mechanism for any chain where the output space is small enough to enumerate.

The full picture is below.

---

## Few-shot prompting — diagram

```
┌─ The chain's prompt anatomy with few-shot ────────────────────────────┐
│                                                                       │
│   ┌──────────────────────────────────────────────┐                    │
│   │ SYSTEM PROMPT                                │  ← constant per   │
│   │  Role:   "You are a tag classifier."         │    chain          │
│   │  Task:   "Classify the entry as one of:      │                    │
│   │           todo, question, vent, note."       │                    │
│   │  Output: "Respond with JSON: {label}."       │                    │
│   └──────────────────────────────────────────────┘                    │
│                                                                       │
│   ┌──────────────────────────────────────────────┐                    │
│   │ FEW-SHOT EXAMPLES (3-5 pairs)                │  ← constant per   │
│   │                                              │    chain          │
│   │  Example 1 (most common case):               │                    │
│   │    Input:  "buy milk"                        │  ← these THREE    │
│   │    Output: {"label": "todo"}                 │    examples ARE   │
│   │                                              │    the rule the   │
│   │  Example 2 (edge: question voice):           │    model follows  │
│   │    Input:  "why am I tired"                  │                    │
│   │    Output: {"label": "question"}             │  cached as part   │
│   │                                              │  of the prefix    │
│   │  Example 3 (edge: vent voice):               │  (~80% cost       │
│   │    Input:  "i hate mondays"                  │   reduction at    │
│   │    Output: {"label": "vent"}                 │   1000+ calls/day) │
│   │                                              │                    │
│   │  Example 4 (negative: vent that mentions    │                    │
│   │             a todo, but isn't a todo):       │                    │
│   │    Input:  "i hate that i keep forgetting   │                    │
│   │             to buy milk"                     │                    │
│   │    Output: {"label": "vent"}                 │                    │
│   └──────────────────────────────────────────────┘                    │
│                                                                       │
│   ┌──────────────────────────────────────────────┐                    │
│   │ USER MESSAGE (the new input)                 │  ← per-call       │
│   │                                              │                    │
│   │  Input: "what should I have for dinner"      │                    │
│   └──────────────────────────────────────────────┘                    │
│                                                                       │
│   model output: {"label": "question"}                                 │
│   (pattern-matched against example 2's shape)                         │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘

  The example set IS the rule. The instructions name the role and the
  schema; the examples define what the rule looks like in action.
```

The boundary between the system+few-shot prefix (constant per chain) and the user message (per-call) is what makes the prompt cacheable. Few-shot examples that move into the user message kill the cache hit; few-shot examples that stay in the prefix are essentially free at scale.

---

## In this codebase

**Not yet implemented.** reincodes is a Next.js static-export DSA visualizer with no AI surface in production code — there are zero classifier chains in the repo and therefore no few-shot example sets to tune. The buildable target for this concept is below in Project exercises — a `/ai/few-shot` page that renders a classifier prompt with a slider for `n = 0, 1, 3, 5, 10` examples and lets the reader watch how output consistency changes as more examples are added, against precomputed outputs at each example count.

**Expected file paths** (when built):
- `src/app/ai/few-shot/page.tsx` — the visualizer page
- `src/components/FewShotVisualizer/` — example-count slider, classifier prompt display, expandable example chips, output-consistency chart
- `public/ai/few-shot/scenarios.json` — precomputed outputs at each example count (0, 1, 3, 5, 10) for the same 20 test inputs, showing the consistency curve
- `scripts/precompute-few-shot.ts` — build-time script that runs the same 20 inputs through Claude with each of the 5 example-count configurations and captures the outputs

---

## Elaborate

### Where this pattern comes from

Few-shot prompting was the canonical demonstration of in-context learning in the original GPT-3 paper (Brown et al., 2020, "Language Models are Few-Shot Learners"). The paper showed that giving the model 3-32 examples in the prompt dramatically improved performance on tasks the model had never been explicitly trained on. The phrase "few-shot" entered the practitioner vocabulary almost immediately and has remained the standard term. The 3-5 sweet spot crystallized over 2021-2023 as production teams hit the diminishing-returns curve at scale — every cookbook, every blog post, and every internal style guide at LLM-shipping companies converged on the same recommendation. The modern caveat is that some frontier models (Sonnet 4+, GPT-5) have internalized common task patterns deeply enough that 0-shot performance has improved, which has narrowed but not eliminated the few-shot benefit.

### The deeper principle

The deeper principle is that *demonstrative teaching beats descriptive teaching for pattern-matching systems*. Language models pattern-match; humans pattern-match too. The same reason a developer learns a new library faster from a working code example than from the prose API documentation is the reason an LLM produces better-formatted output from a few-shot example than from a careful instruction. Both are pattern-matchers; both reach for analogy first and inference second. Few-shot prompting is the LLM-native version of "show, don't tell," and it's the most reliable lever in the prompt-engineering toolkit because it operates at the level the model is best at.

### Where this breaks down

The pattern breaks down in three places. First, *open-ended generation* — for chains that produce long-form text (summaries, explanations, creative writing), few-shot examples bias the model toward producing outputs that look like the examples, which is exactly the wrong shape when you want variety. Use a rubric or evaluator instead. Second, *very large output spaces* — for chains where the valid outputs are too numerous to enumerate with 3-5 examples (e.g., "name a relevant academic paper"), few-shot examples *constrain* the model to the small set of papers shown in the examples rather than the broader space of valid answers. Use instructions + retrieval instead. Third, *interactive multi-turn agents* — for chains where the "input" is a growing conversation transcript, few-shot examples in the system prompt can conflict with the actual conversation; the agent loop framing is the right shape there, not the few-shot framing.

### What to explore next

- [01-anatomy](01-anatomy.md) → few-shot examples are one of the four named sections of a production prompt; they have their own slot in the anatomy
- [02-structured-outputs](02-structured-outputs.md) → few-shot examples should match the structured-output schema exactly; they reinforce the schema at the prompt level
- [04-token-budgeting](04-token-budgeting.md) → few-shot examples consume context tokens on every call; budget allocation determines how many examples you can afford
- [09-chain-of-thought](09-chain-of-thought.md) → CoT often uses few-shot examples that include the reasoning steps; the interaction between the two patterns is load-bearing for both

---

## Tradeoffs

### Comparison table — both costs in one frame

```
┌──────────────────┬──────────────────────────┬─────────────────────────┐
│ Cost dimension   │ Path taken               │ Alternative             │
│                  │ (few-shot 3-5 examples)  │ (instructions only)     │
├──────────────────┼──────────────────────────┼─────────────────────────┤
│ Build time       │ Curate 3-5 good examples │ Iterate on instruction  │
│                  │ (half day)               │ wording (1-2 weeks)     │
│ Tokens per call  │ +100-300 prefix tokens   │ +20-80 instruction      │
│                  │ (cached at ~25% rate)    │ tokens (cached same)    │
│ Drift labels     │ ~1% of calls             │ ~5-10% of calls         │
│ Iteration loop   │ "edge case fails →       │ "edge case fails → add  │
│                  │  add an example"         │  another instruction"   │
│ Iteration speed  │ Half day per edge case   │ Days per edge case      │
│                  │ found                    │ found (instruction      │
│                  │                          │ interactions are        │
│                  │                          │ unpredictable)          │
│ Cache hit benefit│ Higher absolute savings  │ Lower absolute savings  │
│                  │ (more tokens cached)     │ (less to cache)         │
│ Onboarding cost  │ New contributor reads    │ New contributor reads   │
│                  │ examples — instantly     │ instructions — slower   │
│                  │ sees the rule            │ to grok the rule        │
│ Bias risk        │ Examples bias toward     │ Instructions don't bias │
│                  │ example-like outputs     │ in this direction       │
│                  │ (cost when output space  │                         │
│                  │ is genuinely open-ended) │                         │
└──────────────────┴──────────────────────────┴─────────────────────────┘
```

### What we gave up (when planning the reincodes visualizer)

The first cost is *the precompute matrix is wider than the other visualizers*. To show the consistency curve, the precompute script needs to run the same 20 inputs through *five different configurations* of the chain (n=0, 1, 3, 5, 10). That's 100 LLM calls per regeneration of the corpus, which at Haiku rates is ~$0.10 and at Sonnet rates is ~$1.00. Negligible in absolute terms, but it means the precompute step takes 2-3 minutes per run (rate limits + sequential calls) and the regeneration loop is slower than for the simpler visualizers. The mitigation is to commit the JSON once and only regenerate when the example set changes or when a model upgrade lands.

The second cost is *the example-chip interaction surface*. Each example in the few-shot block needs to be expandable (click to see the full input/output pair) and labeled with its role in the example set (common case, edge case, negative case). That's a per-example component with at least three states (collapsed chip, expanded card, hover label) and a small layout problem (the example set has to fit alongside the input/output panel without crowding). The component is roughly the same complexity as the existing `ArrayVisualizer` but in a different shape.

The third cost is *the consistency-chart rendering*. The page's headline interaction is "watch how output consistency changes as n goes from 0 to 10." That's a chart — a small bar chart or line plot showing some consistency metric (e.g., percent of outputs matching a reference answer) at each example count. reincodes currently has *no chart components*; every existing visualizer uses bespoke SVG. Building the first chart component sets up a precedent for the other planned `/ai/*` visualizers but also costs the first-mover tax. Either we hand-roll a small d3 chart (consistent with `NetworkDiagram`) or we ship a tiny self-contained SVG chart inline in the visualizer component.

### What the alternative would have cost (skipping the visualizer)

If reincodes never builds the few-shot visualizer, the cost is zero in this codebase. The pattern still gets exercised in loopd's intent classifier (per the curriculum, with B1.7 explicitly naming the example sets in aipe's templates) and the discipline still gets named in this written guide.

The cost of *not* building it shows up in the portfolio story: the n=3 inflection point is one of the most empirically validated findings in prompt engineering, and most candidates can quote the rule ("3-5 examples is the sweet spot") without having *seen* the inflection curve. The visualizer is the only way to render the curve at interaction-time — drag the slider, watch the chart redraw. Until the candidate is preparing for an interview that probes "show me what you've actually measured about prompt engineering," the visualizer's value-add over the written guide is modest.

### The breakpoint

The visualizer earns its place the day the candidate is preparing for an AI-focused interview and the interview includes "tell me about the empirical relationships you've measured in prompt engineering." The visualizer becomes the demo answer: "here's the n-shot consistency curve for a real classifier — drag the slider, watch the inflection at n=3. I built this to teach the pattern; let me walk you through what the examples cover." Until that interview pressure exists, the buildable target stays in the backlog. The breakpoint is event-shaped, not quantitative.

### What wasn't actually a tradeoff

Live LLM calls in the visualizer were not a real option. The static-export contract (`output: "export"`) is load-bearing — adding a live API would mean leaving GitHub Pages, configuring secrets, paying for compute, and serializing 100 calls per regeneration would either time out the request or force a queue. Precomputing the per-configuration outputs is the only path compatible with the deploy story, and it's also pedagogically better because the same 20 inputs are run consistently across all configurations (no variance from per-session model behavior).

---

## Tech reference (industry pairing)

### Anthropic Messages API (with prompt caching)

- **Codebase uses:** not yet — the planned `/ai/few-shot` visualizer would use Claude as the precompute target. The classifier prompt is structured so that the system + few-shot examples form a stable cacheable prefix, and the per-input user message is the only varying part. The precompute script would benefit from cache hits across the 20 inputs at each example-count configuration.
- **Why it's here:** Anthropic's prompt caching API (released 2024, mature in 2026) is the financial argument for putting few-shot examples in the static prefix rather than the user message — cached tokens cost ~25% of uncached tokens. The visualizer's framing leans on the cacheable-prefix architecture.
- **Leading today:** Anthropic Messages API with prompt caching — `adoption-leading` for cacheable-prefix architectures, 2026.
- **Why it leads:** explicit cache control via `cache_control` blocks lets the chain author mark which parts of the prompt should be cached; the cache TTL (5 minutes default) is long enough for batched precompute runs to benefit; the cost reduction is real and well-documented.
- **Runner-up:** OpenAI prompt caching — `adoption-leading` in raw deployments; automatic for static prefixes longer than 1024 tokens, no manual cache control; slightly less flexible but works for the same shape.

### Hamel Husain on evals (blog + course)

- **Codebase uses:** not yet — the precompute script's structure (run the same 20 inputs through each configuration, capture outputs for consistency measurement) is essentially a small eval harness. Hamel's writing on eval-driven development is the canonical reference for *why* the consistency curve is the right measurement to surface.
- **Why it's here:** the few-shot decision (3 vs 5 examples) is exactly the kind of decision Hamel's "always have an eval set" discipline answers — without the eval set, you're guessing whether the 4th example helped; with the eval set, you can see the marginal improvement and decide. The visualizer's consistency chart is the in-browser version of that eval harness.
- **Leading today:** Hamel Husain's blog + course — `adoption-leading` for production eval discipline, 2026.
- **Why it leads:** Hamel writes from production experience at multiple companies; the framing of "the eval is the data, not the prompt" maps directly to the few-shot decision (the eval tells you whether the example set is good; the example set is then a function of the eval).
- **Runner-up:** OpenAI's Evals framework, LangSmith's eval harness — `innovation-leading` infrastructure; for a precompute-time eval in a static-export site, neither is needed — a small TypeScript script does the same job.

### tiktoken (or Anthropic's tokenizer)

- **Codebase uses:** not yet — the visualizer's "tokens per call" panel would use the appropriate tokenizer to count the prefix tokens at each example-count configuration, showing the reader that adding a sixth example costs ~50 tokens and rarely earns its place. The reincodes tokenization visualizer (planned in `01-tokenization.md` of the study-prep guide) already considers a WASM tokenizer for in-browser use; the few-shot visualizer would reuse the same dependency.
- **Why it's here:** the cost argument for the 3-5 sweet spot is a token-count argument — "the 6th example costs X tokens and earns Y consistency improvement." Without a tokenizer, the cost argument is hand-wavy.
- **Leading today:** tiktoken (for OpenAI models), Anthropic's tokenizer (for Claude) — `adoption-leading` for in-browser token counting, 2026.
- **Why it leads:** both have WASM builds suitable for static-export environments; both are accurate to the byte for their target model families.
- **Runner-up:** `gpt-tokenizer` (a pure-JS reimplementation) — `innovation-leading` lighter-weight tokenizer if WASM bundle size becomes prohibitive; less accurate for some edge cases but fine for the visualizer's "count tokens in the prefix" use case.

---

## Project exercises

### [B-reincodes-few-shot-viz] Build the few-shot visualizer

- **Exercise ID:** `[B-reincodes-few-shot-viz]` — derived from the curriculum's reincodes "interview prep surface" entry; aligns with Phase 1 concepts `[C1.4]` (structured outputs — example sets are part of the structured-output discipline) and `[C1.7]` (prompt engineering as a discipline). Lives in the `ai-engineering` category planned in `src/components/Home/conceptsData.tsx`.
- **What to build:** a page at `/ai/few-shot` that renders a classifier prompt with a slider for n (0, 1, 3, 5, 10 examples). Above the slider, the prompt is displayed with the system message, the n example chips, and a user-message input box. Each example chip is clickable and expands to show the full input/output pair. Below the slider, a small bar chart shows the "consistency score" at each n (precomputed against 20 test inputs). To the right, a panel shows the model output for the currently-selected input at the current n. The reader sees, in one interaction, *why* 3 is the inflection point — drag the slider from 0 to 3, watch the consistency score jump from ~70% to ~95%; drag from 3 to 10, watch the score stay nearly flat. A separate "tokens per call" panel updates with each slider position, showing the cost-to-quality tradeoff as the example set grows.
- **Why it earns its place:** the visualizer makes the empirical inflection point *visible*. Most teaching of few-shot describes "3-5 is the sweet spot" without showing the curve; this page lets the reader see the curve, see the diminishing returns, and see the token cost — and decide for themselves where the sweet spot is for the example shape shown. The interview signal is that the candidate built a tool that demonstrates one of the most empirically validated findings in prompt engineering as an interactive chart.
- **Files to touch:** `src/app/ai/few-shot/page.tsx` (visualizer page), `src/components/FewShotVisualizer/` (slider + prompt display + example chips + consistency chart + tokens panel), `public/ai/few-shot/scenarios.json` (precomputed outputs for 20 test inputs at each of n=0, 1, 3, 5, 10 — 100 LLM calls captured), `scripts/precompute-few-shot.ts` (build-time script that runs Claude with each configuration and captures outputs + consistency-against-reference scores). Add a row to `src/components/Home/conceptsData.tsx`'s `CONCEPT_CATEGORIES` under the new `ai-engineering` category.
- **Done when:** the page loads at `/reincodes/ai/few-shot/` in production (GitHub Pages), the slider snaps to the 5 example counts (0, 1, 3, 5, 10), the consistency chart updates without a network call, example chips expand on click, the tokens-per-call panel reflects the current example count. `next build` passes under `output: "export"`. Precompute script runs successfully against the actual Anthropic API locally (100 calls × Haiku), captures real outputs and consistency scores, commits the JSON.
- **Estimated effort:** 2 days. Precompute script + scenarios JSON: half day (the 100-call run is the long part). Page + visualizer component including the slider, the consistency chart (first chart component in the codebase), and the tokens panel: full day. Polish + the expandable example chips + the cross-browser snap-to-position slider: half day.

---

## Summary

### Part 1 — concept recap

Few-shot prompting is the practice of giving the model 3-5 worked input/output pairs as part of the prompt; examples constrain output more strongly than instructions because the model is pattern-matching against the examples rather than parsing the instructions for intent. The 3-5 sweet spot is the empirical inflection — below 3 the model doesn't generalize; above 5 the marginal benefit flattens while context cost continues to climb. Few-shot is the right tool for classifiers, structured extractors, and format-sensitive generators (small enumerable output spaces); it's the wrong tool for open-ended generation (large output spaces, where examples bias the model toward example-like outputs). In structured-output mode, few-shot examples should match the schema exactly — show the JSON shape directly, not an English description. In this codebase the pattern is *planned* rather than implemented: reincodes has no AI surface in production code, and the buildable target is a `/ai/few-shot` visualizer with a slider for example count and a consistency chart, demonstrating the n=3 inflection point as an interactive event. The constraint that makes the visualizer the right shape here is the static-export contract — live LLM calls would require leaving GitHub Pages, so precomputing the 20-input × 5-configuration matrix at build time is the only path compatible with the deploy story.

### Part 2 — key points to remember

- **Examples > instructions**: language models are pattern-matchers; three examples beat any number of instructions at constraining output shape.
- **3-5 is the sweet spot**: below 3, the model doesn't generalize; above 5, marginal returns flatten while token cost climbs. This is empirically validated across the prompt-engineering literature.
- **Quality > quantity**: three carefully chosen examples covering the decision boundary (common case, edge case, negative case) beat twenty randomly selected examples covering the input space.
- **Match the schema**: in structured-output mode, format examples as actual JSON matching the chain's schema — not as English descriptions of what the output should contain.
- **Keep examples in the static prefix**: examples that sit in the chain's stable prefix get prompt-cached at ~25% of the uncached rate. Examples that move into the user message kill the cache hit.
- **The reincodes shape**: implementation is Case B; the buildable target is a precomputed visualizer under `/ai/few-shot` with a slider for n and a consistency chart, demonstrating the inflection point as an interactive event.

---

## Interview defense

### What an interviewer is really asking

Behind "how do you decide how many examples to include in a prompt?" the interviewer is probing whether the candidate has tuned classifier prompts enough times to have hit the 3-5 inflection point empirically. A junior answer quotes the rule ("3-5 is standard"). A senior answer describes the *iteration loop* and the *failure modes* ("I add the first three examples covering the common case and two edge cases; if the chain still drifts, I add a fourth covering the specific edge that drifted; I rarely go past five because at six the consistency curve flattens and the token cost keeps climbing"). The interviewer is checking whether the candidate distinguishes the *number* (3-5) from the *selection criterion* (decision boundary coverage, not input space coverage).

### Likely questions

**Q (mid):** When would you use few-shot vs just instructions?

A: Few-shot wins for chains with small enumerable output spaces — classifiers, structured extractors, format-sensitive generators. The mechanism is that examples constrain output more strongly than instructions because the model is pattern-matching, and three concrete patterns are more constraining than any number of abstract rules. Few-shot loses for open-ended generation — long-form summaries, creative writing, exploratory chains — because examples bias the model toward example-like outputs, which is exactly the wrong shape when you want variety. The decision tree: count the valid output shapes. Small number → few-shot. Open-ended → instructions + rubric, no examples.

```
few-shot vs instructions — decision tree

  Output space size?
    ↓
  ≤ 10 shapes              open-ended
    ↓                          ↓
  3-5 examples              instructions + rubric
  cover the                  no examples
  decision boundary          (avoid bias toward
                              example-like outputs)
```

**Q (senior):** Walk me through how you'd select the example set for a new classifier.

A: I list the decision boundaries first, not the example inputs. A classifier with four labels has six decision boundaries (one per label pair). For each boundary, I pick the example that's *most likely to be confused* — not the most representative example, the most disambiguating example. Then I check coverage: do I have at least one positive case per label? Do I have at least one "looks like X but is Y" negative case for the most-confused boundary? If the example set is over five, I cut the lowest-signal example — usually a second positive case for an unambiguous label. The first three examples are non-negotiable (common case, primary edge, negative case); the fourth and fifth are added based on which edges show up in the eval set's failures.

```
example selection — boundary-first, not input-first

  Step 1: enumerate decision boundaries
          (for N labels, N×(N-1)/2 boundaries)

  Step 2: per boundary, pick the most-disambiguating example
          (the one most likely to be confused in production)

  Step 3: check coverage
          ✓ one positive per label
          ✓ negative case for most-confused boundary
          ✓ keep total ≤ 5

  Step 4: cut the lowest-signal example
          (usually a redundant positive case)
```

**Q (arch):** Your classifier is at 95% accuracy with 3 examples. You're considering adding a 4th example to catch a specific edge case. What's the framework for deciding?

A: I run the eval set with and without the 4th example. If the 4th example improves the target edge case *and* doesn't regress any other case, it earns its place. If it improves the target edge case but causes a regression elsewhere, it's not the right 4th example — the example set has overspecified and is now pattern-matching too narrowly. The fix is usually to pick a *different* 4th example that disambiguates the same edge case without crowding the others, or to accept the 95% accuracy and document the edge as a known limitation. The framework: *examples are a constrained budget; each example must earn its place against the eval set, not against intuition.* Most candidates don't run the comparison; they just add the example and ship. The senior move is to make the comparison the gate.

```
the 4th example decision

  Current eval score: 95% (3 examples)
            ↓
  Add 4th example for edge case
            ↓
  Re-run eval set
            ↓
        ┌────────┴──────────┐
        ↓                   ↓
  Target edge: ✓      Target edge: ✓
  Other cases: =      Other cases: ↓ regression
        ↓                   ↓
  KEEP the example       REJECT — pick a
  ship the change        different 4th, or
                         accept 95% and
                         document the limitation
```

### The question candidates always dodge

**Q:** Modern frontier models (Sonnet 4+, GPT-5) are good enough at instruction-following that few-shot isn't really necessary anymore, right? It's just a 2022 trick.

A: That argument is half-right and half-wrong in a way that's worth being precise about. The right half: frontier models are dramatically better at 0-shot than the GPT-3 era; many tasks that needed 5-shot examples in 2022 work fine 0-shot in 2026. The wrong half: "fine 0-shot" still means 5-10% worse than well-tuned few-shot for classifier-shape tasks, and 5-10% worse compounds at scale — at 1000 classifications per day, that's 50-100 wrong labels per day vs ~10 with few-shot. The honest framing: the few-shot benefit *has narrowed* on frontier models, but the cost-of-failure for the marginal 5-10% accuracy gap is usually higher than the token cost of including the examples. The interview move is to name the narrowing benefit explicitly, then explain why the narrowed benefit still earns its place in the chains where accuracy compounds (classifiers feeding analytics, extractors feeding downstream chains, anything where the wrong output propagates).

```
"few-shot is obsolete on frontier models"

 0-shot accuracy on classifier tasks
   GPT-3 era (2022):    ~70%
   GPT-4 era (2024):    ~85%
   Frontier (2026):     ~90%

 5-shot accuracy on same tasks
   GPT-3 era (2022):    ~92%
   GPT-4 era (2024):    ~96%
   Frontier (2026):     ~98%

 Gap narrowed: 22 → 11 → 8 percentage points
 Token cost:   ~200 tokens of prefix (cached at 25%)
 Cost per error: variable — but at 1000 calls/day,
                 the 8-point gap = 80 wrong labels/day,
                 still much more expensive than the
                 cache-discounted prefix tokens.
```

The honest answer: few-shot is *narrower* than it was, not *obsolete*. The chains where it still pays off are exactly the chains where errors compound — classifiers, extractors, anything feeding a downstream pipeline. Open-ended generation can drop it; structured tasks can't.

### One-line anchors

- "Examples constrain output more than instructions. Three patterns beat any number of abstract rules."
- "The 3-5 sweet spot is empirical. Below 3, no generalization. Above 5, diminishing returns at climbing cost."
- "Quality of example > quantity. Cover the decision boundary, not the input space."
- "In structured-output mode, examples are JSON matching the schema — not English descriptions."
- "Few-shot examples in the static prefix are cache-eligible. Move them into the user message and you kill the cache."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw the n-shot returns curve from memory — n on the x-axis, consistency on the y-axis. Label the inflection point at n=3 and the diminishing-returns plateau. Mark where the curve might degrade (n > 20, model overspecifies to the example set).

✓ Pass: curve drawn, n=3 inflection labeled, diminishing-returns plateau labeled
✗ Fail: re-read the n-shot returns diagram, wait 10 minutes, try again.

### Level 2 — Explain it out loud

Explain few-shot prompting to a colleague who's been iterating instructions on a classifier for three sprints with marginal improvement. No notes. Under 90 seconds.

Checkpoints — did you:
- Name examples-over-instructions as the pivot, not just an additional technique?
- Reference the 3-5 sweet spot with the inflection-at-3 mechanism?
- Explain example selection (decision boundary, not input space)?
- Reference the buildable target (`/ai/few-shot` visualizer with the slider) as how you'd demonstrate the concept in reincodes?

If you skipped any: you described the pattern, you didn't argue for the pivot.

### Level 3 — Apply it to a new scenario

A new chain lands in the planned reincodes AI surface: a "categorize this DSA algorithm" chain that takes the algorithm name + a short description and returns one of `sorting`, `searching`, `graph-traversal`, `tree-operation`, `recursion`. The chain currently runs with instructions only and is 88% accurate, with the main failures being algorithms that span two categories (e.g., DFS — both `graph-traversal` and `recursion`). Apply the few-shot decision tree. Would you add few-shot? If yes, what's your initial 3-example set?

Write your answer (3–5 sentences minimum). Then open `.aipe/study-ai-engineering/ai-features-in-this-codebase.md` and check whether your example-set design respects the static-export contract (the precompute step adds the examples to a chain that runs at build time, not user-request time).

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff from the Tradeoffs section. Answer in writing: "If I were starting the `/ai/few-shot` visualizer today with the same constraints (static export, no live LLM, GH Pages deploy), would I use the consistency-chart approach or would I use a side-by-side output comparison (show the outputs at n=0 and n=3 in two columns and let the reader spot the difference)? Why? What does each teach better?"

Reference the actual code:
→ Point to `next.config.ts` L1–L17 to support the static-export constraint
→ Point to what would need to change if the visualizer let users type their own example (rather than picking from precomputed configurations) — every keystroke would generate an LLM call

There is no right answer. The point is specificity.

### Quick check — code reference test

Without opening any files, answer:
- What file in reincodes controls the static-export contract that constrains how the visualizer ships?
- What field in `conceptsData.tsx` would need a new entry to register the visualizer in the home grid?
- What other concept file in this guide names the four-section prompt anatomy where few-shot examples have their own slot?
- What other concept file names the token budget that few-shot examples consume?

Then open the files and verify.

✓ Pass: `next.config.ts`, `CONCEPT_CATEGORIES`, `01-anatomy.md`, `04-token-budgeting.md`
✗ Fail on details: that's fine — the shape is what matters. File and directory names should be recoverable.

---
Updated: 2026-05-25 — cross-references refreshed for the new study-ai-engineering/ layout; companion-guides framing updated for v1.38.0 per-repo spec.
