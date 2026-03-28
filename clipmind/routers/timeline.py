"""API endpoints for timeline CRUD — Claude CLI writes, frontend reads."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from clipmind.database import get_db
from clipmind.models.project import Project
from clipmind.models.timeline import Timeline, TimelineClip, TimelineSubtitle, TimelineMusic
from clipmind.models.music import Music
from clipmind.models.video import Video

router = APIRouter(prefix="/api/timelines", tags=["timelines"])


# --- Pydantic schemas for request bodies ---

class ClipIn(BaseModel):
    clip_id: int | None = None
    video_id: int
    position: int = 0
    source_start: float = 0.0
    source_end: float = 0.0
    transition: str = "cut"


class SubtitleIn(BaseModel):
    text: str
    start_time: float
    end_time: float
    style: str = "default"


class MusicIn(BaseModel):
    music_id: int
    start_time: float = 0.0
    end_time: float = 0.0
    volume: float = 0.7
    fade_in: float = 0.0
    fade_out: float = 0.0


class TimelineCreate(BaseModel):
    name: str
    location_cluster: str | None = None
    clips: list[ClipIn] = []
    subtitles: list[SubtitleIn] = []
    music: list[MusicIn] = []


class TimelineUpdate(BaseModel):
    name: str | None = None
    status: str | None = None
    clips: list[ClipIn] | None = None
    subtitles: list[SubtitleIn] | None = None
    music: list[MusicIn] | None = None


# --- Helpers ---

def _serialize_timeline(tl: Timeline, db: Session | None = None) -> dict:
    """Convert Timeline ORM object to JSON-serializable dict."""
    # Batch-fetch video info for thumbnail display
    video_map: dict[int, dict] = {}
    if db:
        video_ids = {c.video_id for c in tl.clips}
        if video_ids:
            videos = db.query(Video).filter(Video.id.in_(video_ids)).all()
            video_map = {v.id: {"thumbnail_path": v.thumbnail_path, "filename": v.filename} for v in videos}

    clips = [
        {
            "id": c.id,
            "clip_id": c.clip_id,
            "video_id": c.video_id,
            "position": c.position,
            "source_start": c.source_start,
            "source_end": c.source_end,
            "transition": c.transition,
            "thumbnail_path": video_map.get(c.video_id, {}).get("thumbnail_path"),
            "filename": video_map.get(c.video_id, {}).get("filename"),
        }
        for c in tl.clips
    ]
    subtitles = [
        {
            "id": s.id,
            "text": s.text,
            "start_time": s.start_time,
            "end_time": s.end_time,
            "style": s.style,
        }
        for s in tl.subtitles
    ]
    music = []
    for m in tl.music_tracks:
        entry = {
            "id": m.id,
            "music_id": m.music_id,
            "start_time": m.start_time,
            "end_time": m.end_time,
            "volume": m.volume,
            "fade_in": m.fade_in,
            "fade_out": m.fade_out,
            "title": None,
        }
        if db:
            track = db.get(Music, m.music_id)
            if track:
                entry["title"] = track.title
        music.append(entry)

    return {
        "id": tl.id,
        "project_id": tl.project_id,
        "name": tl.name,
        "location_cluster": tl.location_cluster,
        "status": tl.status,
        "total_duration": tl.total_duration,
        "created_at": tl.created_at.isoformat() if tl.created_at else None,
        "updated_at": tl.updated_at.isoformat() if tl.updated_at else None,
        "clips": clips,
        "subtitles": subtitles,
        "music": music,
    }


def _compute_duration(clips: list[ClipIn]) -> float:
    """Compute total timeline duration from clips."""
    return round(sum(c.source_end - c.source_start for c in clips), 2)


# --- Read endpoints ---

@router.get("/{project_id}")
def list_timelines(project_id: int, db: Session = Depends(get_db)):
    """List all timelines for a project."""
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    timelines = (
        db.query(Timeline)
        .filter(Timeline.project_id == project_id)
        .order_by(Timeline.created_at.asc())
        .all()
    )

    return [
        {
            "id": tl.id,
            "name": tl.name,
            "location_cluster": tl.location_cluster,
            "status": tl.status,
            "total_duration": tl.total_duration,
            "clip_count": len(tl.clips),
            "subtitle_count": len(tl.subtitles),
            "music_count": len(tl.music_tracks),
            "created_at": tl.created_at.isoformat() if tl.created_at else None,
            "updated_at": tl.updated_at.isoformat() if tl.updated_at else None,
        }
        for tl in timelines
    ]


@router.get("/{project_id}/{timeline_id}")
def get_timeline(project_id: int, timeline_id: int, db: Session = Depends(get_db)):
    """Get a single timeline with full clips/subtitles/music data."""
    tl = db.get(Timeline, timeline_id)
    if not tl or tl.project_id != project_id:
        raise HTTPException(404, "Timeline not found")

    return _serialize_timeline(tl, db)


# --- Write endpoints (called by Claude CLI via curl) ---

@router.post("/{project_id}")
def create_timeline(
    project_id: int,
    body: TimelineCreate,
    db: Session = Depends(get_db),
):
    """Create a new timeline with clips, subtitles, and music."""
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    tl = Timeline(
        project_id=project_id,
        name=body.name,
        location_cluster=body.location_cluster,
        status="draft",
        total_duration=_compute_duration(body.clips),
    )
    db.add(tl)
    db.flush()  # get tl.id

    for c in body.clips:
        db.add(TimelineClip(
            timeline_id=tl.id,
            clip_id=c.clip_id,
            video_id=c.video_id,
            position=c.position,
            source_start=c.source_start,
            source_end=c.source_end,
            transition=c.transition,
        ))

    for s in body.subtitles:
        db.add(TimelineSubtitle(
            timeline_id=tl.id,
            text=s.text,
            start_time=s.start_time,
            end_time=s.end_time,
            style=s.style,
        ))

    for m in body.music:
        db.add(TimelineMusic(
            timeline_id=tl.id,
            music_id=m.music_id,
            start_time=m.start_time,
            end_time=m.end_time,
            volume=m.volume,
            fade_in=m.fade_in,
            fade_out=m.fade_out,
        ))

    db.commit()
    db.refresh(tl)
    return _serialize_timeline(tl, db)


@router.put("/{timeline_id}")
def update_timeline(
    timeline_id: int,
    body: TimelineUpdate,
    db: Session = Depends(get_db),
):
    """Bulk update a timeline. Replaces clips/subtitles/music if provided."""
    tl = db.get(Timeline, timeline_id)
    if not tl:
        raise HTTPException(404, "Timeline not found")

    if body.name is not None:
        tl.name = body.name
    if body.status is not None:
        tl.status = body.status

    # Replace clips if provided
    if body.clips is not None:
        for c in tl.clips:
            db.delete(c)
        db.flush()
        for c in body.clips:
            db.add(TimelineClip(
                timeline_id=tl.id,
                clip_id=c.clip_id,
                video_id=c.video_id,
                position=c.position,
                source_start=c.source_start,
                source_end=c.source_end,
                transition=c.transition,
            ))
        tl.total_duration = _compute_duration(body.clips)

    # Replace subtitles if provided
    if body.subtitles is not None:
        for s in tl.subtitles:
            db.delete(s)
        db.flush()
        for s in body.subtitles:
            db.add(TimelineSubtitle(
                timeline_id=tl.id,
                text=s.text,
                start_time=s.start_time,
                end_time=s.end_time,
                style=s.style,
            ))

    # Replace music if provided
    if body.music is not None:
        for m in tl.music_tracks:
            db.delete(m)
        db.flush()
        for m in body.music:
            db.add(TimelineMusic(
                timeline_id=tl.id,
                music_id=m.music_id,
                start_time=m.start_time,
                end_time=m.end_time,
                volume=m.volume,
                fade_in=m.fade_in,
                fade_out=m.fade_out,
            ))

    tl.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(tl)
    return _serialize_timeline(tl, db)


@router.delete("/{timeline_id}")
def delete_timeline(timeline_id: int, db: Session = Depends(get_db)):
    """Delete a timeline and all its clips/subtitles/music."""
    tl = db.get(Timeline, timeline_id)
    if not tl:
        raise HTTPException(404, "Timeline not found")

    db.delete(tl)
    db.commit()
    return {"deleted": timeline_id}


# --- Fine-grained endpoints ---

@router.post("/{timeline_id}/clips")
def add_clip(timeline_id: int, body: ClipIn, db: Session = Depends(get_db)):
    """Add a single clip to a timeline."""
    tl = db.get(Timeline, timeline_id)
    if not tl:
        raise HTTPException(404, "Timeline not found")

    clip = TimelineClip(
        timeline_id=tl.id,
        clip_id=body.clip_id,
        video_id=body.video_id,
        position=body.position,
        source_start=body.source_start,
        source_end=body.source_end,
        transition=body.transition,
    )
    db.add(clip)
    tl.total_duration += round(body.source_end - body.source_start, 2)
    tl.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(clip)
    return {"id": clip.id, "timeline_id": tl.id, "position": clip.position}


@router.delete("/{timeline_id}/clips/{clip_record_id}")
def remove_clip(timeline_id: int, clip_record_id: int, db: Session = Depends(get_db)):
    """Remove a clip from a timeline."""
    clip = db.get(TimelineClip, clip_record_id)
    if not clip or clip.timeline_id != timeline_id:
        raise HTTPException(404, "Timeline clip not found")

    tl = db.get(Timeline, timeline_id)
    tl.total_duration = max(0, tl.total_duration - (clip.source_end - clip.source_start))
    tl.updated_at = datetime.now(timezone.utc)
    db.delete(clip)
    db.commit()
    return {"deleted": clip_record_id}


@router.put("/{timeline_id}/subtitles")
def replace_subtitles(
    timeline_id: int,
    body: list[SubtitleIn],
    db: Session = Depends(get_db),
):
    """Replace all subtitles for a timeline."""
    tl = db.get(Timeline, timeline_id)
    if not tl:
        raise HTTPException(404, "Timeline not found")

    for s in tl.subtitles:
        db.delete(s)
    db.flush()

    for s in body:
        db.add(TimelineSubtitle(
            timeline_id=tl.id,
            text=s.text,
            start_time=s.start_time,
            end_time=s.end_time,
            style=s.style,
        ))

    tl.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"timeline_id": tl.id, "subtitle_count": len(body)}


@router.put("/{timeline_id}/music")
def replace_music(
    timeline_id: int,
    body: list[MusicIn],
    db: Session = Depends(get_db),
):
    """Replace all music tracks for a timeline."""
    tl = db.get(Timeline, timeline_id)
    if not tl:
        raise HTTPException(404, "Timeline not found")

    for m in tl.music_tracks:
        db.delete(m)
    db.flush()

    for m in body:
        db.add(TimelineMusic(
            timeline_id=tl.id,
            music_id=m.music_id,
            start_time=m.start_time,
            end_time=m.end_time,
            volume=m.volume,
            fade_in=m.fade_in,
            fade_out=m.fade_out,
        ))

    tl.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"timeline_id": tl.id, "music_count": len(body)}
