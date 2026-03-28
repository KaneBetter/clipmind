"""Video stability analysis using OpenCV optical flow.

Algorithm:
1. Extract feature points per frame (goodFeaturesToTrack)
2. Track with Lucas-Kanade optical flow
3. Estimate global camera motion (dx, dy, rotation) via estimateAffinePartial2D
4. Accumulate trajectory and smooth with uniform_filter1d
5. Deviation = actual trajectory - smoothed trajectory = shake magnitude
6. Classify segments as stable/shaky by threshold
"""

import json
import logging
import time

import cv2
import numpy as np
from scipy.ndimage import uniform_filter1d

logger = logging.getLogger(__name__)

# Analysis resolution — downsample for speed, minimal accuracy loss
ANALYSIS_WIDTH = 640
ANALYSIS_HEIGHT = 360

# Lucas-Kanade optical flow parameters
LK_PARAMS = dict(
    winSize=(15, 15),
    maxLevel=2,
    criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 10, 0.03),
)

# Feature detection parameters
FEATURE_PARAMS = dict(
    maxCorners=200,
    qualityLevel=0.01,
    minDistance=30,
    blockSize=3,
)

# Trajectory smoothing window (frames)
SMOOTH_WINDOW = 30

# Minimum segment duration (seconds)
MIN_SEGMENT_SEC = 1.0


def analyze_stability(
    video_path: str,
    threshold: float = 5.0,
    smooth_window: int = SMOOTH_WINDOW,
    min_segment_sec: float = MIN_SEGMENT_SEC,
) -> dict:
    """Analyze video stability and return stable/shaky segments.

    Args:
        video_path: Path to video file.
        threshold: Shake magnitude threshold (pixels). Higher = more tolerant.
        smooth_window: Smoothing window size in frames.
        min_segment_sec: Minimum segment duration in seconds.

    Returns:
        Dict with overall_score, is_stable, stable_ratio,
        stable_segments, shaky_segments, and analysis metadata.
    """
    t0 = time.monotonic()

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    ret, prev_frame = cap.read()
    if not ret:
        cap.release()
        raise ValueError(f"Cannot read first frame: {video_path}")

    prev_gray = _to_analysis_gray(prev_frame)
    transforms = []

    while True:
        ret, curr_frame = cap.read()
        if not ret:
            break

        curr_gray = _to_analysis_gray(curr_frame)
        transform = _estimate_transform(prev_gray, curr_gray)
        transforms.append(transform)
        prev_gray = curr_gray

    cap.release()

    if len(transforms) < 2:
        elapsed_ms = int((time.monotonic() - t0) * 1000)
        return _build_result(
            stable_segments=[{"start": 0.0, "end": total_frame_count / fps, "avg_shake": 0.0}],
            shaky_segments=[],
            shake_magnitude=np.zeros(1),
            fps=fps,
            total_frames=total_frame_count,
            threshold=threshold,
            analysis_time_ms=elapsed_ms,
        )

    transforms_arr = np.array(transforms)
    shake_magnitude = _compute_shake_magnitude(transforms_arr, smooth_window)

    segments = _classify_segments(
        shake_magnitude, fps, threshold, min_segment_sec
    )

    elapsed_ms = int((time.monotonic() - t0) * 1000)

    stable_segs = [s for s in segments if s["label"] == "stable"]
    shaky_segs = [s for s in segments if s["label"] == "shaky"]

    # Remove internal label key from output
    for s in stable_segs:
        del s["label"]
    for s in shaky_segs:
        del s["label"]

    return _build_result(
        stable_segments=stable_segs,
        shaky_segments=shaky_segs,
        shake_magnitude=shake_magnitude,
        fps=fps,
        total_frames=len(transforms) + 1,
        threshold=threshold,
        analysis_time_ms=elapsed_ms,
    )


def _to_analysis_gray(frame: np.ndarray) -> np.ndarray:
    """Downsample and convert to grayscale for analysis."""
    resized = cv2.resize(frame, (ANALYSIS_WIDTH, ANALYSIS_HEIGHT))
    return cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)


