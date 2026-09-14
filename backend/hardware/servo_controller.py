import math
from dataclasses import dataclass
from typing import List, Tuple


@dataclass
class ServoConfig:
    servo_name: str
    axis: str
    min_angle: float
    max_angle: float
    center_angle: float
    speed: float
    sensitivity: float
    trim_offset: float = 0.0
    invert: bool = False
    dead_zone: float = 2.0


def clamp_angle(angle: float, min_angle: float, max_angle: float) -> float:
    """Clamp angle to the valid range [min_angle, max_angle]."""
    return max(min_angle, min(max_angle, angle))


def validate_angle(angle: float, config: ServoConfig) -> float:
    """
    Validate and clamp an angle to the servo configured limits.
    Applies trim offset and inversion if configured.
    Raises ValueError if angle is absurdly out of range.
    """
    if angle < -720 or angle > 720:
        raise ValueError(
            f"Angle {angle} is unreasonably large, refusing to process"
        )
    effective_angle = angle
    if config.invert:
        effective_angle = config.max_angle - (effective_angle - config.min_angle)
    effective_angle += config.trim_offset
    return clamp_angle(effective_angle, config.min_angle, config.max_angle)


def yaw_to_pan_angle(
    yaw: float,
    config: ServoConfig,
    sensitivity: float | None = None,
    dead_zone: float | None = None,
) -> float:
    """Map human yaw angle (degrees, negative=left, positive=right) to robot PAN servo angle."""
    dz = dead_zone if dead_zone is not None else config.dead_zone
    if abs(yaw) < dz:
        yaw = 0.0
    s = sensitivity if sensitivity is not None else config.sensitivity
    offset = yaw * s
    effective_offset = -offset if config.invert else offset
    target = config.center_angle + effective_offset + config.trim_offset
    return clamp_angle(target, config.min_angle, config.max_angle)


def pitch_to_tilt_angle(
    pitch: float,
    config: ServoConfig,
    sensitivity: float | None = None,
    dead_zone: float | None = None,
) -> float:
    """Map human pitch angle (degrees, negative=down, positive=up) to robot TILT servo angle."""
    dz = dead_zone if dead_zone is not None else config.dead_zone
    if abs(pitch) < dz:
        pitch = 0.0
    s = sensitivity if sensitivity is not None else config.sensitivity
    offset = pitch * s
    effective_offset = -offset if config.invert else offset
    target = config.center_angle + effective_offset + config.trim_offset
    return clamp_angle(target, config.min_angle, config.max_angle)


def smooth_angle(
    current: float,
    target: float,
    alpha: float = 0.3,
) -> float:
    """Exponential moving average smoothing for servo movement."""
    return alpha * target + (1.0 - alpha) * current


def calculate_s_curve_trajectory(
    start_angle: float,
    target_angle: float,
    steps: int = 10,
) -> List[float]:
    """
    Generate an S-curve (sigmoid) interpolated list of intermediate angles.
    Ensures smooth acceleration and deceleration to protect physical servo gears.
    """
    if steps <= 1 or abs(target_angle - start_angle) < 0.1:
        return [target_angle]

    trajectory = []
    for i in range(1, steps + 1):
        # Normalized progress t in [0, 1]
        t = i / steps
        # Smoothstep / Sigmoidal factor: 3*t^2 - 2*t^3
        smooth_factor = 3 * (t ** 2) - 2 * (t ** 3)
        angle = start_angle + (target_angle - start_angle) * smooth_factor
        trajectory.append(round(angle, 2))

    return trajectory
