import pytest
from httpx import ASGITransport, AsyncClient
from app.main import app
from app.services.vision.tracking_controller import get_tracking_controller


@pytest.fixture(autouse=True)
async def cleanup_tracking():
    ctrl = get_tracking_controller()
    await ctrl.stop_tracking()
    yield
    await ctrl.stop_tracking()


@pytest.mark.asyncio
async def test_get_vision_status():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/vision/status")
        assert resp.status_code == 200
        data = resp.json()
        assert "camera_running" in data
        assert "is_tracking" in data
        assert "tracking_mode" in data
        assert "fps" in data
        assert "yaw" in data


@pytest.mark.asyncio
async def test_start_and_stop_tracking_api():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Start tracking
        resp = await client.post("/api/v1/vision/tracking/start", json={"mode": "mirror"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_tracking"] is True
        assert data["tracking_mode"] == "mirror"

        # Stop tracking
        resp_stop = await client.post("/api/v1/vision/tracking/stop")
        assert resp_stop.status_code == 200
        data_stop = resp_stop.json()
        assert data_stop["is_tracking"] is False
        assert data_stop["tracking_mode"] == "off"


@pytest.mark.asyncio
async def test_update_vision_config():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.put(
            "/api/v1/vision/config",
            json={"sensitivity": 0.8, "smoothing_alpha": 0.45, "dead_zone": 2.5},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["sensitivity"] == 0.8
        assert data["smoothing_alpha"] == 0.45
        assert data["dead_zone"] == 2.5
