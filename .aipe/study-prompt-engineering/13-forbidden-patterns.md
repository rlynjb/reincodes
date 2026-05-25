# Forbidden patterns and rotating formulas

**Industry name(s):** Anti-repetition prompting, output diversity, rotation history, forbidden-pattern lists
**Type:** Industry standard

> LLMs converge on phrasings — every output from the same chain sounds the same after a week of use. The fix is anti-repetition machinery in the prompt itself: a list of forbidden openings and a set of rotating formulas, fed in as data alongside the user input.

**See also:** → [01-anatomy](01-anatomy.md) · → [04-token-budgeting](04-token-budgeting.md) · → [06-single-purpose-chains](06-single-purpose-chains.md) · → [08-few-shot](08-few-shot.md)

---

## Why care

### Move 1 — The grounded scenario

You ship a "daily caption" chain — it takes a transcript of what the user did today and returns a one-paragraph caption for a vlog. Demo runs look fine. Each caption is a distinct paragraph; no two demos sound identical. The user starts using the feature daily. Day three's caption opens with "Today I…". Day four's caption opens with "Today I…". Day five's caption opens with "Today I…" — and a different phrasing later in the paragraph, but the user is now noticing the pattern. By day seven the user types in Slack: "is this AI? every caption sounds the same." You read seven captions in a row and see it immediately: same opening, same rhythm, same vocabulary. The model has converged.

### Move 2 — Name the question

That convergence has a name — *output mode collapse*, or in production prompt-engineering vernacular, *model voice convergence*. Not whether each individual caption is good, not whether the prompt has enough instructions about style, not whether the temperature is set right — just whether the chain, run repeatedly on similar inputs over time, produces outputs that *vary*. LLMs are trained to find the highest-probability completion; on a chain with a fixed prompt and similar inputs, that highest-probability completion is the same handful of openings, the same handful of structural shapes, the same vocabulary clusters. Without intervention, every output from the same chain sounds the same.

### Move 3 — Why answering that question matters

**Why you need to answer that question at all:** because user-facing generative chains are judged by their freshness as much as by their accuracy. I've shipped two captioning chains in production. The first one had no anti-repetition machinery; user complaints about "robotic" output started in the second week and never stopped. The second one had a rotation history (the prompt got fed the last 10 captions as a forbidden-openings list) and got compliments instead of complaints. Same model, same temperature, same vibes on a single output — only difference was the model could *see* its own recent output and was instructed to avoid the openings it had just used. The cost of running this in production is one extra database query per call (fetch the last N outputs) and ~200 extra tokens in the prompt (the forbidden list). The cost of *not* running it is a chain that gets uninstalled because users assume it's broken.

### Move 4 — Concrete before/after

Without anti-repetition machinery:

- Day 1 caption: "Today I built the auth flow…"
- Day 2 caption: "Today I worked on the database schema…"
- Day 3 caption: "Today I…"
- Day 4 caption: "Today I…"
- Day 7 user complaint: "is this AI? every caption sounds the same"
- Outcome: user perceives the feature as broken even though each caption is individually fine

With rotation-history anti-repetition:

- Day 1 caption: "Today I built the auth flow…"
- Prompt for day 2 includes: `forbiddenOpenings: ["Today I"]`
- Day 2 caption: "The auth flow is shipped — finally clicked into place…"
- Prompt for day 3 includes: `forbiddenOpenings: ["Today I", "The auth flow"]` (recent N captions)
- Day 3 caption: "Three hours into the database schema and I'm starting to see why…"
- Day 7: each caption opens distinctly; user perceives the feature as alive

### Move 5 — The one-line summary

Anti-repetition is the same shape as a React `useEffect` cleanup that prevents stale closures — the chain has to remember what it just produced and refuse to produce it again, by passing the recent outputs back into the prompt as data the model treats as a forbidden list. The mechanics are below.

---

## How it works

### Move 1 — The mental model

The chain has a feedback loop. Each call produces an output; the next call's prompt includes the previous N outputs as a "do not repeat" list. The model treats the list as constraints — instructions that say "do not open with any of these phrases, do not use these structural patterns, vary your vocabulary from what's shown below." The result is a per-call constraint that's dynamic (the forbidden list changes every call) but mechanically simple (read N rows from a database, format as a list, interpolate into the prompt).

The strategy: turn each call into a *contextual* call by feeding the chain's own recent history back in as data.

```
The feedback loop

  Call N-1 ──► output ──► database (stored)
                            │
                            ▼ fetch last N
  Call N ◄────── prompt with forbiddenOpenings: [...]
       │
       ▼
     output (distinct from the last N)
       │
       ▼
     database (stored, becomes part of Call N+1's forbidden list)
```

