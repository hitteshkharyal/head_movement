from typing import List, Optional
from pydantic import BaseModel, Field


class ServoMoveRequest(BaseModel):
    pan_angle: Optional[float] = Field(None, description="Target Pan angle in degrees (-90 to +90 or 0 to 180)")
    tilt_angle: Optional[float] = Field(None, description="Target Tilt angle in degrees (-45 to +45 or 0 to 180)")
    speed: int = Field(100, ge=1, le=100, description="Movement speed percentage 1-100")
    smooth: bool = Field(True, description="Enable S-curve trajectory smoothing")


class ServoSingleAxisMoveRequest(BaseModel):
    angle: float = Field(..., description="Target angle in degrees")
    speed: int = Field(100, ge=1, le=100, description="Movement speed percentage 1-100")


class ServoConfigItem(BaseModel):
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


class ServoConfigUpdateRequest(BaseModel):
    servos: List[ServoConfigItem]


class ServoStatusResponse(BaseModel):
    connected: bool
    controller_type: str
    pan_angle: float
    tilt_angle: float
    is_moving: bool
    is_emergency_stopped: bool
    latency_ms: float
    error: Optional[str] = None


class EmergencyStopResponse(BaseModel):
    status: str
    emergency_stopped: bool
    message: str


class HardwarePortItem(BaseModel):
    port: str
    description: str
    manufacturer: Optional[str] = "Unknown"
    hwid: Optional[str] = ""


class HardwareConnectRequest(BaseModel):
    mode: str = Field(..., description="'mock', 'serial', or 'wifi'")
    port: Optional[str] = Field("COM3", description="Serial port name, e.g. COM3 or /dev/ttyUSB0")
    baud_rate: Optional[int] = Field(115200, description="Serial baud rate, defaults to 115200")
    host: Optional[str] = Field("192.168.1.100", description="WiFi IP address of ESP32 (for wifi mode)")
    wifi_port: Optional[int] = Field(8080, description="WiFi TCP port of ESP32 (for wifi mode)")


class HardwareConnectResponse(BaseModel):
    success: bool
    mode: str
    port: Optional[str] = None
    baud_rate: Optional[int] = None
    host: Optional[str] = None
    wifi_port: Optional[int] = None
    connected: bool
    message: str


