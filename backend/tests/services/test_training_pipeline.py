import pytest
import os
import numpy as np
from app.services.training.trainer import GestureTrainer


@pytest.mark.asyncio
async def test_synthetic_trajectory_generation():
    trainer = GestureTrainer()
    traj = trainer.generate_synthetic_trajectory("yes_nod", sequence_length=30)
    assert isinstance(traj, np.ndarray)
    assert traj.shape == (30, 18)

    # For yes_nod, pitch is index 1; should show pitch amplitude variation
    pitches = traj[:, 1]
    assert np.ptp(pitches) > 10.0


@pytest.mark.asyncio
async def test_feature_vector_extraction():
    trainer = GestureTrainer()
    traj = trainer.generate_synthetic_trajectory("no_shake", sequence_length=30)
    feat = trainer.extract_features_from_sample(traj, target_length=30)
    # 30 frames * 18 features (540) + 18 features * 5 statistics (90) = 630 dimensions
    assert isinstance(feat, np.ndarray)
    assert feat.shape == (630,)
    assert not np.isnan(feat).any()


@pytest.mark.asyncio
async def test_train_model_pipeline():
    trainer = GestureTrainer()
    result = await trainer.train(
        dataset_id=None,
        model_name="PyTest-RF-Classifier",
        model_type="sklearn_rf",
        n_estimators=10,
        max_depth=5,
    )

    assert result is not None
    assert result["status"] == "active"
    assert "metrics" in result
    metrics = result["metrics"]
    assert metrics["train_accuracy"] >= 0.8
    assert metrics["val_accuracy"] >= 0.7
    assert metrics["test_accuracy"] >= 0.7
    assert metrics["macro_f1"] >= 0.7
    assert len(metrics["class_labels"]) == 6
    assert len(metrics["confusion_matrix"]) == 6
    assert os.path.exists(result["model_file"])
