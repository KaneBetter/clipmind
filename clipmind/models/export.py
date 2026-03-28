from datetime import datetime, timezone
from sqlalchemy import String, Integer, DateTime, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column
from clipmind.database import Base


class Export(Base):
    __tablename__ = "exports"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"))
    format: Mapped[str] = mapped_column(String(50))
    video_ids: Mapped[dict] = mapped_column(JSON)
    music_id: Mapped[int | None] = mapped_column(ForeignKey("music.id"), default=None)
    copywrite_id: Mapped[int | None] = mapped_column(
        ForeignKey("copywrites.id"), default=None
    )
    config: Mapped[dict | None] = mapped_column(JSON, default=None)
    output_path: Mapped[str | None] = mapped_column(String(500), default=None)
    status: Mapped[str] = mapped_column(String(50), default="pending")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
