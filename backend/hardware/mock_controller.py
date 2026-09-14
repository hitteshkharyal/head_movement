import asyncio
import time
from typing import Callable, Optional

from hardware.base import HardwareController, HardwareStatus, ServoStatus
from hardware.servo_controller import ServoConfig, validate_angle


class MockController(HardwareController):
    """
    Simulated hardware controller for development and testing.

    - Validates all angle limits
    - Tracks virtual servo positions in-memory
    - Records command history (for test assertions)
    - Emits position updates via optional callback
    - No external dependencies
    """

    CONTROLLER_TYPE = "mock"

    def __init__(
        self,
        pan_config: ServoConfig,
        tilt_config: ServoConfig,
        on_position_update: Optional[Callable] = None,
    ):
        self._pan_config = pan_config
        self._tilt_config = tilt_config
        self._on_position_update = on_position_update

        self._connected = False
        self._pan_angle: float = pan_config.center_angle
        self._tilt_angle: float = tilt_config.center_angle
        self._is_moving = False
        self._emergency_stopped = False
        self._command_history: list[dict] = []

    async def connect(self) -> bool:
        await asyncio.sleep(0.05)
        self._connected = True
        self._emergency_stopped = False
        self._record("connect", {})
        return True

    async def disconnect(self) -> None:
        self._connected = False
        self._record("disconnect", {})

    async def move_pan(self, angle: float) -> bool:
        if self._emergency_stopped:
            return False
        validated = validate_angle(angle, self._pan_config)
        self._record("move_pan", {"requested": angle, "validated": validated})
        await self._simulate("pan", validated)
        return True

    async def move_tilt(self, angle: float) -> bool:
        if self._emergency_stopped:
            return False
        validated = validate_angle(angle, self._tilt_config)
        self._record("move_tilt", {"requested": angle, "validated": validated})
        await self._simulate("tilt", validated)
        return True

    async def center(self) -> bool:
        self._record("center", {})
        await asyncio.gather(
            self._simulate("pan", self._pan_config.center_angle),
            self._simulate("tilt", self._tilt_config.center_angle),
        )
        return True

    async def stop(self) -> bool:
        self._is_moving = False
        self._record("stop", {})
        return True

    async def emergency_stop(self) -> bool:
        self._is_moving = False
        self._emergency_stopped = True
        self._record("emergency_stop", {})
        return True

    async def get_status(self) -> HardwareStatus:
        return HardwareStatus(
            connected=self._connected,
            controller_type=self.CONTROLLER_TYPE,
            servo=ServoStatus(
                pan_angle=self._pan_angle,
                tilt_angle=self._tilt_angle,
                is_moving=self._is_moving,
            ),
        )

    async def execute_gesture(self, gesture_name: str) -> bool:
        self._record("execute_gesture", {"name": gesture_name})
        return True

    # ------------------------------------------------------------------
    # Testing helpers
    # ------------------------------------------------------------------

    def get_command_history(self) -> list[dict]:
        return list(self._command_history)

    def clear_command_history(self) -> None:
        self._command_history.clear()

    def reset_emergency_stop(self) -> None:
        self._emergency_stopped = False

    @property
    def pan_angle(self) -> float:
        return self._pan_angle

    @property
    def tilt_angle(self) -> float:
        return self._tilt_angle

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _simulate(self, axis: str, target: float) -> None:
        self._is_moving = True
        steps = 5
        start = self._pan_angle if axis == "pan" else self._tilt_angle
        for i in range(1, steps + 1):
            current = start + (target - start) * (i / steps)
            if axis == "pan":
                self._pan_angle = round(current, 2)
            else:
                self._tilt_angle = round(current, 2)
            if self._on_position_update:
                await self._on_position_update(self._pan_angle, self._tilt_angle)
            await asyncio.sleep(0.005)
        self._is_moving = False

    def _record(self, command: str, payload: dict) -> None:
        self._command_history.append(
            {"command": command, "payload": payload, "timestamp": time.time()}
        )