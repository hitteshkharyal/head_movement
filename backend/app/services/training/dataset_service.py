import asyncio
import io
import json
import logging
import os
import random
import time
import uuid
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import numpy as np
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.models.gesture import Gesture as GestureModel
from app.models.training_dataset import TrainingDataset as DatasetModel
from app.models.training_sample import TrainingSample as SampleModel

logger = logging.getLogger(__name__)

DEFAULT_GESTURE_CLASSES = [
    {"name": "nod", "description": "Affirmative head nod (agreement/acknowledgment)", "type": "predefined"},
    {"name": "shake", "description": "Side-to-side head shake (disagreement/negation)", "type": "predefined"},
    {"name": "head_tilt_left", "description": "Head tilted towards left shoulder", "type": "predefined"},
    {"name": "head_tilt_right", "description": "Head tilted towards right shoulder", "type": "predefined"},
    {"name": "look_away", "description": "Gaze shifted away from audience/camera", "type": "predefined"},
    {"name": "attention", "description": "Direct forward focus and high attention", "type": "predefined"},
]


class DatasetService:
    """
    Manages gesture datasets, training samples, stratified splits, and active learning queues.
    """

    def __init__(self):
        self._samples_dir = settings.recordings_directory / "samples"
        self._active_learning_queue: List[Dict[str, Any]] = []

    async def ensure_default_gestures(self, db: AsyncSession) -> None:
        """Seed default predefined gesture classes if not already present."""
        for g in DEFAULT_GESTURE_CLASSES:
            stmt = select(GestureModel).where(GestureModel.name == g["name"])
            res = await db.execute(stmt)
            existing = res.scalar_one_or_none()
            if not existing:
                gesture = GestureModel(
                    id=str(uuid.uuid4()),
                    name=g["name"],
                    description=g["description"],
                    type=g["type"],
                    configuration={"min_frames": 10, "max_frames": 45},
                )
                db.add(gesture)
        await db.commit()

    async def list_gestures(self, db: AsyncSession) -> List[Dict[str, Any]]:
        """List all available gesture classes with sample counts."""
        await self.ensure_default_gestures(db)
        stmt = select(GestureModel)
        result = await db.execute(stmt)
        gestures = result.scalars().all()

        output = []
        for g in gestures:
            # Count samples
            cnt_stmt = select(func.count(SampleModel.id)).where(SampleModel.gesture_id == g.id)
            cnt_res = await db.execute(cnt_stmt)
            sample_count = cnt_res.scalar() or 0

            output.append({
                "id": g.id,
                "name": g.name,
                "description": g.description,
                "type": g.type,
                "sample_count": sample_count,
            })
        return output

    async def create_dataset(
        self,
        name: str,
        description: Optional[str],
        version: str = "1.0",
        db: Optional[AsyncSession] = None,
    ) -> Dict[str, Any]:
        """Create a new training dataset record."""
        session = db or AsyncSessionLocal()
        try:
            ds = DatasetModel(
                id=str(uuid.uuid4()),
                name=name,
                description=description,
                version=version,
                status="draft",
            )
            session.add(ds)
            await session.commit()
            return {
                "id": ds.id,
                "name": ds.name,
                "description": ds.description,
                "version": ds.version,
                "status": ds.status,
            }
        finally:
            if not db:
                await session.close()

    async def list_datasets(self, db: AsyncSession) -> List[Dict[str, Any]]:
        """List all training datasets with summary metrics."""
        stmt = select(DatasetModel)
        result = await db.execute(stmt)
        datasets = result.scalars().all()

        output = []
        for ds in datasets:
            cnt_stmt = select(func.count(SampleModel.id)).where(SampleModel.dataset_id == ds.id)
            cnt_res = await db.execute(cnt_stmt)
            sample_count = cnt_res.scalar() or 0

            output.append({
                "id": ds.id,
                "name": ds.name,
                "description": ds.description,
                "version": ds.version,
                "status": ds.status,
                "sample_count": sample_count,
            })
        return output

    async def add_sample(
        self,
        gesture_name: str,
        dataset_id: Optional[str],
        feature_file: str,
        frame_count: int,
        duration: float,
        db: AsyncSession,
    ) -> Dict[str, Any]:
        """Save a recorded gesture sample into the database."""
        await self.ensure_default_gestures(db)

        # Get or create gesture
        g_stmt = select(GestureModel).where(GestureModel.name == gesture_name)
        g_res = await db.execute(g_stmt)
        gesture = g_res.scalar_one_or_none()
        if not gesture:
            gesture = GestureModel(
                id=str(uuid.uuid4()),
                name=gesture_name,
                type="custom",
            )
            db.add(gesture)
            await db.flush()

        # Get default dataset if not provided
        if not dataset_id:
            ds_stmt = select(DatasetModel).where(DatasetModel.name == "Default Dataset")
            ds_res = await db.execute(ds_stmt)
            ds = ds_res.scalar_one_or_none()
            if not ds:
                ds = DatasetModel(
                    id=str(uuid.uuid4()),
                    name="Default Dataset",
                    description="Primary training dataset for gesture recognition",
                    version="1.0",
                )
                db.add(ds)
                await db.flush()
            dataset_id = ds.id

        sample = SampleModel(
            id=str(uuid.uuid4()),
            dataset_id=dataset_id,
            gesture_id=gesture.id,
            feature_file=feature_file,
            frame_count=frame_count,
            duration=duration,
        )
        db.add(sample)
        await db.commit()

        return {
            "id": sample.id,
            "dataset_id": sample.dataset_id,
            "gesture_id": sample.gesture_id,
            "gesture_name": gesture_name,
            "feature_file": sample.feature_file,
            "frame_count": sample.frame_count,
            "duration": sample.duration,
        }

    async def list_samples(
        self,
        gesture_name: Optional[str] = None,
        dataset_id: Optional[str] = None,
        limit: int = 50,
        db: Optional[AsyncSession] = None,
    ) -> List[Dict[str, Any]]:
        """List recorded training samples with gesture metadata."""
        session = db or AsyncSessionLocal()
        try:
            stmt = select(SampleModel, GestureModel.name).join(
                GestureModel, SampleModel.gesture_id == GestureModel.id
            )
            if gesture_name:
                stmt = stmt.where(GestureModel.name == gesture_name)
            if dataset_id:
                stmt = stmt.where(SampleModel.dataset_id == dataset_id)

            stmt = stmt.limit(limit)
            res = await session.execute(stmt)
            rows = res.all()

            output = []
            for sample, g_name in rows:
                output.append({
                    "id": sample.id,
                    "dataset_id": sample.dataset_id,
                    "gesture_id": sample.gesture_id,
                    "gesture_name": g_name,
                    "feature_file": sample.feature_file,
                    "frame_count": sample.frame_count,
                    "duration": sample.duration,
                    "created_at": sample.created_at.isoformat() if sample.created_at else None,
                })
            return output
        finally:
            if not db:
                await session.close()

    async def delete_sample(self, sample_id: str, db: AsyncSession) -> bool:
        """Delete a sample record and its associated feature file."""
        stmt = select(SampleModel).where(SampleModel.id == sample_id)
        res = await db.execute(stmt)
        sample = res.scalar_one_or_none()
        if not sample:
            return False

        if sample.feature_file and os.path.exists(sample.feature_file):
            try:
                os.remove(sample.feature_file)
            except Exception as exc:
                logger.warning("Could not delete feature file %s: %s", sample.feature_file, exc)

        await db.delete(sample)
        await db.commit()
        return True

    # Active Learning Pipeline
    def enqueue_active_learning_sample(
        self,
        predicted_gesture: str,
        confidence: float,
        features: np.ndarray,
        entropy: float = 0.0,
    ) -> str:
        """Enqueue an ambiguous/low-confidence inference sample for human review."""
        sample_id = str(uuid.uuid4())
        # Save temporary feature file
        filename = f"active_learning_{sample_id}.npy"
        path = self._samples_dir / filename
        np.save(str(path), features)

        item = {
            "id": sample_id,
            "predicted_gesture": predicted_gesture,
            "confidence": round(confidence, 3),
            "entropy": round(entropy, 3),
            "feature_file": str(path),
            "created_at": time.time(),
        }
        self._active_learning_queue.append(item)
        return sample_id

    def get_active_learning_queue(self) -> List[Dict[str, Any]]:
        return list(self._active_learning_queue)

    async def label_active_learning_sample(
        self,
        sample_id: str,
        confirmed_gesture: str,
        db: AsyncSession,
    ) -> Optional[Dict[str, Any]]:
        """Confirm or re-label an active learning item and promote it to the training dataset."""
        target_item = None
        for item in self._active_learning_queue:
            if item["id"] == sample_id:
                target_item = item
                break

        if not target_item:
            return None

        self._active_learning_queue.remove(target_item)
        saved = await self.add_sample(
            gesture_name=confirmed_gesture,
            dataset_id=None,
            feature_file=target_item["feature_file"],
            frame_count=30,
            duration=1.0,
            db=db,
        )
        return saved


def get_dataset_service() -> DatasetService:
    return DatasetService()
