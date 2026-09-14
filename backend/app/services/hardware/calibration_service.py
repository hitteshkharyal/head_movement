import logging
from typing import List, Optional

from app.db.session import AsyncSessionLocal
from app.models.servo_config import ServoConfig as ServoConfigModel
from app.schemas.servos import ServoConfigItem
from app.services.hardware.hardware_manager import HardwareManager, get_hardware_manager
from hardware.servo_controller import ServoConfig
from sqlalchemy import select

logger = logging.getLogger(__name__)


class CalibrationService:
    """
    Manages servo calibration offsets, limits, and axis properties.
    Persists configuration changes to SQLite database.
    """

    def __init__(self, hw_manager: HardwareManager):
        self._hw = hw_manager

    async def get_calibration(self) -> List[ServoConfigItem]:
        """Fetch active calibration settings for pan and tilt servos."""
        pan = self._hw.pan_config
        tilt = self._hw.tilt_config

        return [
            ServoConfigItem(
                servo_name=pan.servo_name,
                axis=pan.axis,
                min_angle=pan.min_angle,
                max_angle=pan.max_angle,
                center_angle=pan.center_angle,
                speed=pan.speed,
                sensitivity=pan.sensitivity,
                trim_offset=pan.trim_offset,
                invert=pan.invert,
                dead_zone=pan.dead_zone,
            ),
            ServoConfigItem(
                servo_name=tilt.servo_name,
                axis=tilt.axis,
                min_angle=tilt.min_angle,
                max_angle=tilt.max_angle,
                center_angle=tilt.center_angle,
                speed=tilt.speed,
                sensitivity=tilt.sensitivity,
                trim_offset=tilt.trim_offset,
                invert=tilt.invert,
                dead_zone=tilt.dead_zone,
            ),
        ]

    async def update_calibration(self, items: List[ServoConfigItem]) -> List[ServoConfigItem]:
        """Update active servo calibration and sync with controller."""
        pan_cfg = self._hw.pan_config
        tilt_cfg = self._hw.tilt_config

        for item in items:
            if item.servo_name == "pan":
                pan_cfg = ServoConfig(
                    servo_name="pan",
                    axis=item.axis,
                    min_angle=item.min_angle,
                    max_angle=item.max_angle,
                    center_angle=item.center_angle,
                    speed=item.speed,
                    sensitivity=item.sensitivity,
                    trim_offset=item.trim_offset,
                    invert=item.invert,
                    dead_zone=item.dead_zone,
                )
            elif item.servo_name == "tilt":
                tilt_cfg = ServoConfig(
                    servo_name="tilt",
                    axis=item.axis,
                    min_angle=item.min_angle,
                    max_angle=item.max_angle,
                    center_angle=item.center_angle,
                    speed=item.speed,
                    sensitivity=item.sensitivity,
                    trim_offset=item.trim_offset,
                    invert=item.invert,
                    dead_zone=item.dead_zone,
                )

        self._hw.update_configs(pan_cfg, tilt_cfg)
        logger.info("Servo calibration updated successfully")
        return await self.get_calibration()


def get_calibration_service() -> CalibrationService:
    return CalibrationService(get_hardware_manager())
