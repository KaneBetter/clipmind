from datetime import datetime, timezone
from sqlalchemy import String, Float, Integer, DateTime, ForeignKey, Boolean, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from clipmind.database import Base


class Analysis(Base):
    __tablename__ = "analyses"

    id: Mapped[int] = mapped_column(primary_key=True)
    video_id: Mapped[int] = mapped_column(ForeignKey("videos.id"), unique=True)
    model_version: Mapped[str] = mapped_column(String(100))

    # AI analysis results
    scene_category: Mapped[str | None] = mapped_column(String(50), default=None)
    quality_score: Mapped[float | None] = mapped_column(Float, default=None)
    is_highlight: Mapped[bool] = mapped_column(Boolean, default=False)
    mood: Mapped[str | None] = mapped_column(String(50), default=None)
    description: Mapped[str | None] = mapped_column(Text, default=None)
    people_count: Mapped[int | None] = mapped_column(Integer, default=None)
    audio_type: Mapped[str | None] = mapped_column(String(50), default=None)
    issues: Mapped[str | None] = mapped_column(String(200), default=None)

    # Detailed segments within the video
    segments: Mapped[dict | None] = mapped_column(JSON, default=None)

    # Raw LLM response for debugging
    raw_response: Mapped[str | None] = mapped_column(Text, default=None)
    cost_tokens: Mapped[int | None] = mapped_column(Integer, default=None)
    prompt_token_count: Mapped[int | None] = mapped_column(Integer, default=None)
    candidate_token_count: Mapped[int | None] = mapped_column(Integer, default=None)
    thoughts_token_count: Mapped[int | None] = mapped_column(Integer, default=None)
    prompt_tokens_details: Mapped[list | None] = mapped_column(JSON, default=None)

    # User overrides
    user_score: Mapped[float | None] = mapped_column(Float, default=None)
    user_category: Mapped[str | None] = mapped_column(String(50), default=None)
    user_highlight: Mapped[bool | None] = mapped_column(Boolean, default=None)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    video: Mapped["Video"] = relationship(back_populates="analysis")
