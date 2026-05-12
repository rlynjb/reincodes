# Classical metrics: precision, recall, F1, confusion matrix

**Industry name(s):** Classical ML metrics, confusion matrix, precision/recall/F1, AUC-ROC
**Type:** Industry standard

> The metrics that quantify classifier performance — precision (don't be wrong) and recall (don't miss) and their compromise F1, derived from the confusion matrix. Not yet built in this codebase — slated as a reincodes confusion-matrix interactive.

**See also:** → [02-bias-variance](./02-bias-variance.md) · → [03-ml-observability-tooling](./03-ml-observability-tooling.md)

---

## Why care

A medical-test classifier says "you have disease X" with 99% accuracy. Sounds great — until you realise the disease has 1% prevalence, so the classifier could be "always say no" and still hit 99% accuracy. Accuracy alone is misleading. Precision and recall (and F1) pull apart what "correct" means in different operating regimes.

This sits in **classical ML metrics** — the foundation of every supervised-learning evaluation. The same metrics apply to retrieval (search relevance), spam detection, fraud, and any binary or multi-class classifier.

---

## How it works

Picture sorting mail into two piles: "spam" and "important." Four outcomes per email: (1) actually spam, correctly flagged (TP); (2) actually spam, missed (FN); (3) actually important, incorrectly flagged (FP); (4) actually important, correctly kept (TN). The confusion matrix is the 2×2 table of these counts.

### The confusion matrix

```
                          Predicted
                       ┌──────────┬──────────┐
                       │ Positive │ Negative │
                       ├──────────┼──────────┤
              Actual + │   TP     │    FN    │
              positive │          │ (miss)   │
                       ├──────────┼──────────┤
              Actual - │   FP     │    TN    │
              negative │ (false   │          │
                       │  alarm)  │          │
                       └──────────┴──────────┘
```

### Precision, recall, F1

```
Precision = TP / (TP + FP)        "of what I predicted positive, how many actually were"
Recall    = TP / (TP + FN)        "of what was actually positive, how many did I catch"
F1        = 2 × P × R / (P + R)   "harmonic mean of precision and recall"
Accuracy  = (TP + TN) / total
```

The harmonic mean punishes imbalance — F1 is high only when *both* P and R are high.

### Trace: 100 emails, 10 are spam

```
Classifier A: "always predict spam"
                 Pred=spam  Pred=ham
  Actual=spam      10          0      → TP=10, FN=0
  Actual=ham       90          0      → FP=90, TN=0

  Precision = 10 / (10+90) = 0.10   ← bad
  Recall    = 10 / (10+0)  = 1.00   ← perfect
  F1        = 2*0.10*1 / 1.10 = 0.18
  Accuracy  = (10+0) / 100 = 0.10


Classifier B: "always predict ham"
                 Pred=spam  Pred=ham
  Actual=spam       0         10     → TP=0, FN=10
  Actual=ham        0         90     → FP=0, TN=90

  Precision = 0 / (0+0)  = undefined (0/0)
  Recall    = 0 / (0+10) = 0.00
  F1        = 0
  Accuracy  = 90 / 100 = 0.90    ← misleading — but you missed every spam


Classifier C (better): 9 TP, 1 FN, 5 FP, 85 TN
  Precision = 9 / (9+5)  = 0.643
  Recall    = 9 / (9+1)  = 0.900
  F1        = 2*0.643*0.9 / 1.543 = 0.750
  Accuracy  = (9+85) / 100 = 0.940
```

### When to optimise precision vs recall

```
Optimise precision when FP is expensive:
  - Spam filter (don't flag legit emails)
  - Recommender ("user clicks something" — don't show garbage)

Optimise recall when FN is expensive:
  - Cancer screening (don't miss a case)
  - Fraud detection (don't let bad transactions through)
  - Form-quality classifier (don't miss a "bad form" — would let user reinforce it)

F1 when both matter equally.
```

### Multi-class extension

For C classes (say 5 exercise types in contrl-mo), you get a C×C confusion matrix. Per-class precision/recall is row/column normalisation. **Macro-F1** averages F1 across classes equally (good for imbalanced); **micro-F1** sums TP/FP/FN globally (good for balanced).

### The principle

This is what people mean by *the right metric depends on what's expensive*. There's no universally-correct metric — there's "the metric that aligns with the cost of mistakes in your domain."

The full picture is below.

---

## Confusion matrix — diagram

```
A classifier emits Pred = Pos or Pred = Neg.
Truth has Actual = Pos or Actual = Neg.

  Total = TP + FP + FN + TN

  P = "what I predict positive"  ─── how many right?    → Precision = TP / (TP + FP)
  R = "what is actually positive" ─── how many caught?  → Recall    = TP / (TP + FN)

  Trade them off:
    higher threshold → fewer predictions → higher precision, lower recall
    lower threshold  → more predictions  → higher recall,    lower precision

  F1 = harmonic mean (penalises imbalance).
```

---

## In this codebase

**Not yet implemented.** reincodes has no classifier. Curriculum's `[C3.4]` "Classical metrics" is **Case B** — slated as the **Confusion matrix interactive** (curriculum line 526).

---

## Elaborate

### Where this pattern comes from
Information retrieval: precision and recall date to Cleverdon (1966) at the Cranfield experiments. F1 from Rijsbergen (1979). Confusion matrix from statistical decision theory, predates computing.

### The deeper principle
*Every metric encodes a value judgment about what kind of mistake is worse.* Accuracy treats FP and FN as equal; precision says "FN is fine, FP is the enemy"; recall says the opposite. Knowing your domain's cost structure picks your metric.

