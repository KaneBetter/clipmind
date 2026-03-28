"""Music analysis service -- beat detection and rhythm analysis using librosa."""

import librosa
import numpy as np


def analyze_music(file_path: str) -> dict:
    """Analyze a music file for beats, onsets, tempo, and sections.

    Args:
        file_path: Path to the audio file (mp3, wav, etc.)

    Returns:
        dict with keys: bpm, beats, onsets, sections, duration
    """
    y, sr = librosa.load(file_path, sr=22050)
    duration = float(librosa.get_duration(y=y, sr=sr))

    # Tempo and beat tracking
    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
    beat_times = librosa.frames_to_time(beat_frames, sr=sr)

    # Onset detection (rhythm cut points)
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    onset_frames = librosa.onset.onset_detect(
        y=y, sr=sr, onset_envelope=onset_env, backtrack=True
    )
    onset_times = librosa.frames_to_time(onset_frames, sr=sr)

    # Onset strength curve (downsampled for visualization)
    onset_env_times = librosa.times_like(onset_env, sr=sr)
    step = max(1, len(onset_env) // 200)
    strength_curve = [
        {"t": round(float(onset_env_times[i]), 3), "v": round(float(onset_env[i]), 3)}
        for i in range(0, len(onset_env), step)
    ]

    # Section boundaries via spectral change detection
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    bounds = librosa.segment.agglomerative(chroma, k=min(8, max(2, int(duration / 30))))
    bound_times = librosa.frames_to_time(bounds, sr=sr)
    sections = []
    for i, start in enumerate(bound_times):
        end = bound_times[i + 1] if i + 1 < len(bound_times) else duration
        sections.append({
            "start": round(float(start), 3),
            "end": round(float(end), 3),
            "index": i,
        })

    bpm_value = float(tempo) if np.isscalar(tempo) else float(tempo[0])

    return {
        "bpm": round(bpm_value, 1),
        "beats": [round(float(t), 3) for t in beat_times],
        "onsets": [round(float(t), 3) for t in onset_times],
        "strength_curve": strength_curve,
        "sections": sections,
        "duration": round(duration, 2),
    }


def get_audio_duration(file_path: str) -> float:
    """Get duration of an audio file without full analysis."""
    return float(librosa.get_duration(path=file_path))
