"""Gemini video analysis service for ClipMind."""

import json
import logging
import mimetypes
import re
import threading
import time
from pathlib import Path
from typing import Any, Callable

# Ensure common video MIME types are registered
mimetypes.add_type("video/quicktime", ".mov")
mimetypes.add_type("video/mp4", ".mp4")
mimetypes.add_type("video/x-msvideo", ".avi")
mimetypes.add_type("video/x-matroska", ".mkv")
mimetypes.add_type("video/x-m4v", ".m4v")

from clipmind.config import settings

logger = logging.getLogger(__name__)

ANALYSIS_PROMPT = """你是一个专业的旅行视频分析师。请分析这个视频片段，返回严格的JSON格式（不要markdown代码块）：

{
  "scene_category": "landscape/people/food/transport/accommodation/activity/cityscape/wildlife/other 中选一个",
  "quality_score": "1-10的浮点数，考虑画面稳定性、构图、光线、趣味性",
  "is_highlight": "true/false，是否是精彩片段值得保留",
  "mood": "epic/warm/joyful/calm/tense/melancholy/adventurous/other 中选一个",
  "description": "用中文1-2句话描述视频内容",
  "people_count": "画面中的人数，整数",
  "audio_type": "wind/speech/music/silence/nature/traffic/other 中选一个",
  "issues": "shaky/overexposed/blurry/dark/obstructed/none 用逗号分隔",
  "segments": [{"start_sec": 0, "end_sec": 3, "label": "描述"}]
}

请只返回JSON，不要包含任何其他文字或markdown格式。"""

VALID_SCENE_CATEGORIES = {
    "landscape", "people", "food", "transport", "accommodation",
    "activity", "cityscape", "wildlife", "other",
}
VALID_MOODS = {
    "epic", "warm", "joyful", "calm", "tense",
    "melancholy", "adventurous", "other",
}
VALID_AUDIO_TYPES = {
    "wind", "speech", "music", "silence", "nature", "traffic", "other",
}
VALID_ISSUES = {
    "shaky", "overexposed", "blurry", "dark", "obstructed", "none",
}

# Token estimation constants
# Gemini token guide: video is 263 tokens/sec, audio is 32 tokens/sec.
# Prompt overhead is calibrated against current analysis prompt shape.
TOKENS_PER_FRAME = 263
AUDIO_TOKENS_PER_SEC = 32
PROMPT_TOKENS = 250
ESTIMATED_OUTPUT_TOKENS = 300  # approximate response size

# Gemini model pricing per 1M tokens (as of 2026-03)
# Source: https://ai.google.dev/gemini-api/docs/pricing
MODEL_PRICING = {
    "gemini-2.5-flash": {
        "input_text_per_million": 0.30,       # text / image / video
        "input_audio_per_million": 1.00,       # audio tokens priced separately
        "output_per_million": 2.50,
        "standard_free": True,
        "label": "Gemini 2.5 Flash",
        "recommended": True,
    },
    "gemini-2.5-pro": {
        "input_text_per_million": 1.25,
        "input_audio_per_million": 1.25,
        "output_per_million": 10.00,
        "standard_free": True,
        "label": "Gemini 2.5 Pro",
        "recommended": False,
    },
    "gemini-2.0-flash": {
        "input_text_per_million": 0.10,
        "input_audio_per_million": 0.10,
        "output_per_million": 0.40,
        "standard_free": True,
        "label": "Gemini 2.0 Flash",
        "recommended": False,
        "deprecated": "2026-06-01",
    },
}

DEFAULT_MODEL = "gemini-2.5-flash"
GEMINI_FILE_STORAGE_QUOTA_BYTES = 21_474_836_480
_gemini_storage_cleanup_lock = threading.Lock()


def _serialize_modality_details(details: Any) -> list[dict[str, Any]] | None:
    """Normalize SDK modality token details into plain dicts."""
    if not details:
        return None

    normalized = []
    for item in details:
        modality = getattr(item, "modality", None)
        token_count = getattr(item, "token_count", None)
        if modality is None and isinstance(item, dict):
            modality = item.get("modality")
            token_count = item.get("token_count")
        normalized.append({
            "modality": modality,
            "token_count": token_count,
        })
    return normalized


