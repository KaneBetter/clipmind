from datetime import datetime
from pydantic import BaseModel


class VideoRead(BaseModel):
    id: int
    project_id: int
    filename: str
    path: str
    media_type: str = "video"
    duration: float
    width: int | None
    height: int | None
    fps: float | None
    codec: str | None
    file_size: int | None
    lat: float | None
    lon: float | None
    altitude: float | None
    captured_at: datetime | None
    location_label: str | None
    timeline_id: str | None
    thumbnail_path: str | None
    is_ingested: bool
    is_hidden: bool
    created_at: datetime

    # Analysis summary (joined from Analysis table)
    scene_category: str | None = None
    quality_score: float | None = None
    is_highlight: bool | None = None
    mood: str | None = None
    description: str | None = None
    people_count: int | None = None
    audio_type: str | None = None
    issues: str | None = None
    segments: list | None = None
    model_version: str | None = None
    cost_tokens: int | None = None

    model_config = {"from_attributes": True}


class VideoFilter(BaseModel):
    location_label: str | None = None
    timeline_id: str | None = None
    min_quality: float | None = None
    max_quality: float | None = None
    scene_category: str | None = None
    mood: str | None = None
    is_highlight: bool | None = None
    min_duration: float | None = None
    max_duration: float | None = None
    has_gps: bool | None = None
    show_hidden: bool | None = None
    search: str | None = None  # search in filename or description
