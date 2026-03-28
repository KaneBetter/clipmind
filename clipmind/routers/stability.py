"""API endpoints for video stability analysis."""

import json
import logging
import os
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from clipmind.config import settings
from clipmind.database import SessionLocal, get_db
from clipmind.models.project import Project
from clipmind.models.stability import Stability
from clipmind.models.video import Video
from clipmind.services.stability import (
    analyze_stability,
    reclassify_from_curve,
    auto_threshold_for_target,
    auto_threshold_for_ratio,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/stability", tags=["stability"])

# In-memory progress tracking per project
_progress: dict[int, dict] = {}


def _resolve_video_path(video: Video) -> str:
    """Resolve actual file path for a video."""
    if os.path.exists(video.path):
        return video.path
    alt = os.path.join(settings.video_dir, video.filename)
    if os.path.exists(alt):
        return alt
    raise FileNotFoundError(f"Video not found: {video.path} or {alt}")


def _analyze_one(video_id: int, video_path: str, threshold: float) -> dict:
    """Analyze a single video and save result to DB. Runs in thread."""
    result = analyze_stability(video_path, threshold=threshold)

    db = SessionLocal()
    try:
        existing = db.query(Stability).filter(Stability.video_id == video_id).first()
        if existing:
            db.delete(existing)
            db.flush()

        stability = Stability(
            video_id=video_id,
            overall_score=result["overall_score"],
            is_stable=result["is_stable"],
            stable_ratio=result["stable_ratio"],
            stable_segments=result["stable_segments"],
            shaky_segments=result["shaky_segments"],
            shake_curve=result["shake_curve"],
            threshold=result["threshold"],
            total_frames=result["total_frames"],
            fps=result["fps"],
            analysis_time_ms=result["analysis_time_ms"],
        )
        db.add(stability)
        db.commit()

        return {"video_id": video_id, "status": "ok", "score": result["overall_score"]}
    except Exception as e:
        db.rollback()
        raise e
    finally:
        db.close()


def _run_stability_bg(
    project_id: int, threshold: float, limit: int, workers: int, location: str | None,
):
    """Run stability analysis in background thread with progress updates."""
    db = SessionLocal()
    try:
        query = (
            db.query(Video)
            .outerjoin(Stability)
            .filter(
                Video.project_id == project_id,
                Video.media_type == "video",
                Stability.id.is_(None),
            )
            .order_by(Video.id)
        )
        if location:
            query = query.filter(Video.location_label == location)
        if limit > 0:
            query = query.limit(limit)

        unanalyzed = query.all()
        if not unanalyzed:
            _progress[project_id] = {
                "status": "completed", "done": 0, "total": 0,
                "errors": 0, "skipped": 0, "percent": 100,
            }
            return

        # Resolve paths
        tasks = []
        skipped = 0
        for video in unanalyzed:
            try:
                path = _resolve_video_path(video)
                tasks.append((video.id, path))
            except FileNotFoundError:
                skipped += 1

        total = len(tasks)
        _progress[project_id] = {
            "status": "running", "done": 0, "total": total,
            "errors": 0, "skipped": skipped, "percent": 0,
        }

        analyzed = 0
        errors = 0

        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {
                pool.submit(_analyze_one, vid_id, path, threshold): vid_id
                for vid_id, path in tasks
            }
            for future in as_completed(futures):
                vid_id = futures[future]
                try:
                    future.result()
                    analyzed += 1
                except Exception as e:
                    logger.error("Stability failed: video %d: %s", vid_id, e)
                    errors += 1

                _progress[project_id] = {
                    "status": "running",
                    "done": analyzed,
                    "total": total,
                    "errors": errors,
                    "skipped": skipped,
                    "percent": round((analyzed + errors) / total * 100, 1) if total > 0 else 0,
                }

        _progress[project_id] = {
            "status": "completed",
            "done": analyzed,
            "total": total,
            "errors": errors,
            "skipped": skipped,
            "percent": 100,
        }
    except Exception as e:
        logger.error("Background stability failed: %s", e)
        _progress[project_id] = {"status": "error", "error": str(e)}
    finally:
        db.close()


@router.post("/run/{project_id}")
def run_stability_batch(
    project_id: int,
    threshold: float = Query(default=5.0, ge=0.1, le=50.0),
    limit: int = Query(default=0, ge=0),
    workers: int = Query(default=4, ge=1, le=8),
    location: str = Query(default=None, description="Filter by location_label"),
    db: Session = Depends(get_db),
):
    """Start stability analysis in background. Poll /api/stability/progress/{project_id}."""
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    current = _progress.get(project_id)
    if current and current.get("status") == "running":
        return {"message": "Already running", **current}

    _progress[project_id] = {"status": "running", "done": 0, "total": 0, "percent": 0}

    thread = threading.Thread(
        target=_run_stability_bg,
        args=(project_id, threshold, limit, workers, location),
        daemon=True,
    )
    thread.start()

    return {"message": "Stability analysis started", "status": "running"}


@router.get("/run-progress/{project_id}")
def get_run_progress(project_id: int):
    """Get background stability analysis progress."""
    progress = _progress.get(project_id)
    if not progress:
        return {"status": "idle"}
    return progress


_reclassify_progress: dict[int, dict] = {}


def _run_reclassify_bg(
    project_id: int, min_score: float, max_score: float,
    mode: str, threshold: float, target_segments: int,
    target_ratio: float, max_stable_ratio: float,
):
    """Run batch reclassify in background thread."""
    db = SessionLocal()
    try:
        query = (
            db.query(Stability)
            .join(Video)
            .filter(
                Video.project_id == project_id,
                Stability.overall_score >= min_score,
                Stability.overall_score <= max_score,
            )
        )
        if max_stable_ratio > 0:
            query = query.filter(Stability.stable_ratio < max_stable_ratio)
        rows = query.all()

        total = len(rows)
        if total == 0:
            _reclassify_progress[project_id] = {
                "status": "completed", "done": 0, "total": 0, "errors": 0, "percent": 100,
            }
            return

        _reclassify_progress[project_id] = {
            "status": "running", "done": 0, "total": total, "errors": 0, "percent": 0,
        }

        done = 0
        for stab in rows:
            curve = json.loads(stab.shake_curve or "[]")
            if not curve:
                done += 1
                continue

            if mode == "auto_avg":
                avg_shake = sum(p["v"] for p in curve) / len(curve)
                result = reclassify_from_curve(curve, stab.fps, avg_shake)
            elif mode == "target_segments":
                result = auto_threshold_for_target(curve, stab.fps, target_segments)
            elif mode == "target_ratio":
                result = auto_threshold_for_ratio(curve, stab.fps, target_ratio)
            else:
                result = reclassify_from_curve(curve, stab.fps, threshold)

            stab.stable_segments = json.dumps(result["stable_segments"])
            stab.shaky_segments = json.dumps(result["shaky_segments"])
            stab.overall_score = result["overall_score"]
            stab.stable_ratio = result["stable_ratio"]
            stab.threshold = result["threshold"]
            stab.is_stable = result["stable_ratio"] >= 0.5
            done += 1

            _reclassify_progress[project_id] = {
                "status": "running", "done": done, "total": total,
                "errors": 0, "percent": round(done / total * 100, 1),
            }

            # Commit in batches for progress visibility and DB breathing room
            if done % 50 == 0:
                db.commit()

        db.commit()
        _reclassify_progress[project_id] = {
            "status": "completed", "done": done, "total": total, "errors": 0, "percent": 100,
        }
    except Exception as e:
        db.rollback()
        logger.error("Background reclassify failed: %s", e)
        _reclassify_progress[project_id] = {"status": "error", "error": str(e)}
    finally:
        db.close()


@router.post("/batch-reclassify/{project_id}")
def batch_reclassify(
    project_id: int,
    min_score: float = Query(default=0.0, ge=0, le=100),
    max_score: float = Query(default=100.0, ge=0, le=100),
    mode: str = Query(default="auto_avg", description="fixed | auto_avg | target_segments | target_ratio"),
    threshold: float = Query(default=5.0, ge=0.1, le=50.0),
    target_segments: int = Query(default=1, ge=1, le=20),
    target_ratio: float = Query(default=0.5, ge=0.0, le=1.0),
    max_stable_ratio: float = Query(default=0.0, ge=0.0, le=1.0),
    db: Session = Depends(get_db),
):
    """Start batch reclassify in background. Poll /reclassify-progress/{project_id}."""
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    current = _reclassify_progress.get(project_id)
    if current and current.get("status") == "running":
        return {"message": "Already running", **current}

    _reclassify_progress[project_id] = {"status": "running", "done": 0, "total": 0, "percent": 0}

    thread = threading.Thread(
        target=_run_reclassify_bg,
        args=(project_id, min_score, max_score, mode, threshold, target_segments, target_ratio, max_stable_ratio),
        daemon=True,
    )
    thread.start()

    return {"message": "Reclassify started", "status": "running"}


@router.get("/reclassify-progress/{project_id}")
def get_reclassify_progress(project_id: int):
    """Get background reclassify progress."""
    progress = _reclassify_progress.get(project_id)
    if not progress:
        return {"status": "idle"}
    return progress

    return {
        "reclassified": reclassified,
        "mode": mode,
        "score_range": [min_score, max_score],
    }


@router.post("/run-single/{video_id}")
def run_single_stability(
    video_id: int,
    threshold: float = Query(default=5.0, ge=0.1, le=50.0),
    db: Session = Depends(get_db),
):
    """Analyze (or re-analyze) stability for a single video."""
    video = db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Video not found")
    if video.media_type != "video":
        raise HTTPException(400, "Stability analysis only applies to videos, not photos")

    try:
        path = _resolve_video_path(video)
    except FileNotFoundError:
        raise HTTPException(404, f"Video file not found: {video.filename}")

    try:
        result = analyze_stability(path, threshold=threshold)
    except Exception as e:
        raise HTTPException(500, f"Analysis failed: {e}")

    existing = db.query(Stability).filter(Stability.video_id == video_id).first()
    if existing:
        db.delete(existing)
        db.flush()

    stability = Stability(
        video_id=video.id,
        overall_score=result["overall_score"],
        is_stable=result["is_stable"],
        stable_ratio=result["stable_ratio"],
        stable_segments=result["stable_segments"],
        shaky_segments=result["shaky_segments"],
        shake_curve=result["shake_curve"],
        threshold=result["threshold"],
        total_frames=result["total_frames"],
        fps=result["fps"],
        analysis_time_ms=result["analysis_time_ms"],
    )
    db.add(stability)
    db.commit()
    db.refresh(stability)

    return {
        "video_id": video.id,
        "filename": video.filename,
        "overall_score": stability.overall_score,
        "is_stable": stability.is_stable,
        "stable_ratio": stability.stable_ratio,
        "stable_segments": json.loads(stability.stable_segments or "[]"),
        "shaky_segments": json.loads(stability.shaky_segments or "[]"),
        "shake_curve": json.loads(stability.shake_curve or "[]"),
        "threshold": stability.threshold,
        "analysis_time_ms": stability.analysis_time_ms,
    }


@router.put("/save-segments/{video_id}")
def save_segments(
    video_id: int,
    threshold: float = Query(..., ge=0.1, le=50.0),
    stable_segments: str = Query(..., description="JSON array of stable segments"),
    shaky_segments: str = Query(..., description="JSON array of shaky segments"),
    overall_score: float = Query(..., ge=0, le=100),
    stable_ratio: float = Query(..., ge=0, le=1),
    db: Session = Depends(get_db),
):
    """Save reclassified segments from the frontend without re-analyzing.

    Called when user adjusts threshold on the client and clicks Save.
    """
    stability = db.query(Stability).filter(Stability.video_id == video_id).first()
    if not stability:
        raise HTTPException(404, "No stability analysis found. Analyze the video first.")

    # Validate JSON
    try:
        json.loads(stable_segments)
        json.loads(shaky_segments)
    except json.JSONDecodeError:
        raise HTTPException(400, "Invalid JSON in segments")

    stability.threshold = threshold
    stability.stable_segments = stable_segments
    stability.shaky_segments = shaky_segments
    stability.overall_score = overall_score
    stability.stable_ratio = stable_ratio
    stability.is_stable = stable_ratio >= 0.5
    db.commit()

    return {
        "video_id": video_id,
        "threshold": threshold,
        "overall_score": overall_score,
        "stable_ratio": stable_ratio,
        "stable_count": len(json.loads(stable_segments)),
        "shaky_count": len(json.loads(shaky_segments)),
    }


@router.get("/status/{project_id}")
def get_stability_status(
    project_id: int,
    location: str = Query(default=None),
    db: Session = Depends(get_db),
):
    """Get stability analysis progress for a project, optionally filtered by location."""
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    video_q = db.query(Video).filter(Video.project_id == project_id, Video.media_type == "video")
    stab_q = db.query(Stability).join(Video).filter(Video.project_id == project_id)
    if location:
        video_q = video_q.filter(Video.location_label == location)
        stab_q = stab_q.filter(Video.location_label == location)

    total_videos = video_q.count()
    analyzed_videos = stab_q.count()

    return {
        "project_id": project_id,
        "total_videos": total_videos,
        "analyzed_videos": analyzed_videos,
        "unanalyzed_videos": total_videos - analyzed_videos,
        "progress_percent": (
            round((analyzed_videos / total_videos) * 100, 1)
            if total_videos > 0
            else 0
        ),
    }


@router.get("/usable-segments/{project_id}")
def get_usable_segments(
    project_id: int,
    min_duration: float = Query(default=0.5, description="Minimum segment duration (seconds)"),
    db: Session = Depends(get_db),
):
    """Get all usable (stable) segments for every video in a project.

    This is the primary data source for AI editing:
    returns which time ranges of each video are stable and can be used.
    """
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    rows = (
        db.query(Video, Stability)
        .join(Stability, Video.id == Stability.video_id)
        .filter(Video.project_id == project_id)
        .all()
    )

    result = {}
    for video, stab in rows:
        segments = json.loads(stab.stable_segments or "[]")
        # Filter by minimum duration
        usable = [
            s for s in segments
            if (s["end"] - s["start"]) >= min_duration
        ]
        total_usable = sum(s["end"] - s["start"] for s in usable)

        result[str(video.id)] = {
            "filename": video.filename,
            "thumbnail_path": video.thumbnail_path,
            "duration": video.duration,
            "overall_score": stab.overall_score,
            "usable_segments": usable,
            "usable_ratio": round(total_usable / video.duration, 3) if video.duration > 0 else 0,
            "total_usable_duration": round(total_usable, 2),
            "user_comment": video.user_comment,
        }

    return result


@router.get("/stats/{project_id}")
def get_stability_stats(project_id: int, db: Session = Depends(get_db)):
    """Get aggregated stability statistics for a project."""
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    stabilities = (
        db.query(Stability)
        .join(Video)
        .filter(Video.project_id == project_id)
        .all()
    )

    if not stabilities:
        return {
            "total_analyzed": 0,
            "avg_score": 0,
            "stable_count": 0,
            "shaky_count": 0,
            "avg_stable_ratio": 0,
            "score_distribution": {},
            "total_usable_duration": 0,
        }

    scores = [s.overall_score for s in stabilities]
    stable_count = sum(1 for s in stabilities if s.is_stable)
    ratios = [s.stable_ratio for s in stabilities]

    # Score distribution in buckets
    score_dist = {"0-20": 0, "21-40": 0, "41-60": 0, "61-80": 0, "81-100": 0}
    for sc in scores:
        if sc <= 20:
            score_dist["0-20"] += 1
        elif sc <= 40:
            score_dist["21-40"] += 1
        elif sc <= 60:
            score_dist["41-60"] += 1
        elif sc <= 80:
            score_dist["61-80"] += 1
        else:
            score_dist["81-100"] += 1

    # Total usable duration across all videos
    total_usable = 0.0
    for s in stabilities:
        segments = json.loads(s.stable_segments or "[]")
        total_usable += sum(seg["end"] - seg["start"] for seg in segments)

    return {
        "total_analyzed": len(stabilities),
        "avg_score": round(sum(scores) / len(scores), 1),
        "stable_count": stable_count,
        "shaky_count": len(stabilities) - stable_count,
        "avg_stable_ratio": round(sum(ratios) / len(ratios), 3),
        "score_distribution": score_dist,
        "total_usable_duration": round(total_usable, 1),
    }


@router.get("/{video_id}")
def get_stability(video_id: int, db: Session = Depends(get_db)):
    """Get stability analysis result for a specific video."""
    stability = db.query(Stability).filter(Stability.video_id == video_id).first()
    if not stability:
        raise HTTPException(404, "Stability analysis not found for this video")

    return {
        "id": stability.id,
        "video_id": stability.video_id,
        "overall_score": stability.overall_score,
        "is_stable": stability.is_stable,
        "stable_ratio": stability.stable_ratio,
        "stable_segments": json.loads(stability.stable_segments or "[]"),
        "shaky_segments": json.loads(stability.shaky_segments or "[]"),
        "shake_curve": json.loads(stability.shake_curve or "[]"),
        "threshold": stability.threshold,
        "total_frames": stability.total_frames,
        "fps": stability.fps,
        "analysis_time_ms": stability.analysis_time_ms,
        "created_at": stability.created_at.isoformat() if stability.created_at else None,
    }
