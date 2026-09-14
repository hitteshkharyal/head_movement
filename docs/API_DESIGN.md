# API Design — AI Humanoid Presentation Robot

## Conventions

- Base path: `/api/v1/`
- Content-Type: `application/json`
- Authentication: Bearer token (Phase 0 uses none; add in production)
- Error format:
```json
{
  "error": "VALIDATION_ERROR",
  "message": "Angle 200 exceeds maximum allowed 180",
  "detail": { ... }
}
```
- Success responses include an `id` and `created_at` where applicable
- Paginated lists use: `?page=1&page_size=20`

---

## Endpoints

### Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/health` | Service health, version, uptime |

Response:
```json
{
  "status": "ok",
  "version": "0.1.0",
  "uptime_seconds": 1234,
  "database": "connected",
  "hardware": "mock",
  "camera": "idle"
}
```

---

### Robots

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/robots` | List robots |
| POST | `/api/v1/robots` | Create robot |
| GET | `/api/v1/robots/{id}` | Get robot |
| PATCH | `/api/v1/robots/{id}` | Update robot |
| GET | `/api/v1/robots/{id}/status` | Live status |
| POST | `/api/v1/robots/{id}/connect` | Connect to hardware |
| POST | `/api/v1/robots/{id}/disconnect` | Disconnect |

---

### Servos

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/servos/config` | Get servo configurations |
| PATCH | `/api/v1/servos/config/{id}` | Update servo config |

---

### Robot Commands

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/robots/{id}/commands` | Send command |
| GET | `/api/v1/robots/{id}/commands` | Command history |

Command payload examples:
```json
{"command": "CENTER"}
{"command": "MOVE_PAN", "angle": 45}
{"command": "MOVE_TILT", "angle": 60}
{"command": "LEFT"}
{"command": "RIGHT"}
{"command": "UP"}
{"command": "DOWN"}
{"command": "STOP"}
{"command": "EMERGENCY_STOP"}
```

---

### Gestures

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/gestures` | List gestures |
| POST | `/api/v1/gestures` | Create gesture |
| GET | `/api/v1/gestures/{id}` | Get gesture |
| PATCH | `/api/v1/gestures/{id}` | Update gesture |
| DELETE | `/api/v1/gestures/{id}` | Delete gesture |
| POST | `/api/v1/gestures/{id}/execute` | Execute gesture |

---

### Camera

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/camera/start` | Start camera pipeline |
| POST | `/api/v1/camera/stop` | Stop camera pipeline |
| GET | `/api/v1/camera/status` | Camera status |
| GET | `/api/v1/camera/frame` | Get current JPEG frame |

---

### Head Tracking

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/head-tracking/status` | Tracking status |
| POST | `/api/v1/head-tracking/start` | Start tracking |
| POST | `/api/v1/head-tracking/stop` | Stop tracking |
| POST | `/api/v1/head-tracking/calibrate` | Set current pose as neutral |
| GET | `/api/v1/head-tracking/config` | Sensitivity/mapping config |
| PATCH | `/api/v1/head-tracking/config` | Update config |

---

### Datasets

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/datasets` | List datasets |
| POST | `/api/v1/datasets` | Create dataset |
| GET | `/api/v1/datasets/{id}` | Get dataset |
| DELETE | `/api/v1/datasets/{id}` | Delete dataset |
| GET | `/api/v1/datasets/{id}/samples` | List samples |
| POST | `/api/v1/datasets/{id}/samples` | Upload sample |
| DELETE | `/api/v1/datasets/{id}/samples/{sample_id}` | Delete sample |

---

### Training

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/training/start` | Start training job |
| GET | `/api/v1/training/{job_id}/status` | Training status |
| POST | `/api/v1/training/{job_id}/cancel` | Cancel training |

---

### Models

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/models` | List model versions |
| GET | `/api/v1/models/{id}` | Get model details |
| POST | `/api/v1/models/{id}/activate` | Set as active model |
| POST | `/api/v1/models/{id}/deactivate` | Deactivate model |
| POST | `/api/v1/models/{id}/archive` | Archive model |
| GET | `/api/v1/models/{id}/export` | Download model file |

---

### Predictions

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/predictions` | Prediction history |
| POST | `/api/v1/predictions/test` | Test with manual feature input |

---

### Speech

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/speech/status` | STT service status |
| POST | `/api/v1/speech/start` | Start listening |
| POST | `/api/v1/speech/stop` | Stop listening |
| GET | `/api/v1/speech/transcript` | Recent transcript |

---

### NLP

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/nlp/analyze` | Analyze text for intent |
| GET | `/api/v1/nlp/intents` | List configured intents |
| GET | `/api/v1/nlp/config` | NLP configuration |
| PATCH | `/api/v1/nlp/config` | Update configuration |

NLP analyze request:
```json
{"text": "Do you agree with this approach?"}
```

NLP analyze response:
```json
{
  "text": "Do you agree with this approach?",
  "intent": "QUESTION_AGREEMENT",
  "gesture": "YES",
  "confidence": 0.91,
  "action_triggered": false
}
```

---

### Audience

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/audience/status` | Current audience detection status |
| POST | `/api/v1/audience/start` | Start audience tracking |
| POST | `/api/v1/audience/stop` | Stop audience tracking |
| GET | `/api/v1/audience/config` | Tracking configuration |
| PATCH | `/api/v1/audience/config` | Update configuration |

---

### Presentation

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/presentation/sessions` | List sessions |
| POST | `/api/v1/presentation/sessions` | Start new session |
| GET | `/api/v1/presentation/sessions/{id}` | Session details |
| POST | `/api/v1/presentation/sessions/{id}/end` | End session |
| GET | `/api/v1/presentation/greeting` | Get time-aware greeting |

---

### System

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/system/logs` | System event log |
| GET | `/api/v1/system/config` | Application configuration |
| POST | `/api/v1/system/emergency-stop` | Emergency stop all hardware |

---

## WebSocket

### Connection

```
ws://localhost:8000/ws/live
```

### Message Format

```json
{
  "type": "head_pose",
  "timestamp": "2026-09-14T10:00:00.000Z",
  "data": {
    "yaw": -18.2,
    "pitch": 7.4,
    "roll": 1.2,
    "confidence": 0.97,
    "face_detected": true
  }
}
```

### Event Types

| Type | Description | Frequency |
|------|-------------|-----------|
| `head_pose` | Live yaw/pitch/roll | Per frame (~30fps) |
| `servo_position` | Current pan/tilt degrees | On change |
| `robot_status` | Connection, errors | On change |
| `gesture_prediction` | ML prediction result | On prediction |
| `audience_update` | Detected faces, target | Per frame |
| `speech_transcript` | Partial/final transcript | Streaming |
| `nlp_intent` | Intent + gesture recommendation | Per utterance |
| `system_event` | Log message | On event |

### Client → Server (Commands over WS)

```json
{
  "action": "subscribe",
  "channels": ["head_pose", "servo_position", "robot_status"]
}
```

```json
{
  "action": "unsubscribe",
  "channels": ["head_pose"]
}
```
