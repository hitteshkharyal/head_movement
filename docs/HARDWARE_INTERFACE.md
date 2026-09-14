# Hardware Interface Design

## Abstraction Goal

No application code outside the `hardware/` package should know whether it is talking to:
- A mock/simulated controller
- A physical ESP32 over serial
- A physical ESP32 over Wi-Fi
- A future alternative microcontroller

---

## Abstract Base Class

```python
# hardware/base.py

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional

@dataclass
class ServoStatus:
    pan_angle: float
    tilt_angle: float
    is_moving: bool
    error: Optional[str] = None

@dataclass
class HardwareStatus:
    connected: bool
    controller_type: str
    servo: ServoStatus
    error: Optional[str] = None

class HardwareController(ABC):

    @abstractmethod
    async def connect(self) -> bool:
        """Establish connection to hardware. Returns True on success."""

    @abstractmethod
    async def disconnect(self) -> None:
        """Cleanly disconnect from hardware."""

    @abstractmethod
    async def move_pan(self, angle: float) -> bool:
        """
        Move PAN servo to absolute angle.
        Angle must be within configured min/max range.
        Returns True on success.
        """

    @abstractmethod
    async def move_tilt(self, angle: float) -> bool:
        """
        Move TILT servo to absolute angle.
        Angle must be within configured min/max range.
        Returns True on success.
        """

    @abstractmethod
    async def center(self) -> bool:
        """Move both servos to configured center positions."""

    @abstractmethod
    async def stop(self) -> bool:
        """Stop all movement immediately."""

    @abstractmethod
    async def emergency_stop(self) -> bool:
        """
        Immediate halt. Must be the safest possible state.
        Center position or power-off depending on hardware.
        """

    @abstractmethod
    async def get_status(self) -> HardwareStatus:
        """Return current hardware and servo status."""

    @abstractmethod
    async def execute_gesture(self, name: str) -> bool:
        """
        Execute a named predefined gesture sequence.
        The gesture sequence must be looked up from configuration.
        """
```

---

## Mock Controller

```python
# hardware/mock_controller.py

Simulates hardware locally.
Tracks virtual servo positions.
Validates all angle limits.
Records all commands (useful for testing).
Emits position updates via callback or event queue.
No external dependencies.
```

Behavior:
- `connect()` → always succeeds, logs "Mock hardware connected"
- `move_pan(angle)` → validates limits, updates internal `_pan_angle`, sleeps to simulate movement time
- `move_tilt(angle)` → same for tilt
- `center()` → moves both to configured `center_angle`
- `stop()` → halts any in-progress simulated movement
- `emergency_stop()` → immediate position freeze
- `get_status()` → returns current virtual positions

---

## ESP32 Controller

```python
# hardware/esp32_controller.py

Communicates with ESP32 firmware.
Connection type determined by config:
  - serial: pyserial
  - wifi/http: httpx
  - websocket: websockets

Protocol (Serial example):
  Commands are newline-terminated ASCII strings:
  "PAN:90\n"
  "TILT:60\n"
  "CENTER\n"
  "STOP\n"

Protocol (Wi-Fi/HTTP example):
  POST /command
  {"axis": "pan", "angle": 90}

Responses:
  {"status": "ok", "pan": 90, "tilt": 60}
  {"status": "error", "message": "Angle out of range"}
```

The ESP32 firmware is responsible for PWM generation.
The Python controller only sends validated angle targets.

---

## Servo Controller (Angle Math)

```python
# hardware/servo_controller.py

Responsibilities:
- Clamp angles to configured min/max
- Validate angle before sending
- Convert yaw/pitch → pan/tilt angle
- Smooth movement calculation
- Dead zone detection
```

```python
def clamp_angle(angle: float, min_a: float, max_a: float) -> float:
    return max(min_a, min(max_a, angle))

def yaw_to_pan_angle(yaw: float, config: ServoConfig) -> float:
    # Map human yaw range to servo angle range
    normalized = yaw / 90.0  # -1.0 to 1.0
    offset = normalized * (config.max_angle - config.center_angle) * config.sensitivity
    return clamp_angle(config.center_angle + offset, config.min_angle, config.max_angle)
```

---

## Safety Requirements

### Angle Limits
- Never send angle < `min_angle` or > `max_angle`
- These values come from `servo_configs` DB table
- If limits are not loaded, refuse to operate

### Center Position
- Center is NOT assumed to be 90°
- Center is configured per robot per servo

### Emergency Stop
- Accessible via `/api/v1/system/emergency-stop`
- Should not require hardware connection (mock can still log it)
- Must be processed before any other queued commands

### Command Queue
- Commands are processed sequentially
- Emergency stop clears the queue and executes first

---

## Controller Factory

```python
# app/services/hardware/hardware_service.py

def create_controller(connection_type: str) -> HardwareController:
    if connection_type == "mock":
        return MockController(config)
    elif connection_type == "serial":
        return ESP32Controller(config, transport="serial")
    elif connection_type == "wifi":
        return ESP32Controller(config, transport="http")
    elif connection_type == "websocket":
        return ESP32Controller(config, transport="websocket")
    else:
        raise ValueError(f"Unknown connection type: {connection_type}")
```

The controller is created once at application startup and injected as a FastAPI dependency.

---

## ESP32 Firmware Notes

The ESP32 firmware is a separate embedded codebase (not part of this repository).

Expected firmware interface:
- Accepts servo angle commands over serial or TCP
- Generates PWM signals for MG996R/MG995 servos
- Reports current positions on request
- Responds to STOP/CENTER commands immediately
- Servo #1 = PAN (yaw axis), typically GPIO pin 13
- Servo #2 = TILT (pitch axis), typically GPIO pin 12

MG996R/MG995 PWM spec:
- Frequency: 50 Hz
- Pulse width: 1ms (0°) to 2ms (180°)
- Operating voltage: 4.8V–7.2V
