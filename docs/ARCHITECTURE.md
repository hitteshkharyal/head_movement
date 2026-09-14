# Architecture — AI Humanoid Presentation Robot

## Layer Architecture

```
┌────────────────────────────────────────────────────┐
│                  Presentation Layer                │
│          React 18 + TypeScript + Vite              │
│    Components / Pages / Features / Hooks / Services│
└────────────────────────┬───────────────────────────┘
                         │
              HTTP REST + WebSocket
                         │
┌────────────────────────▼───────────────────────────┐
│                    API Layer                       │
│              FastAPI + Pydantic                    │
│         /api/v1/* routes + /ws/live                │
└────────────────────────┬───────────────────────────┘
                         │
┌────────────────────────▼───────────────────────────┐
│                  Service Layer                     │
│  CameraService │ HeadTrackingService               │
│  GestureService │ TrainingService                  │
│  InferenceService │ SpeechService                  │
│  NLPService │ AudienceService                      │
│  PresentationService │ HardwareService             │
└────────────────────────┬───────────────────────────┘
                         │
┌────────────────────────▼───────────────────────────┐
│             Hardware Abstraction Layer             │
│    HardwareController (abstract base class)        │
│    MockController │ ESP32Controller                │
└────────────────────────┬───────────────────────────┘
                         │
┌────────────────────────▼───────────────────────────┐
│              Data / Persistence Layer              │
│   SQLAlchemy ORM │ Alembic Migrations              │
│   SQLite (dev) │ PostgreSQL (prod)                 │
│   Filesystem: data/ directory                      │
└────────────────────────────────────────────────────┘
```

---

## Backend Package Structure

```
backend/
├── app/
│   ├── main.py               # FastAPI app factory, startup/shutdown lifecycle
│   ├── api/
│   │   └── v1/
│   │       ├── router.py     # Aggregates all v1 routers
│   │       ├── health.py
│   │       ├── robots.py
│   │       ├── servos.py
│   │       ├── gestures.py
│   │       ├── camera.py
│   │       ├── head_tracking.py
│   │       ├── datasets.py
│   │       ├── training.py
│   │       ├── models.py
│   │       ├── predictions.py
│   │       ├── speech.py
│   │       ├── nlp.py
│   │       ├── audience.py
│   │       ├── presentation.py
│   │       └── websocket.py
│   ├── core/
│   │   ├── config.py         # Pydantic Settings from .env
│   │   ├── logging.py        # Structured logging setup
│   │   ├── exceptions.py     # Custom exception hierarchy
│   │   └── security.py       # Input validation, sanitization
│   ├── db/
│   │   ├── base.py           # SQLAlchemy Base
│   │   ├── session.py        # DB session dependency
│   │   └── init_db.py        # DB initialization
│   ├── models/               # SQLAlchemy ORM models
│   │   ├── user.py
│   │   ├── robot.py
│   │   ├── servo_config.py
│   │   ├── gesture.py
│   │   ├── training_dataset.py
│   │   ├── training_sample.py
│   │   ├── model_version.py
│   │   ├── prediction.py
│   │   ├── presentation_session.py
│   │   ├── audience_session.py
│   │   ├── speech_event.py
│   │   ├── robot_command.py
│   │   └── system_event.py
│   ├── schemas/              # Pydantic request/response schemas
│   │   ├── robot.py
│   │   ├── servo.py
│   │   ├── gesture.py
│   │   ├── dataset.py
│   │   ├── training.py
│   │   ├── model.py
│   │   ├── prediction.py
│   │   ├── speech.py
│   │   ├── nlp.py
│   │   ├── audience.py
│   │   └── presentation.py
│   ├── services/
│   │   ├── camera/
│   │   │   ├── camera_service.py
│   │   │   └── frame_processor.py
│   │   ├── vision/
│   │   │   ├── face_detector.py
│   │   │   ├── landmark_extractor.py
│   │   │   └── head_pose_estimator.py
│   │   ├── gestures/
│   │   │   ├── gesture_service.py
│   │   │   ├── gesture_engine.py
│   │   │   └── predefined_gestures.py
│   │   ├── training/
│   │   │   ├── dataset_service.py
│   │   │   ├── preprocessor.py
│   │   │   └── trainer.py
│   │   ├── inference/
│   │   │   ├── inference_service.py
│   │   │   └── model_loader.py
│   │   ├── speech/
│   │   │   ├── speech_service.py
│   │   │   └── providers/
│   │   │       ├── base.py
│   │   │       ├── whisper_provider.py
│   │   │       └── google_provider.py
│   │   ├── nlp/
│   │   │   ├── nlp_service.py
│   │   │   ├── intent_classifier.py
│   │   │   └── providers/
│   │   │       ├── base.py
│   │   │       └── rule_based.py
│   │   ├── audience/
│   │   │   ├── audience_service.py
│   │   │   └── target_selector.py
│   │   ├── presentation/
│   │   │   ├── presentation_service.py
│   │   │   └── greeting_service.py
│   │   └── hardware/
│   │       ├── movement_engine.py
│   │       └── hardware_service.py
│   └── workers/
│       ├── camera_worker.py
│       └── event_broadcaster.py
├── hardware/
│   ├── __init__.py
│   ├── base.py               # Abstract HardwareController
│   ├── mock_controller.py    # Simulation controller
│   ├── esp32_controller.py   # Real ESP32 controller
│   └── servo_controller.py   # Servo angle math/validation
├── migrations/
│   ├── env.py
│   ├── script.py.mako
│   └── versions/
├── tests/
│   ├── conftest.py
│   ├── api/
│   ├── services/
│   └── hardware/
├── scripts/
│   └── seed_data.py
├── data/                     # Runtime data (gitignored except .gitkeep)
├── requirements.txt
├── requirements-dev.txt
├── alembic.ini
└── README.md
```

