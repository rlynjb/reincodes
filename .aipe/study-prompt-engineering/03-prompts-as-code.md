# Prompts as code: versioning and observability

**Industry name(s):** Prompts as code, prompt versioning, prompt observability, prompt registry, prompt-as-artifact
**Type:** Industry standard

> Treating prompts as source files — version-controlled, reviewed in PRs, paired with a model version, logged in production so you know which prompt produced which output. The opposite of "the prompt is a string in a Slack message someone pasted in three months ago."

**See also:** → [01-anatomy](01-anatomy.md) · → [02-structured-outputs](02-structured-outputs.md) · → [05-eval-driven-iteration](05-eval-driven-iteration.md) · → `.aipe/study-prep-fundamentals-for-ai/03-ai-engineering/05-ai-features-in-this-app.md`

---

## Why care

### Move 1 — The grounded scenario

You're three months into a React app that uses an LLM for one feature — summarizing user-uploaded documents. The prompt lives in a `useEffect` hook as a template literal: `` `Summarize this document: ${doc}` ``. Week six, a teammate edits the prompt to "Summarize this document in three bullet points: ${doc}" and ships. Week ten, another teammate edits it to "You are a summarization assistant. Summarize: ${doc}" and ships. Week fourteen, a customer reports that summaries have changed in tone — they used to be conversational; now they're terse. You go to `git blame` the prompt and discover *three different people* have edited the same template literal, each thinking the previous shape was fine, none of them aware their edit shipped through the same `git diff` as a CSS change in the next file. Then the model gets upgraded from Sonnet 4 to Sonnet 5 on a provider-side rollout, and the prompt that was tuned for Sonnet 4's verbose style starts producing one-sentence summaries on Sonnet 5. You don't know which version of the prompt produced which version of the bad summary in your production logs because *the logs only captured the output*, not the prompt string that generated it.

### Move 2 — Name the question

That whole degradation has a name — *unmanaged prompts*. The prompt is a load-bearing piece of source code (it determines what your LLM does) that's being treated like a UI string. The question is: *does your prompt have the same software-engineering hygiene as the code that calls it — version control, review, deployment story, observability — or is it just a string?* Prompts-as-code is the discipline that says the prompt is an artifact: a file in the repo, reviewed in a PR, paired with a model version, and logged in production alongside the output it generated.

### Move 3 — Why answering that question matters

**Why you need to answer that question at all:** because the prompt is the *most behavior-changing* piece of code in an LLM feature. A one-word change to a prompt can shift the entire output distribution. I have shipped a chain that worked fine for nine months and then started failing 12% of the time after the underlying model was bumped from Sonnet 3 → Sonnet 4 in a transparent provider upgrade — and we couldn't even *answer* "which prompt was this output produced from" because the production logs didn't capture the prompt version. The fix took a week longer than it should have because the first three days were spent reconstructing what prompt had been live on which date by digging through git history. If the chain had logged `prompt_id: "summarize_doc"`, `prompt_version: "v3"`, `model: "claude-sonnet-4@20260301"` alongside every output, the diagnosis would have been minutes, not days.

### Move 4 — Concrete before/after

Without prompts-as-code:

- Prompt lives as a template literal in a component file
- Edits ship in PRs that touch six other files; the prompt diff gets lost in the review
- No model version pinned in code — chain uses "whatever the SDK defaults to today"
- Production logs capture inputs and outputs but not the prompt string used
- Model upgrades regress chains in ways nobody can localize ("the summaries feel different this week")
- Rolling back is "find the commit that broke it" in a multi-file diff

With prompts-as-code:

- Prompt lives in its own file (`prompts/summarize_doc.md` or `prompts/summarize_doc.ts`)
- Edits ship as their own diff, reviewed by someone who understands the chain
- Prompt + model version are paired in code (`{ prompt: summarizeV3, model: "claude-sonnet-4-7" }`)
- Production logs capture `prompt_id`, `prompt_version`, `model`, input hash, output
- Model upgrades regress chains *visibly* — you can replay any production input against the previous prompt+model pair to confirm the regression source
- Rolling back is "revert to `summarizeV3` + previous model" — one config flip, not a code revert

### Move 5 — The one-line summary

Prompts-as-code is the discipline of treating prompts like source files instead of like UI strings — paired with a model version, version-controlled with their own diffs, and logged in production so every output can be traced back to the exact `(prompt_version, model)` pair that produced it. The mechanics are below.

---

## How it works

### Move 1 — The mental model

A prompt is a *function definition*. The model is the *runtime*. The pairing of a prompt with a model version is the *binary* — the thing you actually deploy. You wouldn't ship a JavaScript function without pinning the Node version it was tested against; pinning a prompt without pinning the model is the same mistake. The mental shift: prompts and models are *coupled artifacts*. They version together, they deploy together, they roll back together.

The strategy: every prompt lives in its own file, every chain pairs a prompt with a specific model version, every production call logs both, and the rollback story is "revert to the previous (prompt, model) pair" not "revert the code."

