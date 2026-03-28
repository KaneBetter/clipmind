import math
import os

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from clipmind.database import get_db
from clipmind.models.video import Video
from clipmind.models.analysis import Analysis
from clipmind.models.project import Project
from clipmind.schemas.video import VideoRead
from clipmind.services.location_cluster import cluster_locations

router = APIRouter(prefix="/api/videos", tags=["videos"])


@router.post("/sync/{project_id}")
def sync_videos(project_id: int, db: Session = Depends(get_db)):
    """Check filesystem and hide videos whose files no longer exist."""
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    videos = (
        db.query(Video)
        .filter(Video.project_id == project_id, Video.is_hidden.is_(False))
        .all()
    )
    hidden_count = 0
    for video in videos:
        if not os.path.exists(video.path):
            video.is_hidden = True
            hidden_count += 1
    if hidden_count > 0:
        db.commit()
    return {"checked_count": len(videos), "hidden_count": hidden_count}


@router.post("/cluster-locations/{project_id}")
def run_cluster_locations(
    project_id: int,
    eps_km: float = Query(default=0.5, ge=0.05, le=50.0),
    db: Session = Depends(get_db),
):
    """Cluster videos by GPS into location groups."""
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    return cluster_locations(db, project_id, eps_km=eps_km)


@router.get("/locations/{project_id}")
def get_locations(project_id: int, db: Session = Depends(get_db)):
    """Get all unique location labels with counts for filter sidebar."""
    results = (
        db.query(Video.location_label, func.count(Video.id).label("count"))
        .filter(
            Video.project_id == project_id,
            Video.location_label.isnot(None),
            Video.is_hidden.is_(False),
        )
        .group_by(Video.location_label)
        .all()
    )
    return [{"label": r[0], "count": r[1]} for r in results]


@router.get("/{video_id}", response_model=VideoRead)
def get_video(video_id: int, db: Session = Depends(get_db)):
    video = (
        db.query(Video)
        .options(joinedload(Video.analysis))
        .filter(Video.id == video_id)
        .first()
    )
    if not video:
        raise HTTPException(404, "Video not found")
    return _video_to_read(video)


@router.get("")
def list_videos(
    project_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=2000),
    sort_by: str = Query("captured_at"),
    sort_order: str = Query("asc"),
    # Filters
    location_label: str | None = None,
    timeline_id: str | None = None,
    min_quality: float | None = None,
    max_quality: float | None = None,
    scene_category: str | None = None,
    mood: str | None = None,
    is_highlight: bool | None = None,
    min_duration: float | None = None,
    max_duration: float | None = None,
    has_gps: bool | None = None,
    show_hidden: bool = Query(False),
    media_type: str | None = None,
    search: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(Video).options(joinedload(Video.analysis)).filter(
        Video.project_id == project_id
    )

    if not show_hidden:
        query = query.filter(Video.is_hidden.is_(False))

    # Apply filters
    if location_label:
        query = query.filter(Video.location_label == location_label)
    if timeline_id:
        query = query.filter(Video.timeline_id == timeline_id)
    if min_duration is not None:
        query = query.filter(Video.duration >= min_duration)
    if max_duration is not None:
        query = query.filter(Video.duration <= max_duration)
    if has_gps is True:
        query = query.filter(Video.lat.isnot(None))
    elif has_gps is False:
        query = query.filter(Video.lat.is_(None))
    if media_type:
        query = query.filter(Video.media_type == media_type)
    if search:
        query = query.filter(Video.filename.ilike(f"%{search}%"))

    # Analysis-based filters (require join)
    if any(v is not None for v in [min_quality, max_quality, scene_category, mood, is_highlight]):
        query = query.join(Analysis, isouter=True)
        if min_quality is not None:
            query = query.filter(Analysis.quality_score >= min_quality)
        if max_quality is not None:
            query = query.filter(Analysis.quality_score <= max_quality)
        if scene_category:
            query = query.filter(Analysis.scene_category == scene_category)
        if mood:
            query = query.filter(Analysis.mood == mood)
        if is_highlight is not None:
            query = query.filter(Analysis.is_highlight == is_highlight)

    # Count total before pagination
    total = query.count()

    # Sort
    if sort_by == "random":
        from sqlalchemy.sql.expression import func
        query = query.order_by(func.random())
    else:
        sort_col = getattr(Video, sort_by, Video.captured_at)
        if sort_order == "desc":
            sort_col = sort_col.desc()
        query = query.order_by(sort_col)

    # Paginate
    items = query.offset((page - 1) * page_size).limit(page_size).all()

    return {
        "items": [_video_to_read(v) for v in items],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": math.ceil(total / page_size) if total > 0 else 0,
    }


