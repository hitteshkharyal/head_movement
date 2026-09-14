import pytest
from hardware.servo_controller import (
    ServoConfig,
    clamp_angle,
    validate_angle,
    yaw_to_pan_angle,
    pitch_to_tilt_angle,
    smooth_angle,
)


@pytest.fixture
def pan_config():
    return ServoConfig("pan", "yaw", 0.0, 180.0, 90.0, 50.0, 0.5)


@pytest.fixture
def tilt_config():
    return ServoConfig("tilt", "pitch", 30.0, 150.0, 90.0, 50.0, 0.5)


def test_clamp_within_range():
    assert clamp_angle(90.0, 0.0, 180.0) == 90.0


def test_clamp_above_max():
    assert clamp_angle(200.0, 0.0, 180.0) == 180.0


def test_clamp_below_min():
    assert clamp_angle(-10.0, 0.0, 180.0) == 0.0


def test_clamp_at_exact_boundary():
    assert clamp_angle(0.0, 0.0, 180.0) == 0.0
    assert clamp_angle(180.0, 0.0, 180.0) == 180.0


def test_validate_normal_angle(pan_config):
    result = validate_angle(90.0, pan_config)
    assert result == 90.0


def test_validate_clamps_at_max(pan_config):
    result = validate_angle(200.0, pan_config)
    assert result == 180.0


def test_validate_clamps_at_min(pan_config):
    result = validate_angle(-5.0, pan_config)
    assert result == 0.0


def test_validate_unreasonably_large_raises(pan_config):
    with pytest.raises(ValueError):
        validate_angle(9999.0, pan_config)


def test_validate_unreasonably_negative_raises(pan_config):
    with pytest.raises(ValueError):
        validate_angle(-9999.0, pan_config)


def test_yaw_to_pan_center(pan_config):
    result = yaw_to_pan_angle(0.0, pan_config, dead_zone=0.0)
    assert result == pytest.approx(90.0)


def test_yaw_to_pan_dead_zone_suppresses(pan_config):
    result = yaw_to_pan_angle(2.0, pan_config, dead_zone=3.0)
    assert result == pytest.approx(90.0)


def test_yaw_to_pan_right_movement(pan_config):
    result = yaw_to_pan_angle(20.0, pan_config, sensitivity=1.0, dead_zone=0.0)
    assert result > 90.0


def test_yaw_to_pan_left_movement(pan_config):
    result = yaw_to_pan_angle(-20.0, pan_config, sensitivity=1.0, dead_zone=0.0)
    assert result < 90.0


def test_yaw_to_pan_clamped_at_max(pan_config):
    result = yaw_to_pan_angle(9000.0, pan_config, sensitivity=1.0, dead_zone=0.0)
    assert result == pan_config.max_angle


def test_smooth_angle_alpha_1():
    result = smooth_angle(current=0.0, target=90.0, alpha=1.0)
    assert result == 90.0


def test_smooth_angle_alpha_0():
    result = smooth_angle(current=45.0, target=90.0, alpha=0.0)
    assert result == 45.0


def test_smooth_angle_intermediate():
    result = smooth_angle(current=0.0, target=100.0, alpha=0.5)
    assert result == pytest.approx(50.0)


def test_smooth_angle_converges():
    val = 0.0
    for _ in range(100):
        val = smooth_angle(val, 90.0, alpha=0.3)
    assert abs(val - 90.0) < 0.01