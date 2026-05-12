# 04 — Machine learning

Classical ML concepts the curriculum says reincodes should host as interview-prep vizzes. All files are **Case B** — none implemented today.

The codebase has no ML surface (no trained models, no inference, no datasets). These files are present because the curriculum (`~/.config/aipe/global/aieng-curriculum.md`) explicitly tags reincodes as the "interview prep surface" for ML concepts shipped in **contrl-mo** (form classifier, recommender, on-device inference).

## Files (grouped by sub-discipline)

### Metrics
1. **[01-classical-metrics](./01-classical-metrics.md)** — curriculum `[C3.4]`. The buildable target: confusion matrix interactive.

### Data and model quality
2. **[02-bias-variance](./02-bias-variance.md)** — curriculum `[C3.9]`. Bias-variance interactive.

### ML observability
3. **[03-ml-observability-tooling](./03-ml-observability-tooling.md)** — curriculum `[C3.11]`. Tooling extension to the confusion-matrix viz.

## ML features in this codebase (today)

| Feature | Model type | Inference location |
|---|---|---|
| *None* | — | reincodes has no trained models. contrl-mo (linked from the home page) does the on-device pose inference; this site doesn't. |

## What's planned (Case B inventory)

The curriculum's "Interview prep surface — reincodes" section places ML-side vizzes alongside the AI ones:

```
[ ] Confusion matrix interactive  → exercises C3.4, C3.11
[ ] Bias-variance interactive     → exercises C3.9
```

Both visualize ML metrics + tradeoffs that interview-loop classifier-design questions probe. The `## Project exercises` block of each file is the build spec.

## Why no full ML pipeline?

ML pipelines (data → features → training → eval → serving) are anchored to **contrl-mo** in the curriculum. reincodes is the *interview-prep visualizer surface* — the place where ML metrics and concepts get rendered interactively, so the user can demonstrate understanding without running an actual training job in a portfolio site. The full pipeline lives in contrl-mo's repo.

→ See [`system-design-templates/`](./system-design-templates/) for IK-style interview reframes (recommender, anomaly detection, object detection / CV).
