# ML system design templates

Three IK-style interview reframes for classical ML system design. Each uses the **9-bullet system-design shape**.

## Files

1. **[01-recommender-system](./01-recommender-system.md)** — design a recommender that ranks personalised items.
2. **[02-anomaly-detection](./02-anomaly-detection.md)** — design a system that flags unusual events.
3. **[03-object-detection-cv](./03-object-detection-cv.md)** — design a CV pipeline for object detection in images/video.

## What these are

Same 9-bullet shape as the AI-side templates:

- `The prompt:`
- `Standard architecture:`
- `Data model:`
- `Key components:`
- `Scale concerns:`
- `Eval framing:`
- `Common failure modes:`
- `Applies to this codebase:`
- `How to make it apply:`

## Applies table

| Template | Applies to reincodes? | Refactor path |
|---|---|---|
| Recommender system | `no` | Anchored to **contrl-mo** (workout-progression recommender). For reincodes, defending this template means pointing at contrl-mo work. |
| Anomaly detection | `no` | Anchored to **contrl-mo** ("bad form" reps as anomalies in pose-landmark stream). For reincodes, thought experiment only. |
| Object detection / CV | `no` | Anchored to **contrl-mo** (MediaPipe pose detection — same pipeline shape: preprocess → model → post-process). For reincodes, no natural viz form. |

## How to use

- These templates exist so that ML interview questions about *common system shapes* have a pre-thought-out answer.
- All three apply to contrl-mo (the on-device pose + form-classifier + progression recommender project), not reincodes.
- For an ML interview about reincodes-style work specifically (visualizers, metrics displays), point at the planned bias-variance + confusion-matrix vizzes in this section's parent dir.