### Move 2 — The layered walkthrough

#### The forbidden-openings list

The technical thing: a list of opening phrases (typically the first 3-5 words of each recent output) that the prompt instructs the model to avoid. If you're coming from frontend, this is like a controlled-input form where one field's valid values depend on what other fields have already submitted — except the constraint lives in the prompt rather than in form-validation code. Concrete consequence: the model sees `forbiddenOpenings: ["Today I", "The auth", "Three hours", "Yesterday's bug"]` and starts the new output with something *not* in that list. Concrete condition where it works: the model has enough vocabulary to actually find a distinct opening; if the forbidden list grows to 30+ recent openings, the model runs out of natural alternatives and starts producing strained phrasings. The right N is typically 5-10 recent outputs.

```
forbidden-openings list in the prompt

System: "Avoid opening with any of these phrases.
         Vary the opening from what's shown below."

User (interpolated):

  <forbidden_openings>
    "Today I"
    "The auth flow"
    "Three hours"
    "Yesterday's bug"
    "After the standup"
  </forbidden_openings>

  Today's transcript: [user's recorded events]

  Generate a one-paragraph caption.
```

#### The rotating-formulas pattern

The technical thing: instead of *only* listing forbidden openings, also give the model a set of *positive* alternative formulas to rotate through. The bridge from frontend: this is like a CSS animation with discrete keyframes — the system specifies the variations rather than letting the model improvise blindly. Concrete consequence: the rotation list pre-loads the model with diverse patterns ("declarative observation", "narrative recap", "metaphor", "question-and-answer", "list-of-three"), so when the model is told to avoid the recent openings it has a positive direction rather than just a negative one. Concrete condition where it shines: when the chain runs frequently enough that pure forbidden-lists exhaust naturally distinct phrasings — the rotation gives the model fresh structural shapes to reach for.

```
rotating formulas — positive guidance, not just negative

System: "Use one of these structural shapes, rotating through them
         over time. Don't use a shape that's been used in the last
         3 outputs."

  Shape 1: Declarative observation
           "The bug was in the migration script, not the schema."

  Shape 2: Narrative recap
           "Started with the failing test, ended with three new ones."

  Shape 3: Metaphor
           "The auth flow felt like untangling cables behind a TV."

  Shape 4: Question-and-answer
           "Why does this still hurt? Because the cache wasn't busted."

  Shape 5: List-of-three
           "Three hours, two false starts, one shipped feature."

Recent shapes used: [1, 3, 2]
Pick from: [4, 5]
```

#### Reading recent outputs from storage

The technical thing: the chain needs persistent storage to remember its own history. In production this is a database table (`chain_outputs` keyed by `user_id` + `chain_id` + `timestamp`) or a simple key-value store. The bridge from frontend: this is the same shape as a `useEffect` that depends on previous state — each call needs access to what came before. Concrete consequence: the chain handler reads the last N rows on every call, extracts the opening phrases, formats them as the forbidden list, and interpolates into the prompt. The query is fast (indexed on `user_id` + `chain_id`, returning 5-10 rows) and the prompt interpolation is mechanical. Concrete condition where it breaks: if the storage layer is slow or unreliable, the anti-repetition feature degrades gracefully — the chain still works, it just starts converging again until storage comes back.

```
storage shape — minimal viable anti-repetition history

table: chain_outputs
  ├─ id          uuid
  ├─ user_id     uuid          ← who the chain ran for
  ├─ chain_id    string        ← which chain ("caption", "summary")
  ├─ timestamp   timestamptz
  ├─ output      text          ← the full generated text
  ├─ opening     text          ← first 3-5 words (denormalized for query)
  └─ shape_used  string        ← which rotation formula (when applicable)

query on every call:
  SELECT opening, shape_used
    FROM chain_outputs
    WHERE user_id = $1 AND chain_id = $2
    ORDER BY timestamp DESC
    LIMIT 10
```

#### When anti-repetition matters vs when it doesn't

The technical thing: anti-repetition is for *generative* chains run *repeatedly* on *similar inputs*. Captions, summaries, daily prompts, status updates, generated emails — anywhere the user will see multiple outputs from the same chain over a period of days or weeks. The bridge from frontend: this is the same distinction as needing `key` props on a list — you only need them when the list changes; anti-repetition only matters when the chain runs more than once for the same user. Concrete consequence: classifiers don't need anti-repetition (their outputs are labels from a fixed enum; "repeating" the label `todo` is not a bug, it's correctness). Structured outputs where the schema constrains the shape don't need anti-repetition (the model can't open with anything; it's just filling fields). One-shot generation chains (run once, never run again on the same context) don't need anti-repetition. The pattern earns its place specifically when the chain's output is *user-visible prose* run *repeatedly*.

