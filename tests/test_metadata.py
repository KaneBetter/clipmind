import json
from unittest.mock import patch, MagicMock

from clipmind.services.metadata import extract_video_metadata, extract_gps_from_exiftool


def test_extract_video_metadata_parses_ffprobe_output():
    fake_ffprobe = {
        "format": {
            "duration": "12.5",
            "size": "5242880",
        },
        "streams": [
            {
                "codec_type": "video",
                "codec_name": "h264",
                "width": 1920,
                "height": 1080,
                "r_frame_rate": "30/1",
            }
        ],
    }
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(
            stdout=json.dumps(fake_ffprobe), returncode=0
        )
        meta = extract_video_metadata("/fake/video.mov")

    assert meta["duration"] == 12.5
    assert meta["width"] == 1920
    assert meta["height"] == 1080
    assert meta["fps"] == 30.0
    assert meta["codec"] == "h264"
    assert meta["file_size"] == 5242880


def test_extract_gps_from_exiftool():
    fake_exiftool = json.dumps([{
        "GPSLatitude": 36.1156,
        "GPSLongitude": -115.1741,
        "GPSAltitude": "544 m",
        "CreateDate": "2026:02:17 10:30:00",
    }])
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(stdout=fake_exiftool, returncode=0)
        gps = extract_gps_from_exiftool("/fake/video.mov")

    assert gps["lat"] == 36.1156
    assert gps["lon"] == -115.1741
    assert gps["captured_at"] is not None
