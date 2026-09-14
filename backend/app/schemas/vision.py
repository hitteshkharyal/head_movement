from typing import Optional, Tuple, List
from pydantic import BaseModel, Field


class VisionStatusResponse(BaseModel):
    camera_running: bool
    is_tracking: bool
    tracking_mode: str
    fps: float
    face_detected: bool
    yaw: float
    pitch: float
    roll: float
    confidence: float
    bbox: Tuple[int, int, int, int]
    sensitivity: float
    smoothing_alpha: float
    dead_zone: float


class TrackingStartRequest(BaseModel):
    mode: str = Field("mirror", description="Tracking mode: 'mirror', 'follow', 'audience'")


class VisionConfigUpdateRequest(BaseModel):
    sensitivity: Optional[float] = Field(None, ge=0.1, le=2.0)
    smoothing_alpha: Optional[float] = Field(None, ge=0.05, le=1.0)
    dead_zone: Optional[float] = Field(None, ge=0.0, le=15.0)
    mode: Optional[str] = Field(None)
