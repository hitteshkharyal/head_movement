from sqlalchemy import String, DateTime, Float, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base
import uuid


class AudienceSession(Base):
    __tablename__ = "audience_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    presentation_session_id: Mapped[str] = mapped_column(String(36), ForeignKey("presentation_sessions.id"))
    person_identifier: Mapped[str] = mapped_column(String(100))
    first_seen: Mapped[DateTime] = mapped_column(DateTime, server_default=func.now())
    last_seen: Mapped[DateTime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
    attention_score: Mapped[float] = mapped_column(Float, default=0.0)