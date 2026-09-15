import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.schemas.gestures import (
    InferenceStatusResponse,
    LivePredictionResponse,
)
from app.services.ml.gesture_predictor import GesturePredictor, get_gesture_predictor

logger = logging.getLogger(__name__)
router = APIRouter()


class AutonomousReactionToggleRequest(BaseModel):
    enabled: bool


@router.get("/status", response_model=InferenceStatusResponse)
async def get_inference_status(
    predictor: GesturePredictor = Depends(get_gesture_predictor),
):
    """Get live inference engine buffer status, active model info, and cooldown status."""
    st = predictor.get_status()
    return InferenceStatusResponse(
        active_model_id=st["active_model_id"],
        active_model_name=st["active_model_name"],
        active_model_version=st["active_model_version"],
        buffer_frames=st["buffer_frames"],
        buffer_capacity=st["buffer_capacity"],
        is_ready=st["is_ready"],
        last_detected_gesture=st["last_detected_gesture"],
        last_confidence=st["last_confidence"],
        is_cooldown_active=st["is_cooldown_active"],
        cooldown_remaining_sec=st["cooldown_remaining_sec"],
        autonomous_reaction_enabled=st["autonomous_reaction_enabled"],
    )


@router.post("/predict", response_model=LivePredictionResponse)
async def predict_current_window(
    predictor: GesturePredictor = Depends(get_gesture_predictor),
):
    """Trigger real-time inference on the currently buffered 30-frame window."""
    res = await predictor.predict_current_window()
    return LivePredictionResponse(
        detected_gesture=res.get("detected_gesture"),
        confidence=res.get("confidence", 0.0),
        probabilities=res.get("probabilities", {}),
        is_debounced=res.get("is_debounced", False),
        cooldown_active=res.get("cooldown_active", False),
        timestamp=res.get("timestamp", 0.0),
    )


@router.post("/autonomous-reaction", response_model=InferenceStatusResponse)
async def toggle_autonomous_reaction(
    req: AutonomousReactionToggleRequest,
    predictor: GesturePredictor = Depends(get_gesture_predictor),
):
    """Enable or disable autonomous robot servo reactions to detected human gestures."""
    predictor.autonomous_reaction_enabled = req.enabled
    return await get_inference_status(predictor)
