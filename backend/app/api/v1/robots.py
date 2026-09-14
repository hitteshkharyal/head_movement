from fastapi import APIRouter
from app.core.config import settings

router = APIRouter()


@router.get("/")
async def list_robots():
    return {
        "robots": [
            {
                "id": "default",
                "name": "PresentationBot-v1",
                "device_type": "ESP32",
                "connection_type": settings.esp32_connection_type,
                "status": "disconnected",
            }
        ]
    }


@router.get("/{robot_id}/status")
async def get_robot_status(robot_id: str):
    return {
        "id": robot_id,
        "status": "disconnected",
        "hardware_mode": settings.esp32_connection_type,
        "pan_angle": 90.0,
        "tilt_angle": 90.0,
    }
