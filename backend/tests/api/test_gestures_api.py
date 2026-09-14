import pytest
from httpx import ASGITransport, AsyncClient
from app.main import app


@pytest.mark.asyncio
async def test_gestures_api_classes():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/gestures/classes")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 6
        names = [g["name"] for g in data]
        assert "nod" in names


@pytest.mark.asyncio
async def test_gestures_api_recording_endpoints():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Check initial status
        resp = await client.get("/api/v1/gestures/record/status")
        assert resp.status_code == 200
        assert resp.json()["status"] in ("idle", "completed", "cancelled")

        # Start recording
        resp_start = await client.post(
            "/api/v1/gestures/record/start",
            json={"gesture_name": "nod", "sequence_length": 15, "countdown_seconds": 0.1},
        )
        assert resp_start.status_code == 200
        assert resp_start.json()["gesture_name"] == "nod"

        # Cancel recording
        resp_cancel = await client.post("/api/v1/gestures/record/cancel")
        assert resp_cancel.status_code == 200
        assert resp_cancel.json()["status"] in ("cancelled", "idle", "completed")


@pytest.mark.asyncio
async def test_gestures_api_samples_and_datasets():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Create dataset
        resp_ds = await client.post(
            "/api/v1/gestures/datasets",
            json={"name": "API Test Dataset", "description": "From API test", "version": "1.0"},
        )
        assert resp_ds.status_code == 200
        ds_id = resp_ds.json()["id"]

        # List datasets
        resp_list = await client.get("/api/v1/gestures/datasets")
        assert resp_list.status_code == 200
        assert any(d["id"] == ds_id for d in resp_list.json())

        # Create sample
        resp_sample = await client.post(
            "/api/v1/gestures/samples",
            json={
                "gesture_name": "nod",
                "dataset_id": ds_id,
                "feature_file": "/tmp/api_sample.npy",
                "frame_count": 30,
                "duration": 1.0,
            },
        )
        assert resp_sample.status_code == 200
        sample_id = resp_sample.json()["id"]

        # List samples
        resp_samples = await client.get(f"/api/v1/gestures/samples?dataset_id={ds_id}")
        assert resp_samples.status_code == 200
        assert len(resp_samples.json()) >= 1

        # Delete sample
        resp_del = await client.delete(f"/api/v1/gestures/samples/{sample_id}")
        assert resp_del.status_code == 200
        assert resp_del.json()["status"] == "deleted"
