import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.gestures import (
    ModelTrainRequest,
    ModelVersionResponse,
)
from app.services.ml.gesture_predictor import get_gesture_predictor
from app.services.training.trainer import GestureTrainer, get_gesture_trainer

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/train", response_model=ModelVersionResponse)
async def train_gesture_model(
    req: ModelTrainRequest,
    db: AsyncSession = Depends(get_db),
    trainer: GestureTrainer = Depends(get_gesture_trainer),
):
    """
    Train a new gesture classification model on recorded or synthetic dataset samples.
    Generates training/validation/test metrics, confusion matrix, and exports model artifact.
    """
    try:
        result = await trainer.train(
            db=db,
            dataset_id=req.dataset_id,
            model_name=req.model_name or "Gesture-RF-Classifier",
            model_type=req.model_type,
            n_estimators=req.n_estimators,
            max_depth=req.max_depth,
            set_active=True,
        )

        # Notify live gesture predictor to reload active model
        predictor = get_gesture_predictor()
        await predictor.load_active_model()

        return result
    except Exception as exc:
        logger.error("Error during model training: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Model training failed: {str(exc)}",
        )


@router.get("/models", response_model=List[ModelVersionResponse])
async def list_models(
    db: AsyncSession = Depends(get_db),
    trainer: GestureTrainer = Depends(get_gesture_trainer),
):
    """List all trained model versions with performance metrics."""
    return await trainer.list_models(db)


@router.get("/models/{model_id}", response_model=ModelVersionResponse)
async def get_model_details(
    model_id: str,
    db: AsyncSession = Depends(get_db),
    trainer: GestureTrainer = Depends(get_gesture_trainer),
):
    """Retrieve full details, metrics, and confusion matrix for a model version."""
    model = await trainer.get_model(model_id, db)
    if not model:
        raise HTTPException(status_code=404, detail="Model version not found")
    return model


@router.post("/models/{model_id}/activate")
async def activate_model_version(
    model_id: str,
    db: AsyncSession = Depends(get_db),
    trainer: GestureTrainer = Depends(get_gesture_trainer),
):
    """Set the specified model version as the active model for live camera inference."""
    success = await trainer.activate_model(model_id, db)
    if not success:
        raise HTTPException(status_code=404, detail="Model version not found")

    predictor = get_gesture_predictor()
    await predictor.load_active_model()

    return {"status": "activated", "model_id": model_id}


@router.delete("/models/{model_id}")
async def delete_model_version(
    model_id: str,
    db: AsyncSession = Depends(get_db),
    trainer: GestureTrainer = Depends(get_gesture_trainer),
):
    """Delete a trained model version and remove its artifacts on disk."""
    success = await trainer.delete_model(model_id, db)
    if not success:
        raise HTTPException(status_code=404, detail="Model version not found")
    return {"status": "deleted", "model_id": model_id}
