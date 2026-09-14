# Database Design — AI Humanoid Presentation Robot

## Database Choice

- **Development**: SQLite via `DATABASE_URL=sqlite:///./data/robot.db`
- **Production**: PostgreSQL (same schema, drop-in via connection string change)
- **ORM**: SQLAlchemy 2.x with Alembic migrations
- All schema changes go through Alembic — no manual DDL

---

## Entity Relationship Overview

```
users
  └── (auth / future multi-user)

robots
  └── servo_configs (1:N)
  └── robot_commands (1:N)

gestures
  └── training_samples (1:N)

training_datasets
  └── training_samples (1:N)
  └── model_versions (1:N, via training)

model_versions
  └── predictions (1:N)

presentation_sessions
  └── audience_sessions (1:N)
  └── speech_events (1:N)

system_events (standalone audit log)
```

---

## Tables

### users

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| name | VARCHAR(255) | |
| email | VARCHAR(255) UNIQUE | |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

---

### robots

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| name | VARCHAR(255) | e.g. "PresentationBot-v1" |
| device_type | VARCHAR(100) | "ESP32" |
| connection_type | VARCHAR(50) | mock / serial / wifi / websocket |
| connection_config | JSON | port, host, baud_rate, etc. |
| status | VARCHAR(50) | disconnected / connecting / connected / error |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

---

### servo_configs

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| robot_id | UUID FK → robots | |
| servo_name | VARCHAR(100) | "pan" or "tilt" |
| axis | VARCHAR(50) | "yaw" or "pitch" |
| min_angle | FLOAT | mechanical safe minimum |
| max_angle | FLOAT | mechanical safe maximum |
| center_angle | FLOAT | neutral/home position |
| speed | FLOAT | degrees per second |
| sensitivity | FLOAT | multiplier for human→robot mapping |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

---

### gestures

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| name | VARCHAR(100) UNIQUE | YES, NO, LOOK_LEFT, etc. |
| description | TEXT | |
| type | VARCHAR(50) | predefined / trained |
| configuration | JSON | sequence steps for predefined |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

Predefined gesture configuration example:
```json
{
  "sequence": [
    {"command": "CENTER", "duration_ms": 300},
    {"command": "DOWN", "duration_ms": 400},
    {"command": "CENTER", "duration_ms": 300},
    {"command": "DOWN", "duration_ms": 400},
    {"command": "CENTER", "duration_ms": 300}
  ],
  "loop": false,
  "smooth": true
}
```

---

### training_datasets

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| name | VARCHAR(255) | |
| description | TEXT | |
| version | VARCHAR(50) | |
| status | VARCHAR(50) | draft / ready / archived |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

---

### training_samples

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| dataset_id | UUID FK → training_datasets | |
| gesture_id | UUID FK → gestures | |
| feature_file | VARCHAR(500) | path to .npz / .json feature sequence |
| raw_media_file | VARCHAR(500) | optional path to raw video |
| duration | FLOAT | seconds |
| frame_count | INTEGER | |
| created_at | TIMESTAMP | |

Feature file format (stored as JSON or .npz):
```json
{
  "frames": [
    {
      "timestamp": 0.0,
      "yaw": -12.3,
      "pitch": 4.1,
      "roll": 0.8,
      "landmarks": [[x0,y0],[x1,y1],...],
      "confidence": 0.97
    },
    ...
  ]
}
```

---

### model_versions

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| name | VARCHAR(255) | gesture_model_v001 |
| version | VARCHAR(50) | v001, v002, ... |
| model_type | VARCHAR(100) | sklearn_rf / lstm / rule_based |
| model_file | VARCHAR(500) | path to model binary |
| feature_schema | JSON | expected input schema |
| metrics | JSON | accuracy, f1, confusion matrix |
| status | VARCHAR(50) | training / ready / active / archived |
| dataset_id | UUID FK → training_datasets | |
| created_at | TIMESTAMP | |

Only ONE model should have `status = 'active'` for any given task type.

---

### predictions

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| model_version_id | UUID FK → model_versions | |
| predicted_gesture | VARCHAR(100) | |
| confidence | FLOAT | 0.0–1.0 |
| source | VARCHAR(50) | live / test |
| raw_input | JSON | optional feature snapshot |
| created_at | TIMESTAMP | |

---

### presentation_sessions

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| title | VARCHAR(255) | |
| status | VARCHAR(50) | idle / active / paused / ended |
| started_at | TIMESTAMP | |
| ended_at | TIMESTAMP | |

---

### audience_sessions

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| presentation_session_id | UUID FK | |
| person_identifier | VARCHAR(100) | face tracking ID |
| first_seen | TIMESTAMP | |
| last_seen | TIMESTAMP | |
| attention_score | FLOAT | cumulative attention time |

---

### speech_events

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| presentation_session_id | UUID FK | |
| text | TEXT | raw transcript |
| intent | VARCHAR(100) | GREETING, QUESTION, etc. |
| confidence | FLOAT | NLP confidence |
| created_at | TIMESTAMP | |

---

### robot_commands

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| robot_id | UUID FK → robots | |
| command_type | VARCHAR(100) | move_pan, move_tilt, gesture, center, stop |
| payload | JSON | {"axis":"pan","angle":45} |
| source | VARCHAR(50) | manual / mimic / gesture / nlp / audience |
| status | VARCHAR(50) | pending / sent / acknowledged / failed |
| created_at | TIMESTAMP | |

---

### system_events

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| event_type | VARCHAR(100) | camera_start, hardware_error, model_activated, etc. |
| severity | VARCHAR(50) | INFO / WARNING / ERROR / CRITICAL |
| message | TEXT | |
| metadata | JSON | |
| created_at | TIMESTAMP | |

---

## Migration Strategy

All schema changes must use Alembic:

```bash
# Create a new migration
alembic revision --autogenerate -m "add feature_schema to model_versions"

# Apply migrations
alembic upgrade head

# Roll back one step
alembic downgrade -1
```

Migrations are committed to version control.
Production deployments run `alembic upgrade head` before starting the service.