```
prompts as strings              prompts as code

┌──────────────────┐            ┌──────────────────┐
│ template literal │            │ prompts/         │
│ in a component   │            │  summarize_doc/  │
│ file             │            │   v1.md          │
│                  │            │   v2.md          │
│ edits buried in  │            │   v3.md ◄── live │
│ multi-file PRs   │            │                  │
│                  │            │ chains/          │
│ no model version │            │  summarize.ts    │
│ pinned           │            │   prompt: v3     │
│                  │            │   model: sonnet  │
│ logs capture     │            │      -4-7        │
│ output, not the  │            │                  │
│ prompt string    │            │ logs capture     │
│                  │            │ (prompt_id,      │
│                  │            │  version, model) │
└──────────────────┘            └──────────────────┘
```

### Move 2 — The layered walkthrough

#### File-per-prompt, version-controlled

The technical thing: each prompt is a standalone file in a known directory (`prompts/`, `chains/`, `templates/`). The file's history is the prompt's history — `git log prompts/summarize_doc.md` shows every change with its commit message and author. From frontend, this is the same shift JSX made over `innerHTML` strings: the structure becomes diffable because it has its own location. Concrete consequence: review becomes possible. A reviewer can see "this PR changes one prompt, here's the before/after" without scrolling past four CSS files and a Storybook update.

```
file structure — one prompt per file

  prompts/
    summarize_doc.md           ← markdown with frontmatter
    extract_tags.md
    classify_intent.md

  chains/
    summarize.ts               ← imports prompts/summarize_doc.md
    tag.ts
    classify.ts
```

#### The prompt + model version pairing

The technical thing: every chain explicitly names the model version it was written for. Not `model: "claude"` (which defaults to whatever the SDK ships today). Not `model: "claude-sonnet-4"` (which floats across patch versions). The exact version: `claude-sonnet-4-7@20260315` or whatever the provider's pinning syntax requires. The bridge from frontend: this is the `package-lock.json` of the LLM world — the difference between "we use React 19" and "we use React 19.0.4" is the difference between "deployments are reproducible" and "they probably are." Concrete consequence: when a chain regresses after a provider upgrade, you can immediately answer "did the prompt change? did the model change?" because both are pinned. The pairing also documents *what was tested* — the prompt was validated against this specific model version.

```
prompt + model are one artifact

  chain config:
  ┌──────────────────────────────────────┐
  │ prompt:  summarizeV3                 │  ← versioned prompt file
  │ model:   claude-sonnet-4-7@20260315  │  ← exact provider version
  │ params:  { temperature: 0.3 }        │
  └──────────────────────────────────────┘

  when EITHER changes:
    → it's a new pair, a new deploy, a new entry in the eval table
```

#### Prompt observability — log the version, not the string

The technical thing: every production LLM call writes a log row that includes the prompt's *identity* (id + version), the model's identity, the input hash, and the output. The prompt *string* doesn't need to be logged on every row — it's recoverable from the version + the git repo. From frontend, this is the structured-logging move: instead of `console.log("user clicked thing")`, you log `{ event: "click", element_id: "submit", user_id: "..." }` because the structured form is queryable. Concrete consequence: when something looks wrong, you can group production calls by `prompt_version` and `model` and see which pair is producing the bad outputs. Without this, every diagnostic starts with "okay, what was the prompt three weeks ago?" and goes downhill.

```
the log row that makes diagnosis possible

  {
    ts: "2026-05-24T14:32:11Z",
    chain_id: "summarize_doc",
    prompt_id: "summarize_doc",
    prompt_version: "v3",
    model: "claude-sonnet-4-7@20260315",
    input_hash: "sha256:abc...",
    output: "...",
    latency_ms: 1240,
    tokens_in: 891,
    tokens_out: 124,
    schema_fail: false
  }
```

#### Diffs and pull requests on prompts

The technical thing: prompt changes go through PR review like any other code change. A PR that modifies `prompts/summarize_doc.md` is reviewable by the chain's owner. The diff is line-by-line, the commit message explains *why* the change happened ("PM asked for terser summaries; bumping v3 → v4"), and the merge is the deploy boundary. The bridge from frontend: same exact pattern as a CSS file or a translation string file. Prompts join the codebase as first-class citizens. Concrete consequence: a one-word prompt change that ships without review is a *bug in the process*, not "just a quick fix." The review catches the chain-design questions ("does this still work with the structured-output schema downstream?") before they ship.

```
PR diff on a prompt

  prompts/summarize_doc.md

   -## Task
   -Summarize the document in 3 bullet points.
   +## Task
   +Summarize the document in 2-4 bullet points.
   +Each bullet should be ≤ 20 words.

  Reviewer asks: "does the downstream UI still render correctly
                   when there are 2 bullets vs 4? does the
                   structured-output schema enforce min_items?"
```

#### The deployment story

