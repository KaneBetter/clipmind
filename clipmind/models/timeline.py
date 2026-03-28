"""Timeline models for persistent video editing timelines."""

from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from clipmind.database import Base


class Timeline(Base):
    __tablename__ = "timelines"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    location_cluster: Mapped[str | None] = mapped_column(String(200), default=None)
    status: Mapped[str] = mapped_column(String(50), default="draft")
    total_duration: Mapped[float] = mapped_column(Float, default=0.0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    clips: Mapped[list["TimelineClip"]] = relationship(
        back_populates="timeline", cascade="all, delete-orphan",
        order_by="TimelineClip.position",
    )
    subtitles: Mapped[list["TimelineSubtitle"]] = relationship(
        back_populates="timeline", cascade="all, delete-orphan",
        order_by="TimelineSubtitle.start_time",
    )
    music_tracks: Mapped[list["TimelineMusic"]] = relationship(
        back_populates="timeline", cascade="all, delete-orphan",
    )


class TimelineClip(Base):
    __tablename__ = "timeline_clips"

    id: Mapped[int] = mapped_column(primary_key=True)
    timeline_id: Mapped[int] = mapped_column(ForeignKey("timelines.id"), index=True)
    clip_id: Mapped[int | None] = mapped_column(ForeignKey("clips.id"), default=None)
    video_id: Mapped[int] = mapped_column(ForeignKey("videos.id"))

    position: Mapped[int] = mapped_column(Integer, default=0)
    source_start: Mapped[float] = mapped_column(Float, default=0.0)
    source_end: Mapped[float] = mapped_column(Float, default=0.0)
    transition: Mapped[str] = mapped_column(String(50), default="cut")

    timeline: Mapped["Timeline"] = relationship(back_populates="clips")


class TimelineSubtitle(Base):
    __tablename__ = "timeline_subtitles"

    id: Mapped[int] = mapped_column(primary_key=True)
    timeline_id: Mapped[int] = mapped_column(ForeignKey("timelines.id"), index=True)

    text: Mapped[str] = mapped_column(Text, default="")
    start_time: Mapped[float] = mapped_column(Float, default=0.0)
    end_time: Mapped[float] = mapped_column(Float, default=0.0)
    style: Mapped[str] = mapped_column(String(50), default="default")

    timeline: Mapped["Timeline"] = relationship(back_populates="subtitles")


class TimelineMusic(Base):
    __tablename__ = "timeline_music"

    id: Mapped[int] = mapped_column(primary_key=True)
    timeline_id: Mapped[int] = mapped_column(ForeignKey("timelines.id"), index=True)
    music_id: Mapped[int] = mapped_column(ForeignKey("music.id"))

    start_time: Mapped[float] = mapped_column(Float, default=0.0)
    end_time: Mapped[float] = mapped_column(Float, default=0.0)
    volume: Mapped[float] = mapped_column(Float, default=0.7)
    fade_in: Mapped[float] = mapped_column(Float, default=0.0)
    fade_out: Mapped[float] = mapped_column(Float, default=0.0)

    timeline: Mapped["Timeline"] = relationship(back_populates="music_tracks")
