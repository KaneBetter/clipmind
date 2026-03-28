import os
import tempfile
from unittest.mock import patch, MagicMock

from clipmind.services.thumbnail import generate_thumbnail


def test_generate_thumbnail_calls_ffmpeg():
    with tempfile.TemporaryDirectory() as tmpdir:
        output_path = os.path.join(tmpdir, "thumb.jpg")
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0)
            # Create a fake output file to simulate ffmpeg success
            with open(output_path, "w") as f:
                f.write("fake")

            result = generate_thumbnail("/fake/video.mov", output_path, width=320, height=180)

        assert result == output_path
        mock_run.assert_called_once()
        cmd = mock_run.call_args[0][0]
        assert "ffmpeg" in cmd[0]
