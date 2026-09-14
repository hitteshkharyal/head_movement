# ML Pipeline Design

## Design Philosophy

Build the simplest thing that works first.
Introduce complexity only when simpler approaches fail.

Progression:
```
Rule-based (deterministic)
  ↓ (if insufficient)
Feature-based classifier (SVM, Random Forest)
  ↓ (if insufficient)
Temporal classifier (LSTM, 1D-CNN)
  ↓ (if insufficient)
Full neural network
```

For YES/NO head gestures, a feature-based temporal classifier is expected to perform well.

---

## Feature Extraction Pipeline

```
Camera Frame
  ↓
OpenCV decode
  ↓
MediaPipe FaceMesh (468 landmarks)
  ↓
Select key landmarks (subset: eyes, nose, chin, cheeks)
  ↓
Normalize to face bounding box
  ↓
Estimate head pose (yaw, pitch, roll) via PnP solve
  ↓
Feature vector per frame:
  [yaw, pitch, roll, landmark_subset_normalized..., confidence]
  ↓
Sliding window buffer (e.g., 30 frames)
  ↓
Training sample or inference input
```

---

## Feature Schema

```json
{
  "schema_version": "1.0",
  "features_per_frame": 9,
  "feature_names": [
    "yaw", "pitch", "roll",
    "left_eye_x", "left_eye_y",
    "right_eye_x", "right_eye_y",
    "nose_x", "nose_y"
  ],
  "window_size": 30,
  "stride": 1
}
```

All models must record their feature schema in `model_versions.feature_schema`.
This prevents inference with mismatched features.

---

## Training Pipeline

```
1. Select dataset
2. Validate (minimum samples per class, no corruption)
3. Load feature sequences
4. Pad/truncate to uniform window size
5. Normalize (zero-mean, unit-variance per feature)
6. Split: 70% train / 15% validation / 15% test
7. Train model
8. Evaluate on validation set
9. Final evaluation on test set
10. Save model + scaler + feature schema
11. Record metrics in DB
```

### Validation Requirements

Minimum before training:
- At least 2 gesture classes
- At least 10 samples per class
- No zero-length sequences
- Feature schema consistency across samples

---

## Initial Model: Random Forest on Flattened Window

Phase 7 starting point:

```python
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline

model = Pipeline([
    ('scaler', StandardScaler()),
    ('classifier', RandomForestClassifier(
        n_estimators=100,
        random_state=42
    ))
])

# Input: flattened window → shape (n_samples, window_size * n_features)
# Output: class label + probabilities
```

Upgrade path to LSTM if Random Forest underperforms.

---

## Model Versioning

```
gesture_model_v001/
  ├── model.pkl         # Sklearn pipeline
  ├── metadata.json     # Training date, dataset, metrics
  └── evaluation.json   # Per-class accuracy, confusion matrix
```

Version naming: `v001`, `v002`, `v003`...

Only one model is `active` at a time.

---

## Inference Pipeline

```
Sliding window buffer (last N frames of features)
  ↓
Check: buffer full? (>= window_size frames)
  ↓
Load active model
  ↓
Predict class + probabilities
  ↓
Confidence threshold check (default: 0.85)
  ↓
Cooldown check (avoid re-triggering same gesture)
  ↓
Debounce (require N consecutive confident predictions)
  ↓
Emit prediction event
  ↓
Movement Decision Engine
```

### Prediction Smoothing

Do NOT trigger on a single frame.

Requirements:
- Minimum consecutive confident frames: 5 (configurable)
- Confidence threshold: 0.85 (configurable)
- Cooldown after gesture: 1.0 second (configurable)

---

## Metrics Tracked

| Metric | Description |
|--------|-------------|
| Accuracy | Overall classification accuracy |
| Per-class accuracy | Accuracy for each gesture class |
| F1-score (macro) | Balanced accuracy across classes |
| Confusion matrix | Visual error analysis |
| Training time | Seconds |
| Inference latency | Milliseconds per prediction |

---

## Model Evaluation Report Format

```json
{
  "model_version": "v001",
  "trained_at": "2026-09-14T10:00:00Z",
  "dataset_id": "...",
  "feature_schema_version": "1.0",
  "train_samples": 150,
  "val_samples": 32,
  "test_samples": 32,
  "metrics": {
    "train_accuracy": 0.97,
    "val_accuracy": 0.91,
    "test_accuracy": 0.89,
    "f1_macro": 0.88
  },
  "confusion_matrix": [[28, 1, 0], [2, 27, 1], [0, 1, 30]],
  "class_labels": ["YES", "NO", "NEUTRAL"],
  "training_time_seconds": 4.2,
  "inference_latency_ms": 1.1
}
```
