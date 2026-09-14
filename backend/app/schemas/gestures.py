from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class GestureClassResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    type: str
    sample_count: int = 0


class RecordStartRequest(BaseModel):
    gesture_name: str = Field(..., description="Target gesture class name")
    sequence_length: int = Field(30, ge=10, le=120, description="Frames to capture")
    countdown_seconds: float = Field(3.0, ge=0.0, le=10.0, description="Pre-roll countdown seconds")


class RecordStatusResponse(BaseModel):
    session_id: Optional[str]
    gesture_name: Optional[str]
    status: str  # idle, countdown, recording, completed, cancelled
    countdown_remaining: float
    frames_captured: int
    total_frames: int
    duration_seconds: float
    feature_file_path: Optional[str] = None


class SampleCreateRequest(BaseModel):
    gesture_name: str
    dataset_id: Optional[str] = None
    feature_file: str
    frame_count: int = 30
    duration: float = 1.0


class SampleResponse(BaseModel):
    id: str
    dataset_id: str
    gesture_id: str
    gesture_name: str
    feature_file: Optional[str] = None
    frame_count: Optional[int] = None
    duration: Optional[float] = None
    created_at: Optional[str] = None


class DatasetCreateRequest(BaseModel):
    name: str
    description: Optional[str] = None
    version: str = "1.0"


class DatasetResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    version: str
    status: str
    sample_count: int = 0


class ActiveLearningItem(BaseModel):
    id: str
    predicted_gesture: str
    confidence: float
    entropy: float
    feature_file: str
    created_at: float


class ActiveLearningLabelRequest(BaseModel):
    confirmed_gesture: str
