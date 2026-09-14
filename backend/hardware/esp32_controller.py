from hardware.base import HardwareController, HardwareStatus, ServoStatus
from hardware.servo_controller import ServoConfig


class ESP32Controller(HardwareController):
    """
    Physical ESP32 controller stub.

    Full implementation in Phase 1. Supports:
    - transport='serial'    - pyserial connection
    - transport='http'      - HTTP REST to ESP32 firmware
    - transport='websocket' - WebSocket to ESP32 firmware
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
    ):
        self._pan_config = pan_config
        self._tilt_config = tilt_config
        self._transport = transport
        self._port = port
        self._host = host
        self._wifi_port = wifi_port
        self._baud_rate = baud_rate
        self._connected = False

    async def connect(self) -> bool:
        raise NotImplementedError("ESP32 connection implemented in Phase 1")

    async def disconnect(self) -> None:
        raise NotImplementedError("ESP32 disconnect implemented in Phase 1")

    async def move_pan(self, angle: float) -> bool:
        raise NotImplementedError("ESP32 move_pan implemented in Phase 1")

    async def move_tilt(self, angle: float) -> bool:
        raise NotImplementedError("ESP32 move_tilt implemented in Phase 1")

    async def center(self) -> bool:
        raise NotImplementedError("ESP32 center implemented in Phase 1")

    async def stop(self) -> bool:
        raise NotImplementedError("ESP32 stop implemented in Phase 1")

    async def emergency_stop(self) -> bool:
        raise NotImplementedError("ESP32 emergency_stop implemented in Phase 1")

    async def get_status(self) -> HardwareStatus:
        return HardwareStatus(
            connected=False,
            controller_type=self.CONTROLLER_TYPE,
            servo=ServoStatus(),
            error="ESP32 controller not yet implemented (Phase 1)",
        )

    async def execute_gesture(self, gesture_name: str) -> bool:
        raise NotImplementedError("ESP32 execute_gesture implemented in Phase 1")