def _sum_modality_tokens(details: list[dict[str, Any]] | None, modality: str) -> int:
    """Sum token counts for a given modality from usage metadata details."""
    if not details:
        return 0
    total = 0
    for item in details:
        if str(item.get("modality", "")).upper() == modality.upper():
            try:
                total += int(item.get("token_count", 0) or 0)
            except (TypeError, ValueError):
                continue
    return total


def summarize_analysis_error(error: Exception | str) -> str:
    """Convert Gemini/SDK errors into short UI-friendly messages."""
    message = str(error)
    normalized = message.lower()

    if "file_storage_bytes" in normalized:
        return "Gemini file storage quota exceeded"
    if "resource_exhausted" in normalized or "quota exceeded" in normalized:
        return "Gemini quota exceeded"
    if "api key" in normalized:
        return "Gemini API key error"
    if "processing failed" in normalized:
        return "Gemini file processing failed"
    return message[:240]


def is_gemini_file_storage_quota_error(error: Exception | str) -> bool:
    """Return True when Gemini rejects a request due to remote file storage quota."""
    return "file_storage_bytes" in str(error).lower()


def calculate_usage_cost(
    *,
    model: str | None = None,
    total_token_count: int | None = None,
    prompt_token_count: int | None = None,
    candidate_token_count: int | None = None,
    thoughts_token_count: int | None = None,
    prompt_tokens_details: list[dict[str, Any]] | None = None,
    duration_seconds: float | None = None,
) -> float:
    """Calculate Gemini cost from available usage metadata.

    Prefer exact prompt/output fields when available. For legacy rows that only
    store total tokens, estimate input tokens from video duration and treat the
    remainder as output tokens. This matches Gemini billing much better than
    splitting total tokens with a fixed ratio.
    """
    model_id = model or DEFAULT_MODEL
    pricing = MODEL_PRICING.get(model_id, MODEL_PRICING[DEFAULT_MODEL])

    audio_prompt_tokens = 0
    non_audio_prompt_tokens = 0
    output_tokens = 0

    if prompt_token_count is not None:
        if prompt_tokens_details:
            audio_prompt_tokens = _sum_modality_tokens(prompt_tokens_details, "AUDIO")
            non_audio_prompt_tokens = max(prompt_token_count - audio_prompt_tokens, 0)
        elif duration_seconds is not None:
            audio_prompt_tokens = min(int(duration_seconds * AUDIO_TOKENS_PER_SEC), prompt_token_count)
            non_audio_prompt_tokens = max(prompt_token_count - audio_prompt_tokens, 0)
        else:
            non_audio_prompt_tokens = prompt_token_count

        output_tokens = (candidate_token_count or 0) + (thoughts_token_count or 0)
    elif total_token_count is not None and duration_seconds is not None:
        estimated_audio_tokens = int(duration_seconds * AUDIO_TOKENS_PER_SEC)
        estimated_non_audio_prompt_tokens = int(duration_seconds * TOKENS_PER_FRAME) + PROMPT_TOKENS
        estimated_prompt_tokens = estimated_audio_tokens + estimated_non_audio_prompt_tokens

        prompt_tokens = min(total_token_count, estimated_prompt_tokens)
        audio_prompt_tokens = min(estimated_audio_tokens, prompt_tokens)
        non_audio_prompt_tokens = max(prompt_tokens - audio_prompt_tokens, 0)
        output_tokens = max(total_token_count - prompt_tokens, 0)
    elif total_token_count is not None:
        non_audio_prompt_tokens = total_token_count

    cost = (
        (non_audio_prompt_tokens / 1_000_000) * pricing["input_text_per_million"] +
        (audio_prompt_tokens / 1_000_000) * pricing["input_audio_per_million"] +
        (output_tokens / 1_000_000) * pricing["output_per_million"]
    )
    return round(cost, 6)


def _create_client():
    """Create a Gemini client using the configured API key."""
    from google import genai

    if not settings.gemini_api_key:
        raise ValueError("CLIPMIND_GEMINI_API_KEY is not configured")
    return genai.Client(api_key=settings.gemini_api_key)


