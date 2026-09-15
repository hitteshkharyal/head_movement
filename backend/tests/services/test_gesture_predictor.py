import pytest
import asyncio
import numpy as np
from app.services.ml.gesture_predictor import GesturePredictor
from app.services.training.trainer import GestureTrainer
from app.services.vision.face_tracker import FacePose


@pytest.fixture
async def active_model():
    trainer = GestureTrainer()
    model_version = await trainer.train(
        dataset_id=None,
        model_name="Predictor-Test-Model",
        model_type="sklearn_rf",
        n_estimators=10,
        max_depth=5,
    )
    return model_version


@pytest.mark.asyncio
async def test_predictor_initialization():
    predictor = GesturePredictor(buffer_size=30)
    assert predictor.is_ready is False
    assert len(predictor._buffer) == 0
    assert predictor.buffer_size == 30


@pytest.mark.asyncio
async def test_predictor_sliding_window_and_inference(active_model):
    predictor = GesturePredictor(buffer_size=30, confidence_threshold=0.50, debounce_frames=1)
    await predictor.load_active_model()
    assert predictor._pipeline is not None

    # Simulate feeding 29 face poses (not yet ready)
    for i in range(29):
        pose = FacePose(face_detected=True, yaw=0.0, pitch=15.0 * np.sin(i * 0.2), roll=0.0, confidence=0.95)
        predictor.push_frame_pose(pose)

    res_empty = await predictor.predict_current_window()
    assert res_empty["detected_gesture"] is None
    assert res_empty["buffer_frames"] == 29

    # Feed 30th pose
    pose_30 = FacePose(face_detected=True, yaw=0.0, pitch=20.0, roll=0.0, confidence=0.95)
    predictor.push_frame_pose(pose_30)

    res_full = await predictor.predict_current_window()
    assert res_full["buffer_frames"] == 30
    assert "probabilities" in res_full
    assert len(res_full["probabilities"]) > 0


@pytest.mark.asyncio
async def test_predictor_debouncing_and_cooldown(active_model):
    predictor = GesturePredictor(
        buffer_size=30,
        confidence_threshold=0.40,
        debounce_frames=3,
        cooldown_seconds=1.0,
    )
    await predictor.load_active_model()

    # Feed a continuous sinusoidal nod pattern
    for i in range(35):
        pose = FacePose(
            face_detected=True,
            yaw=0.0,
            pitch=22.0 * np.sin(i * 0.3),
            roll=0.0,
            confidence=0.95,
        )
        predictor.push_frame_pose(pose)

    res = await predictor.predict_current_window()
    assert res["buffer_frames"] == 30
    assert isinstance(res["cooldown_active"], bool)
