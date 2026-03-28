"""CapCut Mate export service -- generates JianYing/CapCut drafts from Timeline DB."""
import json
import os
import shutil
import uuid
from urllib.parse import quote

import requests
from sqlalchemy.orm import Session

from clipmind.config import settings
from clipmind.models.timeline import Timeline
from clipmind.models.video import Video
from clipmind.models.music import Music

SEC = 1_000_000  # 1 second in microseconds
MAX_FILE_SIZE = 190_000_000  # 190MB — CapCut Mate rejects files > 200MB


def api_call(endpoint: str, payload: dict) -> dict:
    """Call CapCut Mate API."""
    url = f"{settings.capcut_mate_url}/{endpoint}"
    resp = requests.post(url, json=payload, timeout=300)
    resp.raise_for_status()
    data = resp.json()
    if data.get("code") != 0:
        raise RuntimeError(f"CapCut Mate API error on {endpoint}: {data}")
    return data


def _add_timeline_to_draft(
    db: Session,
    tl: Timeline,
    draft_url: str,
    offset_us: int = 0,
    path_map: dict | None = None,
) -> tuple[int, int, int, int]:
    """Add one timeline's clips/music/captions to an existing draft.

    path_map: if provided, collects video_material_id → original_local_path mapping.
    Returns: (duration_us, video_count, music_count, caption_count)
    """
    # Add video clips
    video_count = 0
    video_infos = []
    original_paths: list[str] = []  # parallel to video_infos
    cursor = 0

    for tc in sorted(tl.clips, key=lambda c: c.position):
        video = db.get(Video, tc.video_id)
        if not video:
            continue

        # Skip files that exceed CapCut Mate's size limit
        if video.file_size and video.file_size > MAX_FILE_SIZE:
            clip_duration = tc.source_end - tc.source_start
            if clip_duration <= 0:
                clip_duration = video.duration
            cursor += int(clip_duration * SEC)
            continue

        file_url = _build_video_url(video.path, video.filename)
        if not file_url:
            continue

        clip_duration = tc.source_end - tc.source_start
        if clip_duration <= 0:
            clip_duration = video.duration

        duration_us = int(clip_duration * SEC)
        video_infos.append({
            "video_url": file_url,
            "start": offset_us + cursor,
            "end": offset_us + cursor + duration_us,
            "duration": int(video.duration * SEC),
            "volume": 0.0,
        })
        original_paths.append(video.path)
        cursor += duration_us
        video_count += 1

    # Batch add_videos in chunks, collect video_ids for path mapping
    BATCH_SIZE = 30
    path_idx = 0
    for i in range(0, len(video_infos), BATCH_SIZE):
        batch = video_infos[i:i + BATCH_SIZE]
        batch_paths = original_paths[i:i + BATCH_SIZE]
        try:
            resp = api_call("add_videos", {
                "draft_url": draft_url,
                "video_infos": json.dumps(batch),
            })
            # Map video_ids to original local paths
            if path_map is not None:
                vid_ids = resp.get("video_ids") or []
                for j, vid_id in enumerate(vid_ids):
                    if j < len(batch_paths):
                        path_map[vid_id] = batch_paths[j]
        except Exception as e:
            print(f"Warning: add_videos batch {i // BATCH_SIZE} failed: {e}")

    # Add music tracks
    music_count = 0
    for tm in tl.music_tracks:
        music = db.get(Music, tm.music_id)
        if not music:
            continue
        music_url = _build_music_url(music.path)
        if not music_url:
            continue
        audio_infos = [{
            "audio_url": music_url,
            "start": offset_us + int(tm.start_time * SEC),
            "end": offset_us + int(tm.end_time * SEC),
            "volume": tm.volume,
        }]
        try:
            resp = api_call("add_audios", {
                "draft_url": draft_url,
                "audio_infos": json.dumps(audio_infos),
            })
            # Map audio material to original path
            if path_map is not None:
                audio_ids = resp.get("audio_ids") or []
                for aid in audio_ids:
                    path_map[aid] = music.path
            music_count += 1
        except Exception as e:
            print(f"Warning: failed to add music {tm.music_id}: {e}")

    # Add subtitles as captions
    caption_items = []
    for ts in tl.subtitles:
        if not ts.text:
            continue
        caption_items.append({
            "start": offset_us + int(ts.start_time * SEC),
            "end": offset_us + int(ts.end_time * SEC),
            "text": ts.text,
        })

    if caption_items:
        try:
            api_call("add_captions", {
                "draft_url": draft_url,
                "captions": json.dumps(caption_items),
                "font_size": 15,
                "bold": True,
                "has_shadow": True,
                "alignment": 1,
            })
        except Exception as e:
            print(f"Warning: failed to add captions: {e}")

    return (cursor, video_count, music_count, len(caption_items))


