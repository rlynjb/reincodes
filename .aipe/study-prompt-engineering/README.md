# Prompt engineering study guide

Topic-focused study guide on prompt engineering as a working discipline. 13 concepts grouped into operational discipline (read first, in order) and specific techniques (read by need). Every file follows the per-concept template from `study.md` and is anchored to reincodes — every concept is Case B (not yet implemented in production code) with a planned `/ai/{concept}` visualizer as the primary buildable target.

## File index

### Operational discipline (read in order)

- [01-anatomy.md](01-anatomy.md) — the four-section shape every production prompt has: system / context / few-shot / user.
- [02-structured-outputs.md](02-structured-outputs.md) — schemas + tool calling + strict mode; how to stop the model wrapping JSON in markdown fences.
- [03-prompts-as-code.md](03-prompts-as-code.md) — version, review, log, deploy prompts as source code; survive model upgrades.
- [04-token-budgeting.md](04-token-budgeting.md) — count what you spend, allocate by section, cache the static prefix, watch for lost-in-the-middle.
- [05-eval-driven-iteration.md](05-eval-driven-iteration.md) — change prompt → run golden set → diff outputs → keep change only if no regression. The senior-vs-junior dividing line.

### Specific techniques (read by need)

- [06-single-purpose-chains.md](06-single-purpose-chains.md) — one job per chain; compose into pipelines.
- [07-output-mode-mismatch.md](07-output-mode-mismatch.md) — every chain has one output mode declared in its schema; don't let chain A's prose break chain B's JSON parser.
- [08-few-shot.md](08-few-shot.md) — 3-5 examples beat 20 instructions; constrain output by example, not by exhortation.
- [09-chain-of-thought.md](09-chain-of-thought.md) — give the model space to reason; in 2026 the load-bearing variant is a `thinking` field in the structured output schema.
- [10-self-critique.md](10-self-critique.md) — when 2-5× token cost is worth one extra step of reliability (and when it isn't).
- [11-meta-prompting.md](11-meta-prompting.md) — using an LLM to draft prompts for other LLM calls; drafting tool, not authoring tool.
- [12-prompt-injection-defense.md](12-prompt-injection-defense.md) — instruction hierarchies + input delimiters + output structure as defense; defense in depth, not a fully-solved problem.
- [13-forbidden-patterns.md](13-forbidden-patterns.md) — anti-repetition for long-running generative chains; feed the chain's own recent outputs back in as forbidden openings.

## Recommended reading order for someone new to the discipline

1. **Read [00-overview.md](00-overview.md) first** — the one-page map plus the "what it gets wrong" failure mode per concept.
2. **Read 01-05 in order** — the operational discipline files. Skipping ahead is how teams end up with one trick they over-apply.
3. **Use 06-13 as reference** — read the concept that matches the failure mode you're hitting. See the failure-mode-per-concept list in [00-overview.md](00-overview.md).

## What this guide is

- **Topic-focused, not codebase-focused.** Every concept stands on its own.
- **Working-AI-engineer voice.** First-person where it earns its place, citing production debugging stories. Not staff-engineer-from-FAANG voice; the failure modes are different.
- **Concrete over abstract.** Specific bugs, specific token counts, specific dates the model changed, specific phrasings that drifted.
- **No hedging.** "Might," "could potentially," "tends to" don't appear in the staff-engineer sections. Production engineers don't talk that way.

## What this guide is not

- **Not a fix list.** Every file ends in a `## Project exercises` block, but those are the *buildable target* (a visualizer that demonstrates the concept), not a backlog of work to grind through.
- **Not a tutorial.** The reader is assumed to be a working AI engineer or aspiring one. The guide opines on patterns; it doesn't teach Python or React.
- **Not exhaustive on prompt-engineering literature.** Vendor-specific quirks, academic research (Tree of Thoughts, Constitutional AI), and vision/multi-modal prompting are deliberately out of scope.

## Companion guides

- [`.aipe/study-system-design-dsa/`](../study-system-design-dsa/) — the per-codebase study guide for reincodes, covering system design / DSA / AI engineering / interview-prep system-design templates. Section 03 (AI engineering) covers tokenization, embeddings, RAG, agents — concepts orthogonal to prompt engineering.
- [`.aipe/audit-refactor-prep-fundamentals-for-ai/`](../audit-refactor-prep-fundamentals-for-ai/) — staff-engineer notebook of refactor opinions on the reincodes codebase. Different voice (staff engineer), different scope (refactor catalog vs prompt engineering catalog), same project.
