from typing import List
from fastapi import APIRouter, Depends, HTTPException, status

from app.schemas.servos import (
    EmergencyStopResponse,
    HardwareConnectRequest,
    HardwareConnectResponse,
    HardwarePortItem,
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


@router.post("/center/pan", response_model=ServoStatusResponse)
async def center_pan_only(hw: HardwareManager = Depends(get_hardware_manager)):
    """Reset ONLY the Pan servo to its calibrated center position (90°)."""
    controller = hw.controller
    if hasattr(controller, "is_emergency_stopped") and controller.is_emergency_stopped:
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="Emergency Stop active",
        )
    if not (await controller.get_status()).connected:
        await controller.connect()
    await controller.move_pan(hw.pan_config.center_angle)
    return await get_servo_status(hw)


@router.post("/center/tilt", response_model=ServoStatusResponse)
async def center_tilt_only(hw: HardwareManager = Depends(get_hardware_manager)):
    """Reset ONLY the Tilt servo to its calibrated center position (90° - level gaze)."""
    controller = hw.controller
    if hasattr(controller, "is_emergency_stopped") and controller.is_emergency_stopped:
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="Emergency Stop active",
        )
    if not (await controller.get_status()).connected:
        await controller.connect()
    await controller.move_tilt(hw.tilt_config.center_angle)
    return await get_servo_status(hw)


@router.post("/gesture/{gesture_name}")
async def execute_gesture(
    gesture_name: str,
    hw: HardwareManager = Depends(get_hardware_manager),
):
    """
    Execute a predefined named gesture (e.g. 'yes', 'no', 'nod', 'shake') on the robot servos.
    """
    controller = hw.controller
    if hasattr(controller, "is_emergency_stopped") and controller.is_emergency_stopped:
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="Emergency Stop active",
        )
    if not (await controller.get_status()).connected:
        await controller.connect()
    success = await controller.execute_gesture(gesture_name)
    return {
        "success": success,
        "gesture": gesture_name,
        "status": "completed" if success else "failed",
    }



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


@router.get("/ports", response_model=List[HardwarePortItem])
async def list_available_ports(hw: HardwareManager = Depends(get_hardware_manager)):
    """List all available USB / COM serial ports on the host system."""
    return hw.list_serial_ports()


@router.post("/connect", response_model=HardwareConnectResponse)
async def connect_hardware(
    req: HardwareConnectRequest,
    hw: HardwareManager = Depends(get_hardware_manager),
):
    """
    Connect to real ESP32 hardware via serial/COM port or switch back to mock mode.
    """
    success = await hw.switch_controller(
        mode=req.mode,
        port=req.port or "COM3",
        baud_rate=req.baud_rate or 115200,
        host=req.host or "192.168.1.100",
        wifi_port=req.wifi_port or 8080,
    )
    return HardwareConnectResponse(
        success=success,
        mode=hw.active_mode,
        port=hw.active_port if hw.active_mode in ("serial", "esp32", "usb") else None,
        baud_rate=hw.active_baud if hw.active_mode in ("serial", "esp32", "usb") else None,
        host=hw.active_host if hw.active_mode in ("wifi", "tcp", "network") else None,
        wifi_port=hw.active_wifi_port if hw.active_mode in ("wifi", "tcp", "network") else None,
        connected=success,
        message=f"Switched to {hw.active_mode.upper()} mode. Status: {'Connected' if success else 'Connection failed'}",
    )



@router.post("/disconnect", response_model=HardwareConnectResponse)
async def disconnect_hardware(hw: HardwareManager = Depends(get_hardware_manager)):
    """Disconnect active hardware controller."""
    await hw.controller.disconnect()
    return HardwareConnectResponse(
        success=True,
        mode=hw.active_mode,
        port=hw.active_port,
        baud_rate=hw.active_baud,
        connected=False,
        message="Hardware disconnected",
    )


@router.post("/ping")
async def ping_hardware(hw: HardwareManager = Depends(get_hardware_manager)):
    """Send live Ping packet to ESP32 hardware and return round-trip latency."""
    controller = hw.controller
    latency = -1.0
    if hasattr(controller, "ping"):
        latency = await controller.ping()
    return {
        "success": latency >= 0,
        "latency_ms": max(0.0, latency),
        "controller_type": (await controller.get_status()).controller_type,
        "connected": (await controller.get_status()).connected,
    }


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

