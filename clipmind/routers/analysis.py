"""API endpoints for Gemini video analysis."""

import logging
import os
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from clipmind.config import settings
from clipmind.database import SessionLocal, get_db
from clipmind.models.analysis import Analysis
from clipmind.models.project import Project
from clipmind.models.video import Video
from clipmind.services.analysis import (
    analyze_video,
    calculate_usage_cost,
    clear_gemini_file_storage,
    estimate_batch_cost,
    MODEL_PRICING,
    DEFAULT_MODEL,
    get_gemini_file_storage_usage,
    summarize_analysis_error,
)

# In-memory progress tracking per project
_analysis_progress: dict[int, dict] = {}

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/analysis", tags=["analysis"])


@router.get("/models")
def list_models():
    """Return available Gemini models with pricing."""
    from clipmind.services.analysis import get_available_models
    return get_available_models()


@router.get("/storage/usage")
def get_analysis_storage():
    """Return current Gemini Developer File API storage usage."""
    try:
        return get_gemini_file_storage_usage()
    except Exception as e:
        raise HTTPException(status_code=502, detail=summarize_analysis_error(e))


@router.post("/storage/clear")
def clear_analysis_storage(limit: int = Query(default=0, ge=0, description="Max files to delete; 0 = all")):
    """Delete remote Gemini Developer File API uploads."""
    try:
        return clear_gemini_file_storage(limit=limit)
    except Exception as e:
        raise HTTPException(status_code=502, detail=summarize_analysis_error(e))


@router.get("/stats/{project_id}")
def get_analysis_stats(project_id: int, db: Session = Depends(get_db)):
    """Get aggregated analysis statistics for a project."""
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    analyses = (
        db.query(Analysis)
        .join(Video)
        .filter(Video.project_id == project_id)
        .all()
    )

    if not analyses:
        return {
            "scene_distribution": {},
            "quality_distribution": {},
            "mood_distribution": {},
            "audio_distribution": {},
            "highlight_count": 0,
            "issues_summary": {},
            "avg_quality": 0,
            "total_analyzed": 0,
            "total_cost_tokens": 0,
            "total_cost_usd": 0.0,
            "cost_by_model": {},
            "model_usage": {},
        }

    scene_dist = {}
    quality_scores = []
    mood_dist = {}
    audio_dist = {}
    highlight_count = 0
    issues_summary = {}
    total_cost_tokens = 0
    model_usage = {}

    for a in analyses:
        # Scene distribution
        scene_dist[a.scene_category] = scene_dist.get(a.scene_category, 0) + 1

        # Quality scores
        if a.quality_score is not None:
            quality_scores.append(a.quality_score)

        # Mood distribution
        mood_dist[a.mood] = mood_dist.get(a.mood, 0) + 1

        # Audio distribution
        if a.audio_type:
            audio_dist[a.audio_type] = audio_dist.get(a.audio_type, 0) + 1

        # Highlights
        if a.is_highlight:
            highlight_count += 1

        # Issues
        if a.issues and a.issues != "none":
            for issue in a.issues.split(","):
                issue = issue.strip()
                if issue and issue != "none":
                    issues_summary[issue] = issues_summary.get(issue, 0) + 1

        # Cost tracking
        model_name = a.model_version or DEFAULT_MODEL
        if a.cost_tokens:
            total_cost_tokens += a.cost_tokens
        if a.model_version:
            model_usage[a.model_version] = model_usage.get(a.model_version, 0) + 1

    # Quality distribution in buckets
    quality_dist = {"1-3": 0, "4-5": 0, "6-7": 0, "8-9": 0, "10": 0}
    for q in quality_scores:
        if q <= 3:
            quality_dist["1-3"] += 1
        elif q <= 5:
            quality_dist["4-5"] += 1
        elif q <= 7:
            quality_dist["6-7"] += 1
        elif q <= 9:
            quality_dist["8-9"] += 1
        else:
            quality_dist["10"] += 1

    avg_quality = round(sum(quality_scores) / len(quality_scores), 1) if quality_scores else 0

    # Calculate cost in USD from usage metadata.
    # Legacy rows only have total_token_count, so fall back to duration-based
    # prompt estimation and treat the remainder as output tokens.
    total_cost_usd = 0.0
    cost_by_model = {}
    for a in analyses:
        model_name = a.model_version or DEFAULT_MODEL
        duration_seconds = a.video.duration if a.video else None
        cost = calculate_usage_cost(
            model=model_name,
            total_token_count=a.cost_tokens,
            prompt_token_count=a.prompt_token_count,
            candidate_token_count=a.candidate_token_count,
            thoughts_token_count=a.thoughts_token_count,
            prompt_tokens_details=a.prompt_tokens_details,
            duration_seconds=duration_seconds,
        )
        if cost <= 0:
            continue
        cost_by_model[model_name] = round(cost_by_model.get(model_name, 0.0) + cost, 6)
        total_cost_usd += cost
    total_cost_usd = round(total_cost_usd, 6)

    return {
        "scene_distribution": scene_dist,
        "quality_distribution": quality_dist,
        "mood_distribution": mood_dist,
        "audio_distribution": audio_dist,
        "highlight_count": highlight_count,
        "issues_summary": issues_summary,
        "avg_quality": avg_quality,
        "total_analyzed": len(analyses),
        "total_cost_tokens": total_cost_tokens,
        "total_cost_usd": total_cost_usd,
        "cost_by_model": cost_by_model,
        "model_usage": model_usage,
    }


