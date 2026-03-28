import json
import platform
import re
import shutil
import subprocess
from datetime import datetime


def extract_video_metadata(filepath: str) -> dict:
    """Extract technical metadata from a video file using ffprobe."""
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "quiet", "-print_format", "json",
                "-show_format", "-show_streams", filepath,
            ],
            capture_output=True, text=True, timeout=30,
        )
        data = json.loads(result.stdout)
    except Exception:
        return {"duration": 0.0}

    fmt = data.get("format", {})
    video_stream = next(
        (s for s in data.get("streams", []) if s.get("codec_type") == "video"),
        {},
    )

    fps = 0.0
    if rfr := video_stream.get("r_frame_rate", ""):
        parts = rfr.split("/")
        if len(parts) == 2 and int(parts[1]) != 0:
            fps = round(int(parts[0]) / int(parts[1]), 2)

    return {
        "duration": float(fmt.get("duration", 0)),
        "file_size": int(fmt.get("size", 0)),
        "width": video_stream.get("width"),
        "height": video_stream.get("height"),
        "fps": fps or None,
        "codec": video_stream.get("codec_name"),
    }


def extract_gps_from_exiftool(filepath: str) -> dict:
    """Extract GPS coordinates and capture date using exiftool, with mdls fallback on macOS."""
    # Try exiftool first
    try:
        result = subprocess.run(
            [
                "exiftool", "-json", "-GPSLatitude", "-GPSLongitude",
                "-GPSAltitude", "-CreateDate", "-n", filepath,
            ],
            capture_output=True, text=True, timeout=30,
        )
        items = json.loads(result.stdout)
        if items:
            item = items[0]
            captured_at = None
            if cd := item.get("CreateDate"):
                try:
                    captured_at = datetime.strptime(str(cd), "%Y:%m:%d %H:%M:%S")
                except ValueError:
                    pass

            alt = item.get("GPSAltitude")
            if isinstance(alt, str):
                m = re.search(r"([\d.]+)", alt)
                alt = float(m.group(1)) if m else None

            data = {
                "lat": item.get("GPSLatitude"),
                "lon": item.get("GPSLongitude"),
                "altitude": float(alt) if alt else None,
                "captured_at": captured_at,
            }
            if data.get("lat") is not None:
                return data
    except Exception:
        pass

    # Fallback to macOS mdls (only available on macOS)
    if platform.system() == "Darwin" and shutil.which("mdls"):
        return _extract_gps_mdls(filepath)

    return {}


def _extract_gps_mdls(filepath: str) -> dict:
    """Extract GPS coordinates using macOS mdls command. Only works on macOS."""
    try:
        result = subprocess.run(
            ["mdls", "-name", "kMDItemLatitude", "-name", "kMDItemLongitude",
             "-name", "kMDItemAltitude", "-name", "kMDItemContentCreationDate",
             filepath],
            capture_output=True, text=True, timeout=10,
        )
    except Exception:
        return {}

    data: dict = {}
    for line in result.stdout.strip().split("\n"):
        if "= (null)" in line:
            continue
        if "kMDItemLatitude" in line:
            data["lat"] = float(line.split("=")[1].strip())
        elif "kMDItemLongitude" in line:
            data["lon"] = float(line.split("=")[1].strip())
        elif "kMDItemAltitude" in line:
            data["altitude"] = float(line.split("=")[1].strip())
        elif "kMDItemContentCreationDate" in line:
            date_str = line.split("=")[1].strip()
            try:
                data["captured_at"] = datetime.strptime(date_str, "%Y-%m-%d %H:%M:%S +0000")
            except ValueError:
                pass

    return data
