import pytest
from httpx import ASGITransport, AsyncClient
from app.main import app
from app.services.hardware.hardware_manager import get_hardware_manager


@pytest.fixture(autouse=True)
def reset_hardware_state():
    hw = get_hardware_manager()
    if hasattr(hw.controller, "reset_emergency_stop"):
        hw.controller.reset_emergency_stop()


@pytest.mark.asyncio
async def test_get_servo_status():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/servos/status")
        assert resp.status_code == 200
        data = resp.json()
        assert "pan_angle" in data
        assert "tilt_angle" in data
        assert "connected" in data
        assert "is_emergency_stopped" in data
        assert data["is_emergency_stopped"] is False


@pytest.mark.asyncio
async def test_move_servos():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/api/v1/servos/move",
            json={"pan_angle": 110.0, "tilt_angle": 75.0, "speed": 80},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["pan_angle"] == 110.0
        assert data["tilt_angle"] == 75.0


@pytest.mark.asyncio
async def test_center_servos():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Move first
        await client.post("/api/v1/servos/move", json={"pan_angle": 120.0, "tilt_angle": 60.0})
        # Center
        resp = await client.post("/api/v1/servos/center")
        assert resp.status_code == 200
        data = resp.json()
        assert data["pan_angle"] == 90.0
        assert data["tilt_angle"] == 90.0


@pytest.mark.asyncio
async def test_emergency_stop_blocks_movement_and_resume():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Trigger E-Stop
        resp_estop = await client.post("/api/v1/servos/emergency-stop")
        assert resp_estop.status_code == 200
        assert resp_estop.json()["emergency_stopped"] is True

        # Movement attempt should be 423 Locked
        resp_move = await client.post(
            "/api/v1/servos/move",
            json={"pan_angle": 100.0, "tilt_angle": 100.0},
        )
        assert resp_move.status_code == 423

        # Resume
        resp_resume = await client.post("/api/v1/servos/resume")
        assert resp_resume.status_code == 200
        assert resp_resume.json()["emergency_stopped"] is False

        # Movement now succeeds
        resp_move2 = await client.post(
            "/api/v1/servos/move",
            json={"pan_angle": 95.0, "tilt_angle": 95.0},
        )
        assert resp_move2.status_code == 200


@pytest.mark.asyncio
async def test_calibration_get_and_put():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # GET calibration
        resp = await client.get("/api/v1/servos/calibration")
        assert resp.status_code == 200
        cal = resp.json()
        assert len(cal) == 2

        # PUT calibration with updated trim
        cal[0]["trim_offset"] = 5.0
        put_resp = await client.put("/api/v1/servos/calibration", json={"servos": cal})
        assert put_resp.status_code == 200
        updated = put_resp.json()
        assert updated[0]["trim_offset"] == 5.0


@pytest.mark.asyncio
async def test_ports_and_connection_endpoints():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # GET ports
        resp = await client.get("/api/v1/servos/ports")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

        # Connect Mock mode
        resp_conn = await client.post(
            "/api/v1/servos/connect",
            json={"mode": "mock", "port": "COM3", "baud_rate": 115200},
        )
        assert resp_conn.status_code == 200
        data = resp_conn.json()
        assert data["success"] is True
        assert data["mode"] == "mock"

        # Ping
        resp_ping = await client.post("/api/v1/servos/ping")
        assert resp_ping.status_code == 200
        assert "latency_ms" in resp_ping.json()

        # Disconnect
        resp_disc = await client.post("/api/v1/servos/disconnect")
        assert resp_disc.status_code == 200
        assert resp_disc.json()["connected"] is False


@pytest.mark.asyncio
async def test_execute_gesture_yes_and_no():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Reconnect to mock controller
        await client.post("/api/v1/servos/connect", json={"mode": "mock"})

        # Execute YES gesture (Up & Down nod)
        resp_yes = await client.post("/api/v1/servos/gesture/yes")
        assert resp_yes.status_code == 200
        data_yes = resp_yes.json()
        assert data_yes["success"] is True
        assert data_yes["gesture"] == "yes"
        assert data_yes["status"] == "completed"

        # Execute NO gesture (Left & Right shake)
        resp_no = await client.post("/api/v1/servos/gesture/no")
        assert resp_no.status_code == 200
        data_no = resp_no.json()
        assert data_no["success"] is True
        assert data_no["gesture"] == "no"
        assert data_no["status"] == "completed"