def _rewrite_draft_paths(draft_dir: str, path_map: dict[str, str]) -> int:
    """Rewrite draft_content.json to use original local paths instead of copies.

    Returns number of paths replaced.
    """
    content_file = os.path.join(draft_dir, "draft_content.json")
    if not os.path.exists(content_file):
        return 0

    with open(content_file, "r") as f:
        draft = json.load(f)

    replaced = 0
    materials = draft.get("materials", {})

    # Rewrite video paths
    for video_mat in materials.get("videos", []):
        mat_id = video_mat.get("material_id") or video_mat.get("id")
        if mat_id and mat_id in path_map:
            video_mat["path"] = path_map[mat_id]
            video_mat["material_name"] = os.path.basename(path_map[mat_id])
            replaced += 1

    # Rewrite audio paths
    for audio_mat in materials.get("audios", []):
        mat_id = audio_mat.get("material_id") or audio_mat.get("id")
        if mat_id and mat_id in path_map:
            audio_mat["path"] = path_map[mat_id]
            audio_mat["material_name"] = os.path.basename(path_map[mat_id])
            replaced += 1

    with open(content_file, "w") as f:
        json.dump(draft, f, ensure_ascii=False)

    # Delete downloaded copies to save disk space
    assets_videos = os.path.join(draft_dir, "assets", "videos")
    if os.path.exists(assets_videos):
        shutil.rmtree(assets_videos)
        print(f"  Deleted {assets_videos}")

    assets_audios = os.path.join(draft_dir, "assets", "audios")
    if os.path.exists(assets_audios):
        shutil.rmtree(assets_audios)
        print(f"  Deleted {assets_audios}")

    return replaced


def export_timeline(
    db: Session,
    timeline_id: int,
    draft_name: str | None = None,
) -> dict:
    """Export a Timeline from DB to a CapCut Mate draft."""
    tl = db.get(Timeline, timeline_id)
    if not tl:
        raise ValueError(f"Timeline {timeline_id} not found")

    if not draft_name:
        draft_name = f"ClipMind - {tl.name}"

    result = api_call("create_draft", {"width": 1920, "height": 1080})
    draft_url = result["draft_url"]

    path_map: dict[str, str] = {}
    dur_us, vc, mc, cc = _add_timeline_to_draft(
        db, tl, draft_url, offset_us=0, path_map=path_map,
    )

    api_call("save_draft", {"draft_url": draft_url})

    draft_id = _extract_draft_id(draft_url)
    local_path = os.path.expanduser(
        f"~/code/capcut-mate/output/draft/{draft_id}"
    ) if draft_id else ""

    # Rewrite paths to originals, delete copies
    if local_path and path_map:
        n = _rewrite_draft_paths(local_path, path_map)
        print(f"  Rewrote {n} material paths to originals")

    return {
        "draft_id": draft_id,
        "draft_url": draft_url,
        "output_path": local_path,
        "video_count": vc,
        "subtitle_count": cc,
        "music_count": mc,
        "draft_name": draft_name,
    }


