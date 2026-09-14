import pytest


@pytest.mark.asyncio
async def test_health_ok(async_client):
    response = await async_client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "version" in data
    assert "uptime_seconds" in data
    assert data["uptime_seconds"] >= 0


@pytest.mark.asyncio
async def test_health_returns_hardware_mode(async_client):
    response = await async_client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert "hardware_mode" in data
    assert data["hardware_mode"] in ("mock", "serial", "wifi", "websocket")


@pytest.mark.asyncio
async def test_health_returns_environment(async_client):
    response = await async_client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert "environment" in data
