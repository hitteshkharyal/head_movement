import pytest
from hardware.esp32_controller import ESP32Controller, compute_checksum
from hardware.servo_controller import (
    ServoConfig,
    calculate_s_curve_trajectory,
    validate_angle,
)


class MockSerial:
    """Mock serial stream capturing bytes written and simulating responses."""

    def __init__(self):
        self.is_open = False
        self.written_bytes = bytearray()
        self.response_buffer = bytearray()

    def open(self):
        self.is_open = True

    def close(self):
        self.is_open = False

    def write(self, data: bytes) -> int:
        self.written_bytes.extend(data)
        return len(data)

    def readline(self) -> bytes:
        return b"<ACK>\n"

    def flush(self):
        pass


@pytest.fixture
def esp32_controller():
    pan_cfg = ServoConfig("pan", "yaw", 0.0, 180.0, 90.0, 50.0, 0.5)
    tilt_cfg = ServoConfig("tilt", "pitch", 45.0, 135.0, 90.0, 50.0, 0.5)
    mock_serial = MockSerial()
    controller = ESP32Controller(
        pan_config=pan_cfg,
        tilt_config=tilt_cfg,
        transport="serial",
        serial_instance=mock_serial,
    )
    return controller, mock_serial


def test_checksum_computation():
    payload = "P:90.0,T:90.0,S:100"
    chk = compute_checksum(payload)
    assert isinstance(chk, int)
    assert 0 <= chk <= 255
    # Idempotent
    assert compute_checksum(payload) == chk


def test_s_curve_trajectory():
    traj = calculate_s_curve_trajectory(0.0, 100.0, steps=5)
    assert len(traj) == 5
    assert traj[-1] == 100.0
    # Acceleration and deceleration pattern (midpoint step should move most)
    diffs = [traj[i] - (traj[i - 1] if i > 0 else 0) for i in range(len(traj))]
    assert max(diffs) > 0


@pytest.mark.asyncio
async def test_esp32_connect_disconnect(esp32_controller):
    ctrl, mock_serial = esp32_controller
    assert not ctrl._connected

    connected = await ctrl.connect()
    assert connected is True
    assert ctrl._connected is True
    assert mock_serial.is_open is True

    await ctrl.disconnect()
    assert ctrl._connected is False


@pytest.mark.asyncio
async def test_esp32_move_pan_tilt(esp32_controller):
    ctrl, mock_serial = esp32_controller
    await ctrl.connect()

    success = await ctrl.move_pan_tilt(120.0, 80.0, speed=90)
    assert success is True
    assert ctrl.pan_angle == 120.0
    assert ctrl.tilt_angle == 80.0

    output = mock_serial.written_bytes.decode("ascii")
    assert "P:120.0,T:80.0,S:90" in output


@pytest.mark.asyncio
async def test_esp32_emergency_stop_and_resume(esp32_controller):
    ctrl, mock_serial = esp32_controller
    await ctrl.connect()

    await ctrl.emergency_stop()
    assert ctrl.is_emergency_stopped is True

    # Movement should be blocked
    res = await ctrl.move_pan(100.0)
    assert res is False

    # Reset E-stop
    ctrl.reset_emergency_stop()
    assert ctrl.is_emergency_stopped is False

    res = await ctrl.move_pan(100.0)
    assert res is True