### Move 3 — The principle

The principle that generalises beyond any one chain: *the model's training pulls it toward the mean; production chains have to actively push it away*. Without intervention, every long-running generative chain converges to a small set of high-probability outputs. The model isn't broken; it's doing what it was trained to do (predict the most likely next token), and the most likely next token for "given this transcript, write a caption" is "Today I…" for the same reason "the quick brown fox" is the most likely completion of "the quick brown". Anti-repetition is the prompt-engineering version of breaking out of a local optimum — you feed the constraint that says "the highest-probability completion is forbidden; find the next-best one that satisfies the new constraints." Every long-running generative chain in 2026 production needs this machinery; the ones that don't have it are the ones whose users have stopped using them.

The full picture is below.

---

## Forbidden patterns — diagram

```
┌─ Storage layer (per-user, per-chain output history) ───────────────┐
│                                                                    │
│   chain_outputs                                                    │
│     ┌───────────┬──────────┬─────────────┬──────────┐              │
│     │ user_id   │ chain_id │ timestamp   │ opening  │ ...          │
│     ├───────────┼──────────┼─────────────┼──────────┤              │
│     │ u123      │ caption  │ 2026-05-23  │ "Today I"│              │
│     │ u123      │ caption  │ 2026-05-24  │ "The aut"│              │
│     │ u123      │ caption  │ 2026-05-25  │ "Three h"│              │
│     │ u123      │ caption  │ ...         │ ...      │              │
│     └───────────┴──────────┴─────────────┴──────────┘              │
│                              │                                     │
│                              ▼ SELECT openings, LIMIT 10           │
└──────────────────────────────│─────────────────────────────────────┘
                                │
                                ▼
┌─ Chain handler (composes per-call prompt) ─────────────────────────┐
│                                                                    │
│   const recentOpenings = await db.query(...);                      │
│                                                                    │
│   const prompt = {                                                 │
│     system: "Avoid opening with any of these phrases. Rotate       │
│              through the structural shapes below.",                │
│     user: `                                                        │
│       <forbidden_openings>                                         │
│         ${recentOpenings.map(o => `"${o}"`).join("\n")}            │
│       </forbidden_openings>                                        │
│                                                                    │
│       <rotation_shapes>                                            │
│         (declarative | narrative | metaphor | Q&A | list-of-3)     │
│         recently used: [${recentShapes.join(", ")}]                │
│       </rotation_shapes>                                           │
│                                                                    │
│       Today's transcript: ${transcript}                            │
│       Generate a one-paragraph caption.                            │
│     `                                                              │
│   };                                                               │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
                                │
                                ▼   sent to provider
┌─ Provider call ────────────────────────────────────────────────────┐
│   Output: distinct from the recent N; uses one of the unused       │
│           rotation shapes                                          │
└─────────────────────────────────│──────────────────────────────────┘
                                  │
                                  ▼   stored
┌─ Storage layer (new row appended, becomes part of next call's      │
│  forbidden list) ──────────────────────────────────────────────────│
└────────────────────────────────────────────────────────────────────┘
```

The feedback loop between storage and the chain handler is what makes this pattern work. Without storage, every call is amnesiac and converges to the same opening; with storage, every call sees the chain's own history and pushes away from it.

---

## In this codebase

**Not yet implemented.** reincodes is a Next.js static-export DSA visualizer with no AI surface in production code — there are no generative chains, no storage layer, no rotation history. The buildable target for this concept is below in Project exercises — a `/ai/forbidden-patterns` page that simulates 7 days of generations from a caption chain, with a toggle between "anti-repetition off" and "anti-repetition on" so the reader can watch the convergence pattern emerge without the safety mechanism and the rotation pattern emerge with it. The pedagogical payoff: the reader sees, in one scroll, that without the machinery every caption opens "Today I…" by day 3, and with the machinery each caption opens distinctly through day 7+.

**Expected file paths** (when built):
- `src/app/ai/forbidden-patterns/page.tsx` — the visualizer page
- `src/components/ForbiddenPatternsVisualizer/` — caption-feed component, anti-repetition toggle, day-N selector
- `public/ai/forbidden-patterns/captions-no-rotation.json` — 7 precomputed captions from a no-rotation chain
- `public/ai/forbidden-patterns/captions-with-rotation.json` — 7 precomputed captions from the same chain with rotation history fed in

---

## Elaborate

### Where this pattern comes from

