# Development Phases

## Overview

The system is built in 15 phases (0–14). Each phase must be fully tested and committed before the next begins.

| Phase | Name | Key Output |
|-------|------|-----------|
| 0 | Architecture & Foundation | Docs, structure, CI, env config |
| 1 | ESP32 + Servo Control | Hardware abstraction, mock controller |
| 2 | Manual Control Dashboard | Frontend D-pad, backend command API |
| 3 | Predefined YES/NO Gestures | Gesture engine, stored sequences |
| 4 | Live Head Tracking | OpenCV + MediaPipe, pose estimation |
| 5 | Human → Robot Mimic | Live mimic mode with smoothing |
| 6 | Gesture Data Collection | Training UI, feature extraction, sample storage |
| 7 | Gesture Model Training | Training pipeline, model versioning |
| 8 | Live Gesture Prediction | Inference on live camera stream |
| 9 | ESP32 Model Interface | ML → Movement Engine → HAL integration |
| 10 | Speech-to-Text | Microphone input, STT integration |
| 11 | NLP / Intent Engine | Intent classification, gesture triggering |
| 12 | Audience Face Detection | Multi-face tracking, attention switching |
| 13 | Time-Aware Greeting | Time-based greeting generator |
| 14 | Complete Presentation Mode | Full pipeline integration |

---

## Phase Completion Criteria

A phase is complete when:
1. All features of the phase are implemented
2. Unit/API/integration tests pass
3. No known critical bugs
4. Code is documented
5. Changes are committed to Git with clear message
6. Branch is pushed to GitHub

**A phase is NOT complete if tests fail or code does not run.**

---

## Phase 0 — Architecture & Project Foundation

**Goal**: Establish the complete project scaffold before writing any application logic.

Deliverables:
- [ ] Repository initialized with branch strategy
- [ ] Complete directory structure (frontend + backend)
- [ ] All documentation files in `docs/`
- [ ] `.env.example` with all required variables
- [ ] `.gitignore` comprehensive
- [ ] Backend: `requirements.txt`, `requirements-dev.txt`
- [ ] Backend: FastAPI app skeleton that starts and serves `/api/v1/health`
- [ ] Backend: Database setup (SQLAlchemy + Alembic init)
- [ ] Backend: Config system (Pydantic Settings)
- [ ] Backend: Logging setup
- [ ] Backend: All ORM models defined
- [ ] Backend: All schemas defined
- [ ] Backend: Test infrastructure (pytest + conftest)
- [ ] Frontend: Vite + React + TypeScript initialized
- [ ] Frontend: Basic routing (all pages as stubs)
- [ ] Frontend: Sidebar navigation
- [ ] Frontend: API client setup
- [ ] Frontend: Test infrastructure (Vitest)
- [ ] GitHub Actions CI workflow
- [ ] Git commit + push

---

## Phase 1 — ESP32 + Two Servo Control

**Goal**: First working hardware control layer with mock and real controllers.

Deliverables:
- [ ] `hardware/base.py` — abstract `HardwareController`
- [ ] `hardware/mock_controller.py` — full simulation
- [ ] `hardware/esp32_controller.py` — serial/wifi stub
- [ ] `hardware/servo_controller.py` — angle math and validation
- [ ] Backend: servo config loaded from DB on startup
- [ ] Backend: `HardwareService` factory
- [ ] API: `POST /api/v1/robots/{id}/commands`
- [ ] API: `GET /api/v1/robots/{id}/status`
- [ ] Tests: mock controller command validation
- [ ] Tests: angle limit enforcement
- [ ] Tests: emergency stop

---

## Phase 2 — Manual Control Dashboard

**Goal**: Working frontend that controls robot via backend API.

Deliverables:
- [ ] Frontend: `RobotControlPage` with D-pad
- [ ] Frontend: Hold-to-move behavior (mousedown/mouseup)
- [ ] Frontend: Real-time angle display
- [ ] Frontend: Connection status indicator
- [ ] Frontend: Error display
- [ ] Backend: Command logging to DB
- [ ] WebSocket: servo_position events
- [ ] Tests: D-pad interaction tests
- [ ] Tests: command debounce tests

---

## Phase 3 — Predefined YES/NO Gestures

**Goal**: Deterministic gesture execution from stored definitions.

Deliverables:
- [ ] DB: gestures table seeded with YES and NO
- [ ] Backend: `GestureEngine` reads sequence from DB
- [ ] Backend: Gesture execution API
- [ ] Frontend: Gesture buttons (YES, NO, CENTER)
- [ ] Tests: YES gesture sequence validation
- [ ] Tests: NO gesture sequence validation
- [ ] Tests: concurrent gesture request handling

---

## Phases 4–14

See individual design documents for detailed implementation plans.
Each phase builds incrementally on the previous.
