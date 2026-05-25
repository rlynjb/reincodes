# Tech support chatbot system design

**Industry name(s):** Conversational support, RAG-backed chatbot, escalation routing, IK Module: Tech support chatbot
**Type:** Industry standard

> The interview prompt: "Design a tech support chatbot that resolves customer questions, escalates to a human when needed, and improves over time from feedback." The 9-bullet reframe walks the architecture, data model, scale concerns at concrete thresholds, eval framing, and reincodes applicability.

**See also:** → [../03-retrieval-and-rag/11-rag.md](../03-retrieval-and-rag/11-rag.md) · → [../04-agents-and-tool-use/04-tool-routing.md](../04-agents-and-tool-use/04-tool-routing.md) · → [../05-evals-and-observability/04-llm-observability.md](../05-evals-and-observability/04-llm-observability.md)

---

- **The prompt:** Design a tech support chatbot that takes a customer message, retrieves relevant knowledge-base articles, generates a helpful response or routes to a human agent, and learns from feedback.

- **Standard architecture:**

  ```
  ┌─ Indexing (offline) ─────────────────────────────────────────────┐
  │  KB articles ──► chunker ──► embedder ──► vector index           │
  │                                                                  │
  │  Past resolved tickets ──► embedder ──► resolutions index        │
  └──────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼  serves
  ┌─ Conversation turn (online, p95 < 5s end-to-end) ────────────────┐
  │                                                                  │
  │  user message ──► intent classifier (small fast model)           │
  │                    │                                             │
  │                    ├─ FAQ-shaped ──► RAG over KB ──► generate    │
  │                    ├─ Account ─────► tool call (account API)     │
  │                    ├─ Complaint ───► escalate (skip generation)  │
  │                    └─ Out of scope ► refuse + redirect           │
  │                                                                  │
  │  generated reply ──► safety filter ──► return to user            │
  │                          │                                       │
  │                          ▼                                       │
  │                    log (prompt, response, citations, tools)      │
  │                                                                  │
  └──────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼  every conversation
  ┌─ Feedback loop ──────────────────────────────────────────────────┐
  │  thumbs-up/down ──► annotation queue ──► weekly fine-tune          │
  │  escalations ─────► failure case set ──► next iteration of prompts │
  └──────────────────────────────────────────────────────────────────┘
  ```

- **Data model:**
  - **KB article**: `{ doc_id, title, body, embedding, last_updated_at, tags, category }` — the canonical knowledge source; embedded chunks indexed in a vector store.
  - **Conversation**: `{ conv_id, user_id, started_at, messages[], status, escalated_to_human_at, csat_score }` — every turn captured for analysis and replay.
  - **Tool call log**: `{ call_id, conv_id, tool_name, args, result, latency_ms, error }` — separate from messages so tool failures can be analyzed without conversation noise.
  - **Annotation**: `{ conv_id, turn_index, label, annotator, rubric_scores, notes }` — human labels for the eval set; used to fine-tune the response model and tune the intent classifier.

- **Key components:**
  - *Intent classifier*: small model (Haiku, GPT-5-nano) returning a typed enum `{ intent: "faq" | "account" | "complaint" | "out_of_scope" }`. Choice: explicit routing beats letting the main LLM decide implicitly — faster, cheaper, and easier to add a new intent without retraining.
  - *RAG pipeline*: hybrid retrieval (dense + BM25 + RRF) over the KB, retrieve top-20, rerank to top-5, generate the answer with citations. Choice: citations are non-negotiable for support — every claim has to link back to a KB article so a human can verify.
  - *Tool calling*: typed tool schemas for account-API calls (`get_subscription`, `update_email`, `lookup_order`). Choice: typed schemas + strict validation; tool errors return structured error objects the LLM can recover from.
  - *Escalation router*: rule-based + ML — if confidence < 0.6 OR intent is "complaint" OR user has been in the conversation > 5 turns without resolution → escalate. Choice: rules + ML beats pure ML because rules ship the same day; the ML refines them over months.
  - *Safety filter*: output-side check for PII echoing, off-topic answers, broken citations. Choice: defense in depth — the prompt should already prevent these, but the post-hoc filter catches what slips through.

- **Scale concerns:**
  - At ~10k conversations/day: per-conversation logging fills the warehouse fast (~10GB/day raw). Solution: sample full logs at 10% for analysis, but always log structured fields (intent, tool calls, escalation flag); compress the message bodies.
  - At ~100 escalations/day: human-agent queue can back up. Solution: pre-route escalations to specialist queues by intent + product area; surface "wait time" estimate to the user; for low-priority intents, offer "we'll email you" as the path off the queue.
  - At ~1M KB chunks: vector retrieval latency creeps past 200ms at p95. Solution: shard the index by product / language / locale; route via the intent classifier; cache the top-50 docs for high-volume queries.

- **Eval framing:**
  - Offline: resolution rate (chatbot resolved without escalation), citation accuracy (% of claims grounded in retrieved KB), intent-classifier F1 per class, tool-call success rate.
  - Online: CSAT (customer satisfaction post-conversation), escalation rate (lower = better, with floor), time-to-resolution, repeat-contact rate (user comes back with the same question in 7 days = bot didn't resolve it).
  - Framing notes: don't optimize purely for "deflection" — a bot that refuses everything has 0% escalation rate but also 0% resolution. The right joint metric is "resolution rate at fixed CSAT floor."

- **Common failure modes:**
  - Hallucination: bot answers confidently with content not in the KB. Mitigation: retrieval-first prompting ("only use information from the provided context"); citations validated against retrieved chunks; flag low-grounding responses for human review.
  - Infinite loop: bot keeps clarifying without progressing toward a resolution. Mitigation: track conversation turns; if no resolution by turn 5 OR no new information in last 2 turns, escalate to human.
  - Tool-call cascade: one tool call fails, model retries, retry fails, model panics. Mitigation: bounded retries (max 2 per tool), structured error responses the model can reason about, fallback to "I'm having trouble with that — let me get a human."
  - Stale KB: KB article updated but embedding not re-indexed; bot cites the old version. Mitigation: `last_indexed_at` per doc; background re-indexer; staleness banner in citations when over a threshold.

- **Applies to this codebase:** **no** — reincodes is a Next.js static-export DSA visualizer + portfolio with no customer-support surface, no users to chat with, no knowledge base, no escalation path. The static-export contract precludes the always-on backend the chatbot needs (RAG retrieval at request time, tool calls to account APIs, human-agent queue).

- **How to make it apply:** as a thought experiment for interview prep, the closest framing in reincodes is the planned `/ai/rag` visualizer named in `../03-retrieval-and-rag/11-rag.md` — it demonstrates the retrieval-generate-cite shape against a precomputed corpus, which is the closest reincodes can come to "RAG-backed support" under the static-export contract. The escalation routing and human-agent components are out of scope for any browser-side visualizer; they belong in a different project entirely (a project with a real backend, real users, a real support workload).
