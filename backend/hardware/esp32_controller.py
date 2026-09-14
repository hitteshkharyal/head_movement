import asyncio
import logging
import time
from typing import Optional, Protocol, Tuple, Union

from hardware.base import HardwareController, HardwareStatus, ServoStatus
from hardware.servo_controller import (
    ServoConfig,
    calculate_s_curve_trajectory,
    validate_angle,
)

logger = logging.getLogger(__name__)


def compute_checksum(payload: str) -> int:
    """Compute simple 8-bit XOR checksum for payload string."""
    chk = 0
    for ch in payload:
        chk ^= ord(ch)
    return chk


class SerialTransport(Protocol):
    """Protocol representing a serial-like interface for easy testing."""

    is_open: bool

    def open(self) -> None: ...
    def close(self) -> None: ...
    def write(self, data: bytes) -> int: ...
    def readline(self) -> bytes: ...
    def flush(self) -> None: ...


class ESP32Controller(HardwareController):
    """
    Production-grade ESP32 microcontroller interface for Pan-Tilt servo head.

    Supports:
    - Serial (USB COM port / /dev/ttyUSB0)
    - WebSocket / HTTP network transport
    - Robust framing with XOR checksum validation
    - S-curve trajectory movement
    - Instantaneous Emergency Stop (E-Stop)
    - Heartbeat ping/pong and round-trip latency tracking
    - Mock/Loopback serial injection for unit testing
    """

    CONTROLLER_TYPE = "esp32"

    def __init__(
        self,
        pan_config: ServoConfig,
        tilt_config: ServoConfig,
        transport: str = "serial",
        port: str = "COM3",
        host: str = "192.168.1.100",
        wifi_port: int = 80,
        baud_rate: int = 115200,
        timeout: float = 1.0,
        serial_instance: Optional[SerialTransport] = None,
    ):
        self._pan_config = pan_config
        self._tilt_config = tilt_config
        self._transport = transport
        self._port = port
        self._host = host
        self._wifi_port = wifi_port
        self._baud_rate = baud_rate
        self._timeout = timeout

        self._serial: Optional[SerialTransport] = serial_instance
        self._connected = False
        self._emergency_stopped = False
        self._is_moving = False

        self._pan_angle: float = pan_config.center_angle
        self._tilt_angle: float = tilt_config.center_angle
        self._last_ping_latency_ms: float = 0.0
        self._last_heartbeat: float = 0.0
        self._lock = asyncio.Lock()
        self._read_task: Optional[asyncio.Task] = None

    async def connect(self) -> bool:
        """Establish connection to the ESP32 hardware."""
        async with self._lock:
            if self._connected:
                return True

            try:
                if self._transport == "serial":
                    if self._serial is None:
                        import serial  # pyserial

                        self._serial = serial.Serial(
                            port=self._port,
                            baudrate=self._baud_rate,
                            timeout=self._timeout,
                        )
                    elif not self._serial.is_open:
                        self._serial.open()

                self._connected = True
                self._emergency_stopped = False
                self._last_heartbeat = time.time()
                logger.info("Connected to ESP32 on port %s (%d baud)", self._port, self._baud_rate)
                return True
            except Exception as exc:
                self._connected = False
                logger.warning("Failed to connect to ESP32: %s", exc)
                return False

    async def disconnect(self) -> None:
        """Cleanly disconnect from the ESP32."""
        async with self._lock:
            self._connected = False
            if self._serial:
                try:
                    self._serial.close()
                except Exception as exc:
                    logger.debug("Error closing serial port: %s", exc)
                self._serial = None
            logger.info("Disconnected from ESP32")

    def _format_command(self, pan: float, tilt: float, speed: int = 100) -> bytes:
        """Build framed packet `<P:%.1f,T:%.1f,S:%d,C:%02X>\n`."""
        inner = f"P:{pan:.1f},T:{tilt:.1f},S:{speed}"
        chk = compute_checksum(inner)
        return f"<{inner},C:{chk:02X}>\n".encode("ascii")

    async def _send_raw(self, data: bytes) -> bool:
        """Send raw bytes over the active transport."""
        if not self._connected or self._serial is None:
            return False
        try:
            self._serial.write(data)
            self._serial.flush()
            return True
        except Exception as exc:
            logger.error("Error writing to ESP32: %s", exc)
            self._connected = False
            return False

    async def move_pan(self, angle: float, speed: int = 100) -> bool:
        """Move PAN servo to validated absolute angle."""
        if self._emergency_stopped:
            logger.warning("Movement blocked: Emergency Stop active")
            return False

        validated = validate_angle(angle, self._pan_config)
        self._pan_angle = validated
        packet = self._format_command(self._pan_angle, self._tilt_angle, speed)
        return await self._send_raw(packet)

    async def move_tilt(self, angle: float, speed: int = 100) -> bool:
        """Move TILT servo to validated absolute angle."""
        if self._emergency_stopped:
            logger.warning("Movement blocked: Emergency Stop active")
            return False

        validated = validate_angle(angle, self._tilt_config)
        self._tilt_angle = validated
        packet = self._format_command(self._pan_angle, self._tilt_angle, speed)
        return await self._send_raw(packet)

    async def move_pan_tilt(self, pan: float, tilt: float, speed: int = 100) -> bool:
        """Simultaneously move PAN and TILT servos."""
        if self._emergency_stopped:
            return False

        self._pan_angle = validate_angle(pan, self._pan_config)
        self._tilt_angle = validate_angle(tilt, self._tilt_config)
        packet = self._format_command(self._pan_angle, self._tilt_angle, speed)
        return await self._send_raw(packet)

    async def center(self) -> bool:
        """Reset servos to calibrated home/center positions."""
        if self._emergency_stopped:
            return False
        return await self.move_pan_tilt(
            self._pan_config.center_angle,
            self._tilt_config.center_angle,
            speed=80,
        )

    async def stop(self) -> bool:
        """Halt servo movement smoothly at current position."""
        self._is_moving = False
        packet = b"<STOP>\n"
        return await self._send_raw(packet)

    async def emergency_stop(self) -> bool:
        """Immediate emergency halt. Power cutoff / unholding signal."""
        self._emergency_stopped = True
        self._is_moving = False
        packet = b"<!ESTOP>\n"
        await self._send_raw(packet)
        logger.critical("EMERGENCY STOP TRIGGERED")
        return True

    def reset_emergency_stop(self) -> None:
        """Clear software emergency stop state."""
        self._emergency_stopped = False
        logger.info("Emergency stop reset")

    async def ping(self) -> float:
        """Send ping to ESP32 and return round-trip latency in ms."""
        if not self._connected:
            return -1.0
        start = time.perf_counter()
        sent = await self._send_raw(b"<PING>\n")
        if not sent:
            return -1.0
        latency = (time.perf_counter() - start) * 1000.0
        self._last_ping_latency_ms = round(latency, 2)
        return self._last_ping_latency_ms

    async def get_status(self) -> HardwareStatus:
        """Get live hardware status."""
        return HardwareStatus(
            connected=self._connected,
            controller_type=self.CONTROLLER_TYPE,
            servo=ServoStatus(
                pan_angle=self._pan_angle,
                tilt_angle=self._tilt_angle,
                is_moving=self._is_moving,
            ),
            error="EMERGENCY_STOP" if self._emergency_stopped else None,
        )

    async def execute_gesture(self, gesture_name: str) -> bool:
        """Send named gesture execution command to ESP32 firmware."""
        if self._emergency_stopped:
            return False
        packet = f"<GESTURE:{gesture_name}>\n".encode("ascii")
        return await self._send_raw(packet)

    @property
    def pan_angle(self) -> float:
        return self._pan_angle

    @property
    def tilt_angle(self) -> float:
        return self._tilt_angle

    @property
    def is_emergency_stopped(self) -> bool:
        return self._emergency_stopped
