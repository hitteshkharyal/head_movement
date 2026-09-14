from typing import List
from fastapi import APIRouter, Depends, HTTPException, status

from app.schemas.servos import (
    EmergencyStopResponse,
    ServoConfigItem,
    ServoConfigUpdateRequest,
    ServoMoveRequest,
    ServoSingleAxisMoveRequest,
    ServoStatusResponse,
)
from app.services.hardware.calibration_service import (
    CalibrationService,
    get_calibration_service,
)
from app.services.hardware.hardware_manager import HardwareManager, get_hardware_manager
from hardware.esp32_controller import ESP32Controller
from hardware.mock_controller import MockController

router = APIRouter()


@router.get("/status", response_model=ServoStatusResponse)
async def get_servo_status(hw: HardwareManager = Depends(get_hardware_manager)):
    """Get current status of both servos, connection health, and latency."""
    controller = hw.controller
    status_obj = await controller.get_status()

    latency = 0.0
    if hasattr(controller, "ping"):
        latency = await controller.ping()

    is_estop = False
    if hasattr(controller, "is_emergency_stopped"):
        is_estop = controller.is_emergency_stopped

    return ServoStatusResponse(
        connected=status_obj.connected,
        controller_type=status_obj.controller_type,
        pan_angle=status_obj.servo.pan_angle,
        tilt_angle=status_obj.servo.tilt_angle,
        is_moving=status_obj.servo.is_moving,
        is_emergency_stopped=is_estop,
        latency_ms=max(0.0, latency),
        error=status_obj.error,
    )


@router.post("/move", response_model=ServoStatusResponse)
async def move_servos(
    req: ServoMoveRequest,
    hw: HardwareManager = Depends(get_hardware_manager),
):
    """
    Move pan and/or tilt servos to specified angles with speed & safety limits.
    """
    controller = hw.controller

    if hasattr(controller, "is_emergency_stopped") and controller.is_emergency_stopped:
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="Movement blocked: Emergency Stop is active. Call /resume first.",
        )

    # Ensure connected
    if not (await controller.get_status()).connected:
        await controller.connect()

    if req.pan_angle is not None and req.tilt_angle is not None:
        if hasattr(controller, "move_pan_tilt"):
            await controller.move_pan_tilt(req.pan_angle, req.tilt_angle, speed=req.speed)
        else:
            await controller.move_pan(req.pan_angle)
            await controller.move_tilt(req.tilt_angle)
    elif req.pan_angle is not None:
        await controller.move_pan(req.pan_angle)
    elif req.tilt_angle is not None:
        await controller.move_tilt(req.tilt_angle)

    return await get_servo_status(hw)


@router.post("/pan", response_model=ServoStatusResponse)
async def move_pan_only(
    req: ServoSingleAxisMoveRequest,
    hw: HardwareManager = Depends(get_hardware_manager),
):
    """Move only the PAN (horizontal) servo."""
    controller = hw.controller
    if hasattr(controller, "is_emergency_stopped") and controller.is_emergency_stopped:
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="Emergency Stop active",
        )
    if not (await controller.get_status()).connected:
        await controller.connect()
    await controller.move_pan(req.angle)
    return await get_servo_status(hw)


@router.post("/tilt", response_model=ServoStatusResponse)
async def move_tilt_only(
    req: ServoSingleAxisMoveRequest,
    hw: HardwareManager = Depends(get_hardware_manager),
):
    """Move only the TILT (vertical) servo."""
    controller = hw.controller
    if hasattr(controller, "is_emergency_stopped") and controller.is_emergency_stopped:
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="Emergency Stop active",
        )
    if not (await controller.get_status()).connected:
        await controller.connect()
    await controller.move_tilt(req.angle)
    return await get_servo_status(hw)


@router.post("/center", response_model=ServoStatusResponse)
async def center_servos(hw: HardwareManager = Depends(get_hardware_manager)):
    """Reset both servos to their calibrated home/center positions."""
    controller = hw.controller
    if hasattr(controller, "is_emergency_stopped") and controller.is_emergency_stopped:
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="Emergency Stop active",
        )
    if not (await controller.get_status()).connected:
        await controller.connect()
    await controller.center()
    return await get_servo_status(hw)


@router.post("/stop", response_model=ServoStatusResponse)
async def stop_servos(hw: HardwareManager = Depends(get_hardware_manager)):
    """Smoothly stop ongoing servo movement."""
    await hw.controller.stop()
    return await get_servo_status(hw)


@router.post("/emergency-stop", response_model=EmergencyStopResponse)
async def trigger_emergency_stop(hw: HardwareManager = Depends(get_hardware_manager)):
    """
    Trigger immediate emergency halt. Cuts off power/signals to servos.
    Blocks any further movement commands until /resume is called.
    """
    await hw.controller.emergency_stop()
    return EmergencyStopResponse(
        status="EMERGENCY_STOP_TRIGGERED",
        emergency_stopped=True,
        message="Emergency stop active. Servos locked. Call /api/v1/servos/resume to re-enable.",
    )


@router.post("/resume", response_model=EmergencyStopResponse)
async def resume_servos(hw: HardwareManager = Depends(get_hardware_manager)):
    """Reset emergency stop state and re-enable servo control."""
    controller = hw.controller
    if hasattr(controller, "reset_emergency_stop"):
        controller.reset_emergency_stop()
    return EmergencyStopResponse(
        status="NORMAL_OPERATION",
        emergency_stopped=False,
        message="Emergency stop cleared. Normal servo operation resumed.",
    )


@router.get("/calibration", response_model=List[ServoConfigItem])
async def get_calibration(
    service: CalibrationService = Depends(get_calibration_service),
):
    """Retrieve current servo calibration parameters (limits, offsets, trim)."""
    return await service.get_calibration()


@router.put("/calibration", response_model=List[ServoConfigItem])
async def update_calibration(
    req: ServoConfigUpdateRequest,
    service: CalibrationService = Depends(get_calibration_service),
):
    """Update and persist servo calibration parameters."""
    return await service.update_calibration(req.servos)


@router.get("/config")
async def get_servo_config(hw: HardwareManager = Depends(get_hardware_manager)):
    """Get active servo configurations."""
    return {
        "servos": [
            {
                "servo_name": "pan",
                "axis": "yaw",
                "min_angle": hw.pan_config.min_angle,
                "max_angle": hw.pan_config.max_angle,
                "center_angle": hw.pan_config.center_angle,
                "speed": hw.pan_config.speed,
                "trim_offset": hw.pan_config.trim_offset,
            },
            {
                "servo_name": "tilt",
                "axis": "pitch",
                "min_angle": hw.tilt_config.min_angle,
                "max_angle": hw.tilt_config.max_angle,
                "center_angle": hw.tilt_config.center_angle,
                "speed": hw.tilt_config.speed,
                "trim_offset": hw.tilt_config.trim_offset,
            },
        ]
    }
