"""Extract usable clips by combining AI analysis + stability detection."""

import json
import logging

from sqlalchemy.orm import Session

from clipmind.models.clip import Clip
from clipmind.models.video import Video
from clipmind.models.analysis import Analysis
from clipmind.models.stability import Stability

logger = logging.getLogger(__name__)

# Clip duration constraints
MIN_CLIP_SEC = 1.5
MAX_CLIP_SEC = 15.0


def extract_clips(
    db: Session,
    project_id: int,
    min_duration: float = MIN_CLIP_SEC,
    max_duration: float = MAX_CLIP_SEC,
) -> list[dict]:
    """Extract usable clips for a project.

    Combines stable segments from Stability analysis with AI metadata from Analysis.
    Each stable segment becomes a Clip with inherited scene/mood/location data.

    Returns list of created clip summaries.
    """
    # Clear existing clips for this project
    db.query(Clip).filter(Clip.project_id == project_id).delete()
    db.flush()

    # Fetch all videos with their analysis and stability data
    rows = (
        db.query(Video, Analysis, Stability)
        .outerjoin(Analysis, Video.id == Analysis.video_id)
        .outerjoin(Stability, Video.id == Stability.video_id)
        .filter(Video.project_id == project_id, Video.media_type == "video")
        .all()
    )

    created = []

    for video, analysis, stability in rows:
        segments = _get_usable_segments(video, stability, min_duration, max_duration)

        for seg in segments:
            clip = Clip(
                project_id=project_id,
                video_id=video.id,
                start_time=seg["start"],
                end_time=seg["end"],
                duration=round(seg["end"] - seg["start"], 2),
                stability_score=seg["avg_shake"],
                quality_score=analysis.quality_score if analysis else None,
                scene_type=analysis.scene_category if analysis else None,
                mood=analysis.mood if analysis else None,
                description=analysis.description if analysis else None,
                location_cluster=video.location_label,
                gps_lat=video.lat,
                gps_lon=video.lon,
                usable=True,
            )
            db.add(clip)
            created.append({
                "video_id": video.id,
                "filename": video.filename,
                "start": seg["start"],
                "end": seg["end"],
                "duration": clip.duration,
                "stability_score": seg["avg_shake"],
                "scene_type": clip.scene_type,
                "mood": clip.mood,
                "location": clip.location_cluster,
            })

    db.commit()
    logger.info("Extracted %d clips for project %d", len(created), project_id)
    return created


def _get_usable_segments(
    video: Video,
    stability: Stability | None,
    min_duration: float,
    max_duration: float,
) -> list[dict]:
    """Get usable segments from a video.

    If stability data exists, use stable segments.
    Otherwise, treat the entire video as one segment.
    """
    if stability and stability.stable_segments:
        segments = json.loads(stability.stable_segments)
    else:
        # No stability data — use whole video as one segment
        segments = [{"start": 0.0, "end": video.duration, "avg_shake": 0.0}]

    result = []
    for seg in segments:
        dur = seg["end"] - seg["start"]
        if dur < min_duration:
            continue

        # Split long segments into max_duration chunks
        if dur > max_duration:
            cursor = seg["start"]
            while cursor + min_duration <= seg["end"]:
                chunk_end = min(cursor + max_duration, seg["end"])
                if chunk_end - cursor >= min_duration:
                    result.append({
                        "start": round(cursor, 2),
                        "end": round(chunk_end, 2),
                        "avg_shake": seg.get("avg_shake", 0.0),
                    })
                cursor = chunk_end
        else:
            result.append({
                "start": round(seg["start"], 2),
                "end": round(seg["end"], 2),
                "avg_shake": seg.get("avg_shake", 0.0),
            })

    return result
