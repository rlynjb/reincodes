# Object detection / CV system design

**Industry name(s):** Object detection, computer vision pipeline, IK Module: Object detection
**Type:** Industry standard

> The canonical interview prompt for image-based detection systems; thought experiment for reincodes since the codebase has no image surface or vision pipeline.

**See also:** → [../01-classical-metrics](../01-classical-metrics.md)

---

- **The prompt:** Design a computer-vision system that detects and locates objects (people, vehicles, products) in an image or video stream.

- **Standard architecture:**

  ```
  ┌─ Camera / image source ─────────────────┐
  │  webcam / phone / surveillance / drone  │
  └─────────────────────────────────────────┘
            │
            ▼
  ┌─ Preprocessing ─────────────────────────┐
  │  resize, normalise, format (RGB/BGR)    │
  └─────────────────────────────────────────┘
            │
            ▼
  ┌─ Detection model ───────────────────────┐
  │  YOLO / SSD / Faster R-CNN              │
  │  output: bounding boxes + class + conf  │
  └─────────────────────────────────────────┘
            │
            ▼
  ┌─ Post-processing ───────────────────────┐
  │  NMS (non-max suppression)              │
  │  confidence threshold                   │
  └─────────────────────────────────────────┘
            │
            ▼
  ┌─ Tracking (video only) ─────────────────┐
  │  link detections across frames          │
  │  ByteTrack / DeepSORT                    │
  └─────────────────────────────────────────┘
            │
            ▼
  ┌─ Downstream ────────────────────────────┐
  │  alerts, counting, dashboards, actions  │
  └─────────────────────────────────────────┘
  ```

- **Data model:**
  - `frames{id, source_id, timestamp, image_path}` — raw input.
  - `detections{frame_id, bbox[x,y,w,h], class, confidence}` — model output.
  - `tracks{track_id, detections[], start_frame, end_frame}` — temporal grouping.
  - `model_versions{...}` — registry.

- **Key components:**
  - *Preprocessor*: resize to model input (640×640 for YOLO), normalise pixel values.
  - *Detector*: YOLO v8/v10 (real-time), Faster R-CNN (higher accuracy, slower), DETR (transformer-based, newer).
  - *NMS*: removes overlapping boxes for the same object — keep highest confidence within an IoU window.
  - *Tracker* (video): assigns persistent IDs across frames using motion + appearance.
  - *Edge vs cloud*: on-device for latency (mobile YOLO Tiny); cloud for accuracy (larger models).

- **Scale concerns:**
  - At ~1 fps single camera: any model works; cloud inference fine.
  - At ~30 fps single camera: needs real-time model (YOLO) at the edge; ~33ms budget/frame.
  - At ~1000 cameras × 30 fps: GPU clusters, model sharding, frame-level load balancing. Latency-budget vs accuracy choice gets tight.

- **Eval framing:**
  - Offline: mAP (mean Average Precision at various IoU thresholds), per-class AP, recall at fixed precision.
  - Online: detection rate on production traffic, false-positive rate by category, model drift over time.
  - Caveats: COCO-style mAP doesn't capture all errors; tracking ID switches and fragmentation need separate metrics. Edge cases (occlusion, motion blur, lighting) need adversarial eval sets.

- **Common failure modes:**
  - Domain gap (training on COCO, deployed in factory). Mitigation: fine-tune on target domain; collect labelled examples from production.
  - Adversarial patches (designed to fool detectors). Mitigation: ensemble; spatial dropout.
  - Class imbalance (most frames have only "person", rare classes underperform). Mitigation: weighted loss; balanced sampling.
  - Latency vs accuracy tradeoff. Mitigation: model quantisation; distillation to smaller model.

- **Applies to this codebase:** `no`. reincodes has no image surface, no CV, no inference. It's a Next.js SPA with no media processing.

- **How to make it apply:** Object detection is anchored to **contrl-mo** in the curriculum — pose-landmark detection via MediaPipe is essentially a constrained CV task (track 33 keypoints rather than bounding boxes, but the same pipeline shape: preprocess → model → post-process → downstream). For reincodes, this template is a thought experiment. The closest in-scope reincodes work is *no direct viz* — CV pipelines don't visualize well as static-site SPAs. The interview-defence angle: use contrl-mo's MediaPipe Worklets implementation as the proof of CV pipeline understanding.

---

Updated: 2026-05-12 — initial version (system-design template, Applies: no, refactor path notes contrl-mo as the curriculum-anchored buildable target; explicit that this template doesn't have a natural reincodes viz form).
