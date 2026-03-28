"""Video stability analysis results."""

from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, Integer, String, Boolean, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from clipmind.database import Base


class Stability(Base):
    __tablename__ = "stabilities"

    id: Mapped[int] = mapped_column(primary_key=True)
    video_id: Mapped[int] = mapped_column(
        ForeignKey("videos.id"), unique=True, index=True
    )

    # Overall assessment
    overall_score: Mapped[float] = mapped_column(Float, default=0.0)
    is_stable: Mapped[bool] = mapped_column(Boolean, default=False)
    stable_ratio: Mapped[float] = mapped_column(Float, default=0.0)

    # Segments as JSON: [{"start": 0.0, "end": 4.2, "avg_shake": 1.3}, ...]
    stable_segments: Mapped[str | None] = mapped_column(Text, default=None)
    shaky_segments: Mapped[str | None] = mapped_column(Text, default=None)

    # Shake curve: JSON array of {t: time_sec, v: magnitude} downsampled to ~200 points
    shake_curve: Mapped[str | None] = mapped_column(Text, default=None)

    # Analysis parameters
    threshold: Mapped[float] = mapped_column(Float, default=5.0)
    total_frames: Mapped[int] = mapped_column(Integer, default=0)
    fps: Mapped[float] = mapped_column(Float, default=0.0)
    analysis_time_ms: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    video: Mapped["Video"] = relationship(back_populates="stability")