The technical thing: prompt changes ship through the same deploy pipeline as code. The chain's `prompt_version` constant is bumped from `v3` to `v4` in the PR that introduces `prompts/summarize_doc/v4.md`. The deploy promotes both. If the change regresses, the rollback is `revert PR` — both the prompt and the version bump revert together. From frontend, this is the same pattern as a feature flag rollout: the prompt version is the flag, the deploy is the rollout, the revert is the rollback. Concrete consequence: prompts get the same safety net as code. Canary rollouts, observability, gradual ramp — all the patterns that work for code work for prompts because the prompt *is* code.

```
deploy lifecycle of a prompt change

  develop → branch  → PR review → merge → canary 5% → ramp → full
                                          (eval runs at each stage)

  rollback path:
  full → ramp down → canary off → revert PR → previous (prompt, model)
                                                pair is live
```

### Move 3 — The principle

The principle that generalises: *the artifact has to match the volatility*. A prompt changes more often than the chain code around it; it changes for different reasons (PM feedback, model upgrades, eval regressions) than the code (refactors, dep bumps, new features). When two artifacts have different volatility profiles, they live in different files and version on different schedules. Treating prompts as code is the recognition that prompts have their own lifecycle. The other portfolio project — aipe — is the canonical encoding of this pattern: aipe's whole purpose is to give markdown templates first-class repo status with frontmatter, slash-command composition, and review workflows. That's the *implementation* side of this concept; reincodes' role is to *teach* the concept through a visualizer, which is the buildable target below.

The full picture is below.

---

## Prompts as code — diagram

```
┌─ The lifecycle of a managed prompt ──────────────────────────────────┐
│                                                                      │
│                              ┌────────────┐                          │
│                              │ idea / PM  │                          │
│                              │ ask / eval │                          │
│                              │ regression │                          │
│                              └─────┬──────┘                          │
│                                    │                                 │
│                                    ▼                                 │
│                              ┌────────────┐                          │
│                              │ draft new  │                          │
│                              │ version    │  ← prompts/foo/v4.md     │
│                              │ in PR      │                          │
│                              └─────┬──────┘                          │
│                                    │                                 │
│                                    ▼                                 │
│                              ┌────────────┐                          │
│                              │ run evals  │  ← regression suite     │
│                              │ (v3 vs v4) │     + golden set         │
│                              └─────┬──────┘                          │
│                                    │                                 │
│                  ┌─────────────────┴───────────────┐                 │
│                  │                                  │                │
│                  ▼ (score improved,                 ▼ (regressed)    │
│                     no regressions)                                  │
│            ┌──────────┐                       ┌──────────┐           │
│            │ merge +  │                       │ close PR │           │
│            │ deploy   │                       │ + write  │           │
│            │ (canary) │                       │ rationale│           │
│            └─────┬────┘                       └──────────┘           │
│                  │                                                   │
│                  ▼                                                   │
│            ┌──────────────┐                                          │
│            │ production   │                                          │
│            │ logs capture │  ← (prompt_id, version, model, ...)     │
│            │ each call    │                                          │
│            └──────┬───────┘                                          │
│                   │                                                  │
│                   ▼                                                  │
│            ┌──────────────┐                                          │
│            │ if regression│                                          │
│            │ detected →   │                                          │
│            │ revert PR →  │                                          │
│            │ previous pair│                                          │
│            │ live again   │                                          │
│            └──────────────┘                                          │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘

every arrow above is "the same arrow code goes through"
the discipline is recognizing the prompt is code
```

The boundary between "draft" and "merge + deploy" is the eval gate — every prompt change runs through the eval suite before shipping. This is the link to [05-eval-driven-iteration](05-eval-driven-iteration.md).

---

## In this codebase

**Not yet implemented.** reincodes is a Next.js static-export DSA visualizer with no AI surface in production code — there are no prompts to version, no chains to log, no model versions to pin. The existing study guide (`.aipe/study-prep-fundamentals-for-ai/03-ai-engineering/05-ai-features-in-this-app.md`) frames reincodes as the *interview-prep visualizer host* — the place where AI concepts get *taught through visualizers*, not the place where AI runs for users. The canonical implementation of prompts-as-code in the portfolio lives in another project (aipe, which encodes the pattern as its primary purpose); reincodes' role here is to *teach the lifecycle* through a visualizer that renders the prompt history as a timeline.

**Expected file paths** (when built):
- `src/app/ai/prompts-as-code/page.tsx` — the visualizer page
- `src/components/PromptTimelineVisualizer/` — git-log-style timeline, version diff renderer, output replay panel
- `public/ai/prompts-as-code/example-history.json` — precomputed (version + prompt text + model version + sample outputs) entries for one example chain across 5–6 versions
- `scripts/precompute-prompt-history.ts` — build-time script that runs each historical version against its paired model, captures sample outputs, commits the JSON

---

## Elaborate

### Where this pattern comes from