def export_all_timelines(
    db: Session,
    project_id: int,
    draft_name: str | None = None,
) -> dict:
    """Export ALL timelines for a project into a single CapCut Mate draft."""
    from clipmind.models.project import Project

    project = db.get(Project, project_id)
    if not project:
        raise ValueError(f"Project {project_id} not found")

    timelines = (
        db.query(Timeline)
        .filter(Timeline.project_id == project_id)
        .order_by(Timeline.created_at.asc())
        .all()
    )
    if not timelines:
        raise ValueError(f"No timelines found for project {project_id}")

    if not draft_name:
        draft_name = f"ClipMind - {project.name} (All)"

    result = api_call("create_draft", {"width": 1920, "height": 1080})
    draft_url = result["draft_url"]

    global_cursor = 0
    total_videos = 0
    total_music = 0
    total_captions = 0
    path_map: dict[str, str] = {}

    failed_timelines = []
    for tl in timelines:
        try:
            dur_us, vc, mc, cc = _add_timeline_to_draft(
                db, tl, draft_url, offset_us=global_cursor, path_map=path_map,
            )
            global_cursor += dur_us
            total_videos += vc
            total_music += mc
            total_captions += cc
            print(f"  Added timeline #{tl.id} {tl.name} ({dur_us / SEC:.1f}s)")
        except Exception as e:
            skip_dur = int((tl.total_duration or 0) * SEC)
            global_cursor += skip_dur
            failed_timelines.append(tl.name)
            print(f"  FAILED timeline #{tl.id} {tl.name}: {e}")

    api_call("save_draft", {"draft_url": draft_url})

    draft_id = _extract_draft_id(draft_url)
    local_path = os.path.expanduser(
        f"~/code/capcut-mate/output/draft/{draft_id}"
    ) if draft_id else ""

    # Rewrite paths to originals, delete copies
    if local_path and path_map:
        n = _rewrite_draft_paths(local_path, path_map)
        print(f"  Rewrote {n} material paths to originals")

    return {
        "draft_id": draft_id,
        "draft_url": draft_url,
        "output_path": local_path,
        "timeline_count": len(timelines),
        "video_count": total_videos,
        "subtitle_count": total_captions,
        "music_count": total_music,
        "total_duration_sec": round(global_cursor / SEC, 2),
        "draft_name": draft_name,
    }


def _extract_draft_id(draft_url: str) -> str:
    """Extract draft_id parameter from a CapCut Mate draft URL."""
    from urllib.parse import urlparse, parse_qs
    parsed = urlparse(draft_url)
    params = parse_qs(parsed.query)
    ids = params.get("draft_id", [])
    return ids[0] if ids else ""


def _build_video_url(path: str, filename: str) -> str | None:
    """Build file server URL for a video file."""
    rel_path = f"视频/{quote(filename)}"
    return (
        f"http://{settings.file_server_host}:{settings.file_server_port}"
        f"/{rel_path}"
    )


def _build_music_url(path: str) -> str | None:
    """Build file server URL for a music file."""
    basename = os.path.basename(path)
    rel_path = f"music/{quote(basename)}"
    return (
        f"http://{settings.file_server_host}:{settings.file_server_port}"
        f"/{rel_path}"
    )


def fix_docker_path(path: str) -> str:
    """Convert Docker internal paths to local macOS paths."""
    if "/app/output/" in path:
        path = path.replace(
            "/app/output/draft/",
            os.path.expanduser("~/code/capcut-mate/output/draft/"),
        )
    return path


def register_in_jianying(draft_path: str, draft_name: str) -> str | None:
    """Register a draft in JianYing's draft directory via symlink."""
    jianying_drafts = os.path.expanduser(
        "~/Movies/JianyingPro/User Data/Projects/com.lveditor.draft/"
    )
    if not os.path.exists(jianying_drafts):
        return None

    draft_id = str(uuid.uuid4()).upper()
    dest = os.path.join(jianying_drafts, draft_id)

    if os.path.exists(draft_path):
        # Use symlink instead of copy to save disk space
        os.symlink(draft_path, dest)
        return dest

    return None