def estimate_cost(duration_seconds: float, model: str | None = None) -> dict[str, Any]:
    """Estimate the token count and cost for analyzing a video of given duration.

    Args:
        duration_seconds: Duration of the video in seconds.
        model: Optional Gemini model ID. Defaults to DEFAULT_MODEL.

    Returns:
        Dict with estimated_input_tokens, estimated_output_tokens,
        estimated_cost_usd, duration_seconds, model, and standard_free.
    """
    model_id = model or DEFAULT_MODEL
    pricing = MODEL_PRICING.get(model_id, MODEL_PRICING[DEFAULT_MODEL])

    frame_tokens = int(duration_seconds * TOKENS_PER_FRAME)
    audio_tokens = int(duration_seconds * AUDIO_TOKENS_PER_SEC)
    text_input_tokens = frame_tokens + PROMPT_TOKENS  # video frames + prompt = text rate
    input_tokens = text_input_tokens + audio_tokens

    text_cost = (text_input_tokens / 1_000_000) * pricing["input_text_per_million"]
    audio_cost = (audio_tokens / 1_000_000) * pricing["input_audio_per_million"]
    output_cost = (ESTIMATED_OUTPUT_TOKENS / 1_000_000) * pricing["output_per_million"]
    total_cost = text_cost + audio_cost + output_cost

    return {
        "duration_seconds": duration_seconds,
        "estimated_input_tokens": input_tokens,
        "estimated_output_tokens": ESTIMATED_OUTPUT_TOKENS,
        "estimated_cost_usd": round(total_cost, 6),
        "model": model_id,
        "standard_free": pricing.get("standard_free", False),
    }


def estimate_batch_cost(durations: list[float], model: str | None = None) -> dict[str, Any]:
    """Estimate cost for a batch of videos.

    Args:
        durations: List of video durations in seconds.
        model: Optional Gemini model ID. Defaults to DEFAULT_MODEL.

    Returns:
        Dict with per-video estimates, totals, and video count.
    """
    total_input_tokens = 0
    total_output_tokens = 0
    total_cost = 0.0

    for dur in durations:
        est = estimate_cost(dur, model=model)
        total_input_tokens += est["estimated_input_tokens"]
        total_output_tokens += est["estimated_output_tokens"]
        total_cost += est["estimated_cost_usd"]

    return {
        "video_count": len(durations),
        "total_duration_seconds": sum(durations),
        "total_estimated_input_tokens": total_input_tokens,
        "total_estimated_output_tokens": total_output_tokens,
        "total_estimated_cost_usd": round(total_cost, 6),
    }


def get_available_models() -> list[dict[str, Any]]:
    """Return list of available models with pricing info."""
    return [
        {
            "id": model_id,
            "label": info["label"],
            "input_per_million": info["input_text_per_million"],
            "output_per_million": info["output_per_million"],
            "standard_free": info.get("standard_free", False),
            "recommended": info.get("recommended", False),
            "deprecated": info.get("deprecated"),
        }
        for model_id, info in MODEL_PRICING.items()
    ]


def get_gemini_file_storage_usage(client=None) -> dict[str, Any]:
    """Return current Gemini Developer API remote file storage usage."""
    if client is None:
        client = _create_client()

    total_bytes = 0
    file_count = 0

    for file_obj in client.files.list():
        file_count += 1
        try:
            total_bytes += int(getattr(file_obj, "size_bytes", 0) or 0)
        except (TypeError, ValueError):
            continue

    return {
        "file_count": file_count,
        "total_bytes": total_bytes,
        "quota_bytes": GEMINI_FILE_STORAGE_QUOTA_BYTES,
        "usage_percent": round((total_bytes / GEMINI_FILE_STORAGE_QUOTA_BYTES) * 100, 2)
        if GEMINI_FILE_STORAGE_QUOTA_BYTES > 0
        else 0,
    }


def clear_gemini_file_storage(client=None, limit: int = 0) -> dict[str, Any]:
    """Delete remote Gemini Developer API files and return deletion stats."""
    if client is None:
        client = _create_client()

    deleted = 0
    failed = 0

    for file_obj in client.files.list():
        name = getattr(file_obj, "name", None)
        if not name:
            continue
        try:
            client.files.delete(name=name)
            deleted += 1
        except Exception:
            failed += 1
        if limit > 0 and deleted >= limit:
            break

    remaining = get_gemini_file_storage_usage(client=client)
    return {
        "deleted": deleted,
        "failed": failed,
        **remaining,
    }


