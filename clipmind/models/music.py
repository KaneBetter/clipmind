from datetime import datetime, timezone
from sqlalchemy import String, Float, Integer, DateTime, JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from clipmind.database import Base


class Music(Base):
    __tablename__ = "music"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int | None] = mapped_column(
        ForeignKey("projects.id"), default=None
    )
    title: Mapped[str] = mapped_column(String(300))
    artist: Mapped[str | None] = mapped_column(String(200), default=None)
    path: Mapped[str] = mapped_column(String(500))
    duration: Mapped[float] = mapped_column(Float, default=0.0)
    bpm: Mapped[float | None] = mapped_column(Float, default=None)
    mood_tags: Mapped[str | None] = mapped_column(String(500), default=None)
    beats: Mapped[dict | None] = mapped_column(JSON, default=None)
    onsets: Mapped[dict | None] = mapped_column(JSON, default=None)
    sections: Mapped[dict | None] = mapped_column(JSON, default=None)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
