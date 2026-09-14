from fastapi import APIRouter

router = APIRouter()


@router.post("/emergency-stop")
async def emergency_stop():
    return {"status": "emergency_stop_triggered", "message": "All hardware stopped"}


@router.get("/logs")
async def get_system_logs(limit: int = 50):
    return {"logs": [], "total": 0}