def _estimate_transform(prev_gray: np.ndarray, curr_gray: np.ndarray) -> tuple:
    """Estimate global camera motion (dx, dy, rotation) between two frames."""
    prev_pts = cv2.goodFeaturesToTrack(prev_gray, **FEATURE_PARAMS)
    if prev_pts is None or len(prev_pts) < 4:
        return (0.0, 0.0, 0.0)

    curr_pts, status, _ = cv2.calcOpticalFlowPyrLK(
        prev_gray, curr_gray, prev_pts, None, **LK_PARAMS
    )

    idx = np.where(status.flatten() == 1)[0]
    if len(idx) < 4:
        return (0.0, 0.0, 0.0)

    m, _ = cv2.estimateAffinePartial2D(prev_pts[idx], curr_pts[idx])
    if m is None:
        return (0.0, 0.0, 0.0)

    dx = float(m[0, 2])
    dy = float(m[1, 2])
    da = float(np.arctan2(m[1, 0], m[0, 0]))
    return (dx, dy, da)


def _compute_shake_magnitude(
    transforms: np.ndarray, smooth_window: int
) -> np.ndarray:
    """Compute per-frame shake magnitude from transforms.

    Shake = deviation of actual trajectory from smoothed trajectory.
    """
    trajectory = np.cumsum(transforms, axis=0)

    smoothed = np.zeros_like(trajectory)
    for i in range(3):
        smoothed[:, i] = uniform_filter1d(trajectory[:, i], size=smooth_window)

    deviation = trajectory - smoothed
    magnitude = np.sqrt(deviation[:, 0] ** 2 + deviation[:, 1] ** 2)
    return magnitude


def _classify_segments(
    shake_magnitude: np.ndarray,
    fps: float,
    threshold: float,
    min_segment_sec: float,
) -> list[dict]:
    """Classify contiguous frame ranges as stable or shaky."""
    min_frames = max(1, int(min_segment_sec * fps))
    segments = []

    current_label = "stable" if shake_magnitude[0] <= threshold else "shaky"
    seg_start = 0

    for i in range(1, len(shake_magnitude)):
        label = "stable" if shake_magnitude[i] <= threshold else "shaky"
        if label != current_label:
            if i - seg_start >= min_frames:
                segments.append({
                    "start": round(seg_start / fps, 2),
                    "end": round(i / fps, 2),
                    "avg_shake": round(float(np.mean(shake_magnitude[seg_start:i])), 2),
                    "label": current_label,
                })
            current_label = label
            seg_start = i

    # Final segment
    end_idx = len(shake_magnitude)
    if end_idx - seg_start >= min_frames:
        segments.append({
            "start": round(seg_start / fps, 2),
            "end": round(end_idx / fps, 2),
            "avg_shake": round(float(np.mean(shake_magnitude[seg_start:end_idx])), 2),
            "label": current_label,
        })

    return segments


def _build_result(
    stable_segments: list[dict],
    shaky_segments: list[dict],
    shake_magnitude: np.ndarray,
    fps: float,
    total_frames: int,
    threshold: float,
    analysis_time_ms: int,
) -> dict:
    """Build the final result dict."""
    duration = total_frames / fps if fps > 0 else 0.0

    stable_duration = sum(s["end"] - s["start"] for s in stable_segments)
    stable_ratio = stable_duration / duration if duration > 0 else 0.0

    # Score: 0-100, based on stable ratio and average shake of stable segments
    if stable_segments:
        avg_stable_shake = np.mean([s["avg_shake"] for s in stable_segments])
        # Lower shake in stable segments → higher score bonus
        shake_bonus = max(0, 10 - avg_stable_shake) * 2
        overall_score = min(100.0, stable_ratio * 80 + shake_bonus)
    else:
        overall_score = 0.0

    # Downsample shake magnitude to ~200 points for chart
    shake_curve = _downsample_curve(shake_magnitude, fps, max_points=200)

    return {
        "overall_score": round(overall_score, 1),
        "is_stable": stable_ratio >= 0.5,
        "stable_ratio": round(stable_ratio, 3),
        "stable_segments": json.dumps(stable_segments),
        "shaky_segments": json.dumps(shaky_segments),
        "shake_curve": json.dumps(shake_curve),
        "threshold": threshold,
        "total_frames": total_frames,
        "fps": round(fps, 2),
        "analysis_time_ms": analysis_time_ms,
    }


