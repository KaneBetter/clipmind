"""API endpoints for media ingestion with background progress tracking."""

import logging
import os
import threading

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from clipmind.config import settings
from clipmind.database import SessionLocal, get_db
from clipmind.models.project import Project
from clipmind.models.video import Video
from clipmind.services.ingestion import ingest_project
from clipmind.services.thumbnail import generate_thumbnail, generate_photo_thumbnail

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ingest", tags=["ingest"])

# In-memory progress tracking per project
_progress: dict[int, dict] = {}


def _run_ingest_bg(project_id: int, video_dir: str, thumbnail_dir: str):
    """Run ingest in background thread with progress updates."""
    db = SessionLocal()
    try:
        project = db.get(Project, project_id)
        if not project:
            _progress[project_id] = {"status": "error", "error": "Project not found"}
            return

        _progress[project_id] = {"status": "running", "done": 0, "total": 0, "phase": "scanning"}

        def on_progress(done: int, total: int):
            _progress[project_id] = {
                "status": "running",
                "done": done,
                "total": total,
                "phase": "ingesting",
                "percent": round((done / total) * 100, 1) if total > 0 else 0,
            }

        stats = ingest_project(
            db, project, thumbnail_dir=thumbnail_dir,
            include_photos=False, on_progress=on_progress,
        )
        _progress[project_id] = {
            "status": "completed",
            "done": stats.get("ingested", 0),
            "total": stats.get("discovered", 0),
            "errors": stats.get("errors", 0),
            "percent": 100,
        }
    except Exception as e:
        logger.error("Background ingest failed: %s", e)
        _progress[project_id] = {"status": "error", "error": str(e)}
    finally:
        db.close()


@router.post("/{project_id}")
def trigger_ingest(project_id: int, db: Session = Depends(get_db)):
    """Start media ingestion in background. Poll /api/ingest/progress/{project_id} for status."""
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    # Check if already running
    current = _progress.get(project_id)
    if current and current.get("status") == "running":
        return {"message": "Ingest already running", **current}

    _progress[project_id] = {"status": "running", "done": 0, "total": 0, "phase": "starting"}

    thread = threading.Thread(
        target=_run_ingest_bg,
        args=(project_id, project.video_dir, settings.thumbnail_dir),
        daemon=True,
    )
    thread.start()

    return {"message": "Ingest started in background", "status": "running"}


@router.get("/progress/{project_id}")
def get_ingest_progress(project_id: int):
    """Get ingest progress for a project."""
    progress = _progress.get(project_id)
    if not progress:
        return {"status": "idle"}
    return progress


@router.post("/regenerate-thumbnail/{video_id}")
def regenerate_single_thumbnail(video_id: int, db: Session = Depends(get_db)):
    """Regenerate thumbnail for a single video/photo."""
    video = db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Video not found")

    if not video.path or not os.path.exists(video.path):
        raise HTTPException(400, "Source file not found")

    thumb_filename = f"{video.project_id}_{os.path.splitext(video.filename)[0]}.jpg"
    thumb_path = os.path.join(settings.thumbnail_dir, thumb_filename)

    if video.media_type == "photo":
        result = generate_photo_thumbnail(video.path, thumb_path)
    else:
        result = generate_thumbnail(video.path, thumb_path)

    if not result:
        raise HTTPException(500, "Thumbnail generation failed")

    video.thumbnail_path = thumb_filename
    db.commit()
    return {"thumbnail_path": thumb_filename}


@router.post("/regenerate-thumbnails/{project_id}")
def regenerate_thumbnails(project_id: int, db: Session = Depends(get_db)):
    """Regenerate all thumbnails from original video/photo files."""
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    all_media = (
        db.query(Video)
        .filter(Video.project_id == project_id, Video.is_hidden == False)
        .all()
    )
    regenerated = 0
    failed = 0

    for item in all_media:
        if not item.path:
            failed += 1
            continue

        actual_path = item.path
        if not os.path.exists(actual_path):
            failed += 1
            continue

        thumb_filename = f"{project.id}_{os.path.splitext(item.filename)[0]}.jpg"
        thumb_path = os.path.join(settings.thumbnail_dir, thumb_filename)

        if item.media_type == "photo":
            result = generate_photo_thumbnail(actual_path, thumb_path)
        else:
            result = generate_thumbnail(actual_path, thumb_path)

        if result:
            item.thumbnail_path = thumb_filename
            regenerated += 1
        else:
            failed += 1

    db.commit()
    return {"regenerated": regenerated, "failed": failed, "total": len(all_media)}
