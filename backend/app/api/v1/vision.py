import asyncio
import logging
from typing import Optional
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

from app.schemas.vision import (
    TrackingStartRequest,
    VisionConfigUpdateRequest,
    VisionStatusResponse,
)
from app.services.camera.camera_manager import CameraManager, get_camera_manager
from app.services.vision.face_tracker import FaceTracker
from app.services.vision.tracking_controller import (
    TrackingController,
    get_tracking_controller,
)

logger = logging.getLogger(__name__)
router = APIRouter()
face_tracker_singleton = FaceTracker()


@router.get("/status", response_model=VisionStatusResponse)
async def get_vision_status(
    camera: CameraManager = Depends(get_camera_manager),
    tracker_ctrl: TrackingController = Depends(get_tracking_controller),
):
    """Retrieve camera status, live 3D pose, and tracking state."""
    pose = tracker_ctrl.last_pose
    return VisionStatusResponse(
        camera_running=camera.is_running,
        is_tracking=tracker_ctrl.is_tracking,
        tracking_mode=tracker_ctrl.mode,
        fps=tracker_ctrl.fps,
        face_detected=pose.face_detected,
        yaw=pose.yaw,
        pitch=pose.pitch,
        roll=pose.roll,
        confidence=pose.confidence,
        bbox=pose.bbox,
        sensitivity=tracker_ctrl.sensitivity,
        smoothing_alpha=tracker_ctrl.smoothing_alpha,
        dead_zone=tracker_ctrl.dead_zone,
    )


@router.post("/tracking/start", response_model=VisionStatusResponse)
async def start_tracking(
    req: TrackingStartRequest,
    tracker_ctrl: TrackingController = Depends(get_tracking_controller),
    camera: CameraManager = Depends(get_camera_manager),
):
    """Start automated closed-loop head tracking."""
    await tracker_ctrl.start_tracking(mode=req.mode)
    return await get_vision_status(camera, tracker_ctrl)


@router.post("/tracking/stop", response_model=VisionStatusResponse)
async def stop_tracking(
    tracker_ctrl: TrackingController = Depends(get_tracking_controller),
    camera: CameraManager = Depends(get_camera_manager),
):
    """Stop automated closed-loop head tracking."""
    await tracker_ctrl.stop_tracking()
    return await get_vision_status(camera, tracker_ctrl)


@router.put("/config", response_model=VisionStatusResponse)
async def update_vision_config(
    req: VisionConfigUpdateRequest,
    tracker_ctrl: TrackingController = Depends(get_tracking_controller),
    camera: CameraManager = Depends(get_camera_manager),
):
    """Update vision tracking tuning parameters."""
    if req.sensitivity is not None:
        tracker_ctrl.sensitivity = req.sensitivity
    if req.smoothing_alpha is not None:
        tracker_ctrl.smoothing_alpha = req.smoothing_alpha
    if req.dead_zone is not None:
        tracker_ctrl.dead_zone = req.dead_zone
    if req.mode is not None:
        tracker_ctrl.mode = req.mode

    return await get_vision_status(camera, tracker_ctrl)


@router.get("/stream")
async def video_stream(
    overlay: bool = Query(True, description="Render face mesh and HUD overlays on stream"),
    camera: CameraManager = Depends(get_camera_manager),
    tracker_ctrl: TrackingController = Depends(get_tracking_controller),
):
    """
    Live MJPEG multipart video stream for frontend camera viewport.
    """
    await camera.start()

    async def frame_generator():
        try:
            while True:
                ret, frame = camera.read_frame()
                if not ret or frame is None:
                    await asyncio.sleep(0.03)
                    continue

                if overlay:
                    pose = tracker_ctrl.last_pose
                    # If not currently running background tracking loop, run pose on-demand for stream
                    if not tracker_ctrl.is_tracking:
                        pose = face_tracker_singleton.process_frame(frame)
                    frame = face_tracker_singleton.draw_annotations(frame, pose)

                jpeg_bytes = camera.encode_jpeg(frame, quality=75)
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n" + jpeg_bytes + b"\r\n"
                )
                await asyncio.sleep(0.033)  # ~30 FPS
        except asyncio.CancelledError:
            pass

    return StreamingResponse(
        frame_generator(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )
