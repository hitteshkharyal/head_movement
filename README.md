# 🤖 AI Humanoid Presentation Robot

A production-quality software platform for an AI-powered humanoid presentation robot using two MG996R/MG995 servo motors controlled via ESP32, with computer vision, gesture recognition, speech-to-text, NLP, and audience tracking.

---

## 📐 Architecture Overview

```
Frontend (React/TypeScript/Vite)
         ↕ REST API / WebSocket
Backend (Python / FastAPI)
    ├── Computer Vision (OpenCV + MediaPipe)
    ├── Head Tracking
    ├── Gesture Training & ML Inference
    ├── Speech-to-Text
    ├── NLP / Presentation Intent Engine
    ├── Audience Tracking
    ├── Presentation Engine
    └── Hardware Abstraction Layer
                  ↕
               ESP32
                  ↕
        MG996R / MG995 Servos
         (PAN)       (TILT)
```

Two deployable services only:
- **Service 1** — Frontend (React + Vite, port 5173)
- **Service 2** — Backend (FastAPI, port 8000)

---

## 📦 Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite |
| Backend | Python 3.11+, FastAPI |
| Computer Vision | OpenCV, MediaPipe |
| Database | SQLite (dev) → PostgreSQL (prod) |
| Hardware | ESP32 + MG996R/MG995 servos |
| Migrations | Alembic |
| Testing (BE) | Pytest |
| Testing (FE) | Vitest + React Testing Library |
| Linting | ESLint, Ruff, mypy |
| CI/CD | GitHub Actions |

---

## 🗂️ Project Structure

```
head_movement/
├── frontend/           # React/TypeScript/Vite frontend
├── backend/            # Python/FastAPI backend
├── docs/               # Architecture and design documentation
├── .github/            # GitHub Actions CI/CD workflows
├── .env.example        # Environment variable template
├── .gitignore
└── README.md
```

---

## 🚦 Development Phases

| Phase | Description | Status |
|-------|-------------|--------|
| 0 | Architecture & Project Foundation | ✅ Complete |
| 1 | ESP32 + Two Servo Control | 🔲 Pending |
| 2 | Manual Robot Control Dashboard | 🔲 Pending |
| 3 | Predefined YES/NO Gestures | 🔲 Pending |
| 4 | Live Human Head Tracking | 🔲 Pending |
| 5 | Live Human → Robot Mimic Mode | 🔲 Pending |
| 6 | Gesture Data Collection UI | 🔲 Pending |
| 7 | Gesture Model Training | 🔲 Pending |
| 8 | Live Gesture Prediction | 🔲 Pending |
| 9 | ESP32 Model/Command Interface | 🔲 Pending |
| 10 | Speech-to-Text | 🔲 Pending |
| 11 | NLP / Presentation Intent Engine | 🔲 Pending |
| 12 | Audience Face Detection | 🔲 Pending |
| 13 | Time-Aware Greeting | 🔲 Pending |
| 14 | Complete AI Presentation Mode | 🔲 Pending |

---

## 🚀 Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- Git

### Backend Setup

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
cp ../.env.example .env
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

### Access
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

---

## 🛡️ Safety Notice

This system controls physical servo motors. Always test with simulation mode before connecting hardware.

## 📄 License

MIT
