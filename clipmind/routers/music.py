import mimetypes
import os
import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from clipmind.config import settings
from clipmind.database import get_db
from clipmind.models.music import Music
from clipmind.models.project import Project
from clipmind.services.music_analysis import analyze_music, get_audio_duration

router = APIRouter(prefix="/api/music", tags=["music"])

MUSIC_EXTENSIONS = {".mp3", ".wav", ".flac", ".aac", ".m4a", ".ogg", ".wma"}
MUSIC_UPLOAD_DIR = Path("./data/music")

# Docker volume mapping: host music dir → container /music
CONTAINER_MUSIC_DIR = "/music"


def _resolve_music_path(path: str) -> str:
    """Resolve music file path, handling Docker volume mapping."""
    if os.path.exists(path):
        return path
    # Map host path to container path
    host_music_dir = settings.music_dir
    if host_music_dir and path.startswith(host_music_dir):
        container_path = path.replace(host_music_dir, CONTAINER_MUSIC_DIR, 1)
        if os.path.exists(container_path):
            return container_path
    return path


@router.post("/scan/{project_id}")
def scan_music(project_id: int, db: Session = Depends(get_db)):
    """Scan the music directory and import new files into the global library.

    project_id is kept for backward compatibility but music is stored globally.
    """
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    scan_dir = Path(project.music_dir) if project.music_dir else (Path(settings.music_dir) if settings.music_dir else None)
    if scan_dir is None:
        raise HTTPException(400, "No music directory configured. Set project music_dir or CLIPMIND_MUSIC_DIR env var.")
    if not scan_dir.exists():
        raise HTTPException(400, f"Music directory not found: {scan_dir}")

    # Check ALL existing paths globally (music is shared across projects)
    existing_paths = {
        m.path for m in db.query(Music.path).all()
    }

    imported = 0
    for f in sorted(scan_dir.rglob("*")):
        if not f.is_file():
            continue
        if f.suffix.lower() not in MUSIC_EXTENSIONS:
            continue
        abs_path = str(f.resolve())
        if abs_path in existing_paths:
            continue

        try:
            duration = get_audio_duration(abs_path)
        except Exception:
            duration = 0.0

        # Use subfolder/filename as title for clarity
        rel = f.relative_to(scan_dir)
        title = f"{rel.parent}/{f.stem}" if str(rel.parent) != "." else f.stem

        record = Music(
            project_id=None,
            title=title,
            path=abs_path,
            duration=duration,
        )
        db.add(record)
        imported += 1

    db.commit()
    return {"imported": imported, "scan_dir": str(scan_dir)}


@router.post("/upload/{project_id}")
def upload_music(
    project_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Upload a music file to the global library.

    project_id is kept for backward compatibility but music is stored globally.
    """
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    ext = Path(file.filename or "unknown.mp3").suffix.lower()
    if ext not in MUSIC_EXTENSIONS:
        raise HTTPException(400, f"Unsupported format: {ext}")

    MUSIC_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    dest = MUSIC_UPLOAD_DIR / file.filename
    with open(dest, "wb") as out:
        shutil.copyfileobj(file.file, out)

    abs_path = str(dest.resolve())
    try:
        duration = get_audio_duration(abs_path)
    except Exception:
        duration = 0.0

    record = Music(
        project_id=None,
        title=dest.stem,
        path=abs_path,
        duration=duration,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return {
        "id": record.id,
        "title": record.title,
        "path": record.path,
        "duration": record.duration,
    }


@router.get("/project/{project_id}")
def list_music(project_id: int, db: Session = Depends(get_db)):
    """List all music files (global library, shared across projects)."""
    records = (
        db.query(Music)
        .order_by(Music.created_at.desc())
        .all()
    )
    return [
        {
            "id": m.id,
            "title": m.title,
            "artist": m.artist,
            "path": m.path,
            "duration": m.duration,
            "bpm": m.bpm,
            "mood_tags": m.mood_tags,
            "beats": m.beats,
            "onsets": m.onsets,
            "sections": m.sections,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in records
    ]


@router.get("/{music_id}/stream")
def stream_music(music_id: int, db: Session = Depends(get_db)):
    """Stream a music file by its database ID."""
    track = db.get(Music, music_id)
    if not track:
        raise HTTPException(404, "Music not found")
    file_path = Path(track.path)
    if not file_path.exists():
        raise HTTPException(404, f"File not found: {track.path}")
    media_type, _ = mimetypes.guess_type(str(file_path))
    return FileResponse(
        path=str(file_path),
        media_type=media_type or "audio/mpeg",
        filename=file_path.name,
    )


@router.get("/{music_id}")
def get_music(music_id: int, db: Session = Depends(get_db)):
    """Get music details including beat analysis data."""
    record = db.get(Music, music_id)
    if not record:
        raise HTTPException(404, "Music not found")
    return {
        "id": record.id,
        "project_id": record.project_id,
        "title": record.title,
        "artist": record.artist,
        "path": record.path,
        "duration": record.duration,
        "bpm": record.bpm,
        "mood_tags": record.mood_tags,
        "beats": record.beats,
        "onsets": record.onsets,
        "sections": record.sections,
        "created_at": record.created_at.isoformat() if record.created_at else None,
    }


@router.post("/{music_id}/analyze")
def analyze_music_beats(music_id: int, db: Session = Depends(get_db)):
    """Run AI beat detection and rhythm analysis on a music file."""
    record = db.get(Music, music_id)
    if not record:
        raise HTTPException(404, "Music not found")

    resolved = _resolve_music_path(record.path)
    if not Path(resolved).exists():
        raise HTTPException(400, f"Music file not found: {record.path}")

    result = analyze_music(resolved)

    record.bpm = result["bpm"]
    record.beats = result["beats"]
    record.onsets = result["onsets"]
    record.sections = result["sections"]
    record.duration = result["duration"]
    db.commit()
    db.refresh(record)

    return {
        "id": record.id,
        "bpm": result["bpm"],
        "beats": result["beats"],
        "onsets": result["onsets"],
        "strength_curve": result["strength_curve"],
        "sections": result["sections"],
        "duration": result["duration"],
    }


@router.delete("/{music_id}")
def delete_music(music_id: int, db: Session = Depends(get_db)):
    """Delete a music record (does not remove the file)."""
    record = db.get(Music, music_id)
    if not record:
        raise HTTPException(404, "Music not found")
    db.delete(record)
    db.commit()
    return {"deleted": music_id}