@router.put("/{video_id}/comment")
def update_comment(
    video_id: int,
    comment: str = Query("", description="User comment/note for this video"),
    db: Session = Depends(get_db),
):
    """Save a user comment/note on a video for AI editing context."""
    video = db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Video not found")
    video.user_comment = comment if comment else None
    db.commit()
    return {"video_id": video_id, "user_comment": video.user_comment}


@router.put("/{video_id}/hidden")
def update_hidden_state(
    video_id: int,
    is_hidden: bool = Query(..., description="Whether this video should be hidden from browser views"),
    db: Session = Depends(get_db),
):
    """Hide or unhide a video without deleting it."""
    video = db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Video not found")
    video.is_hidden = is_hidden
    db.commit()
    return {"video_id": video_id, "is_hidden": video.is_hidden}


@router.patch("/{video_id}/override")
def override_analysis(
    video_id: int,
    user_score: float | None = None,
    user_category: str | None = None,
    user_highlight: bool | None = None,
    db: Session = Depends(get_db),
):
    """Allow user to override AI analysis results."""
    video = (
        db.query(Video)
        .options(joinedload(Video.analysis))
        .filter(Video.id == video_id)
        .first()
    )
    if not video:
        raise HTTPException(404, "Video not found")
    if not video.analysis:
        raise HTTPException(400, "Video has no analysis to override")

    if user_score is not None:
        video.analysis.user_score = user_score
    if user_category is not None:
        video.analysis.user_category = user_category
    if user_highlight is not None:
        video.analysis.user_highlight = user_highlight

    db.commit()
    return {"status": "ok"}


def _video_to_read(video: Video) -> dict:
    data = {
        "id": video.id,
        "project_id": video.project_id,
        "filename": video.filename,
        "path": video.path,
        "media_type": getattr(video, "media_type", "video"),
        "duration": video.duration,
        "width": video.width,
        "height": video.height,
        "fps": video.fps,
        "codec": video.codec,
        "file_size": video.file_size,
        "lat": video.lat,
        "lon": video.lon,
        "altitude": video.altitude,
        "captured_at": video.captured_at.isoformat() if video.captured_at else None,
        "location_label": video.location_label,
        "timeline_id": video.timeline_id,
        "thumbnail_path": video.thumbnail_path,
        "user_comment": video.user_comment,
        "is_ingested": video.is_ingested,
        "is_hidden": video.is_hidden,
        "created_at": video.created_at.isoformat() if video.created_at else None,
        "scene_category": None,
        "quality_score": None,
        "is_highlight": None,
        "mood": None,
        "description": None,
        "people_count": None,
        "audio_type": None,
        "issues": None,
        "segments": None,
        "model_version": None,
        "cost_tokens": None,
    }
    if video.analysis:
        a = video.analysis
        data["scene_category"] = a.user_category or a.scene_category
        data["quality_score"] = a.user_score or a.quality_score
        data["is_highlight"] = a.user_highlight if a.user_highlight is not None else a.is_highlight
        data["mood"] = a.mood
        data["description"] = a.description
        data["people_count"] = a.people_count
        data["audio_type"] = a.audio_type
        data["issues"] = a.issues
        data["segments"] = a.segments
        data["model_version"] = a.model_version
        data["cost_tokens"] = a.cost_tokens
    return data
