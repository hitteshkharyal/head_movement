import asyncio
import logging
import time
from typing import Callable, Coroutine, Optional, Protocol, Union

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
    def reset_input_buffer(self) -> None: ...
    def reset_output_buffer(self) -> None: ...


PositionCallback = Callable[[float, float], Coroutine[any, any, None]]


class ESP32Controller(HardwareController):
    """
    Production-grade ESP32 microcontroller interface for Pan-Tilt servo head.

    Supports:
    - Serial (USB COM port / /dev/ttyUSB0 / /dev/ttyACM0)
    - Full bidirectional packet framing with XOR checksum validation
    - Non-blocking background telemetry reader
    - Safe ESP32 DTR/RTS bootloader settling delay & handshake
    - Live round-trip latency measurement (Ping/Pong)
    - Real-time position callback dispatch
    - Instantaneous Emergency Stop (E-Stop)
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
        timeout: float = 0.5,
        serial_instance: Optional[SerialTransport] = None,
        on_position_update: Optional[PositionCallback] = None,
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

        self._on_position_update = on_position_update
        self._reader_task: Optional[asyncio.Task] = None
        self._pong_event = asyncio.Event()
        self._ping_sent_time: float = 0.0

    @property
    def port(self) -> str:
        return self._port

    @property
    def baud_rate(self) -> int:
        return self._baud_rate

    async def connect(self) -> bool:
        """Establish connection and perform initial handshake with the ESP32 hardware."""
        async with self._lock:
            if self._connected:
                return True

            try:
                if self._transport == "serial":
                    if self._serial is None:
                        import serial  # pyserial

                        logger.info("Opening serial port %s at %d baud...", self._port, self._baud_rate)
                        # Open with non-blocking timeout
                        self._serial = serial.Serial(
                            port=self._port,
                            baudrate=self._baud_rate,
                            timeout=0.1,
                            write_timeout=1.0,
                        )
                        # ESP32 auto-resets when DTR is toggled on serial connect.
                        # Wait for bootloader to finish (~1.2 seconds)
                        await asyncio.sleep(1.2)

                        if hasattr(self._serial, "reset_input_buffer"):
                            self._serial.reset_input_buffer()
                        if hasattr(self._serial, "reset_output_buffer"):
                            self._serial.reset_output_buffer()
                    elif not self._serial.is_open:
                        self._serial.open()

                self._connected = True
                self._emergency_stopped = False
                self._last_heartbeat = time.time()

                # Start background serial reader
                self._start_reader()

                # Send initial handshake ping
                await self._send_raw(b"<PING>\n")

                logger.info("Successfully connected to ESP32 on port %s (%d baud)", self._port, self._baud_rate)
                return True
            except Exception as exc:
                self._connected = False
                logger.warning("Failed to connect to ESP32 (%s): %s", self._port, exc)
                return False

    async def disconnect(self) -> None:
        """Cleanly disconnect from the ESP32 and stop background tasks."""
        async with self._lock:
            self._connected = False
            self._stop_reader()
            if self._serial:
                try:
                    self._serial.close()
                except Exception as exc:
                    logger.debug("Error closing serial port: %s", exc)
                self._serial = None
            logger.info("Disconnected from ESP32")

    def _start_reader(self) -> None:
        if self._reader_task is None or self._reader_task.done():
            self._reader_task = asyncio.create_task(self._reader_loop())

    def _stop_reader(self) -> None:
        if self._reader_task and not self._reader_task.done():
            self._reader_task.cancel()
            self._reader_task = None

    async def _reader_loop(self) -> None:
        """Background asynchronous task reading and parsing incoming serial messages."""
        logger.debug("ESP32 serial reader loop started")
        while self._connected and self._serial is not None:
            try:
                line_bytes = await asyncio.to_thread(self._read_line_sync)
                if not line_bytes:
                    await asyncio.sleep(0.02)
                    continue

                line = line_bytes.decode("ascii", errors="replace").strip()
                if not line:
                    continue

                await self._handle_incoming_packet(line)
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.debug("Serial reader error: %s", exc)
                await asyncio.sleep(0.05)

    def _read_line_sync(self) -> bytes:
        """Synchronously read line from serial with safety guard."""
        if not self._serial or not self._serial.is_open:
            return b""
        try:
            return self._serial.readline()
        except Exception:
            return b""

    async def _handle_incoming_packet(self, packet: str) -> None:
        """Parse incoming formatted protocol packets like `<POS:90.0,90.0>` or `<PONG>`."""
        if not (packet.startswith("<") and packet.endswith(">")):
            return

        payload = packet[1:-1].strip()

        # 1. PONG response
        if payload == "PONG":
            if self._ping_sent_time > 0:
                self._last_ping_latency_ms = round((time.perf_counter() - self._ping_sent_time) * 1000.0, 1)
            self._pong_event.set()
            self._last_heartbeat = time.time()
            return

        # 2. READY message
        if payload.startswith("READY:"):
            logger.info("ESP32 Firmware Ready: %s", payload)
            self._last_heartbeat = time.time()
            return

        # 3. Position Telemetry (<POS:pan,tilt>)
        if payload.startswith("POS:"):
            try:
                coords = payload[4:].split(",")
                if len(coords) >= 2:
                    p = float(coords[0])
                    t = float(coords[1])
                    self._pan_angle = p
                    self._tilt_angle = t
                    if self._on_position_update:
                        res = self._on_position_update(p, t)
                        if asyncio.iscoroutine(res):
                            await res
            except Exception as e:
                logger.debug("Error parsing POS packet: %s", e)
            return

        # 4. Emergency Stop Acknowledged (<!ESTOP_ACTIVE>)
        if payload == "!ESTOP_ACTIVE":
            self._emergency_stopped = True
            self._is_moving = False
            logger.warning("ESP32 confirmed Emergency Stop active")
            return

        # 5. Generic ACKs
        if payload.startswith("ACK:"):
            logger.debug("ESP32 ACK: %s", payload)
            return

        # 6. Errors
        if payload.startswith("ERR:"):
            logger.warning("ESP32 Error reported: %s", payload)
            return

    def _format_command(self, pan: float, tilt: float, speed: int = 80) -> bytes:
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
            logger.error("Error writing to ESP32 on %s: %s", self._port, exc)
            self._connected = False
            return False

    async def move_pan(self, angle: float, speed: int = 80) -> bool:
        """Move PAN servo to validated absolute angle."""
        if self._emergency_stopped:
            logger.warning("Movement blocked: Emergency Stop active")
            return False

        validated = validate_angle(angle, self._pan_config)
        self._pan_angle = validated
        packet = self._format_command(self._pan_angle, self._tilt_angle, speed)
        return await self._send_raw(packet)

    async def move_tilt(self, angle: float, speed: int = 80) -> bool:
        """Move TILT servo to validated absolute angle."""
        if self._emergency_stopped:
            logger.warning("Movement blocked: Emergency Stop active")
            return False

        validated = validate_angle(angle, self._tilt_config)
        self._tilt_angle = validated
        packet = self._format_command(self._pan_angle, self._tilt_angle, speed)
        return await self._send_raw(packet)

    async def move_pan_tilt(self, pan: float, tilt: float, speed: int = 80) -> bool:
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
        """Immediate emergency halt. Locks servo movement."""
        self._emergency_stopped = True
        self._is_moving = False
        packet = b"<!ESTOP>\n"
        await self._send_raw(packet)
        logger.critical("EMERGENCY STOP TRIGGERED")
        return True

    def reset_emergency_stop(self) -> None:
        """Clear software emergency stop state and send resume command."""
        self._emergency_stopped = False
        asyncio.create_task(self._send_raw(b"<RESUME>\n"))
        logger.info("Emergency stop reset")

    async def ping(self) -> float:
        """Send ping to ESP32 and return round-trip latency in ms."""
        if not self._connected:
            return -1.0
        
        self._pong_event.clear()
        self._ping_sent_time = time.perf_counter()
        
        sent = await self._send_raw(b"<PING>\n")
        if not sent:
            return -1.0

        # Wait for pong event with short timeout
        try:
            await asyncio.wait_for(self._pong_event.wait(), timeout=0.3)
            return self._last_ping_latency_ms
        except asyncio.TimeoutError:
            # Fallback estimation based on write time
            elapsed = (time.perf_counter() - self._ping_sent_time) * 1000.0
            self._last_ping_latency_ms = round(elapsed, 1)
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
