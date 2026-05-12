# ML observability and tooling

**Industry name(s):** ML observability, MLflow, Weights & Biases, model registries
**Type:** Industry standard

> Tools that turn "a model exists somewhere" into "I can see which version was deployed, when, on what data, with what metrics." Not yet built — slated for the confusion-matrix interactive's tooling demonstration in reincodes.

**See also:** → [01-classical-metrics](./01-classical-metrics.md) · → [02-bias-variance](./02-bias-variance.md)

---

## Why care

You trained 30 model variants over a quarter. Three are deployed in different environments; the rest are in your filesystem somewhere. A regression appears in production — which model is running? Which dataset was it trained on? Were these hyperparameters? Without observability tooling, every answer requires archaeology. With it: open the dashboard, click the run, see everything.

This sits in **ML observability** — the operational layer that distinguishes "research code" from "production ML." Same tools span: MLflow for tracking, W&B for experiment management, Phoenix/Langfuse for LLM observability, custom dashboards for in-house needs.

---

## How it works

Picture a research lab notebook for every experiment, automatically captured. Hyperparameters, training data version, code commit, output metrics, the trained model artefact itself — all linked, all queryable. When something breaks in production, you look up which "experiment" is deployed and pull its notebook.

### What gets tracked

For each training run:

```
{
  run_id: "abc123",
  timestamp: "2026-05-10T...",
  git_commit: "7ef02d7",
  dataset_version: "v1.2.0",
  hyperparams: { lr: 0.001, batch_size: 32, ... },
  training_metrics: [ epoch 1 loss, epoch 2 loss, ... ],
  eval_metrics: { precision_per_class: ..., macro_F1: 0.87 },
  artifacts: [ "model.pkl", "confusion_matrix.png" ],
  tags: [ "v1.2-candidate", "improved-recall" ]
}
```

The schema is opinionated: experiment platforms (MLflow, W&B) provide it; the cost is integrating their SDK into your training loop.

### Production observability

After deployment, you also want:

```
{
  model_version: "abc123",
  deployed_at: "2026-05-12T...",
  predictions_count: 12000,
  prediction_distribution: { class_0: 0.85, class_1: 0.10, ... },
  input_drift: { feature_X_KL_divergence: 0.03 },
  prediction_drift: { rolling_24h_mean_change: 0.02 },
  alerts: [ "input_drift_X exceeded threshold" ]
}
```

Drift detection is what separates "monitoring" from "observability." Distribution-of-inputs in production diverges from training distribution → time to retrain.

### The tools

```
MLflow:     open-source, self-host or managed (Databricks).
W&B:        SaaS, generous free tier, great dashboards.
Phoenix:    open-source LLM observability (Arize).
Langfuse:   open-source LLM observability + analytics.
LangSmith:  managed LLM observability (LangChain).
```

For classical ML: MLflow or W&B is the floor. For LLM apps: Langfuse or LangSmith.

### The principle

This is what people mean by *MLOps*. The tools are the boring substrate that makes "model in production" a manageable engineering activity rather than a one-shot research moment.

The full picture is below.

---

## Observability — diagram

```
Training time                       Eval time                  Production
                                                                
  code commit                       golden / adv eval sets        live traffic
       │                                  │                            │
       ▼                                  ▼                            ▼
  hyperparams        ──▶ MLflow / W&B  ◀── eval metrics         ──▶ Phoenix / Langfuse
  dataset version    ──▶  - run_id          - per-class P/R/F1     - prediction logs
  training metrics   ──▶  - artifacts       - confusion matrices   - input drift
  model artifact     ──▶  - tags                                   - prediction drift
                                                                  - latency / cost

                              Search, compare, decide which version to deploy.
                              Alert on drift; trigger retraining.
```

---

## In this codebase

**Not yet implemented.** Curriculum's `[C3.11]` "Tools: Langfuse, LangSmith, Phoenix/Arize — and the ML-side analog: MLflow / W&B" is **Case B** — co-slated with C3.4 as the **Confusion matrix interactive** (curriculum line 526).

reincodes might surface ML observability less as a viz and more as a brief explainer page showing the kinds of dashboards these tools produce, with mocked-up screenshots.

---

## Elaborate

### Where this pattern comes from
MLflow (Databricks, 2018), W&B (2019) made experiment tracking mainstream. Before them, every team rolled their own; some still do (TensorBoard for TF projects). LLM observability (Phoenix, Langfuse, LangSmith) is more recent (2023+) — same idea, different metrics (token usage, prompt versions, chain traces).

### The deeper principle
*Reproducibility is the floor of trustworthy ML.* If you can't reproduce a model, you can't trust it. Observability tooling exists to make reproducibility easy.