---

## Frontend Package Structure

```
frontend/
├── src/
│   ├── app/
│   │   ├── App.tsx
│   │   ├── Router.tsx
│   │   └── store.ts           # Global state (Zustand or Context)
│   ├── components/            # Shared, reusable UI components
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Header.tsx
│   │   │   └── Layout.tsx
│   │   ├── ui/
│   │   │   ├── Button.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Badge.tsx
│   │   │   ├── StatusIndicator.tsx
│   │   │   └── AngleDisplay.tsx
│   │   └── charts/
│   │       └── ConfidenceChart.tsx
│   ├── pages/
│   │   ├── DashboardPage.tsx
│   │   ├── RobotControlPage.tsx
│   │   ├── LiveTrackingPage.tsx
│   │   ├── GestureTrainingPage.tsx
│   │   ├── ModelsPage.tsx
│   │   ├── AudiencePage.tsx
│   │   ├── PresentationPage.tsx
│   │   ├── SystemLogsPage.tsx
│   │   └── SettingsPage.tsx
│   ├── features/
│   │   ├── robot/
│   │   │   ├── RobotControlPanel.tsx
│   │   │   ├── DirectionPad.tsx
│   │   │   └── RobotStatus.tsx
│   │   ├── camera/
│   │   │   ├── CameraView.tsx
│   │   │   └── PoseOverlay.tsx
│   │   ├── training/
│   │   │   ├── TrainingPanel.tsx
│   │   │   ├── SampleList.tsx
│   │   │   └── RecordingControls.tsx
│   │   ├── models/
│   │   │   ├── ModelList.tsx
│   │   │   └── ModelMetrics.tsx
│   │   ├── presentation/
│   │   │   ├── PresentationControls.tsx
│   │   │   └── TranscriptView.tsx
│   │   └── audience/
│   │       ├── AudiencePanel.tsx
│   │       └── FaceTracker.tsx
│   ├── services/
│   │   ├── api.ts             # Axios instance + interceptors
│   │   ├── robotService.ts
│   │   ├── cameraService.ts
│   │   ├── trainingService.ts
│   │   ├── modelService.ts
│   │   └── websocketService.ts
│   ├── hooks/
│   │   ├── useWebSocket.ts
│   │   ├── useRobotStatus.ts
│   │   └── useCamera.ts
│   ├── types/
│   │   ├── robot.ts
│   │   ├── gesture.ts
│   │   ├── training.ts
│   │   ├── model.ts
│   │   ├── speech.ts
│   │   └── websocket.ts
│   └── utils/
│       ├── angles.ts
│       ├── formatters.ts
│       └── validators.ts
├── public/
├── tests/
│   ├── components/
│   └── pages/
├── package.json
├── tsconfig.json
├── vite.config.ts
└── vitest.config.ts
```

---

## WebSocket Event Schema

All live events use:

```json
{
  "type": "event_type",
  "timestamp": "2026-09-14T10:00:00Z",
  "data": { ... }
}
```

Event types:
- `head_pose` — yaw, pitch, roll from camera
- `servo_position` — current pan/tilt angles
- `robot_status` — connection, errors
- `gesture_prediction` — prediction + confidence
- `audience_update` — detected faces, current target
- `speech_transcript` — live transcript text
- `nlp_intent` — detected intent + gesture recommendation
- `system_event` — severity, message

---

## Dependency Injection Strategy

FastAPI dependencies (`Depends()`) provide:
- Database sessions
- Hardware controller instance (mock or real, set at startup)
- Settings/config
- Service instances

This ensures the hardware controller can be swapped without modifying route handlers.
