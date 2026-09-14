import asyncio
import os
import numpy as np
import pytest
from app.services.camera.camera_manager import CameraManager
from app.services.gestures.recorder import GestureRecorder
from app.services.vision.face_tracker import FaceTracker


@pytest.fixture
def gesture_recorder():
    cam = CameraManager(use_synthetic=True)
    tracker = FaceTracker()
    recorder = GestureRecorder(camera=cam, tracker=tracker)
    return recorder


@pytest.mark.asyncio
async def test_gesture_recorder_lifecycle(gesture_recorder):
    # Start short 5-frame recording with 0s countdown for fast test
    session = await gesture_recorder.start_recording(
        gesture_name="nod",
        sequence_length=5,
        countdown_seconds=0.05,
    )
    assert session.gesture_name == "nod"
    assert session.total_frames == 5

    # Wait for completion
    for _ in range(30):
        if session.status == "completed":
            break
        await asyncio.sleep(0.05)

    assert session.status == "completed"
    assert session.frames_captured == 5
    assert session.feature_file_path is not None
    assert os.path.exists(session.feature_file_path)

    # Verify saved numpy array
    data = np.load(session.feature_file_path)
    assert data.shape[0] == 5
    assert data.shape[1] >= 6  # yaw, pitch, roll, dyaw, dpitch, droll + landmarks


@pytest.mark.asyncio
async def test_gesture_recorder_cancellation(gesture_recorder):
    session = await gesture_recorder.start_recording(
        gesture_name="shake",
        sequence_length=30,
        countdown_seconds=5.0,
    )
    assert session.status == "countdown"

    await gesture_recorder.cancel_recording()
    assert session.status == "cancelled"
