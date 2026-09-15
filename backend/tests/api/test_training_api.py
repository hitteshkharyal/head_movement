import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_training_and_model_api_lifecycle(async_client: AsyncClient):
    # 1. Train a new model
    train_res = await async_client.post(
        "/api/v1/training/train",
        json={
            "model_name": "API-Test-Model",
            "model_type": "sklearn_rf",
            "n_estimators": 10,
            "max_depth": 5,
        },
    )
    assert train_res.status_code == 200
    train_data = train_res.json()
    assert train_data["name"] == "API-Test-Model"
    assert train_data["status"] == "active"
    assert "id" in train_data
    model_id = train_data["id"]

    # 2. List models
    list_res = await async_client.get("/api/v1/training/models")
    assert list_res.status_code == 200
    models = list_res.json()
    assert any(m["id"] == model_id for m in models)

    # 3. Get model details
    detail_res = await async_client.get(f"/api/v1/training/models/{model_id}")
    assert detail_res.status_code == 200
    detail_data = detail_res.json()
    assert detail_data["id"] == model_id
    assert detail_data["metrics"] is not None

    # 4. Activate model
    activate_res = await async_client.post(f"/api/v1/training/models/{model_id}/activate")
    assert activate_res.status_code == 200
    assert activate_res.json()["status"] == "activated"

    # 5. Check prediction engine status
    pred_status_res = await async_client.get("/api/v1/predictions/status")
    assert pred_status_res.status_code == 200
    pred_status = pred_status_res.json()
    assert pred_status["active_model_id"] == model_id

    # 6. Toggle autonomous reaction
    reaction_res = await async_client.post(
        "/api/v1/predictions/autonomous-reaction",
        json={"enabled": True},
    )
    assert reaction_res.status_code == 200
    assert reaction_res.json()["autonomous_reaction_enabled"] is True
