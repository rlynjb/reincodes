# Prompt engineering — overview

Prompt engineering is the discipline of getting reliable output from a non-deterministic function. Not magic incantations, not "10 prompts that changed my life" listicles — a small set of patterns, applied consistently, that distinguish prompts that *work in demos* from prompts that *survive production*. This guide covers 13 concepts grouped into two layers: operational discipline (anatomy through eval-driven iteration — the floor of professional prompt work) and specific techniques (chains through forbidden patterns — the levers you reach for once the discipline is in place).

## The 13 concepts, grouped by what they solve

```
Operational discipline (read first)
──────────────────────────────────────────────────────────────────────
01-anatomy.md              The four-section shape every prompt has.
02-structured-outputs.md   Schemas + tool calling for typed output.
03-prompts-as-code.md      Version, review, observe prompts as source.
04-token-budgeting.md      Count what you spend; cache what you can.
05-eval-driven-iteration.md Measure against a fixed set; never iterate by vibes.

Specific techniques (read by need)
──────────────────────────────────────────────────────────────────────
06-single-purpose-chains.md One job per chain; compose into pipelines.
07-output-mode-mismatch.md  Don't let chain A's output break chain B's parser.
08-few-shot.md              Examples constrain output more than instructions.
09-chain-of-thought.md      Give the model space to reason — in a `thinking` field.
10-self-critique.md         When self-evaluation is worth its 2-5× token cost.
11-meta-prompting.md        Using an LLM to draft prompts for another LLM call.
12-prompt-injection-defense.md  Author-side defenses; defense-in-depth.
13-forbidden-patterns.md    Anti-repetition for long-running generative chains.
```

## One-line "what it gets wrong" per concept

The production failure mode each concept addresses:

```
01-anatomy            ─── prompt grows from 50 lines to 200, regressions
                          land that nobody can bisect by section.
02-structured-outputs ─── model wraps schema-conformant JSON in a
                          markdown code fence to "be polite"; parser breaks.
03-prompts-as-code    ─── Sonnet 4 → Sonnet 5 upgrade silently regresses
                          chains nobody version-pinned.
04-token-budgeting    ─── chain that worked on small inputs starts
                          truncating at scale; nobody counted tokens.
05-eval-driven-iter   ─── "better" prompt improves average score by 2
                          points and regresses a critical edge case.
06-single-purpose-ch  ─── multi-purpose monolithic prompt fails 8% of
                          the time; nobody knows which job failed.
07-output-mode-mism   ─── chain A returns JSON, chain B expects
                          markdown; silent fallback eats the error.
08-few-shot           ─── classifier returns labels you didn't define
                          because the prompt has instructions but no
                          examples to anchor the output set.
09-chain-of-thought   ─── multi-signal classification fails because
                          the model jumps to the first signal without
                          reasoning through the rest.
10-self-critique      ─── high-stakes generation ships unreviewed
                          because nobody felt the eval set covered
                          enough; self-critique would have caught it.
11-meta-prompting     ─── 20 prompts in the codebase all read like
                          LLM drafts because nobody hand-tuned them.
12-prompt-injection   ─── user input contains "ignore previous
                          instructions" and the model obeys; system
                          prompt has no defense layer.
13-forbidden-patterns ─── daily-caption chain converges to "Today
                          I…" by week two; users perceive the
                          feature as broken.
```

## How this guide differs from `.aipe/study-prep-fundamentals-for-ai/`

This guide is **topic-focused, portfolio-wide-by-spec** (then redirected to reincodes-only per user instruction). The companion guide `.aipe/study-prep-fundamentals-for-ai/` is **codebase-focused** on reincodes — its `03-ai-engineering/` section already has Case B files for tokenization, embeddings, RAG, agents, and a meta "ai-features-in-this-app" file that frames reincodes as the *visualizer host* for AI concepts. This prompt-engineering guide complements that one by going deeper on the 13 prompt-engineering-specific concepts, each anchored to a planned `/ai/*` visualizer that would exercise the concept in reincodes' static-export contract.

Every file in this guide is Case B (concept not implemented in reincodes' production code) because reincodes has no AI surface — it's a Next.js static-export DSA visualizer + portfolio site. The `## Project exercises` blocks are the load-bearing content: each one names the planned visualizer that would demonstrate the concept in the browser, with file paths, scope, and effort estimates. The visualizers slot under `/ai/{concept}` and follow the static-export-friendly pattern (precompute model outputs at build time, ship as JSON, animate in the browser).

## Reading order

The five operational-discipline files (01-05) build on each other and should be read first, in order. They define the substrate: what a prompt *is* (anatomy), what kind of output it returns (structured), how it's maintained (code), how it's budgeted (tokens), and how it's improved (evals). Skipping ahead to the technique files without the substrate is how teams end up with one prompt-engineering trick they over-apply.

The eight specific-technique files (06-13) can be read in any order, by need. Use the "what it gets wrong" list above to find the concept that matches the failure mode you're hitting. If you're building generative chains, read 13 (forbidden patterns) before launch. If you're routing user input to an LLM, read 12 (prompt injection) before shipping. If you're building a multi-signal classifier, read 09 (chain-of-thought) and 08 (few-shot) together. If you're orchestrating multiple chains, read 06 (single-purpose chains) and 07 (output mode mismatch) together.

## What's deliberately out of scope

Per the spec: vendor-specific prompt syntax quirks (they appear inside concept files under Tech reference, not as their own concepts), Tree of Thoughts and academic prompt research (not yet production practice), Constitutional AI / alignment-style prompting (safety-critical applications, different scope), vision/multi-modal prompting (not exercised by any current reincodes visualizer plan), jailbreak research from the attacker side (defender side is concept #12), and the history of prompt engineering as a field (this is a working guide, not a reference book). The 13 concepts above are the complete list.
