"""API endpoints for usable clip extraction and management."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from clipmind.database import get_db
from clipmind.models.clip import Clip
from clipmind.models.project import Project
from clipmind.services.clip_extraction import extract_clips

router = APIRouter(prefix="/api/clips", tags=["clips"])


@router.post("/extract/{project_id}")
def run_extraction(
    project_id: int,
    min_duration: float = Query(default=1.5, ge=0.5, le=10.0),
    max_duration: float = Query(default=15.0, ge=2.0, le=60.0),
    db: Session = Depends(get_db),
):
    """Extract usable clips from AI analysis + stability data."""
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    clips = extract_clips(db, project_id, min_duration, max_duration)
    return {"extracted": len(clips), "clips": clips}


@router.get("/{project_id}")
def list_clips(
    project_id: int,
    location: str | None = Query(default=None),
    usable: bool | None = Query(default=None),
    scene: str | None = Query(default=None),
    mood: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """List clips for a project with optional filters."""
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    query = db.query(Clip).filter(Clip.project_id == project_id)

    if location is not None:
        query = query.filter(Clip.location_cluster == location)
    if usable is not None:
        query = query.filter(Clip.usable == usable)
    if scene is not None:
        query = query.filter(Clip.scene_type == scene)
    if mood is not None:
        query = query.filter(Clip.mood == mood)

    clips = query.order_by(Clip.video_id, Clip.start_time).all()

    return [
        {
            "id": c.id,
            "video_id": c.video_id,
            "start_time": c.start_time,
            "end_time": c.end_time,
            "duration": c.duration,
            "stability_score": c.stability_score,
            "quality_score": c.quality_score,
            "scene_type": c.scene_type,
            "mood": c.mood,
            "description": c.description,
            "location_cluster": c.location_cluster,
            "gps_lat": c.gps_lat,
            "gps_lon": c.gps_lon,
            "usable": c.usable,
        }
        for c in clips
    ]


@router.get("/{project_id}/summary")
def clips_summary(project_id: int, db: Session = Depends(get_db)):
    """Summary of clips grouped by location."""
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    rows = (
        db.query(
            Clip.location_cluster,
            func.count(Clip.id).label("count"),
            func.sum(Clip.duration).label("total_duration"),
            func.avg(Clip.stability_score).label("avg_stability"),
        )
        .filter(Clip.project_id == project_id, Clip.usable.is_(True))
        .group_by(Clip.location_cluster)
        .all()
    )

    total_clips = sum(r.count for r in rows)
    total_duration = sum(r.total_duration or 0 for r in rows)

    locations = [
        {
            "location": r.location_cluster or "(unknown)",
            "clip_count": r.count,
            "total_duration": round(r.total_duration or 0, 1),
            "avg_stability": round(r.avg_stability or 0, 1),
        }
        for r in rows
    ]

    return {
        "total_clips": total_clips,
        "total_duration": round(total_duration, 1),
        "locations": locations,
    }


@router.patch("/{clip_id}")
def update_clip(
    clip_id: int,
    usable: bool | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """Update clip properties (e.g., mark as usable/unusable)."""
    clip = db.get(Clip, clip_id)
    if not clip:
        raise HTTPException(404, "Clip not found")

    if usable is not None:
        clip.usable = usable

    db.commit()
    return {"id": clip.id, "usable": clip.usable}
