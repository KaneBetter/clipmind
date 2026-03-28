import os
import shutil
import subprocess


def generate_thumbnail(
    video_path: str,
    output_path: str,
    width: int = 320,
    height: int = 180,
    timestamp: str = "00:00:01",
) -> str | None:
    """Generate a JPEG thumbnail from a video at the given timestamp."""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    try:
        subprocess.run(
            [
                "ffmpeg", "-y", "-ss", timestamp,
                "-i", video_path,
                "-vframes", "1",
                "-vf", f"scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2",
                "-q:v", "3",
                output_path,
            ],
            capture_output=True, timeout=30,
            check=True,
        )
    except Exception:
        return None

    return output_path if os.path.exists(output_path) else None


def generate_photo_thumbnail(
    photo_path: str,
    output_path: str,
    width: int = 320,
    height: int = 180,
) -> str | None:
    """Generate a JPEG thumbnail from a photo (supports HEIC, PNG, JPG, etc.)."""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    try:
        ext = os.path.splitext(photo_path)[1].lower()
        if ext in (".heic", ".heif"):
            if shutil.which("magick"):
                # Use ImageMagick (works on Linux and macOS with ImageMagick installed)
                subprocess.run(
                    [
                        "magick", photo_path,
                        "-resize", f"{width}x{height}>",
                        "-gravity", "center",
                        "-extent", f"{width}x{height}",
                        "-quality", "70",
                        output_path,
                    ],
                    capture_output=True, timeout=30,
                    check=True,
                )
            elif shutil.which("sips"):
                # Fallback to macOS sips
                subprocess.run(
                    [
                        "sips", "-s", "format", "jpeg",
                        "-s", "formatOptions", "70",
                        "--resampleWidth", str(width),
                        photo_path,
                        "--out", output_path,
                    ],
                    capture_output=True, timeout=30,
                    check=True,
                )
            else:
                # Last resort: try ffmpeg for HEIC
                subprocess.run(
                    [
                        "ffmpeg", "-y",
                        "-i", photo_path,
                        "-vf", f"scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2",
                        "-q:v", "3",
                        output_path,
                    ],
                    capture_output=True, timeout=30,
                    check=True,
                )
        else:
            # Use ffmpeg for other formats
            subprocess.run(
                [
                    "ffmpeg", "-y",
                    "-i", photo_path,
                    "-vf", f"scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2",
                    "-q:v", "3",
                    output_path,
                ],
                capture_output=True, timeout=30,
                check=True,
            )
    except Exception:
        return None

    return output_path if os.path.exists(output_path) else None