The pattern emerged from production observations in 2023-2024 of LLM-based generative features that worked in demos and degraded in production. Users would compliment a new feature on launch and then quietly stop using it as the outputs started feeling repetitive. The first published treatments came from teams shipping consumer-facing LLM features (newsletters, generated emails, social-media captions) where the freshness gap between demo and production was most visible. The phrasing-rotation-history mechanism was a fix that worked across providers and didn't require any model-side support — just storage and prompt interpolation. By 2025 it was a default pattern in any long-running generative chain.

### The deeper principle

The deeper principle is *probability distributions collapse without explicit pressure to maintain variance*. The model's loss function during training rewards predicting the most likely next token; at inference time, that same instinct shows up as convergence to the highest-probability completion across similar inputs. Temperature is the model-side knob for fighting this (higher temperature samples from a wider distribution), but temperature alone doesn't prevent convergence — it just adds noise on top of the same biased distribution. Anti-repetition machinery is the prompt-side fix: instead of widening the distribution, it forbids the peak and forces the model to find the next-best alternative. The two techniques compose; production chains often use both.

### Where this breaks down

Anti-repetition breaks down when the forbidden list grows large enough to exhaust natural alternatives. At 30+ recent forbidden openings in the same vocabulary domain, the model starts producing strained phrasings ("Henceforth begin the chronicle of…") to satisfy the constraint. The fix is to either (a) cap the forbidden list at 5-10 (older outputs roll off the list as new ones are added), or (b) reset the list periodically (every Monday morning, the forbidden list clears). It also breaks when the rotation formulas are too narrow — a 3-shape rotation feels mechanical after a week; a 7-10 shape rotation has enough variety to feel organic. The honest answer: anti-repetition is a discipline that needs ongoing maintenance as user behavior changes; it's not set-and-forget.

### What to explore next

- [08-few-shot](08-few-shot.md) → few-shot examples and rotation formulas are the same engineering primitive (positive constraints via examples) applied to two different problems
- [04-token-budgeting](04-token-budgeting.md) → the forbidden list and rotation shapes consume tokens; budget them
- [06-single-purpose-chains](06-single-purpose-chains.md) → anti-repetition belongs in the generative chain, not in the classifier upstream of it
- Generative-feature post-mortems from 2023-2024 (search for "AI feature feels repetitive" in the prompt-engineering literature) → the canonical pre-history of this pattern

---

## Tradeoffs

### Comparison table — both costs in one frame

```
┌──────────────────┬──────────────────────┬─────────────────────────┐
│ Cost dimension   │ Path taken           │ Alternative             │
│                  │ (anti-repetition)    │ (no machinery)          │
├──────────────────┼──────────────────────┼─────────────────────────┤
│ Storage          │ One row per chain    │ Zero                    │
│                  │ call (chain_outputs  │                         │
│                  │ table)               │                         │
│ DB queries       │ +1 SELECT per call   │ Zero                    │
│ Latency          │ +20-50ms per call    │ Baseline                │
│ Token cost       │ +100-300 tokens for  │ Baseline                │
│                  │ forbidden + rotation │                         │
│ Schema effort    │ One new table + one  │ Zero                    │
│                  │ helper function      │                         │
│ Output diversity │ Sustained across     │ Converges by day 3-5    │
│                  │ weeks of use         │                         │
│ User perception  │ "It's alive"         │ "Is this AI? Every      │
│                  │                      │  output sounds the same"│
│ Maintenance      │ Periodic review of   │ None                    │
│                  │ rotation shapes      │                         │
│ Failure mode     │ Forbidden list grows │ Convergence is silent;  │
│                  │ stale, model strains │ shows up in user        │
│                  │ for variety          │ complaints              │
└──────────────────┴──────────────────────┴─────────────────────────┘
```

### What we gave up (planning the visualizer)

The first cost is *14 precomputed caption outputs* — 7 days × 2 modes (without rotation, with rotation). Each output has to be generated by actually running the chain against a real model (Anthropic), with the rotation-on side requiring 6 cumulative calls (each call sees the prior outputs as forbidden openings). The precompute script has to simulate the day-by-day accumulation correctly. That's ~half a day of work plus careful API budget management.

The second cost is *engineering the convergence to be visible*. The pedagogical payoff requires the no-rotation outputs to actually converge by day 3-5 — a string of "Today I…" openings. If the model happens to pick distinct openings naturally (it can; temperature plays a role), the convergence isn't visible and the lesson doesn't land. Forcing convergence by holding temperature low and choosing transcripts that bias toward "Today I…" openings is a calibration job that can stretch to a full day.

The third cost is *the day-N selector UX*. The visualizer needs a way to scroll through 7 days of outputs without overwhelming the reader. A vertical timeline with both modes side by side is the natural shape but takes some component work — sticky headers, side-by-side scrolling, highlighting where the openings repeat in the no-rotation mode and where the rotation shapes vary in the with-rotation mode.

