# File Management Design

## Philosophy

The database stores **metadata and references**.
The filesystem stores **large binary artifacts**.

Never store:
- Video files in database BLOBs
- Trained model binaries in database rows
- Raw numpy arrays in database columns

Always store in filesystem with path reference in database.

---

## Directory Layout

```
data/
├── datasets/
│   ├── raw/               # Original unprocessed recordings (optional)
│   │   └── {dataset_id}/{sample_id}.mp4
│   ├── processed/         # Extracted feature sequences
│   │   └── {dataset_id}/{sample_id}.json
│   └── exports/           # Exported dataset packages
│       └── {dataset_id}_v{version}.zip
│
├── models/
│   ├── trained/           # All trained model files
│   │   └── {model_id}/
│   │       ├── model.pkl  # or model.pt / model.onnx
│   │       ├── metadata.json
│   │       └── evaluation.json
│   ├── active/            # Symlink/copy of currently active model
│   │   └── gesture_model/
│   │       └── model.pkl
│   └── archived/          # Deactivated old models
│       └── {model_id}/
│
├── recordings/
│   ├── sessions/          # Full presentation session recordings
│   │   └── {session_id}/
│   │       ├── video.mp4
│   │       └── audio.wav
│   └── samples/           # Individual gesture training samples
│       └── {sample_id}/
│           ├── video.mp4  # Optional raw video
│           └── features.json  # Primary ML representation
│
├── logs/
│   └── app_{date}.log
│
└── temp/                  # Short-lived processing files, cleaned on restart
    └── {job_id}/
```

---

## File Naming Rules

### NEVER use user-supplied filenames directly

All files are named with system-generated safe IDs:

```python
import uuid

def safe_filename(extension: str) -> str:
    return f"{uuid.uuid4().hex}{extension}"
```

### File type validation

Accepted types:
- Video: `.mp4`, `.avi`, `.webm`
- Feature sequences: `.json`, `.npz`
- Models: `.pkl`, `.pt`, `.onnx`, `.h5`
- Exports: `.zip`

Reject anything else.

### File size limits

| Type | Limit |
|------|-------|
| Training video | 100 MB |
| Feature file | 10 MB |
| Model file | 500 MB |
| Session recording | 1 GB |

Configured via `MAX_UPLOAD_SIZE_MB` environment variable.

---

## Database Path References

Paths stored in database are relative to `DATA_DIRECTORY`:

```
training_samples.feature_file = "datasets/processed/abc123/def456.json"
model_versions.model_file = "models/trained/xyz789/model.pkl"
```

The service layer resolves absolute paths:

```python
def resolve_path(relative_path: str) -> Path:
    return settings.DATA_DIRECTORY / relative_path
```

---

## Cleanup Policy

| Location | Cleanup trigger |
|----------|----------------|
| `data/temp/` | On application startup + daily cron |
| `data/models/archived/` | Manual via admin API |
| `data/recordings/samples/` | When sample deleted via API |
| `data/datasets/raw/` | Optional, user-controlled |

---

## Model File Lifecycle

```
Train
  ↓
Write to data/models/trained/{model_id}/
  ↓
Store path in model_versions.model_file (DB)
  ↓
Evaluate
  ↓
Activate (one active at a time)
  ↓
Copy/symlink to data/models/active/
  ↓
Update model_versions.status = 'active' (DB)
  ↓
Archive old model
  ↓
Move to data/models/archived/
  ↓
Update old model_versions.status = 'archived'
```

---

## Feature Sequence Format

Primary representation for ML training:

```json
{
  "schema_version": "1.0",
  "gesture": "YES",
  "duration_seconds": 2.1,
  "frame_count": 63,
  "fps": 30,
  "frames": [
    {
      "frame_index": 0,
      "timestamp": 0.0,
      "yaw": 0.1,
      "pitch": -0.3,
      "roll": 0.2,
      "landmarks_normalized": [[0.5, 0.4], [0.51, 0.39], ...],
      "face_confidence": 0.99,
      "face_bbox": [x, y, w, h]
    }
  ]
}
```

This is the primary ML artifact. Raw video is optional.
