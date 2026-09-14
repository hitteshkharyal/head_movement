# 🤖 AI Humanoid Presentation Robot

A production-grade, full-stack software platform for an **AI-powered Humanoid Presentation Robot**. Featuring dual-axis Pan-Tilt servo head kinematics (MG90S / MG995 / MG996R), real-time 3D head tracking via MediaPipe Face Mesh, active-learning gesture recording, an interactive 360° spatial gaze controller, and dual-mode ESP32 hardware bridging (USB Serial + Wireless Wi-Fi TCP Socket).

---

## 📐 High-Level Architecture

```
                                  ┌──────────────────────────────────────────────┐
                                  │      React 18 / TypeScript / Vite Dashboard  │
                                  │  ├── 3D Head Orientation Viewport (Drag-Look)│
                                  │  ├── 360° Omnidirectional Gaze Joystick Pad  │
                                  │  ├── Independent 8-Way Steppers & Centering  │
                                  │  └── Live WebCam Stream & Gesture Studio     │
                                  └──────────────────────┬───────────────────────┘
                                                         │ REST API + WebSockets
                                                         ▼
                                  ┌──────────────────────────────────────────────┐
                                  │         Python 3.11+ / FastAPI Backend       │
                                  │  ├── Hardware Abstraction Layer (HAL)        │
                                  │  │    ├── MockController (Virtual Sim)       │
                                  │  │    └── ESP32Controller (Serial / Wi-Fi)   │
                                  │  ├── Computer Vision & 3D Head Tracking      │
                                  │  │    └── OpenCV + MediaPipe Face Mesh       │
                                  │  ├── Gesture Studio & Active Learning Engine │
                                  │  └── Telemetry Broker & WebSocket Publisher  │
                                  └──────────────────────┬───────────────────────┘
                                                         │ Framed Checksum Packets
                                                         ▼
                                  ┌──────────────────────────────────────────────┐
                                  │        ESP32 Microcontroller (Firmware)      │
                                  │  ├── Dual-Transport: USB Serial (115200)     │
                                  │  │                   & Wi-Fi TCP (Port 8080) │
                                  │  ├── Hardware Brownout Protection            │
                                  │  ├── 50Hz PWM Timers & S-Curve Smoothing     │
                                  │  └── Signal Outputs:                         │
                                  │       • GPIO 18 -> PAN Servo  (Horizontal)   │
                                  │       • GPIO 19 -> TILT Servo (Vertical)     │
                                  └──────────────────────────────────────────────┘
```

---

## 🚦 Development Status & Completed Phases

| Phase | Module | Key Features & Output | Test Coverage | Status |
|---|---|---|---|---|
| **Phase 0** | **Architecture & Foundation** | Full directory scaffold, FastAPI backend, Vite React frontend, SQLite + Alembic migrations, unified logging, and GitHub Actions CI. | `33/33` Pytest<br>`3/3` Vitest | ✅ Complete |
| **Phase 1** | **Hardware Abstraction Layer (HAL)** | `HardwareController` abstract interface, `MockController` simulator, `ESP32Controller` serial bridge, S-curve trajectory smoothing, angle clamping, E-Stop safety interlocks, and calibration REST APIs. | `43/43` Pytest<br>`7/7` Vitest | ✅ Complete |
| **Phase 2** | **Computer Vision & 3D Head Tracking** | MediaPipe Face Mesh 468-landmark 3D pose estimation, Euler angle extraction (yaw, pitch, roll), smoothing filters, Mirror & Follow tracking modes, and live MJPEG streaming with HUD overlays. | `52/52` Pytest<br>`11/11` Vitest | ✅ Complete |
| **Phase 3** | **Gesture Studio & Active Learning** | Dynamic gesture recording pipeline, trajectory feature extraction, dataset curation & auto-labeling, training metrics evaluation, and predefined gesture sequences (NOD, SHAKE, TILT). | `59/59` Pytest<br>`15/15` Vitest | ✅ Complete |
| **Hardware Bridge & Human Gestures** | **Multi-Transport Firmware & Gestures** | • **YES Gesture (Up & Down Nod)**: Vertical multi-cycle nodding with Pan strictly locked.<br>• **NO Gesture (Left & Right Shake)**: Horizontal multi-cycle head shake with Tilt strictly locked.<br>• **360° Omnidirectional Gaze Pad** + Direct 3D Face Drag-to-Look.<br>• **Zero-Cross-Talk Steppers** & Independent Centering (`Center Pan`, `Center Tilt`, `Center Both`).<br>• **Dual Hardware Transports**: USB Serial 115200 + Wireless Wi-Fi TCP 8080. | `61/61` Pytest<br>`16/16` Vitest | ✅ Complete |
| **Phase 4** | **Voice & Audio Pipeline** | Speech-to-Text (STT via Whisper), Wake Word detection, and Text-to-Speech (TTS) with viseme/gesture synchronization. | — | ⏳ Awaiting Approval |
| **Phase 5** | **Presentation Flow Controller** | Script orchestration engine, slide sync, Q&A handling, and audience attention switching. | — | ⏳ Pending |
| **Phase 6** | **Cloud Telemetry & Diagnostics** | Fleet diagnostics, remote OTA update hooks, and cloud session analytics. | — | ⏳ Pending |

---