The shift to treating prompts as code happened in 2023–2024 when teams started getting burned by silent model upgrades. Before that, prompts lived in notebooks, in Slack messages, in screenshots, in the heads of the engineers who wrote them. The forcing function was the wave of provider upgrades (Sonnet 3 → Sonnet 3.5 → Sonnet 4 → Sonnet 4.5, GPT-4 → GPT-4o → GPT-4.1, etc.) that quietly changed model behavior in production. Teams that hadn't pinned model versions discovered their chains had regressed and they couldn't even reproduce the *previous* behavior. The pattern is now table-stakes; the prompt-engineering frameworks (LangChain, DSPy, Promptfoo, PromptLayer) all enforce some version of it. aipe (a separate portfolio project) is the canonical encoding of this pattern as a *meta-tool* — markdown templates with frontmatter, slash-command composition, review-friendly file structure — but reincodes' content here stays focused on what a visualizer would teach.

### The deeper principle

The deeper principle is that *the prompt is a leaky abstraction over the model*. Unlike a function (where the body fully determines the output), a prompt's output depends on the model's training and inference behavior — both of which are outside your repo. You cannot reproduce a chain's output without (a) the prompt, (b) the model version, and (c) the model's sampling parameters. Treating prompts as code is the discipline of capturing what you *can* capture so the reproducibility gap is the model's inference noise, not your own missing data. The history of software has the same shape: deterministic-builds movement, container image pinning, lockfiles — all variations of "capture every dependency so the only variable is the runtime."

### Where this breaks down

Prompts-as-code breaks down when the prompt is *generated* by another LLM call (meta-prompting). The "version" of a generated prompt is harder to pin — it depends on the meta-prompt, the meta-model, the input that triggered the generation. Some teams handle this by caching the *generated prompt* and treating the cached version as the artifact (back to file-per-prompt). Others version the meta-prompt and the meta-model and treat the generation as deterministic-enough. There's no clean answer; meta-prompting trades reproducibility for flexibility, and the team has to pick. Also, prompts-as-code can over-rotate: extremely small prompt tweaks (single-character changes) every other day means the version history bloats. The mitigation is a versioning threshold — only bump the version when behavior changes meaningfully, not for typo fixes.

### What to explore next

- [01-anatomy](01-anatomy.md) → the prompt's four sections all live in the same prompt file; the anatomy is what makes the file diffable
- [02-structured-outputs](02-structured-outputs.md) → the schema is part of the prompt+model artifact and versions with it
- [05-eval-driven-iteration](05-eval-driven-iteration.md) → the eval suite is the gate that lets prompt changes ship safely

---

## Tradeoffs

### Comparison table — both costs in one frame

```
┌──────────────────┬──────────────────────────┬─────────────────────────┐
│ Cost dimension   │ Path taken               │ Alternative             │
│                  │ (prompts as code)        │ (prompts as strings)    │
├──────────────────┼──────────────────────────┼─────────────────────────┤
│ Build time       │ 2–4 hours per chain to   │ Inline literal in 5 min │
│                  │ set up file + logging    │                         │
│ Lines of code    │ Prompt file + chain file │ Multi-line string in    │
│                  │ + log schema (3+ files)  │ component file          │
│ Onboarding cost  │ New contributor reads    │ New contributor reads   │
│                  │ prompts/ directory       │ component to find prompt│
│ PR review        │ Prompt diff is its own   │ Prompt diff is buried   │
│                  │ scope, reviewable        │ in multi-file PR        │
│ Model-upgrade    │ Bisect by (prompt, model)│ Bisect by commit + pray │
│ regression cost  │ pair in production logs  │ logs captured something │
│                  │                          │ useful                  │
│ Rollback time    │ Revert PR → previous     │ Multi-file code revert  │
│                  │ pair live                │ with conflict resolution│
│ Observability    │ Production logs include  │ Production logs include │
│                  │ (id, version, model)     │ output only             │
│ Production cost  │ Tiny — log columns       │ "Free" until something  │
│                  │ are cheap                │ regresses               │
└──────────────────┴──────────────────────────┴─────────────────────────┘
```

### What we gave up (when planning the reincodes visualizer)

The first cost is the *precompute step's scope*. The visualizer needs at least one example chain with 5–6 historical versions, each version run against the model version it was paired with, with sample outputs captured for replay. That's 5–6 API calls per example (more if the visualizer covers multiple inputs per version), and the historical model versions may no longer be available from the provider — some older Claude versions are deprecated. The mitigation is to use the *latest available* models and *simulate* the version history with hand-crafted prompt evolutions, rather than actually replaying historical chains. This costs some authenticity in exchange for being buildable.

