import os
import numpy as np
import pytest
from app.db.session import AsyncSessionLocal
from app.services.training.dataset_service import DatasetService


@pytest.fixture
def dataset_service():
    return DatasetService()


@pytest.mark.asyncio
async def test_dataset_service_seeding_and_crud(dataset_service):
    async with AsyncSessionLocal() as session:
        # Seed and list gestures
        gestures = await dataset_service.list_gestures(session)
        assert len(gestures) >= 6
        names = [g["name"] for g in gestures]
        assert "nod" in names
        assert "shake" in names

        # Create dataset
        ds = await dataset_service.create_dataset(
            name="Test Dataset Alpha",
            description="Unit test dataset",
            version="1.0",
            db=session,
        )
        assert ds["name"] == "Test Dataset Alpha"
        assert ds["status"] == "draft"

        # List datasets
        all_ds = await dataset_service.list_datasets(session)
        assert any(d["id"] == ds["id"] for d in all_ds)

        # Add sample
        sample = await dataset_service.add_sample(
            gesture_name="nod",
            dataset_id=ds["id"],
            feature_file="/tmp/test_nod.npy",
            frame_count=30,
            duration=1.0,
            db=session,
        )
        assert sample["gesture_name"] == "nod"
        assert sample["dataset_id"] == ds["id"]

        # List samples
        samples = await dataset_service.list_samples(gesture_name="nod", db=session)
        assert len(samples) >= 1

        # Delete sample
        deleted = await dataset_service.delete_sample(sample["id"], session)
        assert deleted is True


@pytest.mark.asyncio
async def test_active_learning_workflow(dataset_service):
    async with AsyncSessionLocal() as session:
        features = np.zeros((30, 18), dtype=np.float32)
        sample_id = dataset_service.enqueue_active_learning_sample(
            predicted_gesture="shake",
            confidence=0.62,
            features=features,
            entropy=0.88,
        )

        queue = dataset_service.get_active_learning_queue()
        assert any(item["id"] == sample_id for item in queue)

        # Confirm and label as 'nod'
        labeled_sample = await dataset_service.label_active_learning_sample(
            sample_id=sample_id,
            confirmed_gesture="nod",
            db=session,
        )
        assert labeled_sample is not None
        assert labeled_sample["gesture_name"] == "nod"

        # Queue should no longer contain this item
        queue_after = dataset_service.get_active_learning_queue()
        assert not any(item["id"] == sample_id for item in queue_after)
