import mimetypes
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from clipmind.config import settings
from clipmind.database import get_db
from clipmind.models.video import Video
from clipmind.routers import projects, videos, ingest, analysis, copywrite, export, stability, music, timeline, clips

app = FastAPI(title=settings.app_name, version="0.1.0")

cors_origins = os.environ.get("CLIPMIND_CORS_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve thumbnails as static files
thumbnail_path = Path(settings.thumbnail_dir)
thumbnail_path.mkdir(parents=True, exist_ok=True)
app.mount("/thumbnails", StaticFiles(directory=str(thumbnail_path)), name="thumbnails")


app.include_router(projects.router)
app.include_router(videos.router)
app.include_router(ingest.router)
app.include_router(analysis.router)
app.include_router(copywrite.router)
app.include_router(export.router)
app.include_router(stability.router)
app.include_router(music.router)
app.include_router(timeline.router)
app.include_router(clips.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "app": settings.app_name}


@app.post("/api/resolve-folder")
def resolve_folder(body: dict):
    """Given a sample filename from webkitdirectory input, find the full folder path on disk."""
    from pathlib import Path as P
    filename = body.get("filename", "")
    relative_path = body.get("relative_path", "")  # e.g. "视频/video1.mov"
    if not filename:
        return {"error": "No filename provided"}

    # The relative_path from webkitdirectory is "folder/subfolder/file.ext"
    # We want the parent directory of the file
    if relative_path:
        # Search common locations for this relative path
        for base in ["/Users", "/home", "/Volumes"]:
            base_p = P(base)
            if not base_p.exists():
                continue
            # Walk user dirs
            for user_dir in base_p.iterdir():
                if not user_dir.is_dir():
                    continue
                candidate = user_dir / relative_path
                if candidate.exists():
                    return {"path": str(candidate.parent)}
                # Also check common media dirs
                for sub in ["Movies", "Documents", "Desktop", "Downloads", "Music", "Pictures"]:
                    candidate = user_dir / sub / relative_path
                    if candidate.exists():
                        return {"path": str(candidate.parent)}

    return {"error": f"Could not resolve path for {filename}"}


@app.get("/api/media/{video_id}/stream")
def stream_media(video_id: int, db: Session = Depends(get_db)):
    """Stream a video or serve a photo file by its database ID."""
    video = db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Media not found")

    file_path = Path(video.path)
    if not file_path.exists():
        # Try mapping to current video_dir (for Docker)
        file_path = Path(settings.video_dir) / video.filename
    if not file_path.exists():
        raise HTTPException(404, f"File not found: {video.path}")

    # Convert HEIC/HEIF to JPEG on-the-fly (browsers can't render HEIC)
    if file_path.suffix.lower() in (".heic", ".heif"):
        cache_dir = Path(settings.thumbnail_dir) / "converted"
        cache_dir.mkdir(parents=True, exist_ok=True)
        converted_path = cache_dir / f"{file_path.stem}.jpg"

        if not converted_path.exists():
            try:
                if shutil.which("magick"):
                    subprocess.run(
                        [
                            "magick", str(file_path),
                            "-quality", "85",
                            str(converted_path),
                        ],
                        capture_output=True, timeout=30, check=True,
                    )
                elif shutil.which("sips"):
                    subprocess.run(
                        ["sips", "-s", "format", "jpeg", "-s", "formatOptions", "85",
                         str(file_path), "--out", str(converted_path)],
                        capture_output=True, timeout=30, check=True,
                    )
                else:
                    raise RuntimeError("No HEIC converter available (need ImageMagick or sips)")
            except RuntimeError:
                raise HTTPException(500, "Failed to convert HEIC to JPEG: no converter available")
            except Exception:
                raise HTTPException(500, "Failed to convert HEIC to JPEG")

        return FileResponse(
            path=str(converted_path),
            media_type="image/jpeg",
        )

    media_type, _ = mimetypes.guess_type(str(file_path))
    if not media_type:
        media_type = "application/octet-stream"

    return FileResponse(
        path=str(file_path),
        media_type=media_type,
        filename=video.filename,
    )
