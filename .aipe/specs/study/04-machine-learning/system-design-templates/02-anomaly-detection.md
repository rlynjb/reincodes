# Anomaly detection system design

**Industry name(s):** Anomaly detection, novelty detection, outlier detection, IK Module: Anomaly detection
**Type:** Industry standard

> The canonical interview prompt for detecting unusual events; thought experiment for reincodes since the codebase has no event stream to monitor.

**See also:** → [../01-classical-metrics](../01-classical-metrics.md)

---

- **The prompt:** Design an anomaly detection system that flags unusual events in a stream of input data (fraud, network intrusion, defect, etc.).

- **Standard architecture:**

  ```
  ┌─ Event stream ──────────────────────────┐
  │  transactions / logs / sensor readings  │
  └─────────────────────────────────────────┘
            │
            ▼
  ┌─ Feature extraction ────────────────────┐
  │  per-event: amount, location, timing    │
  │  per-entity (rolling): freq, mean, std  │
  └─────────────────────────────────────────┘
            │
            ▼
  ┌─ Anomaly scorer ────────────────────────┐
  │  ┌─ Unsupervised (Isolation Forest,    │
  │  │   autoencoder reconstruction error) │
  │  └─ Supervised (when labels available, │
  │      e.g., past fraud cases)           │
  └─────────────────────────────────────────┘
            │
            ▼
  ┌─ Thresholding + routing ────────────────┐
  │  score > threshold → flag for review     │
  │  high score → block immediately          │
  │  medium score → soft-decline + step-up   │
  └─────────────────────────────────────────┘
            │
            ▼
  ┌─ Feedback loop ─────────────────────────┐
  │  human review → label → retrain         │
  └─────────────────────────────────────────┘
  ```

- **Data model:**
  - `events{id, entity_id, type, payload, timestamp}` — the stream.
  - `entity_profile{id, rolling_features, last_updated}` — per-entity statistics.
  - `anomaly_scores{event_id, score, model_version, scored_at}` — predictions.
  - `reviews{event_id, label, reviewed_at, reviewer_id}` — human-in-the-loop labels.
  - `model_versions{...}` — registry.

- **Key components:**
  - *Feature extractor*: stateful per-entity (rolling means, frequencies); stateless per-event (amount, time-of-day, distance from usual).
  - *Anomaly scorer*: Isolation Forest for fully unsupervised; one-class SVM for "normal vs everything else"; autoencoder reconstruction error for high-dimensional data; supervised GBT when fraud labels exist.
  - *Threshold tuner*: precision-recall curve on labelled data → pick operating point.
  - *Reviewer queue*: items above threshold go to humans; their labels feed back into training.

- **Scale concerns:**
  - At ~100 events/sec: simple unsupervised on a single host.
  - At ~10k events/sec: feature extraction needs caching of per-entity rolling state (Redis or stream-processor like Kafka Streams).
  - At ~1M events/sec: shard by entity_id; precompute features in a feature store; serve model on GPU; cost dominated by feature computation, not the model.

- **Eval framing:**
  - Offline: precision @ k (top-k anomalies), recall @ k, mean precision (MAP), confusion matrix at threshold.
  - Online: precision-after-review (of flagged events, what % were actually anomalies), recall (of known historical anomalies, what % the system would have caught).
  - Caveats: ground truth is expensive — humans label slowly. Adversarial: attackers adapt to your detector. Drift: "normal" changes over time (new product launch shifts the distribution).

- **Common failure modes:**
  - Distribution drift (normal shifts). Mitigation: rolling-window retraining; drift detector on input distribution.
  - Adversarial inputs (attackers learn the detector). Mitigation: ensemble of detectors with different features; periodic blind tests.
  - Class imbalance (anomalies are rare). Mitigation: use precision-recall not accuracy; consider PR-AUC; oversampling at training time.
  - High false-positive rate (reviewers overwhelmed). Mitigation: tighter threshold; risk-tiered routing.

- **Applies to this codebase:** `no`. reincodes has no event stream. The featured-projects + DSA visualizers are static; nothing to monitor or anomaly-detect.

- **How to make it apply:** Anomaly detection is anchored to **contrl-mo** in the curriculum (detecting "bad form" reps is a one-class classification problem). For reincodes, this template is a thought experiment. The bias-variance interactive ([02-bias-variance](../02-bias-variance.md)) is the in-scope reincodes work most relevant to defending this template's design choices (model complexity for anomaly scoring).

---

Updated: 2026-05-12 — initial version (system-design template, Applies: no, refactor path notes contrl-mo as the curriculum-anchored buildable target).
