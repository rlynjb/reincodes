# Tech support chatbot system design

**Industry name(s):** Customer-support chatbot, RAG-grounded support agent, IK Module: Support chatbot
**Type:** Industry standard

> The canonical interview prompt for LLM-driven customer support; applied here as a thought experiment for reincodes since the codebase has no support surface.

**See also:** → [../05-agent-loop](../05-agent-loop.md) · → [../03-dense-vs-sparse-retrieval](../03-dense-vs-sparse-retrieval.md)

---

- **The prompt:** Design a customer-support chatbot that resolves common questions and escalates complex ones to humans.

- **Standard architecture:**

  ```
  ┌─ User message ──────────────────────────────────────────────┐
  │  "How do I reset my password?"                              │
  └─────────────────────────────────────────────────────────────┘
           │
           ▼
  ┌─ Intent classifier (heuristic → LLM fallback) ──────────────┐
  │  regex/keyword match (cheap) ──fail──▶ LLM classifier (slow)│
  │  intent: "password_reset" or "unknown"                       │
  └─────────────────────────────────────────────────────────────┘
           │
           ▼
  ┌─ RAG: retrieve relevant help docs ──────────────────────────┐
  │  hybrid retrieval over KB → top-5 chunks                    │
  └─────────────────────────────────────────────────────────────┘
           │
           ▼
  ┌─ Answer generation (LLM with context) ──────────────────────┐
  │  system_prompt + retrieved_chunks + user_message            │
  │  → response text + confidence score                          │
  └─────────────────────────────────────────────────────────────┘
           │
           ▼
  ┌─ Confidence gate ───────────────────────────────────────────┐
  │  confidence ≥ 0.8 → respond to user                          │
  │  confidence < 0.8 → escalate to human queue                  │
  └─────────────────────────────────────────────────────────────┘
           │                          │
           ▼                          ▼
       Send reply              Human picks up
  ```

- **Data model:**
  - `conversations{id, user_id, started_at, status}` — per-session.
  - `messages{id, conversation_id, role, content, intent, confidence, embedded_at}` — per turn.
  - `knowledge_base{id, title, content, version, last_updated, embedding}` — RAG corpus.
  - `escalations{id, conversation_id, reason, picked_up_at, resolved_at}` — human-handoff trail.

- **Key components:**
  - *Intent classifier*: heuristic-first (regex / keyword), LLM fallback. Cheap on common patterns; LLM on edge cases. Returns `intent` + `confidence`.
  - *RAG retriever*: hybrid (BM25 + dense + RRF) over the KB; returns top-5 chunks.
  - *Answer generator*: LLM (Claude Sonnet or smaller for cost) with the retrieved chunks. System prompt includes "if you don't know, say so and set confidence low."
  - *Confidence gate*: separates auto-respond from human-escalate. Threshold chosen via eval.
  - *Escalation queue*: writes to support-team's tool (Zendesk / Front / etc.).
  - *Logger*: every turn + every escalation + every CSAT score; foundation of eval and retraining.

- **Scale concerns:**
  - At ~100 conversations/day: single LLM endpoint, one KB, no caching needed.
  - At ~10k conversations/day: prompt cache the KB chunks (saves 90% on input tokens for the common case). Latency budget needs streaming responses.
  - At ~1M conversations/day: distill the intent classifier to a small local model; pre-compute embeddings for common phrasings; route by topic to specialised KB shards.

- **Eval framing:**
  - Offline: per-intent precision/recall on the classifier; rubric-based answer quality (LLM-as-judge with calibration); resolution rate on a golden set of ~200 historical conversations.
  - Online: CSAT (user thumbs up/down), escalation rate, time-to-resolution, repeat-contact rate (did the same user return for the same issue within 24h?).
  - Caveats: LLM-as-judge has position/verbosity biases — randomise pair order, rubric-anchor each criterion.

- **Common failure modes:**
  - Hallucination ("Your account is on plan X" when it isn't). Mitigation: ground every claim in retrieved chunks; refuse if no relevant chunk.
  - KB drift: KB updates, but cached embeddings are stale. Mitigation: re-embed on update; mark stale chunks.
  - Confidence miscalibration: model says 0.9 but is wrong. Mitigation: calibrate against ground truth; lower the auto-respond threshold.
  - Prompt injection: user types instructions that try to override the system prompt. Mitigation: input filtering; structured separation of user vs system content.

- **Applies to this codebase:** `no`. reincodes has no support surface, no users with questions, no knowledge base. It's a portfolio + DSA visualizer.

- **How to make it apply:** This is a thought-experiment template for this codebase, not a buildable target. The closest in-scope work is the **RAG pipeline visualizer** (`aieng-curriculum.md:524`) which exercises retrieval + reranking without the full chatbot wrapper. The full chatbot pattern is anchored to **loopd** in the curriculum, not reincodes. Defending this template in an interview would mean using the loopd RAG and aipe slash-command work as proof of the pattern, with reincodes as the visualization surface for *parts* of it (retrieval, embeddings) but not the whole pipeline.

---

Updated: 2026-05-12 — initial version (system-design template, Applies: no, refactor path notes the RAG-pipeline visualizer as the in-scope alternative; the full pattern is anchored to loopd not reincodes).