def extract_json_from_text(text: str) -> dict[str, Any]:
    """Extract JSON from potentially messy Gemini response text.

    Handles cases where the model wraps JSON in markdown code blocks
    or includes extra text around it.

    Args:
        text: Raw response text from Gemini.

    Returns:
        Parsed JSON dict.

    Raises:
        ValueError: If no valid JSON can be extracted.
    """
    # Try direct parse first
    stripped = text.strip()
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        pass

    # Try to extract from markdown code blocks
    code_block_match = re.search(r"```(?:json)?\s*\n?(.*?)\n?\s*```", stripped, re.DOTALL)
    if code_block_match:
        try:
            return json.loads(code_block_match.group(1).strip())
        except json.JSONDecodeError:
            pass

    # Try to find JSON object in the text
    brace_match = re.search(r"\{.*\}", stripped, re.DOTALL)
    if brace_match:
        try:
            return json.loads(brace_match.group(0))
        except json.JSONDecodeError:
            pass

    raise ValueError(f"Could not extract valid JSON from response: {text[:200]}")


def _validate_and_normalize(raw: dict[str, Any]) -> dict[str, Any]:
    """Validate and normalize the parsed Gemini response into Analysis model fields.

    Args:
        raw: Parsed JSON dict from Gemini.

    Returns:
        Normalized dict matching Analysis model fields.
    """
    scene_category = str(raw.get("scene_category", "other")).lower().strip()
    if scene_category not in VALID_SCENE_CATEGORIES:
        scene_category = "other"

    quality_raw = raw.get("quality_score", 5.0)
    try:
        quality_score = float(quality_raw)
        quality_score = max(1.0, min(10.0, quality_score))
    except (TypeError, ValueError):
        quality_score = 5.0

    is_highlight_raw = raw.get("is_highlight", False)
    if isinstance(is_highlight_raw, str):
        is_highlight = is_highlight_raw.lower() in ("true", "1", "yes")
    else:
        is_highlight = bool(is_highlight_raw)

    mood = str(raw.get("mood", "other")).lower().strip()
    if mood not in VALID_MOODS:
        mood = "other"

    description = str(raw.get("description", "")) or None

    people_count_raw = raw.get("people_count", 0)
    try:
        people_count = int(people_count_raw)
        people_count = max(0, people_count)
    except (TypeError, ValueError):
        people_count = 0

    audio_type = str(raw.get("audio_type", "other")).lower().strip()
    if audio_type not in VALID_AUDIO_TYPES:
        audio_type = "other"

    issues_raw = raw.get("issues", "none")
    if isinstance(issues_raw, list):
        issues_raw = ",".join(str(i) for i in issues_raw)
    issues_str = str(issues_raw).lower().strip()
    # Validate individual issue values
    issue_parts = [i.strip() for i in issues_str.split(",")]
    valid_parts = [i for i in issue_parts if i in VALID_ISSUES]
    issues = ",".join(valid_parts) if valid_parts else "none"

    segments_raw = raw.get("segments", [])
    segments = []
    if isinstance(segments_raw, list):
        for seg in segments_raw:
            if isinstance(seg, dict):
                segments.append({
                    "start_sec": float(seg.get("start_sec", 0)),
                    "end_sec": float(seg.get("end_sec", 0)),
                    "label": str(seg.get("label", "")),
                })

    return {
        "scene_category": scene_category,
        "quality_score": quality_score,
        "is_highlight": is_highlight,
        "mood": mood,
        "description": description,
        "people_count": people_count,
        "audio_type": audio_type,
        "issues": issues,
        "segments": segments,
    }


def parse_gemini_response(response_text: str) -> dict[str, Any]:
    """Parse and validate a Gemini response into Analysis-compatible fields.

    Args:
        response_text: Raw text from Gemini response.

    Returns:
        Dict with validated fields matching Analysis model.

    Raises:
        ValueError: If no valid JSON can be extracted.
    """
    raw = extract_json_from_text(response_text)
    return _validate_and_normalize(raw)


