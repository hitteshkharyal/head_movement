from sqlalchemy import String, DateTime, Float, Text, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base
import uuid


class SpeechEvent(Base):
    __tablename__ = "speech_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    presentation_session_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("presentation_sessions.id"), nullable=True)
    text: Mapped[str] = mapped_column(Text)
    intent: Mapped[str | None] = mapped_column(String(100), nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime, server_default=func.now())