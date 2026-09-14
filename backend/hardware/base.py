from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class ServoStatus:
    pan_angle: float = 90.0
    tilt_angle: float = 90.0
    is_moving: bool = False
    error: Optional[str] = None


@dataclass
class HardwareStatus:
    connected: bool = False
    controller_type: str = "unknown"
    servo: ServoStatus = field(default_factory=ServoStatus)
    error: Optional[str] = None


class HardwareController(ABC):
    """
    Abstract interface for all robot hardware controllers.

    All application code must depend on this interface, not on concrete
    implementations. This allows swapping MockController <-> ESP32Controller
    without changing any route handlers.
    """

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
        Must validate angle against configured limits.
        Returns True on success.
        """

    @abstractmethod
    async def move_tilt(self, angle: float) -> bool:
        """
        Move TILT servo to absolute angle.
        Must validate angle against configured limits.
        Returns True on success.
        """

    @abstractmethod
    async def center(self) -> bool:
        """Move both servos to their configured center positions."""

    @abstractmethod
    async def stop(self) -> bool:
        """Stop all servo movement immediately."""

    @abstractmethod
    async def emergency_stop(self) -> bool:
        """
        Immediate emergency halt.
        Must be executed before any queued commands.
        Must work even if not fully connected.
        """

    @abstractmethod
    async def get_status(self) -> HardwareStatus:
        """Return current hardware and servo status."""

    @abstractmethod
    async def execute_gesture(self, gesture_name: str) -> bool:
        """
        Execute a named predefined gesture sequence.
        Gesture sequences are defined in configuration/DB, not here.
        """