def analyze_video(
    video_path: str,
    *,
    client=None,
    model: str | None = None,
    _storage_retry: bool = True,
) -> dict[str, Any]:
    """Analyze a single video file using Gemini.

    Uploads the video to Gemini File API, waits for processing,
    then sends an analysis prompt and parses the response.

    Args:
        video_path: Absolute path to the video file.
        client: Optional pre-created genai.Client (for testing).
        model: Optional model name override.

    Returns:
        Dict with analysis results and metadata (raw_response, cost_tokens, model_version).
    """
    if client is None:
        client = _create_client()

    model_name = model or settings.gemini_model

    # Upload video to Gemini File API
    logger.info("Uploading video: %s", video_path)
    mime_type = mimetypes.guess_type(video_path)[0] or "video/mp4"
    video_file = None
    try:
        with open(video_path, "rb") as fh:
            video_file = client.files.upload(file=fh, config={"mime_type": mime_type})

        # Wait for processing to complete
        while video_file.state.name == "PROCESSING":
            time.sleep(2)
            video_file = client.files.get(name=video_file.name)

        if video_file.state.name == "FAILED":
            raise RuntimeError(f"Gemini file processing failed for {video_path}")

        # Generate analysis
        logger.info("Analyzing video with model: %s", model_name)
        response = client.models.generate_content(
            model=model_name,
            contents=[video_file, ANALYSIS_PROMPT],
        )

        raw_text = response.text
        logger.debug("Raw Gemini response: %s", raw_text[:500])

        # Parse and validate
        result = parse_gemini_response(raw_text)

        # Add metadata
        usage = getattr(response, "usage_metadata", None)
        cost_tokens = None
        prompt_token_count = None
        candidate_token_count = None
        thoughts_token_count = None
        prompt_tokens_details = None
        if usage:
            cost_tokens = getattr(usage, "total_token_count", None)
            prompt_token_count = getattr(usage, "prompt_token_count", None)
            candidate_token_count = getattr(usage, "candidates_token_count", None)
            thoughts_token_count = getattr(usage, "thoughts_token_count", None)
            prompt_tokens_details = _serialize_modality_details(
                getattr(usage, "prompt_tokens_details", None)
            )

        return {
            **result,
            "raw_response": raw_text,
            "cost_tokens": cost_tokens,
            "prompt_token_count": prompt_token_count,
            "candidate_token_count": candidate_token_count,
            "thoughts_token_count": thoughts_token_count,
            "prompt_tokens_details": prompt_tokens_details,
            "model_version": model_name,
        }
    except Exception as error:
        if _storage_retry and is_gemini_file_storage_quota_error(error):
            logger.warning("Gemini file storage quota hit, auto-clearing remote files before retry")
            with _gemini_storage_cleanup_lock:
                clear_gemini_file_storage(client=client)
            return analyze_video(video_path, client=client, model=model, _storage_retry=False)
        raise
    finally:
        if video_file is not None:
            try:
                client.files.delete(name=video_file.name)
                logger.info("Deleted Gemini file: %s", video_file.name)
            except Exception as cleanup_error:
                logger.warning("Failed to delete Gemini file %s: %s", getattr(video_file, "name", "?"), cleanup_error)


def analyze_batch(
    video_paths_and_ids: list[tuple[str, int]],
    *,
    client=None,
    model: str | None = None,
    progress_callback: Callable[[int, int, str], None] | None = None,
) -> list[dict[str, Any]]:
    """Analyze multiple videos in sequence.

    Args:
        video_paths_and_ids: List of (video_path, video_id) tuples.
        client: Optional pre-created genai.Client.
        model: Optional model name override.
        progress_callback: Optional callback(current, total, filename).

    Returns:
        List of dicts, each containing analysis results plus video_id and any error.
    """
    if client is None:
        client = _create_client()

    total = len(video_paths_and_ids)
    results = []

    for idx, (video_path, video_id) in enumerate(video_paths_and_ids):
        filename = video_path.rsplit("/", 1)[-1] if "/" in video_path else video_path
        if progress_callback:
            progress_callback(idx + 1, total, filename)

        try:
            analysis = analyze_video(video_path, client=client, model=model)
            results.append({
                "video_id": video_id,
                "status": "success",
                **analysis,
            })
        except Exception as e:
            logger.error("Failed to analyze video %s (id=%d): %s", video_path, video_id, e)
            results.append({
                "video_id": video_id,
                "status": "error",
                "error": str(e),
            })

    return results
