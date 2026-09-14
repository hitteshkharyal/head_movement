from fastapi import APIRouter
from app.core.config import settings

router = APIRouter()


@router.get("/config")
async def get_servo_config():
    return {
        "servos": [
            {
                "servo_name": "pan",
                "axis": "yaw",
                "min_angle": settings.pan_min_angle,
                "max_angle": settings.pan_max_angle,
                "center_angle": settings.pan_center_angle,
                "speed": settings.pan_speed,
            },
            {
                "servo_name": "tilt",
                "axis": "pitch",
                "min_angle": settings.tilt_min_angle,
                "max_angle": settings.tilt_max_angle,
                "center_angle": settings.tilt_center_angle,
                "speed": settings.tilt_speed,
            },
        ]
    }
