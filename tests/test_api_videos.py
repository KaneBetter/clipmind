from fastapi.testclient import TestClient
from sqlalchemy import create_engine, StaticPool
from sqlalchemy.orm import sessionmaker
import pytest

from clipmind.database import Base, get_db
from clipmind.models.project import Project
from clipmind.models.video import Video
from clipmind.models.analysis import Analysis
from clipmind.main import app


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)

    def override_get_db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    # Seed data
    db = Session()
    project = Project(name="test", video_dir="/tmp")
    db.add(project)
    db.commit()

    for i in range(5):
        v = Video(
            project_id=project.id,
            filename=f"IMG_{i:04d}.MOV",
            path=f"/tmp/IMG_{i:04d}.MOV",
            duration=5.0 + i,
            lat=36.0 + i * 0.1 if i < 3 else None,
            lon=-115.0,
            location_label="Las Vegas" if i < 3 else "Zion",
            is_ingested=True,
        )
        db.add(v)
    db.commit()

    # Add analysis for first 2 videos
    videos = db.query(Video).all()
    for i, v in enumerate(videos[:2]):
        a = Analysis(
            video_id=v.id,
            model_version="gemini-2.0-flash",
            scene_category="landscape",
            quality_score=7.0 + i,
            is_highlight=i == 1,
            mood="epic",
        )
        db.add(a)
    db.commit()
    db.close()

    yield TestClient(app)
    app.dependency_overrides.clear()


def test_list_videos(client):
    resp = client.get("/api/videos?project_id=1")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 5
    assert len(data["items"]) == 5


def test_filter_by_location(client):
    resp = client.get("/api/videos?project_id=1&location_label=Las Vegas")
    assert resp.status_code == 200
    assert resp.json()["total"] == 3


def test_filter_by_min_quality(client):
    resp = client.get("/api/videos?project_id=1&min_quality=7.5")
    assert resp.status_code == 200
    assert resp.json()["total"] == 1


def test_filter_highlight_only(client):
    resp = client.get("/api/videos?project_id=1&is_highlight=true")
    assert resp.status_code == 200
    assert resp.json()["total"] == 1


def test_pagination(client):
    resp = client.get("/api/videos?project_id=1&page=1&page_size=2")
    data = resp.json()
    assert len(data["items"]) == 2
    assert data["pages"] == 3


def test_get_single_video(client):
    resp = client.get("/api/videos/1")
    assert resp.status_code == 200
    assert resp.json()["filename"] == "IMG_0000.MOV"


def test_hidden_videos_excluded_by_default(client):
    resp = client.put("/api/videos/1/hidden?is_hidden=true")
    assert resp.status_code == 200
    assert resp.json()["is_hidden"] is True

    resp = client.get("/api/videos?project_id=1")
    assert resp.status_code == 200
    assert resp.json()["total"] == 4


def test_hidden_videos_included_when_requested(client):
    resp = client.put("/api/videos/1/hidden?is_hidden=true")
    assert resp.status_code == 200

    resp = client.get("/api/videos?project_id=1&show_hidden=true")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 5
    assert any(item["id"] == 1 and item["is_hidden"] is True for item in data["items"])
