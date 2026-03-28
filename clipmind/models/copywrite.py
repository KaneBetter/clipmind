from datetime import datetime, timezone
from sqlalchemy import String, Integer, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column
from clipmind.database import Base


class Copywrite(Base):
    __tablename__ = "copywrites"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"))
    style: Mapped[str] = mapped_column(String(50))
    language: Mapped[str] = mapped_column(String(10), default="zh")
    video_ids: Mapped[dict] = mapped_column(JSON)
    narrations: Mapped[dict] = mapped_column(JSON)
    overall_script: Mapped[str | None] = mapped_column(Text, default=None)
    custom_prompt: Mapped[str | None] = mapped_column(Text, default=None)
    generated_by: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
