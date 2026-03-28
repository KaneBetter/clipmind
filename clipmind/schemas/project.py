from datetime import datetime
from pydantic import BaseModel


class ProjectCreate(BaseModel):
    name: str
    video_dir: str | None = None
    photo_dir: str | None = None
    music_dir: str | None = None
    description: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = None
    video_dir: str | None = None
    photo_dir: str | None = None
    music_dir: str | None = None
    description: str | None = None


class ProjectRead(BaseModel):
    id: int
    name: str
    video_dir: str | None = None
    photo_dir: str | None = None
    music_dir: str | None = None
    description: str | None = None
    created_at: datetime
    video_count: int = 0
    analyzed_count: int = 0

    model_config = {"from_attributes": True}
