from pathlib import Path
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
        protected_namespaces=(),
    )

    # Application
    app_name: str = "AI Humanoid Presentation Robot"
    app_version: str = "0.1.0"
    app_env: str = "development"
    app_debug: bool = True
    app_secret_key: str = "change-this-secret-key"
    log_level: str = "INFO"

    # Database
    database_url: str = "sqlite+aiosqlite:///./data/robot.db"

    # Hardware / ESP32
    esp32_connection_type: str = "mock"
    esp32_port: str = "COM3"
    esp32_serial_port: str = "COM3"
    esp32_host: str = "192.168.1.100"
    esp32_wifi_host: str = "192.168.1.100"
    esp32_wifi_port: int = 80
    esp32_websocket_port: int = 81
    esp32_baud_rate: int = 115200

    # Servo defaults
    pan_min_angle: float = 0.0
    pan_max_angle: float = 180.0
    pan_center_angle: float = 90.0
    pan_speed: float = 50.0
    pan_sensitivity: float = 0.5
    tilt_min_angle: float = 30.0
    tilt_max_angle: float = 150.0
    tilt_center_angle: float = 90.0
    tilt_speed: float = 50.0
    tilt_sensitivity: float = 0.5

    # Camera
    camera_index: int = 0
    camera_width: int = 640
    camera_height: int = 480
    camera_fps: int = 30

    # File storage
    data_directory: Path = Path("./data")
    model_directory: Path = Path("./data/models")
    dataset_directory: Path = Path("./data/datasets")
    recordings_directory: Path = Path("./data/recordings")
    max_upload_size_mb: int = 100

    # Speech
    speech_provider: str = "none"
    whisper_model: str = "base"
    google_speech_credentials: str = ""
    azure_speech_key: str = ""
    azure_speech_region: str = ""

    # NLP
    nlp_provider: str = "rule_based"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"

    # Head Tracking
    head_tracking_yaw_sensitivity: float = 0.5
    head_tracking_pitch_sensitivity: float = 0.5
    head_tracking_dead_zone: float = 3.0
    head_tracking_smoothing_factor: float = 0.3
    head_tracking_max_speed: float = 30.0

    # Audience Tracking
    audience_target_duration_seconds: float = 5.0
    audience_switch_cooldown_seconds: float = 3.0
    audience_max_faces: int = 10

    # Gesture Recognition
    gesture_confidence_threshold: float = 0.85
    gesture_cooldown_seconds: float = 1.0
    gesture_min_duration_frames: int = 10

    # Greetings
    greeting_morning_end: int = 12
    greeting_afternoon_end: int = 17

    # CORS
    backend_cors_origins: list[str] = Field(
        default=["http://localhost:5173", "http://localhost:3000"]
    )


def get_settings() -> Settings:
    return Settings()


settings = get_settings()
