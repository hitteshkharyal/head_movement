import asyncio
import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.hardware.hardware_manager import get_hardware_manager

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/telemetry")
async def websocket_telemetry_endpoint(websocket: WebSocket):
    """
    Real-time bidirectional WebSocket stream for robot servo telemetry and quick controls.
    """
    await websocket.accept()
    hw = get_hardware_manager()
    queue = hw.subscribe_telemetry()
    controller = hw.controller

    logger.info("WebSocket telemetry client connected")

    async def sender():
        try:
            while True:
                # Wait for pub/sub message or timeout for heartbeat
                try:
                    msg = await asyncio.wait_for(queue.get(), timeout=0.1)
                except asyncio.TimeoutError:
                    status = await controller.get_status()
                    is_estop = getattr(controller, "is_emergency_stopped", False)
                    latency = 0.0
                    if hasattr(controller, "ping"):
                        latency = await controller.ping()
                    msg = {
                        "type": "heartbeat",
                        "connected": status.connected,
                        "controller_type": status.controller_type,
                        "pan": status.servo.pan_angle,
                        "tilt": status.servo.tilt_angle,
                        "is_moving": status.servo.is_moving,
                        "is_emergency_stopped": is_estop,
                        "latency_ms": max(0.0, latency),
                    }
                await websocket.send_text(json.dumps(msg))
        except WebSocketDisconnect:
            pass
        except Exception as exc:
            logger.debug("WebSocket sender closed: %s", exc)

    async def receiver():
        try:
            while True:
                data = await websocket.receive_text()
                try:
                    command = json.loads(data)
                    cmd_type = command.get("type")
                    if cmd_type == "move":
                        pan = command.get("pan")
                        tilt = command.get("tilt")
                        speed = command.get("speed", 100)
                        if pan is not None and tilt is not None and hasattr(controller, "move_pan_tilt"):
                            await controller.move_pan_tilt(float(pan), float(tilt), speed=int(speed))
                        elif pan is not None:
                            await controller.move_pan(float(pan), speed=int(speed))
                        elif tilt is not None:
                            await controller.move_tilt(float(tilt), speed=int(speed))
                    elif cmd_type == "center":
                        await controller.center()
                    elif cmd_type == "emergency_stop":
                        await controller.emergency_stop()
                    elif cmd_type == "resume":
                        if hasattr(controller, "reset_emergency_stop"):
                            controller.reset_emergency_stop()
                except Exception as parse_err:
                    logger.warning("Invalid WebSocket command payload: %s", parse_err)
        except WebSocketDisconnect:
            pass
        except Exception as exc:
            logger.debug("WebSocket receiver closed: %s", exc)

    sender_task = asyncio.create_task(sender())
    receiver_task = asyncio.create_task(receiver())

    try:
        done, pending = await asyncio.wait(
            [sender_task, receiver_task],
            return_when=asyncio.FIRST_COMPLETED,
        )
        for task in pending:
            task.cancel()
    finally:
        hw.unsubscribe_telemetry(queue)
        logger.info("WebSocket telemetry client disconnected")
