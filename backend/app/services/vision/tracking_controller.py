import asyncio
import logging
import time
from typing import Optional

from app.core.config import settings
from app.services.camera.camera_manager import CameraManager, get_camera_manager
from app.services.hardware.hardware_manager import HardwareManager, get_hardware_manager
from app.services.vision.face_tracker import FacePose, FaceTracker
from hardware.servo_controller import (
    pitch_to_tilt_angle,
    smooth_angle,
    yaw_to_pan_angle,
)

logger = logging.getLogger(__name__)


class TrackingController:
    """
    Closed-loop visual head tracking controller.
    Runs continuous background loop mapping face pose angles to robot servos.
    """

    _instance: Optional["TrackingController"] = None

    def __init__(
        self,
        camera: Optional[CameraManager] = None,
        tracker: Optional[FaceTracker] = None,
        hardware: Optional[HardwareManager] = None,
    ):
        self._camera = camera or get_camera_manager()
        self._tracker = tracker or FaceTracker()
        self._hardware = hardware or get_hardware_manager()

        self.mode: str = "off"  # 'off', 'mirror', 'follow', 'audience'
        self.sensitivity: float = settings.head_tracking_yaw_sensitivity
        self.smoothing_alpha: float = settings.head_tracking_smoothing_factor
        self.dead_zone: float = settings.head_tracking_dead_zone

        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._last_pose = FacePose()
        self._smoothed_pan: float = 90.0
        self._smoothed_tilt: float = 90.0
        self._fps: float = 0.0
        self._frame_count = 0
        self._last_fps_time = time.time()
        self._lock = asyncio.Lock()

    @classmethod
    def get_instance(cls) -> "TrackingController":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    async def start_tracking(self, mode: str = "mirror") -> bool:
        """Start closed-loop servo tracking."""
        async with self._lock:
            self.mode = mode
            self._running = True
            await self._camera.start()
            if self._task is None or self._task.done():
                self._task = asyncio.create_task(self._tracking_loop())
            logger.info("Visual tracking started in mode '%s'", mode)
            return True

    async def stop_tracking(self) -> bool:
        """Stop closed-loop tracking and idle servos."""
        async with self._lock:
            self.mode = "off"
            self._running = False
            if self._task and not self._task.done():
                self._task.cancel()
                try:
                    await self._task
                except asyncio.CancelledError:
                    pass
                self._task = None
            logger.info("Visual tracking stopped")
            return True

    async def _tracking_loop(self):
        """Background control loop running at ~30 FPS."""
        logger.info("Tracking control loop active")
        while self._running:
            start_loop = time.perf_counter()
            try:
                ret, frame = self._camera.read_frame()
                if ret and frame is not None:
                    pose = self._tracker.process_frame(frame)
                    self._last_pose = pose

                    # Feed live pose to real-time gesture inference engine
                    try:
                        from app.services.ml.gesture_predictor import get_gesture_predictor
                        predictor = get_gesture_predictor()
                        predictor.push_frame_pose(pose, frame.shape)
                        if predictor.is_ready:
                            asyncio.create_task(predictor.predict_current_window())
                    except Exception as pred_err:
                        logger.debug("Live predictor update error: %s", pred_err)

                    if pose.face_detected and self.mode != "off":
                        await self._dispatch_tracking(pose)

                # FPS calculation
                self._frame_count += 1
                now = time.time()
                if now - self._last_fps_time >= 1.0:
                    self._fps = round(self._frame_count / (now - self._last_fps_time), 1)
                    self._frame_count = 0
                    self._last_fps_time = now

            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error("Error in tracking loop: %s", exc)

            elapsed = time.perf_counter() - start_loop
            sleep_time = max(0.001, (1.0 / 30.0) - elapsed)
            await asyncio.sleep(sleep_time)

    async def _dispatch_tracking(self, pose: FacePose):
        """Map face pose angles to robot servos based on active mode."""
        pan_cfg = self._hardware.pan_config
        tilt_cfg = self._hardware.tilt_config

        if self.mode == "mirror":
            # Human turns right -> Robot turns right
            target_pan = yaw_to_pan_angle(
                pose.yaw,
                pan_cfg,
                sensitivity=self.sensitivity,
                dead_zone=self.dead_zone,
            )
            # Human tilts up -> Robot tilts up
            target_tilt = pitch_to_tilt_angle(
                pose.pitch,
                tilt_cfg,
                sensitivity=self.sensitivity,
                dead_zone=self.dead_zone,
            )
        elif self.mode == "follow":
            # Inverted centering: Robot tracks face to keep it centered in camera frame
            target_pan = yaw_to_pan_angle(
                -pose.yaw,
                pan_cfg,
                sensitivity=self.sensitivity,
                dead_zone=self.dead_zone,
            )
            target_tilt = pitch_to_tilt_angle(
                -pose.pitch,
                tilt_cfg,
                sensitivity=self.sensitivity,
                dead_zone=self.dead_zone,
            )
        else:
            return

        # Apply Exponential Moving Average (EMA) smoothing
        self._smoothed_pan = smooth_angle(self._smoothed_pan, target_pan, alpha=self.smoothing_alpha)
        self._smoothed_tilt = smooth_angle(self._smoothed_tilt, target_tilt, alpha=self.smoothing_alpha)

        # Dispatch command to hardware controller
        ctrl = self._hardware.controller
        if hasattr(ctrl, "move_pan_tilt"):
            await ctrl.move_pan_tilt(self._smoothed_pan, self._smoothed_tilt, speed=100)
        else:
            await ctrl.move_pan(self._smoothed_pan)
            await ctrl.move_tilt(self._smoothed_tilt)

    @property
    def is_tracking(self) -> bool:
        return self._running and self.mode != "off"

    @property
    def last_pose(self) -> FacePose:
        return self._last_pose

    @property
    def fps(self) -> float:
        return self._fps


def get_tracking_controller() -> TrackingController:
    return TrackingController.get_instance()
