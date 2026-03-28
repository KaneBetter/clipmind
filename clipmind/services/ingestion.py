import logging
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from sqlalchemy.orm import Session

from clipmind.models.project import Project
from clipmind.models.video import Video
from clipmind.services.metadata import extract_video_metadata, extract_gps_from_exiftool
from clipmind.services.thumbnail import generate_thumbnail, generate_photo_thumbnail

logger = logging.getLogger(__name__)

VIDEO_EXTENSIONS = {".mov", ".mp4", ".avi", ".mkv", ".m4v"}
PHOTO_EXTENSIONS = {".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp", ".gif", ".tiff"}


def _process_video(project_id: int, filepath: Path, thumbnail_dir: str) -> dict:
    """Process a single video file — extract metadata, GPS, thumbnail."""
    meta = extract_video_metadata(str(filepath))
    gps = extract_gps_from_exiftool(str(filepath))

    thumb_filename = f"{project_id}_{filepath.stem}.jpg"
    thumb_path = os.path.join(thumbnail_dir, thumb_filename)
    thumb_result = generate_thumbnail(str(filepath), thumb_path)

    return {
        "filename": filepath.name,
        "path": str(filepath),
        "media_type": "video",
        "duration": meta.get("duration", 0.0),
        "width": meta.get("width"),
        "height": meta.get("height"),
        "fps": meta.get("fps"),
        "codec": meta.get("codec"),
        "file_size": meta.get("file_size"),
        "lat": gps.get("lat"),
        "lon": gps.get("lon"),
        "altitude": gps.get("altitude"),
        "captured_at": gps.get("captured_at"),
        "thumbnail_path": thumb_filename if thumb_result else None,
    }


def _process_photo(project_id: int, filepath: Path, thumbnail_dir: str) -> dict:
    """Process a single photo — extract GPS, thumbnail."""
    gps = extract_gps_from_exiftool(str(filepath))
    file_size = filepath.stat().st_size if filepath.exists() else None

    thumb_filename = f"{project_id}_{filepath.stem}.jpg"
    thumb_path = os.path.join(thumbnail_dir, thumb_filename)
    thumb_result = generate_photo_thumbnail(str(filepath), thumb_path)

    return {
        "filename": filepath.name,
        "path": str(filepath),
        "media_type": "photo",
        "duration": 0.0,
        "file_size": file_size,
        "lat": gps.get("lat"),
        "lon": gps.get("lon"),
        "altitude": gps.get("altitude"),
        "captured_at": gps.get("captured_at"),
        "thumbnail_path": thumb_filename if thumb_result else None,
    }


def ingest_project(
    db: Session,
    project: Project,
    thumbnail_dir: str = "./data/thumbnails",
    include_photos: bool = True,
    workers: int = 8,
    on_progress: callable = None,
) -> dict:
    """Scan project video_dir, extract metadata, generate thumbnails, save to DB.

    Uses ThreadPoolExecutor for parallel processing.
    Also scans a sibling '照片' directory for photos if include_photos is True.
    """
    # Try project.video_dir first; fallback to settings.video_dir (Docker mount)
    video_dir = Path(project.video_dir)
    if not video_dir.exists():
        from clipmind.config import settings
        video_dir = Path(settings.video_dir)
    if not video_dir.exists():
        return {"error": f"Directory not found: {video_dir}", "discovered": 0, "ingested": 0}

    existing = {v.filename for v in project.videos} | {v.path for v in project.videos}

    # Discover files
    all_media: list[tuple[str, Path]] = []
    for f in sorted(video_dir.iterdir()):
        if f.is_file() and f.suffix.lower() in VIDEO_EXTENSIONS:
            if f.name not in existing and str(f) not in existing:
                all_media.append(("video", f))

    if include_photos:
        photo_dir = video_dir.parent / "照片"
        if photo_dir.exists():
            for f in sorted(photo_dir.iterdir()):
                if f.is_file() and f.suffix.lower() in PHOTO_EXTENSIONS:
                    if f.name not in existing and str(f) not in existing:
                        all_media.append(("photo", f))

    if not all_media:
        skipped = sum(1 for f in video_dir.iterdir() if f.is_file())
        return {"discovered": skipped, "ingested": 0, "skipped": skipped}

    logger.info("Ingesting %d files with %d workers", len(all_media), workers)

    # Process in parallel
    results: list[dict] = []
    errors: list[dict] = []

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {}
        for media_type, filepath in all_media:
            if media_type == "video":
                fut = pool.submit(_process_video, project.id, filepath, thumbnail_dir)
            else:
                fut = pool.submit(_process_photo, project.id, filepath, thumbnail_dir)
            futures[fut] = filepath.name

        done = 0
        for future in as_completed(futures):
            fname = futures[future]
            done += 1
            try:
                result = future.result()
                results.append(result)
                if on_progress:
                    on_progress(done, len(all_media))
                if done % 50 == 0 or done == len(all_media):
                    logger.info("Ingest progress: %d/%d", done, len(all_media))
            except Exception as e:
                logger.error("Failed to process %s: %s", fname, e)
                errors.append({"filename": fname, "error": str(e)})

    # Bulk insert
    for r in results:
        video = Video(
            project_id=project.id,
            filename=r["filename"],
            path=r["path"],
            media_type=r["media_type"],
            duration=r.get("duration", 0.0),
            width=r.get("width"),
            height=r.get("height"),
            fps=r.get("fps"),
            codec=r.get("codec"),
            file_size=r.get("file_size"),
            lat=r.get("lat"),
            lon=r.get("lon"),
            altitude=r.get("altitude"),
            captured_at=r.get("captured_at"),
            thumbnail_path=r.get("thumbnail_path"),
            is_ingested=True,
        )
        db.add(video)

    db.commit()

    return {
        "discovered": len(all_media),
        "ingested": len(results),
        "errors": len(errors),
        "errors_detail": errors[:10] if errors else [],
    }
