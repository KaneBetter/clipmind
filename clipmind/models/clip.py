"""Usable video clips extracted from AI analysis + stability detection."""

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from clipmind.database import Base


class Clip(Base):
    __tablename__ = "clips"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    video_id: Mapped[int] = mapped_column(ForeignKey("videos.id"), index=True)

    # Time range within the source video
    start_time: Mapped[float] = mapped_column(Float, default=0.0)
    end_time: Mapped[float] = mapped_column(Float, default=0.0)
    duration: Mapped[float] = mapped_column(Float, default=0.0)

    # Scores
    stability_score: Mapped[float] = mapped_column(Float, default=0.0)
    quality_score: Mapped[float | None] = mapped_column(Float, default=None)

    # AI metadata (inherited from Analysis)
    scene_type: Mapped[str | None] = mapped_column(String(50), default=None)
    mood: Mapped[str | None] = mapped_column(String(50), default=None)
    description: Mapped[str | None] = mapped_column(Text, default=None)

    # Location (inherited from Video)
    location_cluster: Mapped[str | None] = mapped_column(String(200), default=None)
    gps_lat: Mapped[float | None] = mapped_column(Float, default=None)
    gps_lon: Mapped[float | None] = mapped_column(Float, default=None)

    usable: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    video: Mapped["Video"] = relationship()
