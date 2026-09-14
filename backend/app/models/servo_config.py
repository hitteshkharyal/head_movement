from sqlalchemy import String, DateTime, Float, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base
import uuid


class ServoConfig(Base):
    __tablename__ = "servo_configs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    robot_id: Mapped[str] = mapped_column(String(36), ForeignKey("robots.id"))
    servo_name: Mapped[str] = mapped_column(String(100))   # "pan" or "tilt"
    axis: Mapped[str] = mapped_column(String(50))          # "yaw" or "pitch"
    min_angle: Mapped[float] = mapped_column(Float, default=0.0)
    max_angle: Mapped[float] = mapped_column(Float, default=180.0)
    center_angle: Mapped[float] = mapped_column(Float, default=90.0)
    speed: Mapped[float] = mapped_column(Float, default=50.0)
    sensitivity: Mapped[float] = mapped_column(Float, default=0.5)
    created_at: Mapped[DateTime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[DateTime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())