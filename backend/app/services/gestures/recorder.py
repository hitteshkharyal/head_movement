import asyncio
import json
import logging
import math
import os
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import numpy as np

from app.core.config import settings
from app.services.camera.camera_manager import CameraManager, get_camera_manager
from app.services.vision.face_tracker import FacePose, FaceTracker

logger = logging.getLogger(__name__)


@dataclass
class RecordedFrame:
    timestamp: float
    yaw: float
    pitch: float
    roll: float
    dyaw: float = 0.0
    dpitch: float = 0.0
    droll: float = 0.0
    landmarks_norm: List[float] = field(default_factory=list)


@dataclass
class GestureRecordingSession:
    session_id: str
    gesture_name: str
    status: str  # 'idle', 'countdown', 'recording', 'completed', 'cancelled'
    countdown_remaining: float = 0.0
    frames_captured: int = 0
    total_frames: int = 30
    duration_seconds: float = 1.0
    feature_file_path: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    frames: List[RecordedFrame] = field(default_factory=list)


class GestureRecorder:
    """
    Time-series facial landmark & 3D pose motion recorder for gesture dataset collection.
    """

    _instance: Optional["GestureRecorder"] = None

    def __init__(
        self,
        camera: Optional[CameraManager] = None,
        tracker: Optional[FaceTracker] = None,
    ):
        self._camera = camera or get_camera_manager()
        self._tracker = tracker or FaceTracker()
        self._current_session: Optional[GestureRecordingSession] = None
        self._recording_task: Optional[asyncio.Task] = None
        self._lock = asyncio.Lock()

        self._samples_dir = settings.recordings_directory / "samples"
        self._samples_dir.mkdir(parents=True, exist_ok=True)

    @classmethod
    def get_instance(cls) -> "GestureRecorder":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @property
    def current_session(self) -> Optional[GestureRecordingSession]:
        return self._current_session

    async def start_recording(
        self,
        gesture_name: str,
        sequence_length: int = 30,
        countdown_seconds: float = 3.0,
    ) -> GestureRecordingSession:
        """Start a new recording session with pre-roll countdown."""
        async with self._lock:
            if self._current_session and self._current_session.status in ("countdown", "recording"):
                return self._current_session

            session = GestureRecordingSession(
                session_id=str(uuid.uuid4()),
                gesture_name=gesture_name,
                status="countdown",
                countdown_remaining=countdown_seconds,
                total_frames=sequence_length,
            )
            self._current_session = session

            await self._camera.start()
            self._recording_task = asyncio.create_task(
                self._run_recording_lifecycle(session, countdown_seconds, sequence_length)
            )
            return session

    async def cancel_recording(self) -> None:
        """Cancel an ongoing recording session."""
        async with self._lock:
            if self._recording_task and not self._recording_task.done():
                self._recording_task.cancel()
                try:
                    await self._recording_task
                except asyncio.CancelledError:
                    pass
            if self._current_session:
                self._current_session.status = "cancelled"
            logger.info("Recording session cancelled")

    async def _run_recording_lifecycle(
        self,
        session: GestureRecordingSession,
        countdown_sec: float,
        seq_length: int,
    ):
        """Handle countdown and frame capture window."""
        try:
            # 1. Countdown Phase
            start_countdown = time.time()
            while time.time() - start_countdown < countdown_sec:
                session.countdown_remaining = max(0.0, countdown_sec - (time.time() - start_countdown))
                await asyncio.sleep(0.05)

            # 2. Recording Phase
            session.status = "recording"
            session.countdown_remaining = 0.0
            logger.info("Recording started for gesture: %s (%d frames)", session.gesture_name, seq_length)

            prev_pose: Optional[FacePose] = None
            prev_time: Optional[float] = None
            captured_frames: List[RecordedFrame] = []

            while len(captured_frames) < seq_length:
                now = time.time()
                ret, frame = self._camera.read_frame()
                if ret and frame is not None:
                    pose = self._tracker.process_frame(frame)
                    if pose.face_detected:
                        # Compute angular velocities (degrees/second)
                        dyaw, dpitch, droll = 0.0, 0.0, 0.0
                        if prev_pose and prev_time and (now - prev_time) > 0:
                            dt = now - prev_time
                            dyaw = (pose.yaw - prev_pose.yaw) / dt
                            dpitch = (pose.pitch - prev_pose.pitch) / dt
                            droll = (pose.roll - prev_pose.roll) / dt

                        # Normalize landmarks relative to nose
                        norm_landmarks = self._normalize_landmarks(pose, frame.shape[1], frame.shape[0])

                        rec_frame = RecordedFrame(
                            timestamp=now,
                            yaw=pose.yaw,
                            pitch=pose.pitch,
                            roll=pose.roll,
                            dyaw=round(dyaw, 2),
                            dpitch=round(dpitch, 2),
                            droll=round(droll, 2),
                            landmarks_norm=norm_landmarks,
                        )
                        captured_frames.append(rec_frame)
                        session.frames_captured = len(captured_frames)
                        prev_pose = pose
                        prev_time = now

                await asyncio.sleep(0.033)  # ~30 FPS

            # 3. Completion & Serialization Phase
            session.frames = captured_frames
            session.duration_seconds = round(captured_frames[-1].timestamp - captured_frames[0].timestamp, 3)
            feature_path = self._save_session_features(session)
            session.feature_file_path = feature_path
            session.status = "completed"
            logger.info("Recording complete for '%s' saved to %s", session.gesture_name, feature_path)

        except asyncio.CancelledError:
            session.status = "cancelled"
        except Exception as exc:
            logger.error("Error during gesture recording: %s", exc)
            session.status = "cancelled"

    def _normalize_landmarks(self, pose: FacePose, w: int, h: int) -> List[float]:
        """
        Normalize 2D landmarks relative to nose center and face bounding box scale.
        Produces scale- and translation-invariant feature vectors.
        """
        if not pose.landmarks_2d or pose.nose_2d == (0, 0):
            return [0.0] * 12

        nx, ny = pose.nose_2d
        scale = max(20.0, float(max(pose.bbox[2], pose.bbox[3])))  # Face box dimension

        normalized = []
        for (lx, ly) in pose.landmarks_2d:
            normalized.append(round((lx - nx) / scale, 4))
            normalized.append(round((ly - ny) / scale, 4))

        return normalized

    def _save_session_features(self, session: GestureRecordingSession) -> str:
        """Serialize captured time-series as a numpy array `.npy` file."""
        # Feature vector shape: (num_frames, num_features)
        # Features per frame: [yaw, pitch, roll, dyaw, dpitch, droll, ...norm_landmarks]
        feature_matrix = []
        for f in session.frames:
            row = [f.yaw, f.pitch, f.roll, f.dyaw, f.dpitch, f.droll] + f.landmarks_norm
            feature_matrix.append(row)

        arr = np.array(feature_matrix, dtype=np.float32)
        npy_filename = f"sample_{session.session_id}.npy"
        npy_path = self._samples_dir / npy_filename
        np.save(str(npy_path), arr)

        # Also save JSON metadata
        json_filename = f"sample_{session.session_id}.json"
        json_path = self._samples_dir / json_filename
        meta = {
            "session_id": session.session_id,
            "gesture_name": session.gesture_name,
            "frame_count": len(session.frames),
            "duration_seconds": session.duration_seconds,
            "feature_file": npy_filename,
            "created_at": session.created_at,
            "feature_shape": list(arr.shape),
        }
        with open(json_path, "w") as fp:
            json.dump(meta, fp, indent=2)

        return str(npy_path)


def get_gesture_recorder() -> GestureRecorder:
    return GestureRecorder.get_instance()
