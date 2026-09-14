class AppError(Exception):
    def __init__(self, message: str, code: str = "APP_ERROR"):
        super().__init__(message)
        self.message = message
        self.code = code


class NotFoundError(AppError):
    def __init__(self, resource: str, resource_id: str):
        super().__init__(f"{resource} with id '{resource_id}' not found", "NOT_FOUND")


class ValidationError(AppError):
    def __init__(self, message: str):
        super().__init__(message, "VALIDATION_ERROR")


class HardwareError(AppError):
    def __init__(self, message: str):
        super().__init__(message, "HARDWARE_ERROR")


class AngleLimitError(HardwareError):
    def __init__(self, angle: float, min_a: float, max_a: float):
        super().__init__(
            f"Angle {angle} is outside allowed range [{min_a}, {max_a}]"
        )
        self.code = "ANGLE_LIMIT_ERROR"


class CameraError(AppError):
    def __init__(self, message: str):
        super().__init__(message, "CAMERA_ERROR")


class ModelError(AppError):
    def __init__(self, message: str):
        super().__init__(message, "MODEL_ERROR")


class GestureError(AppError):
    def __init__(self, message: str):
        super().__init__(message, "GESTURE_ERROR")
