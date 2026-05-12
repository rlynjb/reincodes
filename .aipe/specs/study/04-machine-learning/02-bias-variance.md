# Bias-variance tradeoff

**Industry name(s):** Bias-variance tradeoff, underfitting/overfitting, model complexity
**Type:** Industry standard

> The fundamental tension in supervised ML: simple models miss patterns (high bias); complex models overfit noise (high variance). Not yet built — slated as a reincodes bias-variance interactive.

**See also:** → [01-classical-metrics](./01-classical-metrics.md)

---

## Why care

Your classifier is 99% accurate on training data and 60% on holdout. The fix isn't "more data" or "more layers" — it's understanding *which side* of the bias-variance tradeoff you're on. Too simple (high bias, underfitting): both train and test errors are high. Too complex (high variance, overfitting): train error is tiny, test error is huge. The art is finding the sweet spot.

This sits in **data and model quality** — every supervised model has a bias-variance signature, and every "ML didn't work" failure traces to one side of this tradeoff.

---

## How it works

Picture trying to draw a line through scattered data points. A perfectly straight line (high bias): probably misses the true curvy pattern. A wiggly line that hits every point (high variance): clearly capturing noise as if it were signal. A smoothly curved line: probably right, balancing fidelity and smoothness.

### The decomposition

For squared error on a new point:

```
Expected error = Bias² + Variance + Irreducible noise

  Bias²       = "how wrong is the average prediction?"
  Variance    = "how much do predictions change with different training sets?"
  Irreducible = "noise in the labels themselves"
```

You can lower bias *or* variance, but reducing one tends to increase the other — that's the tradeoff.

### Underfitting signatures

```
Linear regression on non-linear data:

  Train error: 0.45  ← high
  Test error:  0.47  ← also high (and close to train)
  → High bias. Model isn't expressive enough.
  Fix: more features, more capacity, less regularisation.
```

### Overfitting signatures

```
1000-parameter neural net on 100 examples:

  Train error: 0.01  ← tiny
  Test error:  0.55  ← huge gap
  → High variance. Model memorising noise.
  Fix: more regularisation, simpler model, more data, dropout.
```

### Sweet spot

```
A well-tuned random forest:

  Train error: 0.08
  Test error:  0.11   ← small gap, both low
  → Generalising well.
```

### Controls

The model's "capacity" is the lever:

```
Lower capacity = higher bias, lower variance:
  - Linear instead of polynomial
  - Smaller neural net
  - More regularisation (L1, L2, weight decay)
  - Fewer features
  - Shallower decision trees

Higher capacity = lower bias, higher variance:
  - Polynomial features
  - Larger neural net
  - Less regularisation
  - More features (with care)
  - Deeper trees / more trees
```

### The principle

This is what people mean by *the central tradeoff of supervised ML*. Almost every ML knob — regularisation strength, model size, feature count, ensemble depth — is fundamentally turning the bias-variance dial.

The full picture is below.

---

## Bias-variance — diagram

```
Test error as a function of model complexity:

  error
    ▲
    │
    │     ←─── bias-variance sum ─────→
    │  ╲                            ╱
    │   ╲                          ╱
    │    ╲                        ╱
    │     ╲ bias²                ╱  variance
    │      ╲    ─────╲          ╱
    │       ╲         ╲ optimal╱
    │   bias²╲────╲   │       ╱  variance↑
    │   high  ╲   ╲   │      ╱
    │       . . . . . . . . . . . . . . irreducible
    │
    └──────────────────────────────────────▶  model complexity

  Left:  underfitting (high bias, low variance)
  Right: overfitting  (low bias, high variance)
  Middle: sweet spot
```

---

## In this codebase

**Not yet implemented.** Curriculum's `[C3.9]` "Bias-variance and ensembles" is **Case B** — slated as **Bias-variance interactive** (curriculum line 527).

---

## Elaborate

### Where this pattern comes from
Bias-variance decomposition is from statistical learning theory (Geman, Bienenstock, Doursat, 1992). The concept of overfitting predates ML — appears in classical statistics under "model overfitting."

### The deeper principle
*A model that memorises every training point won't generalise.* The signal in data is general; the noise is specific to your sample. Distinguishing signal from noise is the central problem.

### Where this breaks down
- Very large modern neural nets (GPT-scale) seem to escape classic overfitting via *double descent* — the curve looks more complex.
- The decomposition is exact for squared error; approximate for other losses (cross-entropy).
- In high dimensions, "more capacity" can mean things classic theory didn't anticipate.

### What to explore next
- Cross-validation for choosing the bias-variance sweet spot.
- Regularisation (L1, L2, dropout, early stopping) as bias-variance levers.
- Ensembles (bagging reduces variance; boosting reduces bias).

---

## Tradeoffs

### Comparison table