### What the alternative would have cost (skipping the visualizer)

If reincodes never builds `/ai/forbidden-patterns`, the cost is zero in the codebase. The pattern still gets taught — by this written file, by the existing study guide's mention in the AI features file, by working through generative-chain features at other portfolio projects. The reincodes site stays pure-DSA.

The cost of not building it shows up in the portfolio story: anti-repetition is one of the most production-flavored patterns in prompt engineering, and a hands-on visualizer that shows the convergence pattern is much sharper interview signal than "I've read about it." The visualizer earns its place when the candidate is preparing for an interview round where production LLM features are the main topic.

### The breakpoint

The visualizer earns its place the day the candidate is preparing for an interview where the question "how do you keep a long-running generative LLM feature from getting stale?" is plausibly going to be asked. Until that interview is on the calendar, the buildable target stays in the backlog. The breakpoint is event-shaped: a specific interview where production-LLM patterns are the focus.

### What wasn't actually a tradeoff

Letting the visualizer call Anthropic at request time so the reader could see fresh outputs every visit was not a real option. Static-export contract forbids server runtime. Precomputed outputs are the only path. The trade isn't worth re-litigating; the architectural constraint is what defines visualizer-shaped teaching in reincodes.

---

## Tech reference (industry pairing)

### Anthropic Messages API

- **Codebase uses:** not yet — the visualizer's precompute script would call the Messages API 13 times (1 + 6 + 6 = 13: one initial caption, then 6 cumulative no-rotation calls and 6 with-rotation calls) to produce the two precomputed sequences.
- **Why it's here:** the chain runs through Claude in any production deployment of this pattern; the visualizer demonstrates the pattern by using the same provider.
- **Leading today:** Anthropic Messages API — `adoption-leading`, 2026.
- **Why it leads:** for generative chains where output quality is the main signal, Claude's voice in 2026 (Sonnet 4) is the most-deployed choice across consumer-facing LLM features.
- **Runner-up:** OpenAI Chat Completions with GPT-5 — `adoption-leading` deployment-share alternative; the patterns transfer 1:1 across providers because the anti-repetition machinery lives in the prompt, not in any provider-specific feature.

### Postgres + Supabase (for the storage layer)

- **Codebase uses:** not yet — a production deployment of this pattern would use Postgres for the `chain_outputs` table; in the visualizer, the "storage" is just a precomputed JSON array.
- **Why it's here:** the anti-repetition pattern requires persistent storage; Postgres is the default in 2026 production stacks for this kind of write-heavy, query-light data.
- **Leading today:** Postgres (via Supabase, Neon, RDS, etc.) — `adoption-leading` for production transactional storage, 2026.
- **Why it leads:** ACID semantics, indexed queries are fast at the row counts these chains generate, ecosystem maturity for migrations and observability.
- **Runner-up:** SQLite (for single-user / local-first apps) — `adoption-leading` for embedded use; relevant if the chain runs on-device (a journal app that runs locally would store its rotation history in SQLite, not Postgres).

### Zod (for typed storage + prompt shapes)

- **Codebase uses:** not yet — would define the `ChainOutput` shape (`{ user_id, chain_id, timestamp, output, opening, shape_used }`) for the storage layer and the prompt-interpolation shape for the chain handler.
- **Why it's here:** the rotation pattern interacts with the structured output of the chain (the chain has to return which `shape_used`, which becomes a stored field for the next call's rotation decision). A typed schema is the contract between the chain output and the storage layer.
- **Leading today:** Zod — `adoption-leading` for TS schema work, 2026.
- **Why it leads:** type inference, compose-with-DB layer (Drizzle ORM integrates Zod schemas natively), familiar to the React/Vue front-end engineers most likely to build these features.
- **Runner-up:** Valibot — `innovation-leading` smaller-bundle alternative; relevant for the static-export bundle-size constraint.

---

## Project exercises

### [B-reincodes-forbidden-patterns-viz] Build the forbidden-patterns visualizer

