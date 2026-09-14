import asyncio
import logging
from typing import Callable, List, Optional, Set

from app.core.config import settings
from hardware.base import HardwareController, HardwareStatus
from hardware.esp32_controller import ESP32Controller
from hardware.mock_controller import MockController
from hardware.servo_controller import ServoConfig

logger = logging.getLogger(__name__)


class HardwareManager:
    """
    Singleton lifecycle manager for robot hardware control and telemetry distribution.
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

        self._controller: HardwareController = self._create_controller()
        self._telemetry_subscribers: Set[asyncio.Queue] = set()

    def _create_controller(self) -> HardwareController:
        mode = settings.esp32_connection_type.lower()
        if mode in ("serial", "wifi", "websocket"):
            logger.info("Initializing ESP32Controller in %s mode", mode)
            return ESP32Controller(
                pan_config=self._pan_config,
                tilt_config=self._tilt_config,
                transport=mode,
                port=settings.esp32_serial_port,
                baud_rate=settings.esp32_baud_rate,
                host=settings.esp32_wifi_host,
                wifi_port=settings.esp32_wifi_port,
            )
        else:
            logger.info("Initializing MockController")
            return MockController(
                pan_config=self._pan_config,
                tilt_config=self._tilt_config,
                on_position_update=self._on_mock_position_update,
            )

    async def _on_mock_position_update(self, pan: float, tilt: float) -> None:
        """Broadcast live position to telemetry subscribers."""
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
    def pan_config(self) -> ServoConfig:
        return self._pan_config

    @property
    def tilt_config(self) -> ServoConfig:
        return self._tilt_config

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
