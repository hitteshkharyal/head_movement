from dataclasses import dataclass, field
import logging
import math
from typing import List, Optional, Tuple
import cv2
import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class FacePose:
    """Estimated 3D head pose and detection metrics."""
    face_detected: bool = False
    yaw: float = 0.0          # Horizontal rotation in degrees (negative=left, positive=right)
    pitch: float = 0.0        # Vertical rotation in degrees (negative=down, positive=up)
    roll: float = 0.0         # In-plane tilt in degrees (negative=left, positive=right)
    confidence: float = 0.0   # Detection confidence 0.0 - 1.0
    bbox: Tuple[int, int, int, int] = (0, 0, 0, 0)  # (x, y, w, h)
    nose_2d: Tuple[int, int] = (0, 0)
    landmarks_2d: List[Tuple[int, int]] = field(default_factory=list)


# 3D Canonical Face Model Points (in millimeters)
MODEL_POINTS_3D = np.array([
    (0.0, 0.0, 0.0),            # Nose tip
    (0.0, -330.0, -65.0),       # Chin
    (-225.0, 170.0, -135.0),    # Left eye outer corner
    (225.0, 170.0, -135.0),     # Right eye outer corner
    (-150.0, -150.0, -125.0),   # Left mouth corner
    (150.0, -150.0, -125.0),    # Right mouth corner
], dtype=np.float64)


