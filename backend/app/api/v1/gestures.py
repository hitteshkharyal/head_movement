from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.gestures import (
    ActiveLearningItem,
    ActiveLearningLabelRequest,
    DatasetCreateRequest,
    DatasetResponse,
    GestureClassResponse,
    RecordStartRequest,
    RecordStatusResponse,
    SampleCreateRequest,
    SampleResponse,
)
from app.services.gestures.recorder import (
    GestureRecorder,
    GestureRecordingSession,
    get_gesture_recorder,
)
from app.services.training.dataset_service import (
    DatasetService,
    get_dataset_service,
)

router = APIRouter()


@router.get("/classes", response_model=List[GestureClassResponse])
async def list_gesture_classes(
    db: AsyncSession = Depends(get_db),
    service: DatasetService = Depends(get_dataset_service),
):
    """List all recognized gesture classes with sample counts."""
    return await service.list_gestures(db)


@router.post("/record/start", response_model=RecordStatusResponse)
async def start_gesture_recording(
    req: RecordStartRequest,
    recorder: GestureRecorder = Depends(get_gesture_recorder),
):
    """Trigger a new time-series motion recording with countdown."""
    session = await recorder.start_recording(
        gesture_name=req.gesture_name,
        sequence_length=req.sequence_length,
        countdown_seconds=req.countdown_seconds,
    )
    return RecordStatusResponse(
        session_id=session.session_id,
        gesture_name=session.gesture_name,
        status=session.status,
        countdown_remaining=session.countdown_remaining,
        frames_captured=session.frames_captured,
        total_frames=session.total_frames,
        duration_seconds=session.duration_seconds,
        feature_file_path=session.feature_file_path,
    )


@router.get("/record/status", response_model=RecordStatusResponse)
async def get_recording_status(
    recorder: GestureRecorder = Depends(get_gesture_recorder),
):
    """Poll live recording progress (countdown, frames captured, completion)."""
    session = recorder.current_session
    if not session:
        return RecordStatusResponse(
            session_id=None,
            gesture_name=None,
            status="idle",
            countdown_remaining=0.0,
            frames_captured=0,
            total_frames=30,
            duration_seconds=0.0,
        )
    return RecordStatusResponse(
        session_id=session.session_id,
        gesture_name=session.gesture_name,
        status=session.status,
        countdown_remaining=session.countdown_remaining,
        frames_captured=session.frames_captured,
        total_frames=session.total_frames,
        duration_seconds=session.duration_seconds,
        feature_file_path=session.feature_file_path,
    )


@router.post("/record/cancel", response_model=RecordStatusResponse)
async def cancel_gesture_recording(
    recorder: GestureRecorder = Depends(get_gesture_recorder),
):
    """Cancel an active recording."""
    await recorder.cancel_recording()
    return await get_recording_status(recorder)


@router.get("/samples", response_model=List[SampleResponse])
async def list_samples(
    gesture_name: Optional[str] = Query(None),
    dataset_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    service: DatasetService = Depends(get_dataset_service),
):
    """List recorded gesture dataset samples."""
    return await service.list_samples(
        gesture_name=gesture_name,
        dataset_id=dataset_id,
        limit=limit,
        db=db,
    )


@router.post("/samples", response_model=SampleResponse)
async def create_sample(
    req: SampleCreateRequest,
    db: AsyncSession = Depends(get_db),
    service: DatasetService = Depends(get_dataset_service),
):
    """Save a recorded sample into the database."""
    return await service.add_sample(
        gesture_name=req.gesture_name,
        dataset_id=req.dataset_id,
        feature_file=req.feature_file,
        frame_count=req.frame_count,
        duration=req.duration,
        db=db,
    )


@router.delete("/samples/{sample_id}")
async def delete_sample(
    sample_id: str,
    db: AsyncSession = Depends(get_db),
    service: DatasetService = Depends(get_dataset_service),
):
    """Delete a recorded gesture sample and its underlying feature file."""
    deleted = await service.delete_sample(sample_id, db)
    if not deleted:
        raise HTTPException(status_code=404, detail="Sample not found")
    return {"status": "deleted", "sample_id": sample_id}


@router.get("/datasets", response_model=List[DatasetResponse])
async def list_datasets(
    db: AsyncSession = Depends(get_db),
    service: DatasetService = Depends(get_dataset_service),
):
    """List training datasets."""
    return await service.list_datasets(db)


@router.post("/datasets", response_model=DatasetResponse)
async def create_dataset(
    req: DatasetCreateRequest,
    db: AsyncSession = Depends(get_db),
    service: DatasetService = Depends(get_dataset_service),
):
    """Create a new training dataset record."""
    return await service.create_dataset(
        name=req.name,
        description=req.description,
        version=req.version,
        db=db,
    )


@router.get("/active-learning", response_model=List[ActiveLearningItem])
async def get_active_learning_queue(
    service: DatasetService = Depends(get_dataset_service),
):
    """Get active learning review queue for unconfirmed / low-confidence samples."""
    return service.get_active_learning_queue()


@router.post("/active-learning/{sample_id}/label", response_model=SampleResponse)
async def label_active_learning_sample(
    sample_id: str,
    req: ActiveLearningLabelRequest,
    db: AsyncSession = Depends(get_db),
    service: DatasetService = Depends(get_dataset_service),
):
    """Confirm or relabel an active learning item and add it to training dataset."""
    result = await service.label_active_learning_sample(
        sample_id=sample_id,
        confirmed_gesture=req.confirmed_gesture,
        db=db,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Active learning item not found")
    return result