The second cost is *the page is conceptually denser than the others*. The structured-outputs visualizer has a clean "toggle this, watch that break" interaction. The prompts-as-code visualizer is a *narrative artifact* — it has to teach the reader to think across time (how does this prompt's history relate to its current state?). The interaction design is harder; the page wants a git-log-style timeline on the left, a diff view in the middle, an output replay on the right. That's three coordinated panels, not one toggle. Roughly 1.5 days of design work versus half a day for a simpler page.

The third cost is *cross-references with aipe*. aipe is the portfolio's canonical encoding of prompts-as-code. The reincodes visualizer needs to teach the concept without *re-implementing* aipe; the boundary needs to be clear ("aipe is the implementation; this visualizer is the teaching surface"). The risk is that the visualizer either inflates the reincodes role ("we built a prompt registry!") or under-sells itself ("just read aipe instead"). The mitigation is to frame the visualizer as "the *lifecycle* of one prompt over time" — a teaching surface that aipe doesn't have, even though aipe has the implementation.

### What the alternative would have cost (skipping the visualizer)

If reincodes never builds `/ai/prompts-as-code`, the cost is *zero* in the codebase. The pattern lives in aipe and in the LLM application projects. The reincodes site stays pure-DSA, and prompts-as-code education happens by reading this guide, opening aipe's templates directory, and seeing the pattern in real production code.

The cost of *not* building it shows up when the interview asks "show me how you version a prompt." Without a visualizer that lets the interviewer scrub through a prompt's history and replay outputs against each version, the candidate has to describe the lifecycle abstractly. The interview move is "open this URL" — a working demo beats a description.

### The breakpoint

The visualizer earns its place the day the candidate is preparing for an AI-focused interview and the portfolio needs a *teaching* artifact for prompt lifecycle that doesn't require the interviewer to clone aipe and read its templates. The breakpoint is the third interview where "show me how you'd manage a prompt over six months" comes up and the answer "let me share my screen and walk you through aipe" feels heavier than "open this URL and scrub through the timeline."

### What wasn't actually a tradeoff

Building the visualizer *inside* aipe (as one of aipe's own slash commands rather than as a reincodes page) was not a real option. aipe is a CLI tool with no UI; the visualizer's value is the *visual* timeline and diff view. Adding a UI to aipe would be a much larger lift than adding a page to reincodes. The right home for the *teaching* surface is the project whose role is *teaching* — that's reincodes, by curriculum design.

---

## Tech reference (industry pairing)

### Git (the version control everyone already uses)

- **Codebase uses:** git is already the version control for reincodes (and every other portfolio project). The visualizer would use a *synthetic* git log (precomputed JSON shaped like commit history) rather than reading the actual git history of an example chain, because the example chain doesn't live in reincodes.
- **Why it's here:** the prompt-version timeline is *literally* git's commit log applied to a single file. The visualizer's UX rhymes with `git log -p prompts/foo.md` — chronological, diffable, author-annotated.
- **Leading today:** Git — `adoption-leading` for source control, 2026.
- **Why it leads:** every prompt-management tool layers on top of git (LangChain Hub, Promptfoo, PromptLayer all assume the prompts are in a git repo somewhere). The version control problem is solved; the discipline is using it.
- **Runner-up:** none meaningful for source control. For the *visualization* layer, `git log --oneline` + `git diff` are the conceptual model; the visualizer renders that model in a browser-friendly way.

### Promptfoo / Promptlayer / LangSmith (the prompt observability ecosystem)

- **Codebase uses:** not yet — would be referenced in the visualizer's "what production tooling exists for this" panel, since reincodes itself doesn't need any of these (no production AI calls). The pattern reads from production at the LLM-app projects.
- **Why it's here:** Promptfoo (open-source, eval-focused), PromptLayer (managed prompt registry + analytics), and LangSmith (LangChain's observability layer) are the tools that ship the prompts-as-code pattern as a product. Naming them lets the reader know there's a market category here, not just a homegrown convention.
- **Leading today:** LangSmith — `adoption-leading` for prompt observability in LangChain-based systems, 2026. Promptfoo — `adoption-leading` for open-source prompt eval + versioning. PromptLayer — strong in enterprise prompt-registry use cases.
- **Why they lead:** each one implements the (prompt_id, version, model, input, output) log row and gives you the query UI to ask "which version of this prompt produced which outputs on which dates."
- **Runner-up:** homegrown logging tables — innovation-leading when your stack already has good observability and you don't want another vendor. The (prompt_id, version, model) schema is the same regardless of where it lives.

### Markdown with frontmatter (the file format for prompts)

- **Codebase uses:** not yet — the planned visualizer would store each historical prompt version as a markdown file with frontmatter (`---\nversion: v3\nmodel: claude-sonnet-4-7\n---\n# System prompt\n...`), serialized into the precomputed JSON for the timeline.
- **Why it's here:** markdown + frontmatter is the de-facto format for prompts-as-code because it's human-readable (reviewers can scan it), tool-friendly (frontmatter is parseable metadata), and version-control-friendly (line-diffable). aipe uses exactly this shape in production.
- **Leading today:** Markdown + YAML frontmatter — `adoption-leading` for prompt file format across the OSS ecosystem, 2026.
- **Why it leads:** every static site generator, every LLM framework, every prompt-management tool reads markdown with frontmatter. The format is the lingua franca.
- **Runner-up:** JSON or YAML files for prompts — innovation-leading when the prompt is heavily templated (multiple interpolation slots) and the metadata is rich enough that markdown body is the wrong primary surface.

### aipe (the portfolio's prompts-as-code encoding)

- **Codebase uses:** aipe is a *separate* portfolio project, not part of reincodes. Cited here because it's the canonical implementation of prompts-as-code in the candidate's portfolio — the reincodes visualizer is the *teaching* counterpart.
- **Why it's here:** aipe is the existence proof that the pattern works as a meta-tool. The visualizer cites aipe's existence ("here's where this pattern actually runs") without re-implementing it.
- **Leading today:** within the candidate's portfolio, aipe is the prompt-engineering-as-discipline encoding; LangChain Hub or LangSmith would be the comparable external tool.
- **Why it leads:** aipe encodes prompts as markdown templates composed via slash commands — the pattern works because the templates are reviewable, the composition is deterministic, and the iteration loop has its own commit history.
- **Runner-up:** LangChain Hub — adoption-leading for *public* prompt sharing, with versioning baked in. Different shape (centralized hub vs in-repo templates) but the same underlying discipline.

---

## Project exercises

### [B-reincodes-prompts-as-code-viz] Build the prompt-timeline visualizer

- **Exercise ID:** `[B-reincodes-prompts-as-code-viz]` — curriculum reference: `[C1.7]` (Prompt engineering as a discipline — what aipe encodes). Aligns with the reincodes interview-prep surface in `.aipe/study-prep-fundamentals-for-ai/03-ai-engineering/05-ai-features-in-this-app.md`.
- **What to build:** a page at `/ai/prompts-as-code` that renders the history of one example chain (a tag extractor or a summarizer) as a git-log-style timeline of 5–6 versions. Each timeline entry shows version label, date, commit message ("PM asked for terser summaries"), and the model version paired at that point. Clicking a version opens a center panel with a unified diff between that version and the previous one. A right-side "replay" panel shows sample outputs from running that version against the same fixed input, demonstrating how the same prompt evolved across model versions (Sonnet 3 → Sonnet 4 → Sonnet 4.5). A "play" button advances the timeline one version at a time, animating the diff and the output change. The reader sees, in one interaction, *why* the prompt+model pairing matters — outputs change not just when prompts change but when models change underneath stable prompts.
- **Why it earns its place:** the visualizer makes the *lifecycle* of a prompt observable in a way no static file structure does. The reader scrubs through six months of prompt history in 30 seconds and sees both the explicit changes (prompt edits) and the implicit changes (model upgrades affecting stable prompts). The interview signal is that the candidate understands prompts as artifacts with a history, not as static strings.
- **Files to touch:** `src/app/ai/prompts-as-code/page.tsx` (the page), `src/components/PromptTimelineVisualizer/` (timeline component, diff renderer using a simple line-diff utility, output replay panel), `public/ai/prompts-as-code/example-history.json` (the precomputed 5–6 version history with paired models and sample outputs), `scripts/precompute-prompt-history.ts` (build-time script that runs each version against its paired model, captures sample outputs, commits JSON). Add a row to `src/components/Home/conceptsData.tsx`'s `CONCEPT_CATEGORIES` under the `ai-engineering` category.
- **Done when:** the page loads at `/reincodes/ai/prompts-as-code/` in production (GitHub Pages), the timeline renders 5–6 versions chronologically, clicking a version shows the diff against the previous, the replay panel shows sample outputs from the (prompt, model) pair, the "play" button animates through the history smoothly. `next build` passes under `output: "export"`. Precompute script runs locally against available provider models and produces the history JSON.
- **Estimated effort:** 2–3 days. Precompute script (potentially with version-history simulation, since some historical models may be unavailable): 1 day. Timeline + diff component: 1 day. Output replay panel + play-button animation + polish: 1 day.

---

## Summary

### Part 1 — concept recap

Prompts-as-code is the discipline of treating prompts like source files — file-per-prompt, version-controlled, reviewed in PRs, paired with a specific model version, and logged in production so every output can be traced to the exact `(prompt_version, model)` pair that produced it. The opposite — template literals buried in component files, no model version pinned, logs that capture only outputs — is the era teams age out of after their first painful model upgrade. aipe (a separate portfolio project) is the canonical implementation of this pattern as a meta-tool; reincodes' role here is to *teach* the lifecycle through a visualizer that renders a prompt's version history as an interactive timeline with diffable versions and replayable outputs. The static-export constraint makes precomputed examples the only buildable shape, which works for a teaching artifact even if the historical model versions need to be simulated rather than literally replayed.

### Part 2 — key points to remember

- **The pairing**: prompt + model version are *one artifact*. Pinning the prompt without pinning the model is half the discipline. Both change together, deploy together, roll back together.
- **The observability shape**: production logs include `(prompt_id, prompt_version, model, input_hash, output)`. The prompt string itself is recoverable from the version + git repo; you don't need to log every string.
- **The volatility insight**: prompts change for different reasons (PM feedback, eval regressions, model upgrades) than the chain code (refactors, dep bumps). Different volatility = different file = different version history.
- **The model-upgrade scenario**: a stable prompt against a new model version produces different outputs. Without (prompt, model) pairing in logs, the regression is unattributable.
- **The reincodes shape**: implementation is Case B; the buildable target is a precomputed visualizer under `/ai/prompts-as-code` that renders one chain's version history as a git-log-style timeline with diffs and output replay. aipe holds the implementation; the visualizer holds the teaching.

---

## Interview defense

### What an interviewer is really asking

Behind "how do you manage prompts in production?" the interviewer is checking whether the candidate has lived through at least one provider-side model upgrade that regressed a chain. The junior answer is "I keep prompts in a constants file." The mid answer is "I version them and review prompt PRs." The senior answer names the (prompt, model) pairing as the artifact, the (prompt_id, version, model) log schema as the observability minimum, and the model-upgrade regression as the forcing function that made the discipline non-negotiable. The interviewer is probing for whether the candidate has been burned by an *unattributable* regression — that's the gradient between "I read about prompts-as-code" and "I learned the hard way."

### Likely questions

**Q (mid):** Where do prompts live in your repo?

A: Each chain has its prompt in a dedicated file — usually `prompts/<chain_name>.md` with YAML frontmatter naming the version, the paired model, and any sampling params. The chain file (`chains/<chain_name>.ts`) imports the prompt file and pins the model version explicitly — `model: "claude-sonnet-4-7@20260315"`, not `model: "claude"`. PRs that change prompts are reviewed by the chain's owner; the diff is its own scope. Production logs capture `(prompt_id, prompt_version, model)` on every call so we can trace any output back to the exact pair that generated it. The whole pattern is "the prompt is code, treat it like code."

```
shape on disk

  prompts/
    summarize_doc.md   ← frontmatter: version, model, params
    extract_tags.md
    classify_intent.md

  chains/
    summarize.ts       ← imports prompts/summarize_doc.md
                          + pins model version explicitly
```

**Q (senior):** Walk me through a prompt regression you debugged.

A: Late 2025, a summarization chain that had been stable for nine months started producing one-sentence summaries when users expected paragraphs. The prompt hadn't changed in months. The model had been bumped from Sonnet 4 to Sonnet 4.5 in a transparent provider rollout the same week. We knew because the production logs captured `(prompt_id, prompt_version, model)` on every call, and we could group by model and see the verbosity drop on the row where the model version changed. The fix was twofold: short-term, pin to the previous model version (which the provider still had available for one more month); long-term, update the prompt to explicitly request "2-4 paragraphs of detailed summary" because the new model had a tighter default verbosity. The whole diagnosis was minutes, not days, because the log schema captured the model version. Without that, we'd have spent the first three days trying to figure out *whether* the model had changed.

```
the diagnosis path

  alert: summaries shorter than expected
   │
   ▼
  query logs: group by model, count avg_output_tokens
   │
   ▼
  saw: claude-sonnet-4-5 average 80 tokens/output
       claude-sonnet-4   average 240 tokens/output
   │
   ▼
  diagnosis: model upgrade changed default verbosity
   │
   ├─ short-term: pin to claude-sonnet-4 (1 line change)
   └─ long-term: update prompt to explicitly request length
                  (new prompt version v4, paired with sonnet-4-5)
```

**Q (arch):** At 10× the chain count — 50 chains, 4 providers — what does the prompt-management architecture look like?

A: Prompts move from "files in the repo" to "files in the repo *plus* a registry layer." Each chain still has its prompt file (versioning + review stay), but there's a registry module that gives every chain a uniform way to fetch its `(prompt, model, params)` triple by name. Production logs include a `chain_id` that joins back to the registry. The eval harness reads the registry and runs every chain against its golden set on every PR. Provider differences (Anthropic's model naming vs OpenAI's vs Google's) are hidden behind the chain's "model spec" rather than leaking into every call site. The architecture is: prompt files + registry + adapter (per provider) + log schema + eval harness. The discipline scales because each piece has a single job.