class FaceTracker:
    """
    3D Head Pose and Face Landmark tracking engine.
    Estimates human Yaw, Pitch, and Roll rotations using solvePnP geometry.
    """

    def __init__(self, max_faces: int = 1):
        self.max_faces = max_faces
        self._mp_face_mesh = None
        self._face_mesh = None
        self._init_mediapipe()

    def _init_mediapipe(self):
        try:
            import mediapipe as mp
            if hasattr(mp, "solutions") and hasattr(mp.solutions, "face_mesh"):
                self._mp_face_mesh = mp.solutions.face_mesh
                self._face_mesh = self._mp_face_mesh.FaceMesh(
                    max_num_faces=self.max_faces,
                    refine_landmarks=True,
                    min_detection_confidence=0.5,
                    min_tracking_confidence=0.5,
                )
                logger.info("MediaPipe FaceMesh pipeline initialized")
        except Exception as exc:
            logger.warning("MediaPipe initialization failed: %s. Using OpenCV fallback.", exc)

    def process_frame(self, frame: np.ndarray) -> FacePose:
        """
        Process a single BGR frame and extract 3D head pose orientation.
        """
        h, w, _ = frame.shape
        if h == 0 or w == 0:
            return FacePose(face_detected=False)

        # Attempt MediaPipe extraction first
        if self._face_mesh is not None:
            try:
                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                results = self._face_mesh.process(rgb_frame)
                if results.multi_face_landmarks:
                    mesh = results.multi_face_landmarks[0]
                    return self._estimate_pose_from_mesh(mesh, w, h)
            except Exception as exc:
                logger.debug("MediaPipe processing error: %s", exc)

        # Geometric fallback extraction (color thresholding / synthetic analysis)
        return self._fallback_pose_estimation(frame, w, h)

    def _estimate_pose_from_mesh(self, mesh, w: int, h: int) -> FacePose:
        """Estimate 3D pose using MediaPipe 468 landmark mesh."""
        # Key landmark indices in MediaPipe FaceMesh
        # 1: Nose tip, 152: Chin, 33: Left eye corner, 263: Right eye corner, 61: Left mouth, 291: Right mouth
        idx_nose = 1
        idx_chin = 152
        idx_left_eye = 33
        idx_right_eye = 263
        idx_left_mouth = 61
        idx_right_mouth = 291

        lm = mesh.landmark
        img_points = np.array([
            (lm[idx_nose].x * w, lm[idx_nose].y * h),
            (lm[idx_chin].x * w, lm[idx_chin].y * h),
            (lm[idx_left_eye].x * w, lm[idx_left_eye].y * h),
            (lm[idx_right_eye].x * w, lm[idx_right_eye].y * h),
            (lm[idx_left_mouth].x * w, lm[idx_left_mouth].y * h),
            (lm[idx_right_mouth].x * w, lm[idx_right_mouth].y * h),
        ], dtype=np.float64)

        # Bounding box
        all_x = [int(p.x * w) for p in lm]
        all_y = [int(p.y * h) for p in lm]
        min_x, max_x = max(0, min(all_x)), min(w, max(all_x))
        min_y, max_y = max(0, min(all_y)), min(h, max(all_y))
        bbox = (min_x, min_y, max_x - min_x, max_y - min_y)

        yaw, pitch, roll = self._solve_pnp(img_points, w, h)

        return FacePose(
            face_detected=True,
            yaw=round(yaw, 2),
            pitch=round(pitch, 2),
            roll=round(roll, 2),
            confidence=0.95,
            bbox=bbox,
            nose_2d=(int(img_points[0][0]), int(img_points[0][1])),
            landmarks_2d=[(int(p[0]), int(p[1])) for p in img_points],
        )

    def _fallback_pose_estimation(self, frame: np.ndarray, w: int, h: int) -> FacePose:
        """
        Fast geometric fallback pose estimation (detects skin regions or synthetic face markers).
        """
        # Convert to HSV to detect face region
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        # Skin tone range in HSV
        lower_skin = np.array([0, 20, 70], dtype=np.uint8)
        upper_skin = np.array([25, 255, 255], dtype=np.uint8)
        mask = cv2.inRange(hsv, lower_skin, upper_skin)

        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return FacePose(face_detected=False)

        largest = max(contours, key=cv2.contourArea)
        area = cv2.contourArea(largest)
        if area < 2500:  # Minimum face size
            return FacePose(face_detected=False)

        x, y, fw, fh = cv2.boundingRect(largest)
        cx, cy = x + fw // 2, y + fh // 2

        # Relative offset from frame center
        dx = (cx - w / 2) / (w / 2)  # -1.0 to +1.0
        dy = (cy - h / 2) / (h / 2)  # -1.0 to +1.0

        yaw = float(dx * 45.0)    # Approx ±45 deg
        pitch = float(-dy * 30.0) # Approx ±30 deg
        roll = 0.0

        return FacePose(
            face_detected=True,
            yaw=round(yaw, 2),
            pitch=round(pitch, 2),
            roll=round(roll, 2),
            confidence=0.85,
            bbox=(x, y, fw, fh),
            nose_2d=(cx, cy),
            landmarks_2d=[(cx, cy)],
        )

    def _solve_pnp(self, image_points: np.ndarray, w: int, h: int) -> Tuple[float, float, float]:
        """Compute Yaw, Pitch, Roll angles using Perspective-n-Point solver."""
        focal_length = w
        center = (w / 2, h / 2)
        camera_matrix = np.array([
            [focal_length, 0, center[0]],
            [0, focal_length, center[1]],
            [0, 0, 1]
        ], dtype=np.float64)
        dist_coeffs = np.zeros((4, 1))

        success, rvec, tvec = cv2.solvePnP(
            MODEL_POINTS_3D,
            image_points,
            camera_matrix,
            dist_coeffs,
            flags=cv2.SOLVEPNP_ITERATIVE,
        )

        if not success:
            return 0.0, 0.0, 0.0

        rmat, _ = cv2.Rodrigues(rvec)
        # Extract Euler angles from rotation matrix
        # Pitch: rotation around X, Yaw: rotation around Y, Roll: rotation around Z
        sy = math.sqrt(rmat[0, 0] * rmat[0, 0] + rmat[1, 0] * rmat[1, 0])
        singular = sy < 1e-6

        if not singular:
            pitch = math.atan2(rmat[2, 1], rmat[2, 2]) * 180.0 / math.pi
            yaw = math.atan2(-rmat[2, 0], sy) * 180.0 / math.pi
            roll = math.atan2(rmat[1, 0], rmat[0, 0]) * 180.0 / math.pi
        else:
            pitch = math.atan2(-rmat[1, 2], rmat[1, 1]) * 180.0 / math.pi
            yaw = math.atan2(-rmat[2, 0], sy) * 180.0 / math.pi
            roll = 0.0

        return yaw, pitch, roll

    def draw_annotations(
        self,
        frame: np.ndarray,
        pose: FacePose,
        show_mesh: bool = True,
        show_bbox: bool = True,
        show_axis: bool = True,
    ) -> np.ndarray:
        """Render cyberpunk-themed HUD overlays onto the frame."""
        annotated = frame.copy()
        if not pose.face_detected:
            # Draw 'Searching' reticle in center
            h, w, _ = annotated.shape
            cv2.drawMarker(annotated, (w // 2, h // 2), (0, 165, 255), cv2.MARKER_CROSS, 30, 2)
            cv2.putText(
                annotated,
                "SEARCHING FOR TARGET...",
                (w // 2 - 120, h // 2 + 50),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                (0, 165, 255),
                2,
            )
            return annotated

        # Bounding box
        if show_bbox and pose.bbox[2] > 0:
            x, y, w_box, h_box = pose.bbox
            cv2.rectangle(annotated, (x, y), (x + w_box, y + h_box), (0, 230, 255), 2)
            # Corner accents
            c_len = 15
            cv2.line(annotated, (x, y), (x + c_len, y), (0, 255, 0), 3)
            cv2.line(annotated, (x, y), (x, y + c_len), (0, 255, 0), 3)
            cv2.line(annotated, (x + w_box, y), (x + w_box - c_len, y), (0, 255, 0), 3)
            cv2.line(annotated, (x + w_box, y), (x + w_box, y + c_len), (0, 255, 0), 3)

        # Landmarks
        if show_mesh:
            for p in pose.landmarks_2d:
                cv2.circle(annotated, p, 3, (255, 100, 50), -1)

        # Nose crosshair & 3D Pose Vector
        if show_axis and pose.nose_2d != (0, 0):
            nx, ny = pose.nose_2d
            # Project Yaw vector (Green) and Pitch vector (Red)
            yaw_rad = math.radians(pose.yaw)
            pitch_rad = math.radians(pose.pitch)
            axis_len = 60

            # 3D Vector projection
            px = int(nx + axis_len * math.sin(yaw_rad))
            py = int(ny - axis_len * math.sin(pitch_rad))
            cv2.line(annotated, (nx, ny), (px, py), (0, 255, 0), 3)
            cv2.circle(annotated, (nx, ny), 5, (0, 0, 255), -1)

        # HUD Text Readout
        h, w, _ = annotated.shape
        hud_bg = np.zeros((45, w, 3), dtype=np.uint8)
        hud_text = f"YAW: {pose.yaw:+.1f} deg | PITCH: {pose.pitch:+.1f} deg | ROLL: {pose.roll:+.1f} deg | CONF: {int(pose.confidence*100)}%"
        cv2.putText(hud_bg, hud_text, (20, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 230), 1, cv2.LINE_AA)
        annotated[h - 45:h, 0:w] = cv2.addWeighted(annotated[h - 45:h, 0:w], 0.3, hud_bg, 0.7, 0)

        return annotated
