import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from hardware.mock_controller import MockController
from hardware.servo_controller import ServoConfig


def make_pan_config() -> ServoConfig:
    return ServoConfig(
        servo_name="pan",
        axis="yaw",
        min_angle=0.0,
        max_angle=180.0,
        center_angle=90.0,
        speed=50.0,
        sensitivity=0.5,
    )


def make_tilt_config() -> ServoConfig:
    return ServoConfig(
        servo_name="tilt",
        axis="pitch",
        min_angle=30.0,
        max_angle=150.0,
        center_angle=90.0,
        speed=50.0,
        sensitivity=0.5,
    )


@pytest.fixture
def pan_config():
    return make_pan_config()


@pytest.fixture
def tilt_config():
    return make_tilt_config()


@pytest.fixture
def mock_controller(pan_config, tilt_config):
    return MockController(pan_config, tilt_config)


@pytest.fixture
async def async_client():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client
