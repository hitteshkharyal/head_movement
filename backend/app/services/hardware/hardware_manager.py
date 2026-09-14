import asyncio
import logging
from typing import Any, Callable, Dict, List, Optional, Set

from app.core.config import settings
from hardware.base import HardwareController, HardwareStatus
from hardware.esp32_controller import ESP32Controller
from hardware.mock_controller import MockController
from hardware.servo_controller import ServoConfig

logger = logging.getLogger(__name__)


class HardwareManager:
    """
    Singleton lifecycle manager for robot hardware control, dynamic port switching,
    and real-time telemetry distribution to frontend WebSockets.
    """

    _instance: Optional["HardwareManager"] = None

    def __init__(self):
        self._pan_config = ServoConfig(
            servo_name="pan",
            axis="yaw",
            min_angle=settings.pan_min_angle,
            max_angle=settings.pan_max_angle,
            center_angle=settings.pan_center_angle,
            speed=settings.pan_speed,
            sensitivity=settings.pan_sensitivity,
            trim_offset=0.0,
            invert=False,
            dead_zone=2.0,
        )
        self._tilt_config = ServoConfig(
            servo_name="tilt",
            axis="pitch",
            min_angle=settings.tilt_min_angle,
            max_angle=settings.tilt_max_angle,
            center_angle=settings.tilt_center_angle,
            speed=settings.tilt_speed,
            sensitivity=settings.tilt_sensitivity,
            trim_offset=0.0,
            invert=False,
            dead_zone=2.0,
        )

        self._active_mode: str = settings.esp32_connection_type.lower()
        self._active_port: str = settings.esp32_serial_port
        self._active_baud: int = settings.esp32_baud_rate
        self._controller: HardwareController = self._create_controller(self._active_mode, self._active_port, self._active_baud)
        self._telemetry_subscribers: Set[asyncio.Queue] = set()

    def _create_controller(self, mode: str, port: str, baud_rate: int) -> HardwareController:
        """Instantiate controller based on requested mode."""
        if mode in ("serial", "esp32", "usb"):
            logger.info("Instantiating ESP32Controller on port %s (%d baud)", port, baud_rate)
            return ESP32Controller(
                pan_config=self._pan_config,
                tilt_config=self._tilt_config,
                transport="serial",
                port=port,
                baud_rate=baud_rate,
                on_position_update=self._on_hardware_position_update,
            )
        else:
            logger.info("Instantiating MockController")
            return MockController(
                pan_config=self._pan_config,
                tilt_config=self._tilt_config,
                on_position_update=self._on_hardware_position_update,
            )

    async def _on_hardware_position_update(self, pan: float, tilt: float) -> None:
        """Broadcast live position to telemetry subscribers (WebSocket)."""
        payload = {
            "type": "telemetry",
            "pan": pan,
            "tilt": tilt,
            "is_moving": True,
        }
        await self.broadcast_telemetry(payload)

    @classmethod
    def get_instance(cls) -> "HardwareManager":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @property
    def controller(self) -> HardwareController:
        return self._controller

    @property
    def active_mode(self) -> str:
        return self._active_mode

    @property
    def active_port(self) -> str:
        return self._active_port

    @property
    def active_baud(self) -> int:
        return self._active_baud

    @property
    def pan_config(self) -> ServoConfig:
        return self._pan_config

    @property
    def tilt_config(self) -> ServoConfig:
        return self._tilt_config

    async def switch_controller(self, mode: str, port: Optional[str] = None, baud_rate: Optional[int] = None) -> bool:
        """
        Dynamically switch between Mock and real ESP32 hardware without restarting server.
        """
        target_mode = mode.lower()
        target_port = port or self._active_port
        target_baud = baud_rate or self._active_baud

        logger.info("Switching hardware controller to mode=%s, port=%s, baud=%d", target_mode, target_port, target_baud)

        # 1. Cleanly disconnect previous controller
        try:
            await self._controller.disconnect()
        except Exception as exc:
            logger.debug("Error disconnecting old controller: %s", exc)

        # 2. Create and connect new controller
        self._active_mode = target_mode
        self._active_port = target_port
        self._active_baud = target_baud
        self._controller = self._create_controller(target_mode, target_port, target_baud)

        connected = await self._controller.connect()
        logger.info("Switched to %s controller. Connected: %s", target_mode, connected)
        return connected

    def list_serial_ports(self) -> List[Dict[str, str]]:
        """Scan and return all available serial COM ports on the system."""
        ports_list = []
        try:
            import serial.tools.list_ports
            for p in serial.tools.list_ports.comports():
                ports_list.append({
                    "port": p.device,
                    "description": p.description or p.device,
                    "manufacturer": p.manufacturer or "Unknown",
                    "hwid": p.hwid or "",
                })
        except Exception as exc:
            logger.warning("Error scanning serial ports: %s", exc)
        return ports_list

    def update_configs(self, pan_config: ServoConfig, tilt_config: ServoConfig) -> None:
        self._pan_config = pan_config
        self._tilt_config = tilt_config
        if isinstance(self._controller, MockController):
            self._controller.update_config(pan_config, tilt_config)

    async def broadcast_telemetry(self, message: dict) -> None:
        """Distribute telemetry dict to all registered WebSocket queues."""
        dead_queues = []
        for q in list(self._telemetry_subscribers):
            try:
                q.put_nowait(message)
            except asyncio.QueueFull:
                pass
            except Exception:
                dead_queues.append(q)
        for dq in dead_queues:
            self._telemetry_subscribers.discard(dq)

    def subscribe_telemetry(self) -> asyncio.Queue:
        q = asyncio.Queue(maxsize=100)
        self._telemetry_subscribers.add(q)
        return q

    def unsubscribe_telemetry(self, q: asyncio.Queue) -> None:
        self._telemetry_subscribers.discard(q)


def get_hardware_manager() -> HardwareManager:
    return HardwareManager.get_instance()
