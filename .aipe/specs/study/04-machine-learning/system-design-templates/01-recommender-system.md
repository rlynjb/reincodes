# Recommender system design

**Industry name(s):** Recommender system, content / collaborative / hybrid recommender, IK Module: Recommender
**Type:** Industry standard

> The canonical interview prompt for recommender architectures; thought experiment for reincodes since the codebase has no users to recommend to.

**See also:** → [../01-classical-metrics](../01-classical-metrics.md)

---

- **The prompt:** Design a recommender system that, given a user, returns a personalised ranked list of items they're likely to engage with.

- **Standard architecture:**

  ```
  ┌─ User signals ────────────────────────────┐
  │  history, clicks, ratings, profile       │
  └───────────────────────────────────────────┘
            │
            ▼
  ┌─ Candidate generation (recall) ──────────┐
  │  ┌─ collaborative filtering ─┐           │
  │  ├─ content-based features  ─┤  → ~1000  │
  │  └─ popularity / new items  ─┘  candidates│
  └───────────────────────────────────────────┘
            │
            ▼
  ┌─ Ranking model (precision) ──────────────┐
  │  features: user × item × context         │
  │  model: LR / GBT / DLRM                  │
  │  output: P(engagement | user, item)      │
  └───────────────────────────────────────────┘
            │
            ▼
  ┌─ Re-rank / business logic ───────────────┐
  │  diversification, freshness boost, ads,  │
  │  guardrails (no NSFW, no banned items)   │
  └───────────────────────────────────────────┘
            │
            ▼
  ┌─ Top-N served to user ───────────────────┐
  │  + impression logged for next training   │
  └───────────────────────────────────────────┘
  ```

- **Data model:**
  - `users{id, profile_features, created_at}` — registration data + derived features.
  - `items{id, content_features, created_at}` — item metadata + content embeddings.
  - `interactions{user_id, item_id, type (view/click/save), timestamp}` — engagement events.
  - `embeddings{user_id, vec[64]}` — collaborative-filtering user vectors.
  - `embeddings{item_id, vec[64]}` — collaborative-filtering item vectors.
  - `model_versions{id, trained_at, eval_metrics, deployed_at}` — registry.

- **Key components:**
  - *Candidate generation*: hybrid — top-K from each: collaborative (matrix factorisation, ALS), content-based (item-features × user-prefs cosine), popularity (trending). Choice: blend ~3 sources for diversity vs concentrated relevance.
  - *Ranking model*: LR for interpretability, GBT (XGBoost / LightGBM) for accuracy, deep models (DLRM) at scale. Choice: GBT for most cases; deep when feature interactions are complex.
  - *Features*: user features (age, history-derived), item features (category, recency), interaction features (user×item past engagement).
  - *Re-rank*: diversification (MMR), freshness boost, business rules.
  - *Logger*: impressions + clicks for next training cycle.

- **Scale concerns:**
  - At ~10k users / 1k items: brute-force per-user × all items; in-memory matrix factorisation. Single host.
  - At ~1M users / 100k items: candidate generation mandatory; ranker scores only top-K candidates. Embeddings + ANN.
  - At ~100M users / 10M items: distributed candidate generation; pre-computed user embeddings; ranking model served on GPU.

- **Eval framing:**
  - Offline: precision@k, recall@k, NDCG against held-out interactions; A/B simulator with click-through replay.
  - Online: CTR, dwell time, completion rate, repeat-visit rate.
  - Caveats: "no click is not a negative label" — user may have intended to click but didn't see. Position bias: top items get more clicks regardless. Adversarial: clickbait gains short-term CTR but hurts long-term satisfaction. Need long-term metrics too (retention, churn).

- **Common failure modes:**
  - Cold-start (new user, no history). Mitigation: profile-based or popularity-based fallback; bandit exploration.
  - Cold-start (new item, no engagement). Mitigation: content-based candidate generation; explore-budget per recommendation slot.
  - Filter bubble (only show items like past clicks). Mitigation: diversification in re-rank stage.
  - Popularity bias (top items get all impressions). Mitigation: inverse-propensity training; explicit diversification.

- **Applies to this codebase:** `no`. reincodes has no users, no recommendations, no engagement signal. The "featured projects" list is hand-curated.

- **How to make it apply:** The recommender pattern is anchored to **contrl-mo** in the curriculum (Phase 2C). For reincodes, this template is a thought experiment — useful for interview prep, not a buildable target. The closest in-scope reincodes work is the [01-classical-metrics](../01-classical-metrics.md) confusion-matrix viz, which can be applied to recommender-output evaluation (precision@k as a confusion-matrix variant).

---

Updated: 2026-05-12 — initial version (system-design template, Applies: no, refactor path notes contrl-mo as the curriculum-anchored buildable target).