@router.post("/estimate/{project_id}")
def estimate_analysis_cost(
    project_id: int,
    model: str = Query(default=None, description="Gemini model to use"),
    db: Session = Depends(get_db),
):
    """Estimate token cost for analyzing all unanalyzed videos in a project."""
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    # Find videos without analysis records
    unanalyzed = (
        db.query(Video)
        .outerjoin(Analysis)
        .filter(Video.project_id == project_id, Analysis.id.is_(None))
        .all()
    )

    if not unanalyzed:
        return {
            "video_count": 0,
            "total_duration_seconds": 0,
            "total_estimated_input_tokens": 0,
            "total_estimated_output_tokens": 0,
            "total_estimated_cost_usd": 0.0,
        }

    durations = [v.duration for v in unanalyzed]
    estimate = estimate_batch_cost(durations, model=model)

    # Add free vs paid tier info
    model_id = model or DEFAULT_MODEL
    pricing = MODEL_PRICING.get(model_id, MODEL_PRICING[DEFAULT_MODEL])
    is_free = pricing.get("standard_free", False)
    video_count = estimate["video_count"]

    estimate["model"] = model_id
    estimate["model_label"] = pricing.get("label", model_id)
    estimate["standard_free"] = is_free
    estimate["free_tier"] = {
        "rpm": 10,
        "rpd": 500,
        "est_days": max(1, (video_count + 499) // 500) if video_count > 0 else 0,
        "est_minutes_per_batch": round(video_count / 10, 1) if video_count <= 500 else round(500 / 10, 1),
        "cost_usd": 0.0,
    }
    estimate["paid_tier"] = {
        "rpm": 2000,
        "rpd": "unlimited",
        "est_minutes": round(video_count / 60, 1) if video_count > 0 else 0,
        "cost_usd": estimate["total_estimated_cost_usd"],
    }
    return estimate


def _analyze_one_video(video_id: int, video_path: str, filename: str, model: str | None) -> dict:
    """Analyze a single video and save to DB. Runs in worker thread."""
    result = analyze_video(video_path, model=model)

    db = SessionLocal()
    try:
        existing = db.query(Analysis).filter(Analysis.video_id == video_id).first()
        if existing:
            db.delete(existing)
            db.flush()

        analysis = Analysis(
            video_id=video_id,
            model_version=result["model_version"],
            scene_category=result["scene_category"],
            quality_score=result["quality_score"],
            is_highlight=result["is_highlight"],
            mood=result["mood"],
            description=result["description"],
            people_count=result["people_count"],
            audio_type=result["audio_type"],
            issues=result["issues"],
            segments=result["segments"],
            raw_response=result["raw_response"],
            cost_tokens=result["cost_tokens"],
            prompt_token_count=result["prompt_token_count"],
            candidate_token_count=result["candidate_token_count"],
            thoughts_token_count=result["thoughts_token_count"],
            prompt_tokens_details=result["prompt_tokens_details"],
        )
        db.add(analysis)
        db.commit()
        return {"video_id": video_id, "status": "ok"}
    except Exception as e:
        db.rollback()
        raise e
    finally:
        db.close()


def _run_analysis_bg(project_id: int, model: str | None, limit: int, location: str | None, workers: int = 1):
    """Run Gemini analysis in background with parallel workers."""
    db = SessionLocal()
    try:
        query = (
            db.query(Video)
            .outerjoin(Analysis)
            .filter(Video.project_id == project_id, Analysis.id.is_(None))
            .order_by(Video.id)
        )
        if location:
            query = query.filter(Video.location_label == location)
        if limit > 0:
            query = query.limit(limit)

        unanalyzed = query.all()
        if not unanalyzed:
            _analysis_progress[project_id] = {
                "status": "completed", "done": 0, "total": 0,
                "errors": 0, "percent": 100, "last_error": None,
            }
            return

        # Resolve paths before spawning threads
        video_dir = settings.video_dir
        tasks = []
        for video in unanalyzed:
            actual_path = video.path
            if not os.path.exists(actual_path):
                actual_path = os.path.join(video_dir, video.filename)
            tasks.append((video.id, actual_path, video.filename))

        total = len(tasks)
        _analysis_progress[project_id] = {
            "status": "running", "done": 0, "total": total,
            "errors": 0, "percent": 0, "last_error": None,
        }

        analyzed_count = 0
        error_count = 0
        last_error = None

        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {
                pool.submit(_analyze_one_video, vid_id, path, fname, model): vid_id
                for vid_id, path, fname in tasks
            }
            for future in as_completed(futures):
                vid_id = futures[future]
                try:
                    future.result()
                    analyzed_count += 1
                    logger.info("Analysis done: video %d (%d/%d)", vid_id, analyzed_count, total)
                except Exception as e:
                    logger.error("Analysis failed: video %d: %s", vid_id, e)
                    error_count += 1
                    last_error = summarize_analysis_error(e)

                _analysis_progress[project_id] = {
                    "status": "running",
                    "done": analyzed_count,
                    "total": total,
                    "errors": error_count,
                    "percent": round((analyzed_count + error_count) / total * 100, 1) if total > 0 else 0,
                    "last_error": last_error if error_count > 0 else None,
                }

        _analysis_progress[project_id] = {
            "status": "completed",
            "done": analyzed_count,
            "total": total,
            "errors": error_count,
            "percent": 100,
            "last_error": last_error if error_count > 0 else None,
        }
    except Exception as e:
        logger.error("Background analysis failed: %s", e)
        error_message = summarize_analysis_error(e)
        _analysis_progress[project_id] = {"status": "error", "error": error_message, "last_error": error_message}
    finally:
        db.close()


@router.post("/run/{project_id}")
def run_analysis(
    project_id: int,
    model: str = Query(default=None, description="Gemini model to use"),
    limit: int = Query(default=0, ge=0, description="Max videos to analyze (0 = all)"),
    location: str = Query(default=None, description="Filter by location_label"),
    workers: int = Query(default=1, ge=1, le=8, description="Parallel workers"),
    db: Session = Depends(get_db),
):
    """Start analysis in background. Poll /api/analysis/run-progress/{project_id}."""
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    if not settings.gemini_api_key:
        raise HTTPException(400, "Gemini API key is not configured")

    current = _analysis_progress.get(project_id)
    if current and current.get("status") == "running":
        return {"message": "Already running", **current}

    _analysis_progress[project_id] = {
        "status": "running",
        "done": 0,
        "total": 0,
        "errors": 0,
        "percent": 0,
        "last_error": None,
    }

    thread = threading.Thread(
        target=_run_analysis_bg,
        args=(project_id, model, limit, location, workers),
        daemon=True,
    )
    thread.start()

    return {"message": "Analysis started in background", "status": "running"}


@router.get("/run-progress/{project_id}")
def get_analysis_run_progress(project_id: int):
    """Get background analysis progress."""
    progress = _analysis_progress.get(project_id)
    if not progress:
        return {"status": "idle"}
    return progress


@router.get("/status/{project_id}")
def get_analysis_status(
    project_id: int,
    location: str = Query(default=None),
    db: Session = Depends(get_db),
):
    """Get analysis progress for a project, optionally filtered by location."""
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    video_q = db.query(Video).filter(Video.project_id == project_id)
    analysis_q = db.query(Analysis).join(Video).filter(Video.project_id == project_id)
    if location:
        video_q = video_q.filter(Video.location_label == location)
        analysis_q = analysis_q.filter(Video.location_label == location)

    total_videos = video_q.count()
    analyzed_videos = analysis_q.count()

    return {
        "project_id": project_id,
        "location": location,
        "total_videos": total_videos,
        "analyzed_videos": analyzed_videos,
        "unanalyzed_videos": total_videos - analyzed_videos,
        "progress_percent": round((analyzed_videos / total_videos) * 100, 1) if total_videos > 0 else 0,
    }


@router.post("/run-single/{video_id}")
def run_single_analysis(
    video_id: int,
    model: str = Query(default=None, description="Gemini model to use"),
    db: Session = Depends(get_db),
):
    """Analyze (or re-analyze) a single video."""
    video = db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Video not found")

    if not settings.gemini_api_key:
        raise HTTPException(400, "Gemini API key is not configured")

    video_dir = settings.video_dir
    actual_path = video.path
    if not os.path.exists(actual_path):
        actual_path = os.path.join(video_dir, video.filename)
    if not os.path.exists(actual_path):
        raise HTTPException(404, f"Video file not found: {video.filename}")

    try:
        result = analyze_video(actual_path, model=model)
    except Exception as e:
        raise HTTPException(500, f"Analysis failed: {e}")

    # Upsert: delete old analysis if exists, create new
    existing = db.query(Analysis).filter(Analysis.video_id == video_id).first()
    if existing:
        db.delete(existing)
        db.flush()

    analysis = Analysis(
        video_id=video.id,
        model_version=result["model_version"],
        scene_category=result["scene_category"],
        quality_score=result["quality_score"],
        is_highlight=result["is_highlight"],
        mood=result["mood"],
        description=result["description"],
        people_count=result["people_count"],
        audio_type=result["audio_type"],
        issues=result["issues"],
        segments=result["segments"],
        raw_response=result["raw_response"],
        cost_tokens=result["cost_tokens"],
        prompt_token_count=result["prompt_token_count"],
        candidate_token_count=result["candidate_token_count"],
        thoughts_token_count=result["thoughts_token_count"],
        prompt_tokens_details=result["prompt_tokens_details"],
    )
    db.add(analysis)
    db.commit()
    db.refresh(analysis)

    return {
        "video_id": video.id,
        "model_version": analysis.model_version,
        "scene_category": analysis.scene_category,
        "quality_score": analysis.quality_score,
        "is_highlight": analysis.is_highlight,
        "mood": analysis.mood,
        "description": analysis.description,
        "people_count": analysis.people_count,
        "audio_type": analysis.audio_type,
        "issues": analysis.issues,
        "segments": analysis.segments,
        "cost_tokens": analysis.cost_tokens,
    }


@router.get("/{video_id}")
def get_analysis(video_id: int, db: Session = Depends(get_db)):
    """Get full analysis for a specific video."""
    analysis = db.query(Analysis).filter(Analysis.video_id == video_id).first()
    if not analysis:
        raise HTTPException(404, "Analysis not found for this video")

    return {
        "id": analysis.id,
        "video_id": analysis.video_id,
        "model_version": analysis.model_version,
        "scene_category": analysis.scene_category,
        "quality_score": analysis.quality_score,
        "is_highlight": analysis.is_highlight,
        "mood": analysis.mood,
        "description": analysis.description,
        "people_count": analysis.people_count,
        "audio_type": analysis.audio_type,
        "issues": analysis.issues,
        "segments": analysis.segments,
        "raw_response": analysis.raw_response,
        "cost_tokens": analysis.cost_tokens,
        "user_score": analysis.user_score,
        "user_category": analysis.user_category,
        "user_highlight": analysis.user_highlight,
        "created_at": analysis.created_at.isoformat() if analysis.created_at else None,
    }
