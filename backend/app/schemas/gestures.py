from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, ConfigDict


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


# -----------------------------------------------------------------------------
# Phase 7 & 8: ML Model Training & Live Inference Schemas
# -----------------------------------------------------------------------------

class ModelTrainRequest(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    dataset_id: Optional[str] = None
    model_name: Optional[str] = Field("Gesture-RF-Classifier", description="Display name for the model")
    model_type: str = Field("sklearn_rf", description="Model architecture type (sklearn_rf, sklearn_gb, sklearn_mlp)")
    n_estimators: int = Field(100, ge=10, le=500)
    max_depth: Optional[int] = Field(15, ge=2, le=50)


class ModelMetrics(BaseModel):
    train_accuracy: float
    val_accuracy: float
    test_accuracy: float
    macro_f1: float
    macro_precision: float
    macro_recall: float
    class_labels: List[str]
    confusion_matrix: List[List[int]]
    training_time_seconds: float
    sample_count: int


class ModelVersionResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    id: str
    name: str
    version: str
    model_type: str
    status: str  # training, ready, active, archived
    dataset_id: Optional[str] = None
    model_file: Optional[str] = None
    metrics: Optional[Dict[str, Any]] = None
    created_at: Optional[str] = None


class InferenceStatusResponse(BaseModel):
    active_model_id: Optional[str] = None
    active_model_name: Optional[str] = None
    active_model_version: Optional[str] = None
    buffer_frames: int = 0
    buffer_capacity: int = 30
    is_ready: bool = False
    last_detected_gesture: Optional[str] = None
    last_confidence: float = 0.0
    is_cooldown_active: bool = False
    cooldown_remaining_sec: float = 0.0
    autonomous_reaction_enabled: bool = False


class LivePredictionResponse(BaseModel):
    detected_gesture: Optional[str] = None
    confidence: float = 0.0
    probabilities: Dict[str, float] = {}
    is_debounced: bool = False
    cooldown_active: bool = False
    timestamp: float = 0.0

