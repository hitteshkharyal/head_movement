from sqlalchemy import String, DateTime, Text, JSON, func, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base
import uuid


class ModelVersion(Base):
    __tablename__ = "model_versions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(255))
    version: Mapped[str] = mapped_column(String(50))
    model_type: Mapped[str] = mapped_column(String(100))  # sklearn_rf | lstm | rule_based
    model_file: Mapped[str | None] = mapped_column(String(500), nullable=True)
    feature_schema: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    metrics: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="training")  # training | ready | active | archived
    dataset_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("training_datasets.id"), nullable=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime, server_default=func.now())