```
50 chains, 4 providers — the architecture shape

  prompts/                     chains/
   ├─ chain_01.md               ├─ chain_01.ts
   ├─ chain_02.md               ├─ chain_02.ts
   ├─ ... 48 more               ├─ ... 48 more

  registry.ts                  adapters/
   - lookup(chain_id) →          ├─ openai.ts
     { prompt, model, params }   ├─ anthropic.ts
                                 ├─ google.ts
                                 └─ openrouter.ts

  evals/                       logs (BQ or similar)
   - golden_sets/               schema: (chain_id, prompt_id,
   - regressions/                       prompt_version, model,
   - run_on_pr.ts                       input_hash, output, ...)
```

### The question candidates always dodge

**Q:** Be honest — is all this versioning machinery actually worth it for a 3-person team shipping a single LLM feature? It feels like enterprise-grade overhead.

A: For day one and week six, no. For month four, yes — and you don't get to retrofit it cleanly. The catch is that the value of the (prompt, model) pairing + the log schema only shows up *after* the first regression you can't debug without them. By that time, you're trying to add the pairing and the logging to a codebase that has six months of production data without it. The cost on day one is small (an extra file, an extra import, four log columns) and the cost of *adding it later* is large (retrofit the chain code, retrofit the logs, hope you can reconstruct historical pairings from git). The honest framing is: this is not enterprise overhead, it's basic hygiene with a slow-payback curve. The teams that skip it are the teams that haven't shipped the upgrade-regression yet. The cost ledger:

