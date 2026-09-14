from sqlalchemy import String, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base
import uuid


class PresentationSession(Base):
    __tablename__ = "presentation_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title: Mapped[str] = mapped_column(String(255), default="Presentation")
    status: Mapped[str] = mapped_column(String(50), default="idle")  # idle | active | paused | ended
    started_at: Mapped[DateTime | None] = mapped_column(DateTime, nullable=True)
    ended_at: Mapped[DateTime | None] = mapped_column(DateTime, nullable=True)