- **Exercise ID:** `[B-reincodes-forbidden-patterns-viz]` — aligns with Phase 1 curriculum concept on prompt engineering as a discipline and the anti-repetition mechanism that's one of the load-bearing techniques for production generative chains.
- **What to build:** a page at `/ai/forbidden-patterns` that simulates 7 days of caption-chain output, presented as a vertical timeline with a top-of-page toggle for "anti-repetition off" vs "anti-repetition on". Each day's caption is a card with the timestamp, the input transcript (small), and the generated caption (large). In the "off" mode, the cards converge to "Today I…" openings by day 3 and the reader can see the repetition. In the "on" mode, each card's caption opens with a distinct phrase and uses a different rotation shape (declarative / narrative / metaphor / Q&A / list-of-3) — also visible as a small label on each card. A "forbidden openings used" panel on the side shows the cumulative list growing day by day in the "on" mode, so the reader sees the machinery operating. The pedagogical payoff: the reader scrolls through 7 days with the toggle off and feels the staleness, scrolls again with the toggle on and feels the variety; the difference is the rotation history, mechanically simple in production.
- **Why it earns its place:** the visualizer makes the convergence pattern *experiential* rather than theoretical. The reader doesn't just read "LLMs converge on phrasings" — they see seven days of "Today I…" cards stacked on top of each other, then watch the same chain produce seven distinct openings when the rotation history is fed in. The interview signal: the candidate built a tool that demonstrates one of the most production-flavored patterns in prompt engineering by making the failure mode visceral.
- **Files to touch:** `src/app/ai/forbidden-patterns/page.tsx` (visualizer page), `src/components/ForbiddenPatternsVisualizer/` (caption-feed component, mode toggle, day-N selector, forbidden-openings panel), `public/ai/forbidden-patterns/captions-no-rotation.json` (7 precomputed captions from a no-rotation chain), `public/ai/forbidden-patterns/captions-with-rotation.json` (7 precomputed captions from the same chain with rotation history fed in), `scripts/precompute-forbidden-patterns.ts` (build-time script that calls Anthropic 13 times in sequence — once to bootstrap, then 6 calls in each mode where each call sees the prior outputs). Register the page in `src/components/Home/conceptsData.tsx` under the `ai-engineering` category.
- **Done when:** the page loads at `/reincodes/ai/forbidden-patterns/` in production (GH Pages), the 7-day caption timeline renders correctly in both modes with the toggle working, the no-rotation mode shows the "Today I…" convergence by day 3, the with-rotation mode shows distinct openings + rotation-shape labels on every card, the forbidden-openings side panel grows day by day in the with-rotation mode. `next build` passes under `output: "export"`. Precompute script runs successfully against the Anthropic API and produces JSON output that demonstrates the convergence cleanly (this is the calibration work — if the no-rotation outputs happen to be naturally diverse, the lesson doesn't land).
- **Estimated effort:** 1-2 days. Precompute script + calibration of inputs to force visible convergence: half to full day. Page + caption-feed component + toggles + side panel: half day. Polish + cross-browser testing: half day.

---

## Summary

### Part 1 — concept recap

Anti-repetition is the prompt-engineering machinery that prevents long-running generative chains from converging to a small set of high-probability outputs — typically a forbidden-openings list (drawn from the chain's recent output history) plus a rotating-formulas set (positive alternatives the model can reach for) interpolated into the per-call prompt. In reincodes this is Case B — no chains, no storage, no captions — but the buildable target is a `/ai/forbidden-patterns` visualizer that simulates 7 days of caption-chain output in two modes (no rotation, with rotation) so the reader experiences the staleness of the converged output and the freshness of the rotated output. The constraint that shapes the visualizer is the static-export contract — live generation at request time is out, precomputed JSON sequences are the path. The cost being paid is 13 precompute API calls plus careful calibration to ensure the no-rotation mode visibly converges (the lesson doesn't land if it doesn't), in exchange for a teaching artifact that makes the convergence pattern *visceral* rather than theoretical.

### Part 2 — key points to remember

- **The shape**: forbidden openings list (drawn from recent output history) + rotating formulas (positive alternatives) + per-user storage of recent outputs.
- **The mechanism**: each call reads the last N outputs from storage, formats their openings as a forbidden list, interpolates into the prompt; model is instructed to vary from the list.
- **When it matters**: user-visible generative chains run repeatedly for the same user (captions, summaries, daily prompts). Doesn't matter for classifiers, structured outputs, or one-shot chains.
- **The cost ledger**: one DB query per call, +20-50ms latency, +100-300 tokens, in exchange for sustained output diversity across weeks of use.
- **The reincodes shape**: implementation is Case B; the buildable target is a precomputed visualizer that simulates 7 days of output in two modes to make the convergence experiential.

---

## Interview defense

### What an interviewer is really asking

Behind "how do you keep a long-running generative feature from feeling stale?" the interviewer is checking whether the candidate has shipped a generative chain past launch week. Junior answer: "increase temperature" or "tell the model to be creative" — neither works in production. Senior answer: "feed the recent output history back into the prompt as a forbidden-openings list plus a rotation of structural shapes; track the rotation in storage, query the last 5-10 outputs on every call." The interviewer is filtering for engineers who've watched a feature converge in production and built the machinery to prevent it.

### Likely questions

**Q (mid):** Why doesn't increasing temperature fix the convergence problem?

A: Temperature widens the sampling distribution but doesn't change the underlying probability landscape — the most likely opening is still the most likely; temperature just makes it slightly less dominant. At temperature 0.8 vs 0.4 the convergence is *slower* but it still happens; users notice the pattern by week two instead of week one. The fundamental issue is that the model has no memory of its own recent outputs — every call is amnesiac. Anti-repetition machinery gives the model that memory by feeding the recent outputs back in as constraints. Temperature is a one-call knob; anti-repetition is a cross-call knob, and convergence is a cross-call problem.

```
temperature alone vs anti-repetition

high temp, no history:                anti-repetition, normal temp:
  day 1: "Today I shipped..."          day 1: "Today I shipped..."
  day 2: "Today's main thing..."       day 2: "Auth flow's behind me..."
  day 3: "Today I worked on..."        day 3: "Three hours into..."
  day 4: "Today I did..."              day 4: "Cache busting cleared..."
  day 5: "Today's win..."              day 5: "Why the migration..."
  → still converging, just slower      → distinct, sustained variety
```

**Q (senior):** What's the maintenance burden of this pattern, and when does it start to break?

A: Two ongoing maintenance jobs. First, the forbidden-list cap — if you keep all recent openings forever, the list grows past the model's ability to find natural alternatives (~30 openings in the same vocabulary domain) and the outputs start sounding strained. The fix is to cap at 5-10 recent outputs with FIFO eviction. Second, the rotation-shape set — if you ship 3 shapes the rotation feels mechanical after a week; if you ship 7-10 shapes the rotation feels organic. The shape set needs to be revisited every few months as user feedback comes in ("the metaphor shape feels forced when my day was all bug fixes"). It breaks when the chain's input domain narrows enough that even with the machinery, the model can only honestly say a few things — if the user's transcript is "I worked on the auth flow" five days in a row, no amount of rotation can hide that the underlying content is similar. At that point the fix isn't anti-repetition; it's variable input.

```
maintenance ledger

ongoing work                              cost
─────────────────────────────────────     ──────────
Forbidden-list cap (5-10 entries, FIFO)   1 line of code
Rotation shapes (7-10, review quarterly)  ~half day per quarter
Convergence telemetry (per-user)          one new dashboard panel
Per-shape eval (does shape X feel forced  ~1 day per shape, once
in this domain?)
```

**Q (arch):** At 10× — say, 100k daily-active users each running a caption chain twice a day — does the storage cost or the prompt-token cost become the bottleneck first?

A: 100k DAU × 2 calls/day = 200k chain outputs/day = ~6M rows/month. Storage cost (Postgres on managed service) at that volume is ~$20-50/month for the data, dominated by the index on `(user_id, chain_id, timestamp)`. That's cheap. The prompt-token cost is harder: each call adds ~150-200 tokens for the forbidden list + rotation context = ~$0.0002 per call at Sonnet 4 input pricing. At 200k calls/day = ~$40/day = ~$1200/month, just for the anti-repetition tokens. That's the bottleneck. The fix at scale is to compress the forbidden list (use opening *fingerprints* like the first 3 words rather than the full opening; use a smaller model for the rotation-shape selection step; cache the system prompt + rotation-shape context separately from the per-call forbidden list so prompt-caching catches the static part). The architecture shifts from "send the full history every call" to "send a compressed signature, lean on prompt caching for the static parts."

```
at 10x scale, token cost dominates

storage at 100k DAU                     tokens at 100k DAU
─────────────────────────               ─────────────────────────
6M rows/month                           200k calls/day × 200 tok
~$30/month                              = 40M tokens/day input
                                        = ~$120/day on Sonnet 4 input
                                        = $3600/month
                                        ──────────────────────────
                                        Solution: prompt caching +
                                                  compressed signatures
                                                  brings to ~$200/month
```

### The question candidates always dodge

**Q:** Couldn't you solve all of this with a more diverse prompt, or with a higher temperature, or with a different model? Why is the machinery worth the operational complexity?

A: I tried each of those, in production, in 2023 — none of them work past launch week. A more diverse system prompt just means the model converges to a slightly different default opening; it converges anyway, because the prompt is static and the inputs are similar over time. A higher temperature slows the convergence but doesn't prevent it — at temperature 0.9 on a chain that runs daily, users still notice the pattern by week two. A different model has its own convergence pattern; switching from Claude to GPT just gives you a different favorite opening. The fundamental problem is that without memory of recent outputs, every call is operating against the same probability distribution and the model is doing what it was trained to do — predict the most likely next token. The only fix that actually works in production is giving the model memory: storing recent outputs, feeding them back in as constraints. The operational complexity is one database table, one query per call, and ~200 tokens in the prompt. The cost ledger:

```
"just turn up temperature / use a better prompt / switch models"
vs the anti-repetition machinery

What was picked                What the alternatives actually cost
(anti-repetition)              (when shipped to production)
─────────────────────────      ─────────────────────────────────────
+ One DB table, one query      Temperature 0.9:
+ ~200 tokens per call           - slows convergence, doesn't prevent
+ Sustained diversity across     - introduces other quality variance
   weeks of use                
                               More diverse system prompt:
+ Maintenance is real but        - converges to a different default
  ~1 day per quarter             - the prompt's static; inputs are similar
                                 - same problem, slightly different shape
+ Compositional: combine with  
  temperature, with model       Different model:
  choice, with prompt design     - has its own favorite opening
                                 - convergence is universal across providers
                                 - switching costs are real

The honest answer: temperature / prompt diversity / model choice are
all complementary to anti-repetition. None of them replace it. Without
the machinery, every long-running generative chain converges.
```

The interview move: name the "I tried that" gradient. "Each of those is a reasonable hypothesis in week one and is wrong by week two."

### One-line anchors

- "Without intervention, every long-running generative chain converges to a small set of high-probability outputs."
- "Anti-repetition is a cross-call knob; temperature is a one-call knob. They solve different problems."
- "Feed the chain's own recent outputs back in as data the model treats as a forbidden list."
- "Rotation formulas give the model positive direction; forbidden lists give the model negative pressure. Both are needed."
- "Classifiers don't need anti-repetition; user-visible generative chains run repeatedly do."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw the feedback loop from memory: storage layer (with the `chain_outputs` table fields), chain handler (with the prompt-interpolation step), provider call, and the loop back to storage. Label which storage field becomes part of the next call's forbidden list.

✓ Pass: storage table with `opening` field labeled as the rotation-history source, chain handler labeled as the place where the forbidden list interpolates into the prompt, loop arrow back to storage visible
✗ Fail: re-read the primary diagram, wait 10 minutes, try again.

### Level 2 — Explain it out loud

Explain anti-repetition to a colleague who's about to ship a daily-newsletter generation chain and hasn't thought about output diversity. No notes. Under 90 seconds.

Checkpoints — did you:
- Name the convergence failure mode (every output sounds the same)?
- Distinguish the forbidden-openings list from the rotating-formulas pattern?
- Mention the storage layer (chain has to remember its own history)?
- Distinguish the chains where this matters (user-visible generative, repeated) from the chains where it doesn't (classifiers, structured outputs, one-shot)?

If you skipped any: you described it, you didn't argue for it.

### Level 3 — Apply it to a new scenario

A new chain lands in the planned reincodes AI surface: a "weekly DSA challenge of the day" chain that generates a one-sentence description of an algorithm challenge for the user, run once daily. The user will see seven challenge descriptions per week. Design the anti-repetition machinery: what gets stored, what gets fed back into the prompt, what rotation shapes would you define?

Write your answer (3-5 sentences minimum). Then check whether the design is compatible with reincodes' static-export contract (look at `.aipe/study-ai-engineering/ai-features-in-this-codebase.md` for the constraint).

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff from the Tradeoffs section. Answer in writing: "If I were starting the `/ai/forbidden-patterns` visualizer today with the same constraints (static export, no live LLM, GH Pages deploy), would I still precompute 7 days × 2 modes = 14 captions, or would I cut to 5 days × 2 modes = 10 captions to save precompute budget and bundle size? What does each choice cost?"

Reference the actual code:
→ Point to `next.config.ts` L1–L17 to support the static-export constraint
→ Point to what 14 vs 10 captions costs in `public/ai/forbidden-patterns/` JSON bundle size

There is no right answer. The point is specificity.

### Quick check — code reference test

Without opening any files, answer:
- What file in reincodes controls the static-export contract that constrains how the visualizer ships?
- What array in `conceptsData.tsx` would need a new entry to register the visualizer in the home grid?
- What two JSON files in `public/ai/forbidden-patterns/` would carry the precomputed captions for each mode?

Then open the files and verify.

✓ Pass: `next.config.ts`, `CONCEPT_CATEGORIES`, `captions-no-rotation.json` + `captions-with-rotation.json`
✗ Fail on details: file and array names matter more than line numbers.

---
Updated: 2026-05-25 — cross-references refreshed for the new study-ai-engineering/ layout; companion-guides framing updated for v1.38.0 per-repo spec.
