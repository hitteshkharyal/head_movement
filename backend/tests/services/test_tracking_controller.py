import asyncio
import pytest
from app.services.camera.camera_manager import CameraManager
from app.services.hardware.hardware_manager import HardwareManager
from app.services.vision.face_tracker import FacePose, FaceTracker
from app.services.vision.tracking_controller import TrackingController


@pytest.fixture
def tracking_setup():
    cam = CameraManager(use_synthetic=True)
    tracker = FaceTracker()
    hw = HardwareManager.get_instance()
    controller = TrackingController(camera=cam, tracker=tracker, hardware=hw)
    return controller, hw


@pytest.mark.asyncio
async def test_tracking_start_stop(tracking_setup):
    ctrl, hw = tracking_setup
    assert not ctrl.is_tracking

    started = await ctrl.start_tracking(mode="mirror")
    assert started is True
    assert ctrl.is_tracking is True
    assert ctrl.mode == "mirror"

    stopped = await ctrl.stop_tracking()
    assert stopped is True
    assert ctrl.is_tracking is False
    assert ctrl.mode == "off"


@pytest.mark.asyncio
async def test_tracking_dispatch_mirror_mode(tracking_setup):
    ctrl, hw = tracking_setup
    ctrl.mode = "mirror"
    ctrl.dead_zone = 1.0
    ctrl.sensitivity = 1.0
    ctrl.smoothing_alpha = 1.0  # Instant update for test

    # Simulate detected face with yaw=30, pitch=15
    pose = FacePose(face_detected=True, yaw=30.0, pitch=15.0, confidence=0.9)
    await ctrl._dispatch_tracking(pose)

    status = await hw.controller.get_status()
    # In mirror mode, yaw=30 -> pan moves towards 90 + 30 = 120
    assert 110.0 <= status.servo.pan_angle <= 130.0
    assert 100.0 <= status.servo.tilt_angle <= 115.0


@pytest.mark.asyncio
async def test_tracking_dispatch_follow_mode(tracking_setup):
    ctrl, hw = tracking_setup
    ctrl.mode = "follow"
    ctrl.dead_zone = 1.0
    ctrl.sensitivity = 1.0
    ctrl.smoothing_alpha = 1.0

    # In follow mode, yaw=30 -> inverted centering: pan moves towards 90 - 30 = 60
    pose = FacePose(face_detected=True, yaw=30.0, pitch=-10.0, confidence=0.9)
    await ctrl._dispatch_tracking(pose)

    status = await hw.controller.get_status()
    assert 50.0 <= status.servo.pan_angle <= 70.0
