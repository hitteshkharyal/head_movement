import pytest
from hardware.mock_controller import MockController
from hardware.servo_controller import ServoConfig


@pytest.mark.asyncio
async def test_connect_succeeds(mock_controller):
    result = await mock_controller.connect()
    assert result is True
    status = await mock_controller.get_status()
    assert status.connected is True


@pytest.mark.asyncio
async def test_disconnect(mock_controller):
    await mock_controller.connect()
    await mock_controller.disconnect()
    status = await mock_controller.get_status()
    assert status.connected is False


@pytest.mark.asyncio
async def test_move_pan_valid_angle(mock_controller):
    await mock_controller.connect()
    result = await mock_controller.move_pan(45.0)
    assert result is True
    assert mock_controller.pan_angle == pytest.approx(45.0, abs=0.5)


@pytest.mark.asyncio
async def test_move_tilt_valid_angle(mock_controller):
    await mock_controller.connect()
    result = await mock_controller.move_tilt(60.0)
    assert result is True
    assert mock_controller.tilt_angle == pytest.approx(60.0, abs=0.5)


@pytest.mark.asyncio
async def test_angle_clamped_at_max(mock_controller):
    """Angles above max are clamped to max (not rejected)."""
    await mock_controller.connect()
    await mock_controller.move_pan(200.0)
    assert mock_controller.pan_angle <= 180.0


@pytest.mark.asyncio
async def test_angle_clamped_at_min(mock_controller):
    """Angles below min are clamped to min."""
    await mock_controller.connect()
    await mock_controller.move_pan(-10.0)
    assert mock_controller.pan_angle >= 0.0


@pytest.mark.asyncio
async def test_center_command(mock_controller):
    await mock_controller.connect()
    await mock_controller.move_pan(30.0)
    await mock_controller.move_tilt(60.0)
    await mock_controller.center()
    assert mock_controller.pan_angle == pytest.approx(90.0, abs=0.5)
    assert mock_controller.tilt_angle == pytest.approx(90.0, abs=0.5)


@pytest.mark.asyncio
async def test_emergency_stop_blocks_movement(mock_controller):
    await mock_controller.connect()
    await mock_controller.emergency_stop()
    result = await mock_controller.move_pan(45.0)
    assert result is False


@pytest.mark.asyncio
async def test_reset_emergency_stop(mock_controller):
    await mock_controller.connect()
    await mock_controller.emergency_stop()
    mock_controller.reset_emergency_stop()
    result = await mock_controller.move_pan(45.0)
    assert result is True


@pytest.mark.asyncio
async def test_command_history_recorded(mock_controller):
    await mock_controller.connect()
    await mock_controller.move_pan(90.0)
    history = mock_controller.get_command_history()
    commands = [h["command"] for h in history]
    assert "connect" in commands
    assert "move_pan" in commands


@pytest.mark.asyncio
async def test_clear_command_history(mock_controller):
    await mock_controller.connect()
    mock_controller.clear_command_history()
    assert mock_controller.get_command_history() == []


@pytest.mark.asyncio
async def test_controller_type_is_mock(mock_controller):
    status = await mock_controller.get_status()
    assert status.controller_type == "mock"