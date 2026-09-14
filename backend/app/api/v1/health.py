import time
from fastapi import APIRouter
from app.core.config import settings

router = APIRouter()
_start_time = time.time()


@router.get("/health")
async def health_check():
    return {
        "status": "ok",
        "version": settings.app_version,
        "environment": settings.app_env,
        "uptime_seconds": round(time.time() - _start_time, 1),
        "hardware_mode": settings.esp32_connection_type,
        "debug": settings.app_debug,
    }