def reclassify_from_curve(
    shake_curve: list[dict],
    fps: float,
    threshold: float,
    min_segment_sec: float = MIN_SEGMENT_SEC,
) -> dict:
    """Reclassify segments from stored shake_curve without re-reading video.

    Args:
        shake_curve: List of {"t": time, "v": shake_magnitude} points.
        fps: Video FPS.
        threshold: New shake threshold.
        min_segment_sec: Minimum segment duration.

    Returns:
        Dict with stable_segments, shaky_segments, overall_score, stable_ratio, threshold.
    """
    if not shake_curve:
        return {
            "stable_segments": [], "shaky_segments": [],
            "overall_score": 0.0, "stable_ratio": 0.0, "threshold": threshold,
        }

    values = np.array([p["v"] for p in shake_curve])
    # shake_curve is downsampled; estimate effective fps from time points
    if len(shake_curve) >= 2:
        duration = shake_curve[-1]["t"] - shake_curve[0]["t"]
        effective_fps = len(shake_curve) / duration if duration > 0 else fps
    else:
        effective_fps = fps

    segments = _classify_segments(values, effective_fps, threshold, min_segment_sec)

    stable_segs = [s for s in segments if s["label"] == "stable"]
    shaky_segs = [s for s in segments if s["label"] == "shaky"]
    for s in stable_segs:
        del s["label"]
    for s in shaky_segs:
        del s["label"]

    duration = shake_curve[-1]["t"] if shake_curve else 0.0
    stable_duration = sum(s["end"] - s["start"] for s in stable_segs)
    stable_ratio = stable_duration / duration if duration > 0 else 0.0

    if stable_segs:
        avg_stable_shake = np.mean([s["avg_shake"] for s in stable_segs])
        shake_bonus = max(0, 10 - avg_stable_shake) * 2
        overall_score = min(100.0, stable_ratio * 80 + shake_bonus)
    else:
        overall_score = 0.0

    return {
        "stable_segments": stable_segs,
        "shaky_segments": shaky_segs,
        "overall_score": round(overall_score, 1),
        "stable_ratio": round(stable_ratio, 3),
        "threshold": threshold,
    }


def auto_threshold_for_target(
    shake_curve: list[dict],
    fps: float,
    target_segments: int,
    min_segment_sec: float = MIN_SEGMENT_SEC,
) -> dict:
    """Binary search threshold until stable_segments count >= target.

    Returns the reclassification result with the found threshold.
    """
    lo, hi = 0.1, 50.0
    best_result = reclassify_from_curve(shake_curve, fps, hi, min_segment_sec)

    for _ in range(20):
        mid = (lo + hi) / 2
        result = reclassify_from_curve(shake_curve, fps, mid, min_segment_sec)
        n_stable = len(result["stable_segments"])

        if n_stable >= target_segments:
            best_result = result
            hi = mid  # try tighter threshold
        else:
            lo = mid  # need looser threshold

        if hi - lo < 0.05:
            break

    return best_result


def auto_threshold_for_ratio(
    shake_curve: list[dict],
    fps: float,
    target_ratio: float,
    min_segment_sec: float = MIN_SEGMENT_SEC,
) -> dict:
    """Binary search threshold until stable_ratio >= target_ratio.

    Returns the reclassification result with the tightest threshold that meets the target.
    """
    lo, hi = 0.1, 50.0
    best_result = reclassify_from_curve(shake_curve, fps, hi, min_segment_sec)

    for _ in range(20):
        mid = (lo + hi) / 2
        result = reclassify_from_curve(shake_curve, fps, mid, min_segment_sec)

        if result["stable_ratio"] >= target_ratio:
            best_result = result
            hi = mid  # try tighter threshold
        else:
            lo = mid  # need looser threshold

        if hi - lo < 0.05:
            break

    return best_result


def _downsample_curve(
    magnitude: np.ndarray, fps: float, max_points: int = 200
) -> list[dict]:
    """Downsample per-frame shake magnitude to chart-friendly points."""
    n = len(magnitude)
    if n <= max_points:
        indices = np.arange(n)
    else:
        indices = np.linspace(0, n - 1, max_points, dtype=int)

    return [
        {"t": round(float(i) / fps, 2), "v": round(float(magnitude[i]), 2)}
        for i in indices
    ]
