import asyncio
import logging
import os
import time
from collections import deque
from typing import Any, Callable, Dict, List, Optional, Tuple

import joblib
import numpy as np
from sqlalchemy import select

from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.models.model_version import ModelVersion as ModelVersionModel
from app.services.hardware.hardware_manager import HardwareManager, get_hardware_manager
from app.services.training.trainer import GestureTrainer, get_gesture_trainer
from app.services.vision.face_tracker import FacePose

logger = logging.getLogger(__name__)


class GesturePredictor:
    """
    Real-time sliding-window live inference engine for gesture recognition.
    Processes live 3D head pose and facial landmarks, performs frame-by-frame
    probabilistic classification, applies confidence gating & debouncing,
    and dispatches autonomous robot reactions.
    """

    _instance: Optional["GesturePredictor"] = None

    def __init__(
        self,
        buffer_size: int = 30,
        confidence_threshold: float = 0.80,
        debounce_frames: int = 3,
        cooldown_seconds: float = 1.0,
    ):
        self.buffer_size = buffer_size
        self.confidence_threshold = confidence_threshold
        self.debounce_frames = debounce_frames
        self.cooldown_seconds = cooldown_seconds

        self._buffer: deque = deque(maxlen=buffer_size)
        self._active_model_id: Optional[str] = None
        self._active_model_name: Optional[str] = None
        self._active_model_version: Optional[str] = None
        self._pipeline: Optional[Any] = None
        self._class_labels: List[str] = []

        self._trainer = get_gesture_trainer()
        self._hw_manager = get_hardware_manager()

        # State tracking
        self._consecutive_class: Optional[str] = None
        self._consecutive_count: int = 0
        self._last_gesture_time: float = 0.0
        self._last_detected_gesture: Optional[str] = None
        self._last_confidence: float = 0.0
        self._autonomous_reaction_enabled: bool = False

        self._subscribers: List[Callable[[Dict[str, Any]], Any]] = []
        self._lock = asyncio.Lock()

        self._prev_pose: Optional[FacePose] = None
        self._prev_time: Optional[float] = None

    @classmethod
    def get_instance(cls) -> "GesturePredictor":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @property
    def is_ready(self) -> bool:
        return self._pipeline is not None and len(self._buffer) >= self.buffer_size

    @property
    def active_model_info(self) -> Dict[str, Any]:
        return {
            "model_id": self._active_model_id,
            "name": self._active_model_name,
            "version": self._active_model_version,
            "class_labels": self._class_labels,
        }

    @property
    def autonomous_reaction_enabled(self) -> bool:
        return self._autonomous_reaction_enabled

    @autonomous_reaction_enabled.setter
    def autonomous_reaction_enabled(self, val: bool):
        self._autonomous_reaction_enabled = bool(val)

    def subscribe(self, callback: Callable[[Dict[str, Any]], Any]) -> None:
        if callback not in self._subscribers:
            self._subscribers.append(callback)

    def unsubscribe(self, callback: Callable[[Dict[str, Any]], Any]) -> None:
        if callback in self._subscribers:
            self._subscribers.remove(callback)

    async def load_active_model(self) -> bool:
        """Load the active model version from disk/database."""
        async with AsyncSessionLocal() as session:
            stmt = select(ModelVersionModel).where(ModelVersionModel.status == "active").order_by(ModelVersionModel.created_at.desc())
            res = await session.execute(stmt)
            model_record = res.scalar_one_or_none()

            # If no active model, fetch most recent ready model
            if not model_record:
                stmt_ready = select(ModelVersionModel).order_by(ModelVersionModel.created_at.desc())
                res_ready = await session.execute(stmt_ready)
                model_record = res_ready.scalar_one_or_none()

            if model_record and model_record.model_file and os.path.exists(model_record.model_file):
                try:
                    self._pipeline = joblib.load(model_record.model_file)
                    self._active_model_id = model_record.id
                    self._active_model_name = model_record.name
                    self._active_model_version = model_record.version
                    if model_record.feature_schema and "class_labels" in model_record.feature_schema:
                        self._class_labels = model_record.feature_schema["class_labels"]
                    else:
                        self._class_labels = ["attention", "head_tilt_left", "head_tilt_right", "look_away", "no_shake", "yes_nod"]
                    logger.info("Loaded active gesture model: %s (%s)", model_record.name, model_record.version)
                    return True
                except Exception as exc:
                    logger.error("Failed loading model file %s: %s", model_record.model_file, exc)

        return False

    def push_frame_pose(self, pose: FacePose, frame_shape: Optional[Tuple[int, int]] = None) -> None:
        """
        Push a live FacePose from video tracker into sliding window buffer.
        """
        now = time.time()
        if not pose.face_detected:
            # Clear or hold buffer during face occlusion
            return

        # Calculate angular velocity
        dyaw, dpitch, droll = 0.0, 0.0, 0.0
        if self._prev_pose and self._prev_time and (now - self._prev_time) > 0:
            dt = now - self._prev_time
            dyaw = (pose.yaw - self._prev_pose.yaw) / dt
            dpitch = (pose.pitch - self._prev_pose.pitch) / dt
            droll = (pose.roll - self._prev_pose.roll) / dt

        # Normalize 12 facial landmarks
        w = frame_shape[1] if frame_shape else 640
        h = frame_shape[0] if frame_shape else 480
        norm_landmarks = self._normalize_landmarks(pose, w, h)

        row = [pose.yaw, pose.pitch, pose.roll, dyaw, dpitch, droll] + norm_landmarks
        self._buffer.append(row)

        self._prev_pose = pose
        self._prev_time = now

    def _normalize_landmarks(self, pose: FacePose, w: int, h: int) -> List[float]:
        if not pose.landmarks_2d or pose.nose_2d == (0, 0):
            return [0.0] * 12

        nx, ny = pose.nose_2d
        scale = max(20.0, float(max(pose.bbox[2], pose.bbox[3])))

        normalized = []
        for (lx, ly) in pose.landmarks_2d:
            normalized.append(round((lx - nx) / scale, 4))
            normalized.append(round((ly - ny) / scale, 4))

        return normalized

    async def predict_current_window(self) -> Dict[str, Any]:
        """
        Run inference on the current 30-frame sliding window buffer.
        Applies confidence thresholding, debounce verification, and cooldown filters.
        """
        now = time.time()
        cooldown_active = (now - self._last_gesture_time) < self.cooldown_seconds
        cooldown_remaining = max(0.0, round(self.cooldown_seconds - (now - self._last_gesture_time), 2))

        if not self._pipeline:
            # Try lazy loading
            await self.load_active_model()

        if not self._pipeline or len(self._buffer) < self.buffer_size:
            return {
                "detected_gesture": None,
                "confidence": 0.0,
                "probabilities": {},
                "is_debounced": False,
                "cooldown_active": cooldown_active,
                "cooldown_remaining_sec": cooldown_remaining,
                "buffer_frames": len(self._buffer),
                "timestamp": now,
            }

        # 1. Prepare 630-dim feature vector from window
        window_arr = np.array(list(self._buffer), dtype=np.float32)
        feature_vec = self._trainer.extract_features_from_sample(window_arr, target_length=self.buffer_size)
        feature_mat = feature_vec.reshape(1, -1)

        # 2. Model Inference
        try:
            probs = self._pipeline.predict_proba(feature_mat)[0]
            max_idx = int(np.argmax(probs))
            confidence = float(probs[max_idx])
            pred_class = self._class_labels[max_idx] if max_idx < len(self._class_labels) else f"class_{max_idx}"

            prob_dict = {
                (self._class_labels[i] if i < len(self._class_labels) else f"class_{i}"): round(float(p), 3)
                for i, p in enumerate(probs)
            }
        except Exception as exc:
            logger.debug("Prediction exception: %s", exc)
            return {
                "detected_gesture": None,
                "confidence": 0.0,
                "probabilities": {},
                "is_debounced": False,
                "cooldown_active": cooldown_active,
                "cooldown_remaining_sec": cooldown_remaining,
                "buffer_frames": len(self._buffer),
                "timestamp": now,
            }

        # 3. Confidence and Neutral Filtering
        # If confidence is below threshold or predicted gesture is neutral attention, suppress trigger
        is_confident = confidence >= self.confidence_threshold and pred_class != "attention"

        is_debounced = False
        if is_confident and not cooldown_active:
            if pred_class == self._consecutive_class:
                self._consecutive_count += 1
            else:
                self._consecutive_class = pred_class
                self._consecutive_count = 1

            if self._consecutive_count >= self.debounce_frames:
                is_debounced = True
                self._last_detected_gesture = pred_class
                self._last_confidence = round(confidence, 3)
                self._last_gesture_time = now
                self._consecutive_count = 0  # Reset after successful trigger
                logger.info("🎯 Real-time Gesture Detected: %s (Confidence: %.2f%%)", pred_class, confidence * 100)

                # Autonomous Robot Reaction Dispatch
                if self._autonomous_reaction_enabled:
                    asyncio.create_task(self._trigger_autonomous_reaction(pred_class))
        else:
            if not is_confident:
                self._consecutive_count = max(0, self._consecutive_count - 1)

        result = {
            "detected_gesture": pred_class if is_confident else None,
            "confidence": round(confidence, 3),
            "probabilities": prob_dict,
            "is_debounced": is_debounced,
            "cooldown_active": cooldown_active,
            "cooldown_remaining_sec": cooldown_remaining,
            "buffer_frames": len(self._buffer),
            "timestamp": now,
        }

        # Notify subscribers
        for sub in list(self._subscribers):
            try:
                sub(result)
            except Exception:
                pass

        return result

    async def _trigger_autonomous_reaction(self, gesture_name: str) -> None:
        """Autonomously dispatch physical robot reaction to detected human gesture."""
        try:
            g_lower = gesture_name.lower().strip()
            controller = self._hw_manager.controller

            if hasattr(controller, "execute_gesture"):
                if "yes" in g_lower or "nod" in g_lower:
                    logger.info("Autonomous Reaction: Robot executing YES (Nod) in response to human nod")
                    await controller.execute_gesture("yes")
                elif "no" in g_lower or "shake" in g_lower:
                    logger.info("Autonomous Reaction: Robot executing NO (Shake) in response to human shake")
                    await controller.execute_gesture("no")
                elif "tilt_left" in g_lower:
                    await controller.execute_gesture("curious")
        except Exception as exc:
            logger.warning("Error triggering autonomous reaction: %s", exc)

    def get_status(self) -> Dict[str, Any]:
        """Return live inference engine diagnostics."""
        now = time.time()
        cooldown_active = (now - self._last_gesture_time) < self.cooldown_seconds
        cooldown_remaining = max(0.0, round(self.cooldown_seconds - (now - self._last_gesture_time), 2))

        return {
            "active_model_id": self._active_model_id,
            "active_model_name": self._active_model_name,
            "active_model_version": self._active_model_version,
            "buffer_frames": len(self._buffer),
            "buffer_capacity": self.buffer_size,
            "is_ready": self.is_ready,
            "last_detected_gesture": self._last_detected_gesture,
            "last_confidence": self._last_confidence,
            "is_cooldown_active": cooldown_active,
            "cooldown_remaining_sec": cooldown_remaining,
            "autonomous_reaction_enabled": self._autonomous_reaction_enabled,
        }


def get_gesture_predictor() -> GesturePredictor:
    return GesturePredictor.get_instance()
