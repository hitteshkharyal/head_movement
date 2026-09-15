import asyncio
import logging
import math
import time
from typing import Optional, Tuple
import cv2
import numpy as np

from app.core.config import settings

logger = logging.getLogger(__name__)


class CameraManager:
    """
    Manages video frame acquisition with support for physical webcams,
    video files, and high-fidelity synthetic test patterns.

    Reference-counted: camera hardware is released automatically when the
    last active consumer (stream viewer or tracking loop) disconnects.
    """

    _instance: Optional["CameraManager"] = None

    def __init__(
        self,
        camera_index: int = 0,
        width: int = 640,
        height: int = 480,
        fps: int = 30,
        use_synthetic: bool = False,
    ):
        self.camera_index = camera_index
        self.width = width
        self.height = height
        self.fps = fps
        self.use_synthetic = use_synthetic

        self._cap: Optional[cv2.VideoCapture] = None
        self._running = False
        self._last_frame: Optional[np.ndarray] = None
        self._frame_count = 0
        self._start_time = time.time()
        self._lock = asyncio.Lock()
        # Reference counter: how many active consumers (streams / tracking loops)
        self._consumer_count: int = 0

    @classmethod
    def get_instance(cls) -> "CameraManager":
        if cls._instance is None:
            # Only use synthetic fallback if camera_index is explicitly -1.
            # ESP32 mock mode should NOT force a synthetic camera — real webcam is independent.
            use_synth = settings.camera_index < 0
            cls._instance = cls(
                camera_index=max(0, settings.camera_index),
                width=settings.camera_width,
                height=settings.camera_height,
                fps=settings.camera_fps,
                use_synthetic=use_synth,
            )
        return cls._instance

    async def start(self) -> bool:
        """Initialize and start camera acquisition. Increments consumer ref count."""
        async with self._lock:
            self._consumer_count += 1
            if self._running:
                logger.debug("Camera already running (consumers=%d)", self._consumer_count)
                return True

            if not self.use_synthetic:
                try:
                    self._cap = cv2.VideoCapture(self.camera_index)
                    if self._cap and self._cap.isOpened():
                        self._cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
                        self._cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
                        self._cap.set(cv2.CAP_PROP_FPS, self.fps)
                        logger.info(
                            "Physical camera %d opened (%dx%d @ %d FPS)",
                            self.camera_index, self.width, self.height, self.fps,
                        )
                    else:
                        logger.warning(
                            "Camera %d unavailable — falling back to synthetic stream.",
                            self.camera_index,
                        )
                        self.use_synthetic = True
                except Exception as exc:
                    logger.warning("Failed to open camera (%s) — using synthetic stream.", exc)
                    self.use_synthetic = True

            self._running = True
            self._start_time = time.time()
            return True

    async def stop(self) -> None:
        """Decrement consumer ref count. Releases hardware when count reaches zero."""
        async with self._lock:
            self._consumer_count = max(0, self._consumer_count - 1)
            if self._consumer_count > 0:
                logger.debug(
                    "Camera stop deferred — %d consumer(s) still active",
                    self._consumer_count,
                )
                return
            # No consumers left — release hardware
            self._running = False
            if self._cap:
                self._cap.release()
                self._cap = None
            logger.info("Camera released (no active consumers)")

    async def force_stop(self) -> None:
        """Immediately release camera regardless of consumer count. For emergency use."""
        async with self._lock:
            self._consumer_count = 0
            self._running = False
            if self._cap:
                self._cap.release()
                self._cap = None
            logger.info("Camera force-stopped")

    def read_frame(self) -> Tuple[bool, np.ndarray]:
        """Read latest frame (physical or synthetic)."""
        if not self._running:
            frame = self._generate_synthetic_frame(0.0, 0.0)
            return True, frame

        if not self.use_synthetic and self._cap and self._cap.isOpened():
            ret, frame = self._cap.read()
            if ret and frame is not None:
                if frame.shape[1] != self.width or frame.shape[0] != self.height:
                    frame = cv2.resize(frame, (self.width, self.height))
                self._last_frame = frame
                self._frame_count += 1
                return True, frame

        # Synthetic fallback — animated Lissajous head
        t = time.time() - self._start_time
        sim_yaw = math.sin(t * 0.8) * 28.0
        sim_pitch = math.cos(t * 0.6) * 18.0
        frame = self._generate_synthetic_frame(sim_yaw, sim_pitch)
        self._last_frame = frame
        self._frame_count += 1
        return True, frame

    def _generate_synthetic_frame(self, yaw_deg: float, pitch_deg: float) -> np.ndarray:
        """
        Render a high-tech synthetic frame containing an animated human face avatar.
        Accurately places facial landmarks corresponding to simulated yaw & pitch.
        """
        frame = np.zeros((self.height, self.width, 3), dtype=np.uint8)
        # Background cyberpunk grid
        grid_color = (25, 30, 45)
        for x in range(0, self.width, 40):
            cv2.line(frame, (x, 0), (x, self.height), grid_color, 1)
        for y in range(0, self.height, 40):
            cv2.line(frame, (0, y), (self.width, y), grid_color, 1)

        cx = self.width // 2 + int(yaw_deg * 2.5)
        cy = self.height // 2 - int(pitch_deg * 2.0)

        # Face oval
        face_color = (220, 190, 170)
        cv2.ellipse(frame, (cx, cy), (75, 100), 0, 0, 360, face_color, -1)
        cv2.ellipse(frame, (cx, cy), (75, 100), 0, 0, 360, (100, 150, 240), 2)

        # Eyes
        eye_offset_x = int(yaw_deg * 0.5)
        eye_offset_y = int(pitch_deg * 0.3)
        left_eye = (cx - 30 + eye_offset_x, cy - 20 + eye_offset_y)
        right_eye = (cx + 30 + eye_offset_x, cy - 20 + eye_offset_y)
        cv2.circle(frame, left_eye, 8, (255, 255, 255), -1)
        cv2.circle(frame, right_eye, 8, (255, 255, 255), -1)
        cv2.circle(frame, left_eye, 4, (20, 20, 20), -1)
        cv2.circle(frame, right_eye, 4, (20, 20, 20), -1)

        # Nose
        nose_tip = (cx + int(yaw_deg * 0.9), cy + 10 + int(pitch_deg * 0.7))
        cv2.circle(frame, nose_tip, 5, (80, 80, 220), -1)

        # Mouth
        mouth_y = cy + 45 + int(pitch_deg * 0.6)
        mouth_x = cx + int(yaw_deg * 0.6)
        cv2.ellipse(frame, (mouth_x, mouth_y), (25, 10), 0, 0, 180, (50, 50, 180), 2)

        # HUD Banner
        cv2.putText(
            frame,
            "SYNTHETIC VISION SOURCE // SIMULATED TARGET",
            (20, 30),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (0, 230, 255),
            1,
            cv2.LINE_AA,
        )
        return frame

    def encode_jpeg(self, frame: np.ndarray, quality: int = 80) -> bytes:
        """Encode OpenCV BGR frame into JPEG bytes."""
        encode_params = [int(cv2.IMWRITE_JPEG_QUALITY), quality]
        success, encoded = cv2.imencode(".jpg", frame, encode_params)
        if not success:
            return b""
        return encoded.tobytes()

    @property
    def is_running(self) -> bool:
        return self._running

    @property
    def consumer_count(self) -> int:
        return self._consumer_count


def get_camera_manager() -> CameraManager:
    return CameraManager.get_instance()
