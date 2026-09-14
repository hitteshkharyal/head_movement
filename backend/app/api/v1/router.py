from fastapi import APIRouter
from app.api.v1 import health, robots, servos, gestures, system

api_router = APIRouter()
api_router.include_router(health.router, tags=["Health"])
api_router.include_router(robots.router, prefix="/robots", tags=["Robots"])
api_router.include_router(servos.router, prefix="/servos", tags=["Servos"])
api_router.include_router(gestures.router, prefix="/gestures", tags=["Gestures"])
api_router.include_router(system.router, prefix="/system", tags=["System"])