### Where this breaks down
- Heavily imbalanced classes — F1 still works but accuracy is meaningless.
- Calibrated probabilities matter (not just classifications) — use Brier score or log-loss.
- Multi-label problems — micro/macro/sample-average F1 each tell different stories.

### What to explore next
- AUC-ROC and AUC-PR — threshold-agnostic.
- Calibration plots — does the model's "0.8 confidence" actually mean 80% correct?
- Precision@k, MRR, NDCG — ranking-specific metrics.

---

## Tradeoffs

### Comparison table

```
┌──────────────────┬──────────────────────────┬──────────────────────────┐
│ Cost dimension   │ Accuracy                 │ F1                       │
├──────────────────┼──────────────────────────┼──────────────────────────┤
│ Intuition        │ % correct                │ Balance of P and R       │
│ Imbalanced data  │ Misleading               │ Robust                   │
│ Captures FP/FN   │ Combined                 │ Separated then averaged  │
│ Use case         │ Balanced classes only    │ General                  │
└──────────────────┴──────────────────────────┴──────────────────────────┘
```

### What we gave up

Single-number simplicity. Precision and recall are *two* numbers; people want one. F1 is the compromise that hides the tradeoff but at least doesn't lie about it.

### The breakpoint

Always use precision+recall on classification problems. Accuracy alone is wrong outside balanced datasets.

---

## Tech reference (industry pairing)

### scikit-learn metrics

- **Codebase would use:** `sklearn.metrics.confusion_matrix`, `classification_report`.
- **Why it'd be here:** the standard implementation for ML eval.
- **Leading today:** scikit-learn — `adoption-leading` for classical ML metrics, 2026.
- **Why it leads:** standard everywhere; consistent API; trusted implementations.

---

## Project exercises

### Confusion matrix interactive (curriculum reference: `Interview prep surface — reincodes`)

- **Exercise ID:** *[reincodes-viz: Confusion matrix interactive]* — `aieng-curriculum.md:526`, exercises **C3.4** + C3.11.
- **What to build:** An interactive confusion matrix viz. Pre-canned dataset (or hand-crafted toy: 5-class exercise form classifier from contrl-mo). Show the matrix. Hover any cell to see: what kind of error it represents (false positive of class X confused with class Y), per-class precision/recall/F1 update live, what happens to overall macro-F1 if you change the threshold. Plus a slider for class threshold.
- **Why it earns its place:** the metrics are abstract until you can see "moving threshold X up trades 2 recalls for 5 precisions." This is the most concrete way to teach precision/recall tradeoffs.
- **Files to touch:** `src/app/concepts/ml/confusion-matrix/page.tsx` (new), `src/components/ML/ConfusionMatrix.tsx` (new), hard-coded sample predictions JSON (or simulate from a probability distribution).
- **Done when:** Hovering any cell highlights its row and column with per-class P/R/F1 displayed. Adjusting the decision threshold smoothly updates the matrix and the metrics. Macro/micro F1 distinction visible.
- **Estimated effort:** `1–2 days`.

---

## Summary

### Part 1 — concept recap

Confusion matrix is the 2×2 (or C×C) tally of predicted vs actual classes. Precision = "of what I called positive, how many were"; recall = "of what was positive, how many did I catch"; F1 = their harmonic mean. reincodes doesn't have a classifier; the curriculum slates a confusion-matrix interactive viz. The constraint is "metrics depend on what's expensive in the domain," and the cost is the build effort plus careful design of a demo dataset.

### Part 2 — key points to remember

- Confusion matrix = TP, FP, FN, TN.
- Precision = TP/(TP+FP); Recall = TP/(TP+FN); F1 = harmonic mean.
- Accuracy lies on imbalanced data.
- Trade precision for recall by threshold movement.
- Multi-class: macro vs micro F1.

---

## Interview defense

### Likely questions

**Q [mid]: Cancer screening: optimise precision or recall?**

A: Recall. Missing a cancer (FN) is fatal; a false alarm (FP) costs a biopsy. The asymmetric cost of mistakes is what drives the choice.

**Q [senior]: A classifier reports 99% accuracy on a 1%-positive class. Is it good?**

A: Probably not. "Always predict negative" hits 99% accuracy on this class distribution. I'd ask for the confusion matrix or per-class metrics. F1 would expose this immediately — if the positive class's recall is 0%, F1 is 0 regardless of accuracy.

**Q [arch]: At 1M predictions/day, how do you monitor classifier health?**

A: Stream predictions + ground truth (when available) into a metrics service. Per-class precision/recall on rolling windows. Alert on drift — sudden recall drop on class X. AUC-PR is better than AUC-ROC at this scale because it's robust to imbalance. Sample mislabelled examples for human review to spot data drift.

### One-line anchors

- "Precision: how often you're right when you say yes."
- "Recall: how many true yeses you catch."
- "F1 punishes imbalance; accuracy hides it."
- "The right metric depends on the cost of being wrong."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Draw a 2×2 confusion matrix. Mark all four cells. Compute P/R/F1 for sample (TP=8, FP=2, FN=3, TN=87).

### Level 2 — Explain it out loud
"Why is accuracy misleading on imbalanced data?"

### Level 3 — Apply it to a new scenario
"A fraud detector flags 0.1% of transactions. You see 99.95% accuracy. Is the system working?"

### Level 4 — Defend the decision you'd change
"For loopd's todo classifier (5 types), which metric matters most?"

### Quick check
- Currently implemented? → No, Case B.
- F1 formula? → `2PR/(P+R)`.
- Why not accuracy alone? → misleading on imbalanced data.

✓ Pass: all three.
