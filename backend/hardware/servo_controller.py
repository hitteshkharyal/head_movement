from dataclasses import dataclass


@dataclass
class ServoConfig:
    servo_name: str
    axis: str
    min_angle: float
    max_angle: float
    center_angle: float
    speed: float
    sensitivity: float


def clamp_angle(angle: float, min_angle: float, max_angle: float) -> float:
    """Clamp angle to the valid range [min_angle, max_angle]."""
    return max(min_angle, min(max_angle, angle))


def validate_angle(angle: float, config: ServoConfig) -> float:
    """
    Validate and clamp an angle to the servo configured limits.
    Raises ValueError if angle is absurdly out of range.
    """
    if angle < -720 or angle > 720:
        raise ValueError(
            f"Angle {angle} is unreasonably large, refusing to process"
        )
    return clamp_angle(angle, config.min_angle, config.max_angle)


def yaw_to_pan_angle(
    yaw: float,
    config: ServoConfig,
    sensitivity: float | None = None,
    dead_zone: float = 3.0,
) -> float:
    """Map human yaw angle to robot PAN servo angle."""
    if abs(yaw) < dead_zone:
        yaw = 0.0
    s = sensitivity if sensitivity is not None else config.sensitivity
    offset = yaw * s
    return clamp_angle(config.center_angle + offset, config.min_angle, config.max_angle)


def pitch_to_tilt_angle(
    pitch: float,
    config: ServoConfig,
    sensitivity: float | None = None,
    dead_zone: float = 3.0,
) -> float:
    """Map human pitch angle to robot TILT servo angle."""
    if abs(pitch) < dead_zone:
        pitch = 0.0
    s = sensitivity if sensitivity is not None else config.sensitivity
    offset = pitch * s
    return clamp_angle(config.center_angle + offset, config.min_angle, config.max_angle)


def smooth_angle(
    current: float,
    target: float,
    alpha: float = 0.3,
) -> float:
    """Exponential moving average smoothing for servo movement."""
    return alpha * target + (1.0 - alpha) * current
