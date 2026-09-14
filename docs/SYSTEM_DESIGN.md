# System Design — AI Humanoid Presentation Robot

## Purpose

This document describes the high-level system design of the AI Humanoid Presentation Robot platform. It captures the overall product vision, component responsibilities, and how the system achieves its goals.

---

## Product Vision

Build an AI-powered humanoid presentation robot whose head movements are driven by:

1. **Manual control** — direct operator commands
2. **Human imitation** — robot mirrors a detected human's head pose via camera
3. **Trained gesture execution** — ML-recognized gestures trigger servo actions
4. **Presentation intelligence** — speech + NLP drives contextually appropriate movements
5. **Audience tracking** — face-directed attention toward multiple detected audience members

---

## System Overview

### Physical Components

| Component | Role |
|-----------|------|
| ESP32 microcontroller | Executes servo PWM commands |
| MG996R/MG995 Servo #1 | PAN axis (left/right, yaw) |
| MG996R/MG995 Servo #2 | TILT axis (up/down, pitch) |
| USB Camera | Head pose and face detection |
| Microphone | Speech input |
| Host PC / Server | Runs both software services |

### Software Services

Only two deployable services:

| Service | Technology | Port |
|---------|-----------|------|
| Frontend | React 18 + TypeScript + Vite | 5173 |
| Backend | Python 3.11 + FastAPI | 8000 |

---

## Subsystem Map

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                             │
│  Dashboard │ Robot Ctrl │ Tracking │ Training │ Presentation│
└──────────────────────────┬──────────────────────────────────┘
                           │ REST / WebSocket
┌──────────────────────────▼──────────────────────────────────┐
│                         BACKEND                             │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
│  │  Camera  │  │   Head   │  │ Gesture  │  │  Speech   │  │
│  │ Pipeline │  │ Tracking │  │ Engine   │  │   / NLP   │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └─────┬─────┘  │
│       │             │             │               │         │
│  ┌────▼─────────────▼─────────────▼───────────────▼─────┐  │
│  │              Movement Decision Engine                  │  │
│  └───────────────────────────┬────────────────────────────┘  │
│                              │                               │
│  ┌───────────────────────────▼────────────────────────────┐  │
│  │             Hardware Abstraction Layer (HAL)            │  │
│  │        MockController │ ESP32Controller                 │  │
│  └───────────────────────────┬────────────────────────────┘  │
│                              │                               │
│                   Database (SQLite → PostgreSQL)             │
└──────────────────────────────┬──────────────────────────────┘
                               │ Serial / Wi-Fi / WebSocket
                          ┌────▼────┐
                          │  ESP32  │
                          └────┬────┘
                         ┌─────┴──────┐
                         ▼            ▼
                      PAN Servo   TILT Servo
                     (MG996R)    (MG996R)
```

---

## Data Flow Summary

### Manual Control Flow
```
Operator → Frontend button → REST POST /api/v1/robots/{id}/commands
  → Movement Decision Engine → HAL → ESP32 → Servo
```

### Head Mimic Flow
```
Camera → OpenCV → MediaPipe → Yaw/Pitch → Mapping → HAL → ESP32
```

### Presentation Flow
```
Microphone → STT → NLP → Intent → Movement Engine → HAL → ESP32
Camera → Face Detection → Audience Tracking → Attention Target → HAL
```

### Gesture Training Flow
```
Camera → Landmarks → Feature Extraction → SQLite → Training Pipeline
  → Model File → Activation → Inference Service → Movement Engine
```

---

## Key Design Principles

1. **Hardware never directly exposed** — frontend never talks to ESP32
2. **HAL always interchangeable** — MockController ↔ ESP32Controller
3. **ML not required for basic function** — deterministic control works without trained models
4. **Two services only** — no separate ML, NLP, or camera microservices
5. **Database for metadata, filesystem for binaries** — models/videos live in `data/`
6. **WebSocket for live data** — pose, status, predictions stream over WS
7. **REST for commands and configuration** — durable, idempotent operations use REST
8. **Phase-gated development** — each capability verified independently before integration

---

## Simulation Mode

The entire system operates without physical hardware using `MockController`.

Simulation behavior:
- Commands are validated and accepted
- Virtual servo positions are tracked in-memory
- Position changes are streamed via WebSocket
- Frontend displays simulated angles
- Allows full development and testing without an ESP32