## 📦 Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, TypeScript, Vite, CSS Modules / Vanilla CSS (Custom Theme System) |
| **Backend** | Python 3.11+, FastAPI, Uvicorn, Pydantic V2, WebSockets |
| **Database** | SQLite with SQLAlchemy 2.0 ORM & Alembic migrations |
| **Computer Vision** | OpenCV (`opencv-python`), MediaPipe Face Mesh |
| **Embedded Firmware** | Arduino C++ for ESP32 (`ESP32Servo`, `WiFi`, `ESP32PWM`) |
| **Hardware Platform** | ESP32 Dev Module (WROOM-32 / NodeMCU-32S) + MG90S / MG995 / MG996R Servos |
| **Testing** | Pytest, AnyIO, Pytest-Asyncio (Backend) + Vitest, React Testing Library (Frontend) |
| **CI/CD** | GitHub Actions Automated Test & Build Matrix |

---

## 🔌 Hardware Wiring & Pinout

```
  ┌────────────────────────────────────────────────────────┐
  │                 ESP32 Microcontroller                  │
  │                                                        │
  │   [ GPIO 18 ] ─── Orange/Yellow Wire ─── PAN Servo     │
  │   [ GPIO 19 ] ─── Orange/Yellow Wire ─── TILT Servo    │
  │   [   GND   ] ─── Black/Brown Wire   ─── Common Ground │
  │   [ VIN/5V  ] ─── Red Wire           ─── Servo 5V VCC  │
  └────────────────────────────────────────────────────────┘
```

> [!TIP]
> **Power Recommendations:**
> - **MG90S Micro-Servos (Prototyping)**: Can be powered directly from the ESP32 `VIN` (5V) pin via USB.
> - **MG995 / MG996R Metal Gear Servos (Production)**: Require an external **5V 2A–3A power supply** with a common ground connected to the ESP32 `GND` pin.

---

## 🎮 Interactive Web Dashboard Features

Navigate to **`http://localhost:5173/robot-control`**:

1. **👍 YES Gesture (Up & Down Nod)**: 1-click trigger executes natural vertical nodding (Tilt: `115°` ➔ `65°` ➔ `110°` ➔ `70°` ➔ `90°`) while maintaining fixed horizontal Pan orientation.
2. **👎 NO Gesture (Left & Right Shake)**: 1-click trigger executes natural horizontal head shaking (Pan: `125°` ➔ `55°` ➔ `120°` ➔ `60°` ➔ `90°`) while maintaining fixed vertical Tilt angle.
3. **360° Omnidirectional Gaze Joystick**: Click and drag the glowing thumbstick puck across the circular radar pad to smoothly look in any spherical direction (360° yaw/pitch interpolation).
4. **Direct 3D Face Drag-to-Look**: Click and drag directly on the 3D Head Avatar to naturally turn the robot's head in 3D space with your mouse.
5. **Independent 8-Way D-Pad Steppers**:
   - `⬆️ UP` / `⬇️ DOWN`: Steps only the vertical tilt angle without altering horizontal position.
   - `⬅️ LEFT` / `➡️ RIGHT`: Steps only the horizontal pan angle without altering vertical position.
   - `↖️ UP-L`, `↗️ UP-R`, `↙️ DN-L`, `↘️ DN-R`: Moves both motors simultaneously.
6. **Independent & Dual Centering**:
   - `🎯 Center Pan`: Resets only Motor 1 to `90°` (Horizontal forward).
   - `🎯 Center Tilt`: Resets only Motor 2 to `90°` (Level gaze).
   - `🎯 Center Both`: Resets both motors to `90°, 90°`.
7. **Hardware Direction Inversion**: 1-click **`⇄ Invert Pan`** and **`⇅ Invert Tilt`** toggles instantly mirror motor movement if horns were mounted conversely.
8. **Dual Hardware Transports**: Connect via USB Serial (`COMx` @ 115200 baud) or Wireless Wi-Fi TCP Socket (`Port 8080`).

---

## 🚀 Quick Start Guide

### Prerequisites
- **Node.js** v18+ and **npm** v9+
- **Python** 3.11+
- **Arduino IDE** (with ESP32 board support installed)

---

### 1. Backend Setup

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate       # On Windows (.venv/bin/activate on Linux/macOS)
pip install -r requirements.txt
alembic upgrade head
```

Run the backend server:
```bash
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

---

### 2. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Open **`http://localhost:5173`** in your browser.

---

### 3. ESP32 Firmware Flashing

1. Open [`firmware/esp32_servo_controller/esp32_servo_controller.ino`](file:///e:/head_movement/firmware/esp32_servo_controller/esp32_servo_controller.ino) in Arduino IDE.
2. If using Wi-Fi, verify your SSID and Password:
   ```cpp
   #define ENABLE_WIFI true
   const char* WIFI_SSID     = "pc_h";     // Your Hotspot or Wi-Fi name
   const char* WIFI_PASSWORD = "12345678"; // Your Wi-Fi Password
   const uint16_t TCP_PORT   = 8080;
   ```
3. Select your ESP32 Board and Port (e.g. `COM6`), then click **Upload**.
4. Open the Dashboard at `http://localhost:5173/robot-control` and click **Connect Serial** or **Connect Wi-Fi**.

---

## 🧪 Running Automated Tests

### Backend Test Suite (Pytest)
```bash
cd backend
.venv\Scripts\activate
pytest tests -v
# Output: 61 passed in ~5.0s
```

### Frontend Test Suite (Vitest)
```bash
cd frontend
npm test -- --run
# Output: 16 passed in ~3.5s
```

---

## 📄 License

MIT License. Designed and engineered for the AI Humanoid Presentation Robot Platform.
