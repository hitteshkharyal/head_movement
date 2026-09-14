import numpy as np
import pytest
from app.services.camera.camera_manager import CameraManager
from app.services.vision.face_tracker import FaceTracker, FacePose


def test_face_tracker_blank_frame():
    tracker = FaceTracker()
    blank = np.zeros((480, 640, 3), dtype=np.uint8)
    pose = tracker.process_frame(blank)
    assert isinstance(pose, FacePose)
    assert not pose.face_detected
    assert pose.yaw == 0.0


def test_face_tracker_synthetic_frame():
    cam = CameraManager(use_synthetic=True)
    # Generate frame with +15 deg yaw, -10 deg pitch
    frame = cam._generate_synthetic_frame(15.0, -10.0)
    tracker = FaceTracker()
    pose = tracker.process_frame(frame)

    assert isinstance(pose, FacePose)
    assert pose.face_detected is True
    assert -90.0 <= pose.yaw <= 90.0
    assert -90.0 <= pose.pitch <= 90.0
    assert pose.confidence > 0.0
    assert len(pose.bbox) == 4
    assert pose.bbox[2] > 0 and pose.bbox[3] > 0


def test_face_tracker_draw_annotations():
    cam = CameraManager(use_synthetic=True)
    frame = cam._generate_synthetic_frame(0.0, 0.0)
    tracker = FaceTracker()
    pose = tracker.process_frame(frame)

    annotated = tracker.draw_annotations(frame, pose, show_mesh=True, show_bbox=True, show_axis=True)
    assert annotated.shape == frame.shape
    assert annotated.dtype == frame.dtype
    # Frame should be modified with annotations
    assert not np.array_equal(annotated, frame)
