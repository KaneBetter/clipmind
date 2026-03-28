import os
import tempfile
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from clipmind.database import Base
from clipmind.models.project import Project
from clipmind.services.ingestion import ingest_project


@patch("clipmind.services.ingestion.extract_video_metadata")
@patch("clipmind.services.ingestion.extract_gps_from_exiftool")
@patch("clipmind.services.ingestion.generate_thumbnail")
def test_ingest_discovers_and_imports_videos(mock_thumb, mock_gps, mock_meta):
    mock_meta.return_value = {
        "duration": 5.0, "width": 1920, "height": 1080,
        "fps": 30.0, "codec": "h264", "file_size": 1024,
    }
    mock_gps.return_value = {
        "lat": 36.0, "lon": -115.0, "altitude": 500.0, "captured_at": None,
    }
    mock_thumb.return_value = "/tmp/thumb.jpg"

    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    db = Session()

    with tempfile.TemporaryDirectory() as video_dir:
        # Create fake video files
        for name in ["IMG_0001.MOV", "IMG_0002.MP4", "readme.txt"]:
            open(os.path.join(video_dir, name), "w").close()

        project = Project(name="test", video_dir=video_dir)
        db.add(project)
        db.commit()

        stats = ingest_project(db, project, thumbnail_dir="/tmp/thumbs")

    assert stats["discovered"] == 2  # Only .MOV and .MP4
    assert stats["ingested"] == 2
    assert len(project.videos) == 2
