from fastapi import APIRouter
from app.api.v1 import gestures, health, predictions, robots, servos, system, training, vision

api_router = APIRouter()
api_router.include_router(health.router, tags=["Health"])
api_router.include_router(robots.router, prefix="/robots", tags=["Robots"])
api_router.include_router(servos.router, prefix="/servos", tags=["Servos"])
api_router.include_router(gestures.router, prefix="/gestures", tags=["Gestures"])
api_router.include_router(training.router, prefix="/training", tags=["Training"])
api_router.include_router(predictions.router, prefix="/predictions", tags=["Predictions"])
api_router.include_router(system.router, prefix="/system", tags=["System"])
api_router.include_router(vision.router, prefix="/vision", tags=["Vision"])

