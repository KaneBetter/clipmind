import os
import tempfile
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, StaticPool
from sqlalchemy.orm import sessionmaker
import pytest

from clipmind.database import Base, get_db
from clipmind.models.project import Project
from clipmind.main import app


@pytest.fixture
def client_with_videos():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)

    tmpdir = tempfile.mkdtemp()
    # Create fake video files
    for name in ["IMG_0001.MOV", "IMG_0002.MP4"]:
        open(os.path.join(tmpdir, name), "w").close()

    db = Session()
    project = Project(name="test", video_dir=tmpdir)
    db.add(project)
    db.commit()
    db.close()

    def override_get_db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


@patch("clipmind.services.ingestion.extract_video_metadata")
@patch("clipmind.services.ingestion.extract_gps_from_exiftool")
@patch("clipmind.services.ingestion.generate_thumbnail")
def test_trigger_ingest(mock_thumb, mock_gps, mock_meta, client_with_videos):
    mock_meta.return_value = {
        "duration": 5.0, "width": 1920, "height": 1080,
        "fps": 30.0, "codec": "h264", "file_size": 1024,
    }
    mock_gps.return_value = {"lat": 36.0, "lon": -115.0, "altitude": None, "captured_at": None}
    mock_thumb.return_value = "/tmp/thumb.jpg"

    resp = client_with_videos.post("/api/ingest/1")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ingested"] == 2
