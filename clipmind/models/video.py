from datetime import datetime, timezone
from sqlalchemy import String, Float, Integer, DateTime, ForeignKey, Boolean, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from clipmind.database import Base


class Video(Base):
    __tablename__ = "videos"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"))
    filename: Mapped[str] = mapped_column(String(300), index=True)
    path: Mapped[str] = mapped_column(String(500))

    # Technical metadata
    duration: Mapped[float] = mapped_column(Float, default=0.0)
    width: Mapped[int | None] = mapped_column(Integer, default=None)
    height: Mapped[int | None] = mapped_column(Integer, default=None)
    fps: Mapped[float | None] = mapped_column(Float, default=None)
    codec: Mapped[str | None] = mapped_column(String(50), default=None)
    file_size: Mapped[int | None] = mapped_column(Integer, default=None)

    # GPS
    lat: Mapped[float | None] = mapped_column(Float, default=None)
    lon: Mapped[float | None] = mapped_column(Float, default=None)
    altitude: Mapped[float | None] = mapped_column(Float, default=None)

    # Time
    captured_at: Mapped[datetime | None] = mapped_column(DateTime, default=None)

    # Location cluster (from existing data)
    location_label: Mapped[str | None] = mapped_column(String(200), default=None)
    timeline_id: Mapped[str | None] = mapped_column(String(100), default=None)

    # Generated assets
    thumbnail_path: Mapped[str | None] = mapped_column(String(500), default=None)

    # Type: video or photo
    media_type: Mapped[str] = mapped_column(String(10), default="video")  # video / photo

    # User comment — free text note for AI editing context
    user_comment: Mapped[str | None] = mapped_column(Text, default=None)

    # Flags
    is_ingested: Mapped[bool] = mapped_column(Boolean, default=False)
    is_hidden: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    project: Mapped["Project"] = relationship(back_populates="videos")
    analysis: Mapped["Analysis | None"] = relationship(back_populates="video", uselist=False)
    stability: Mapped["Stability | None"] = relationship(back_populates="video", uselist=False)