```
add discipline on day one         retrofit on month four
─────────────────────────         ──────────────────────
+ small upfront cost              + larger one-time refactor
+ one file per prompt             + add to existing chain files
+ pin model version (one line)    + audit every chain for model pinning
+ log (prompt_id, version, model) + migrate existing log schema
                                  + reconstruct historical pairings
                                    from git history (lossy)

= 2 hours per chain on creation   = 1–2 weeks per chain to retrofit
                                    + lost historical attribution
```

The interview move: name the slow-payback curve. "On day one this looks like overhead. On month four this looks like the only thing that saved the chain."

### One-line anchors

- "The prompt + the model version are one artifact. Pin both, version both, log both, roll back both."
- "Production logs capture `(prompt_id, prompt_version, model)` on every call — the string is recoverable from git."
- "Model upgrades regress chains silently. Without the pairing in logs, the regression is unattributable."
- "Prompts have different volatility than the chain code around them. Different volatility = different file."
- "aipe is the implementation of this pattern; reincodes' visualizer is the teaching surface."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw the lifecycle of a managed prompt from memory: idea → draft → eval gate → merge → deploy → production logging → regression detection → rollback. Label the eval gate and the rollback path.

- Pass: 7+ steps in order, eval gate before merge, rollback explicitly named with the "revert PR → previous pair" mechanism
- Fail: re-read the primary diagram, wait 10 minutes, try again.

