# System design templates

These files reframe canonical AI engineering interview prompts (Interview Kickstart Modules 1–5) against this codebase. Each template uses the same nine labelled bullets — *the prompt*, *standard architecture*, *data model*, *key components*, *scale concerns*, *eval framing*, *common failure modes*, *applies to this codebase*, *how to make it apply* — because that's the shape interviewers ask system-design questions in: requirements → data → architecture → scale → eval → failure.

All templates appear in every AI engineering study guide regardless of codebase applicability, per the study spec. When a template doesn't apply (which is the case for both of the templates here, given reincodes' static-export visualizer role), the *applies to this codebase* bullet says so honestly and the *how to make it apply* bullet names the concrete refactor or, more often, the thought experiment for an interview answer.

## Files in this section

### Search and retrieval

- `01-search-ranking.md` — the IK Module 1 "design a search ranking system" prompt. Standard architecture: query understanding → hybrid retrieval (BM25 + dense) → ranking (LambdaMART or cross-encoder rerank) → serving + logging. Verdict: does not apply to reincodes (no search surface).

### Conversational AI

- `02-tech-support-chatbot.md` — the IK Module 5 "design a tech support chatbot" prompt. Standard architecture: intent classification → RAG over KB → constrained generation → rule-based escalation → feedback loop. Verdict: does not apply to reincodes (no support surface, no users to support).

## Applies-to-codebase table

### Search ranking

- **Verdict:** No.
- **Reasoning:** reincodes has no search surface anywhere. The site is a portfolio + static DSA visualizer; navigation is link-based, not search-driven. There is no corpus, no query, no clicks to log.
- **Interview move:** name the gap, then walk the loopd journal-search version of the same architecture.

### Tech support chatbot

- **Verdict:** No.
- **Reasoning:** reincodes has no support surface, no users with accounts, no tickets, no chat UI, no KB to retrieve over. Static portfolio sites don't have support needs.
- **Interview move:** name the gap, then walk the aipe slash-command system as the closest structural analog (intent classification + RAG + generate).