```
┌──────────────────┬──────────────────────────┬──────────────────────────┐
│ Cost dimension   │ Simple model (high bias) │ Complex model (high var) │
├──────────────────┼──────────────────────────┼──────────────────────────┤
│ Train error      │ High                     │ Very low                 │
│ Test error       │ High (close to train)    │ High (far from train)    │
│ Compute          │ Cheap                    │ Expensive                │
│ Interpretability │ Easy                     │ Hard                     │
│ Data hunger      │ Low                      │ High                     │
│ Fix              │ Add capacity, features   │ Regularise, more data    │
└──────────────────┴──────────────────────────┴──────────────────────────┘
```

### The breakpoint

The "right" complexity depends on data size, signal-to-noise ratio, and the cost of being wrong. There's no universal answer — empirical via cross-validation is the only honest method.

---

## Tech reference (industry pairing)

### Model selection tooling

- **Codebase would use:** scikit-learn `cross_val_score` + `GridSearchCV` for parameter search.
- **Leading today:** scikit-learn for classical ML — `adoption-leading`, 2026.
- **Runner-up:** Optuna — `innovation-leading` for hyperparameter search; integrates with PyTorch / TF.

---

## Project exercises

### Bias-variance interactive (curriculum reference: `Interview prep surface — reincodes`)

- **Exercise ID:** *[reincodes-viz: Bias-variance interactive]* — `aieng-curriculum.md:527`, exercises C3.9.
- **What to build:** A page with a scatter plot of noisy data (sine wave + noise) and a fitted model. Slider for "model complexity" (polynomial degree from 1 to 15). Show train error and test error on two separate held-out folds. As the user drags the slider: low degree → underfit (line is too straight, both errors high); high degree → overfit (curve hits every train point, test error explodes); middle → balanced.
- **Why it earns its place:** the bias-variance tradeoff is the most important concept in ML and the most often misunderstood. A slider showing the U-curve of test error vs complexity makes it intuitive.
- **Files to touch:** `src/app/concepts/ml/bias-variance/page.tsx` (new), `src/components/ML/BiasVariance.tsx` (new), polynomial regression in TypeScript (no external lib needed).
- **Done when:** Slider smoothly moves complexity; train error monotonically decreases; test error U-shapes; the sweet spot is visible and labelled.
- **Estimated effort:** `1–2 days`.

---

## Summary

### Part 1 — concept recap

Bias-variance tradeoff describes the U-shape of test error vs model complexity: simple models have high bias (miss patterns), complex models have high variance (overfit noise), and the sweet spot is in between. reincodes doesn't have it yet; the curriculum slates a bias-variance interactive. The constraint is "this is the most important concept in ML and the most often misunderstood," and the cost is the build effort.

### Part 2 — key points to remember

- Bias = wrong on average; variance = inconsistent across training samples.
- Underfit: train ≈ test, both high; fix with more capacity.
- Overfit: train tiny, test huge; fix with regularisation or more data.
- Regularisation, model size, feature count, ensemble depth all turn this dial.
- Cross-validation finds the sweet spot empirically.

---

## Interview defense

### Likely questions

**Q [mid]: What's the difference between underfitting and overfitting?**

A: Underfitting: the model is too simple to capture the data — both train and test errors are high and close together. Overfitting: the model captures training data perfectly but fails on new data — train error is tiny, test error is large.

**Q [senior]: You see train error 0.05 and test error 0.55. What do you try?**

A: Overfitting. Three moves: (1) regularise — L1/L2 penalty, dropout, early stopping; (2) reduce model capacity — fewer parameters, shallower tree; (3) more data — both train and test improve when more signal is available. Cross-validate to confirm.

**Q [arch]: For loopd's classifier with ~50 labelled examples, which side of the tradeoff are you on?**

A: 50 examples is small — almost any non-trivial classifier overfits. The right move: start simple (logistic regression with hand-picked features), heavy regularisation, cross-validate on small folds. If still overfitting, the answer is more data, not a bigger model.

### One-line anchors

- "Simple = high bias; complex = high variance."
- "U-shaped test error vs complexity."
- "Train ≈ test high → underfit; train low, test high → overfit."
- "Almost every ML knob turns this dial."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Draw the bias-variance U-curve with axes labelled.

### Level 2 — Explain it out loud
"What does it mean when train error is 0.02 but test error is 0.40?"

### Level 3 — Apply it to a new scenario
"You have a 10-feature dataset, 1000 examples. A random forest with 1000 trees has train error 0.01 and test error 0.15. Should you simplify the model?"

### Level 4 — Defend the decision you'd change
"For contrl-mo's form classifier with limited labelled data, would you reach for a small LR/GBT or a deep net?"

### Quick check
- Currently implemented? → No, Case B.
- Underfit signature? → train ≈ test, both high.
- Overfit signature? → train tiny, test huge.

✓ Pass: all three.