### Level 2 — Explain it out loud

Explain prompts-as-code to a colleague who has been keeping prompts as template literals inside React components. No notes. Under 90 seconds.

Checkpoints — did you:
- Name the (prompt, model) pairing as the artifact?
- Name the production log schema `(prompt_id, version, model)` as the observability minimum?
- Reference the model-upgrade scenario as the forcing function?
- Mention that aipe encodes this pattern in the portfolio, separately from reincodes?
- Reference the buildable target (`/ai/prompts-as-code` visualizer) as how you'd teach the lifecycle?

If you skipped any: you described the practice, you didn't argue for it.

### Level 3 — Apply it to a new scenario

A new chain lands in the planned reincodes AI surface: a "generate an interview-style explanation of this algorithm" chain that takes the algorithm name, target audience level (junior / senior), and length budget, and returns a paragraph of explanation. Design the prompts-as-code setup. Where does the prompt file live? What's in the frontmatter? Which model do you pin to? What does the production log row look like (assume the visualizer ever runs live)? How would you handle a Sonnet 4.5 → Sonnet 5 upgrade six months from now?

Write your answer (3–5 sentences minimum). Then open `.aipe/study-prep-fundamentals-for-ai/03-ai-engineering/05-ai-features-in-this-app.md` and check whether your proposed setup respects the static-export constraints (no live LLM at request time — the "production logs" answer should be hypothetical, framed as "if this ever ran live, here's the schema").

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff from the Tradeoffs section. Answer in writing: "If I were starting the `/ai/prompts-as-code` visualizer today, would I simulate the version history (hand-crafted prompt evolutions across versions) or insist on capturing real historical chains (with the risk that some historical models are deprecated and unavailable)? Why? What does each choice cost?"

Reference the actual code:
→ Point to `next.config.ts` L1–L17 for the static-export contract
→ Point to what would need to change if the visualizer pulled historical data from aipe's actual template git history (the file would need to land in reincodes' `public/`, the schemas would need to be unified, the visualizer would become tightly coupled to aipe's directory structure)

There is no right answer. The point is specificity.

### Quick check — code reference test

Without opening any files, answer:
- What file in reincodes controls the static-export contract that forces precomputed examples?
- What three fields should every production LLM log row include at minimum, beyond the input and output?
- What's the portfolio project that canonically implements prompts-as-code as a meta-tool?
- What field in `conceptsData.tsx` would need a new entry to register the visualizer in the home grid?

Then open the files and verify.

- Pass: `next.config.ts`, `(prompt_id, prompt_version, model)`, aipe, `CONCEPT_CATEGORIES` (with a new `ai-engineering` category if not yet introduced)
- Fail on details: that's fine — the shape is what matters. The log schema and the (prompt, model) pairing should be recoverable.