### Where this breaks down
- Heavy infra overhead for tiny projects (don't reach for MLflow at 5 experiments).
- Vendor lock-in: leaving W&B means re-exporting all runs.
- Privacy: cloud-hosted tools see your data and metrics.

### What to explore next
- Model registries (where the binaries live).
- Feature stores (Tecton, Feast — keep training and production features in sync).
- Retraining pipelines (Phase 5 of the curriculum).

---

## Tradeoffs

### Comparison table

```
┌──────────────────┬──────────────────────────┬──────────────────────────┐
│ Cost dimension   │ Managed (W&B SaaS)       │ Self-host (MLflow)       │
├──────────────────┼──────────────────────────┼──────────────────────────┤
│ Setup            │ pip install + login       │ Deploy server, DB, S3   │
│ Dollars          │ Free tier → $50–500/mo   │ Compute + storage costs  │
│ Privacy          │ Data in vendor cloud     │ Local                    │
│ Maintenance      │ Vendor                   │ You                      │
│ Scale            │ Vendor handles            │ You handle               │
└──────────────────┴──────────────────────────┴──────────────────────────┘
```

### What we gave up

Without observability tooling: every experiment is a black box, every regression is archaeology.

### The breakpoint

At >10 experiments, observability earns its keep. At <5, a spreadsheet of "what I tried" suffices.

---

## Tech reference (industry pairing)

### Experiment tracking

- **Codebase would use:** MLflow (self-host, free) or W&B (free tier).
- **Leading today:** W&B — `adoption-leading` for ML experiment tracking, 2026.
- **Why it leads:** best dashboards in the category; generous free tier; great Python SDK.
- **Runner-up:** MLflow — `adoption-leading` for self-hosted; the open-source default.

### LLM observability

- **Codebase would use:** Langfuse (self-host or cloud).
- **Leading today:** Langfuse — `innovation-leading` for LLM observability, 2026.
- **Why it leads:** open-source, fast iteration, integrates with most LLM SDKs.
- **Runner-up:** LangSmith — `adoption-leading` for LangChain users; tighter integration with LangChain.

---

## Project exercises

### Confusion matrix interactive (with tooling-demo extension)

- **Exercise ID:** *[reincodes-viz: Confusion matrix interactive]* — `aieng-curriculum.md:526`, exercises C3.4 + **C3.11**.
- **What to build:** Building on the confusion-matrix interactive (see [01-classical-metrics](./01-classical-metrics.md)), add an "experiments view" panel that mocks up what MLflow / W&B would show: a list of "runs" each with hyperparameters, metrics, and a "promote to production" toggle. Compare two runs side by side. The data is mocked but the *shape* is real.
- **Why it earns its place:** observability is conceptually abstract until you see it. A mocked-up dashboard makes "what does an experiment platform actually do" concrete.
- **Files to touch:** `src/app/concepts/ml/observability/page.tsx` (new, may be a sub-route of `/confusion-matrix`), `src/components/ML/RunsList.tsx` (new), mock data JSON.
- **Done when:** The user can browse a list of "runs," click two to compare metrics side by side, and see how the confusion matrix changes between versions. Tooltips explain what each field maps to in MLflow / W&B.
- **Estimated effort:** `1hr–4hr` (extension to the existing exercise).

---

## Summary

### Part 1 — concept recap

ML observability tooling tracks experiments (hyperparameters, datasets, metrics, artifacts) at training time and monitors models (predictions, drift, latency) in production. reincodes doesn't have it yet; the curriculum slates a tooling demo as part of the confusion-matrix interactive. The constraint that justifies tooling is "without it, regressions are archaeology," and the cost is integrating the SDK plus monthly subscription (or self-host ops).

### Part 2 — key points to remember

- Training-time: track hyperparams, dataset version, code commit, metrics, model artefact.
- Production-time: log predictions, monitor input + prediction drift, alert on regression.
- W&B (managed) and MLflow (self-host) are the classical-ML defaults.
- Langfuse / LangSmith are the LLM-observability defaults.
- "Boring substrate" that distinguishes research from production.

---

## Interview defense

### Likely questions

**Q [mid]: Why use MLflow instead of just saving model files locally?**

A: Files lose context. Saving `model_v1.pkl` doesn't tell you what data trained it, what hyperparameters were used, what eval metrics it produced. MLflow links all that. When a regression appears in prod, you look up the run, see everything, decide whether to roll back or retrain.

**Q [senior]: How do you detect when a deployed model is becoming stale?**

A: Two signals. (1) Input drift — the distribution of features in production diverges from training (measure via KL divergence or PSI). (2) Prediction drift — the distribution of predictions shifts (e.g., the "spam" rate doubles overnight, suspicious). Both trigger an alert. The remediation is either retrain on recent data or investigate why the input distribution changed (legitimate user-behaviour shift vs data pipeline bug).

```
Healthy model           Drifting model
  inputs: normal          inputs: shifted distribution → alert
  outputs: stable         outputs: shifted ratio       → alert
  metrics: stable         metrics: degrading           → alert
```

**Q [arch]: For a single-person ML project, do you really need MLflow?**

A: Not on day one. At 5 experiments a notebook + a spreadsheet works. At 50+ experiments or with a teammate, you need it. The transition cost is real (integrate the SDK, learn the dashboards), so picking it up before you need it is overhead. Picking it up after you've lost track of which model is deployed is panic.

### One-line anchors

- "Track everything; assume you'll forget."
- "Drift detection is the production-side observability that matters most."
- "MLflow for classical, Langfuse for LLM."
- "Don't reach for tooling before you have experiments to manage."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Draw training-time tracking and production-time monitoring as two parallel flows.

### Level 2 — Explain it out loud
"What's the difference between input drift and prediction drift?"

### Level 3 — Apply it to a new scenario
"Your loopd classifier has been live for 3 months. How do you tell whether it needs retraining?"

### Level 4 — Defend the decision you'd change
"Would you self-host MLflow or use W&B for contrl-mo's single-person ML pipeline?"

### Quick check
- Currently implemented? → No, Case B.
- Classical-ML tool? → MLflow / W&B.
- LLM tool? → Langfuse / LangSmith.

✓ Pass: all three.
