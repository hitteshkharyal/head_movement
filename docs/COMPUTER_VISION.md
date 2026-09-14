# Computer Vision Design

## Technology Stack

| Component | Library | Reason |
|-----------|---------|--------|
| Frame capture | OpenCV VideoCapture | Reliable, cross-platform |
| Face detection | MediaPipe FaceDetection | Fast, accurate, no GPU required |
| Face landmarks | MediaPipe FaceMesh | 468 landmarks per face |
| Head pose estimation | solvePnP (OpenCV) | Geometric, deterministic |
| Multiple face detection | MediaPipe or OpenCV DNN | Audience tracking |

---

## Camera Pipeline

```
camera_worker.py (background async task)
  ↓
OpenCV VideoCapture(CAMERA_INDEX)
  ↓
Frame read loop (target: 30 FPS)
  ↓
frame_processor.py
  ├── face_detector.py      → face bounding boxes
  ├── landmark_extractor.py → 468 facial landmarks
  └── head_pose_estimator.py → yaw, pitch, roll
  ↓
EventBroadcaster → WebSocket → Frontend
  ↓
HeadTrackingService → mapping → HAL → ESP32
```

---

## Head Pose Estimation

### Method: PnP (Perspective-n-Point)

Using known 3D model points of a generic face and corresponding 2D MediaPipe landmarks:

```python
# 3D model points (canonical face)
model_points = np.array([
    (0.0, 0.0, 0.0),        # Nose tip
    (0.0, -330.0, -65.0),   # Chin
    (-225.0, 170.0, -135.0), # Left eye corner
    (225.0, 170.0, -135.0),  # Right eye corner
    (-150.0, -150.0, -125.0),# Left mouth corner
    (150.0, -150.0, -125.0)  # Right mouth corner
], dtype=np.float64)

# 2D image points from MediaPipe landmarks
image_points = extract_key_landmarks(landmarks, image_shape)

# Solve PnP
success, rotation_vector, translation_vector = cv2.solvePnP(
    model_points, image_points, camera_matrix, dist_coefficients
)

# Convert to Euler angles
rotation_matrix, _ = cv2.Rodrigues(rotation_vector)
yaw, pitch, roll = rotation_matrix_to_euler(rotation_matrix)
```

### Output
- **Yaw**: Left/right rotation (- = left, + = right)
- **Pitch**: Up/down rotation (- = down, + = up)
- **Roll**: Clockwise/counter-clockwise tilt

---

## Human → Robot Mapping

```python
def map_head_pose_to_servo(
    yaw: float,
    pitch: float,
    pan_config: ServoConfig,
    tilt_config: ServoConfig,
    sensitivity_yaw: float,
    sensitivity_pitch: float,
    dead_zone: float
) -> tuple[float, float]:

    # Apply dead zone
    if abs(yaw) < dead_zone:
        yaw = 0.0
    if abs(pitch) < dead_zone:
        pitch = 0.0

    # Map to servo angles
    pan_offset = yaw * sensitivity_yaw
    tilt_offset = pitch * sensitivity_pitch

    pan_target = clamp(
        pan_config.center_angle + pan_offset,
        pan_config.min_angle,
        pan_config.max_angle
    )
    tilt_target = clamp(
        tilt_config.center_angle + tilt_offset,
        tilt_config.min_angle,
        tilt_config.max_angle
    )

    return pan_target, tilt_target
```

---

## Calibration

User defines their neutral pose → robot center.

```
User sits naturally → presses Calibrate
  ↓
Current yaw/pitch captured
  ↓
Stored as calibration_offset
  ↓
All future pose = raw_pose - calibration_offset
```

Calibration stored in DB (servo_configs or separate calibration table).

---

## Smoothing

Exponential moving average (EMA) applied before sending to servo:

```python
smoothed_pan = alpha * new_pan + (1 - alpha) * last_pan
smoothed_tilt = alpha * new_tilt + (1 - alpha) * last_tilt
```

`alpha` = `HEAD_TRACKING_SMOOTHING_FACTOR` (0.0 = no change, 1.0 = instant)

---

## Loss-of-Face Behavior

If no face detected for N consecutive frames:
1. Stop sending new servo commands
2. Maintain last valid position
3. Do NOT send unstable/noisy commands
4. After configurable timeout: return to center

```python
if not face_detected:
    if consecutive_no_face_frames > LOSS_OF_FACE_THRESHOLD:
        if seconds_since_last_face > RETURN_TO_CENTER_TIMEOUT:
            controller.center()
    # else: hold last position
```

---

## Audience Face Detection

Multiple-face detection for audience tracking:

```python
# MediaPipe FaceDetection (optimized for multiple faces)
detection_results = face_detector.process(rgb_frame)

faces = []
for detection in detection_results.detections:
    bbox = detection.location_data.relative_bounding_box
    score = detection.score[0]
    center_x = bbox.xmin + bbox.width / 2
    center_y = bbox.ymin + bbox.height / 2
    faces.append({
        "id": assign_tracker_id(bbox),
        "bbox": bbox,
        "center": (center_x, center_y),
        "confidence": score
    })
```

Target selection strategy (initial):
1. Score faces by proximity to frame center
2. Select most central face
3. Hold for `AUDIENCE_TARGET_DURATION_SECONDS`
4. Then consider switching

---

## Frame Data Published via WebSocket

```json
{
  "type": "head_pose",
  "timestamp": "...",
  "data": {
    "face_detected": true,
    "yaw": -12.3,
    "pitch": 4.1,
    "roll": 0.8,
    "confidence": 0.97,
    "pan_target": 83.8,
    "tilt_target": 92.1,
    "face_bbox": [x, y, w, h],
    "landmark_count": 468
  }
}
```
