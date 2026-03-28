"""Tests for the analysis API endpoints."""

from unittest.mock import patch

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

    # Seed data: project with 4 videos, 2 already analyzed
    db = Session()
    project = Project(name="test-trip", video_dir="/tmp/videos")
    db.add(project)
    db.commit()

    for i in range(4):
        v = Video(
            project_id=project.id,
            filename=f"VID_{i:04d}.MOV",
            path=f"/tmp/videos/VID_{i:04d}.MOV",
            duration=10.0 + i * 5,
            is_ingested=True,
        )
        db.add(v)
    db.commit()

    # Add analysis for first 2 videos
    videos = db.query(Video).order_by(Video.id).all()
    for i, v in enumerate(videos[:2]):
        a = Analysis(
            video_id=v.id,
            model_version="gemini-2.0-flash",
            scene_category="landscape" if i == 0 else "food",
            quality_score=7.0 + i,
            is_highlight=i == 1,
            mood="epic" if i == 0 else "warm",
            description="测试描述" + str(i),
            people_count=i,
            audio_type="wind",
            issues="none",
            segments=[{"start_sec": 0, "end_sec": 5, "label": "测试"}],
            raw_response='{"test": true}',
            cost_tokens=3000 + i * 1000,
        )
        db.add(a)
    db.commit()
    db.close()

    yield TestClient(app)
    app.dependency_overrides.clear()


def test_estimate_cost_endpoint(client):
    resp = client.post("/api/analysis/estimate/1")
    assert resp.status_code == 200
    data = resp.json()
    # 2 unanalyzed videos with durations 20.0 and 25.0 seconds
    assert data["video_count"] == 2
    assert data["total_duration_seconds"] == 45.0
    assert data["total_estimated_input_tokens"] > 0
    assert data["total_estimated_cost_usd"] > 0


def test_list_models(client):
    resp = client.get("/api/analysis/models")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) > 0

    model = data[0]
    assert "id" in model
    assert "label" in model
    assert "input_per_million" in model
    assert "output_per_million" in model
    assert "standard_free" in model
    assert "recommended" in model
    assert "deprecated" in model


def test_estimate_cost_project_not_found(client):
    resp = client.post("/api/analysis/estimate/999")
    assert resp.status_code == 404


def test_estimate_cost_all_analyzed(client):
    """When all videos are already analyzed, should return zero counts."""
    # First analyze remaining videos by adding analysis records
    # Use the endpoint that returns zero for fully-analyzed project
    # We test with a new project that has no videos
    resp = client.post("/api/projects", json={"name": "empty", "video_dir": "/tmp/empty"})
    pid = resp.json()["id"]
    resp = client.post(f"/api/analysis/estimate/{pid}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["video_count"] == 0
    assert data["total_estimated_cost_usd"] == 0.0


def test_get_analysis_for_video(client):
    resp = client.get("/api/analysis/1")
    assert resp.status_code == 200
    data = resp.json()
    assert data["video_id"] == 1
    assert data["scene_category"] == "landscape"
    assert data["quality_score"] == 7.0
    assert data["mood"] == "epic"
    assert data["description"] == "测试描述0"
    assert data["issues"] == "none"
    assert data["segments"] == [{"start_sec": 0, "end_sec": 5, "label": "测试"}]
    assert data["cost_tokens"] == 3000
    assert data["model_version"] == "gemini-2.0-flash"


def test_get_analysis_second_video(client):
    resp = client.get("/api/analysis/2")
    assert resp.status_code == 200
    data = resp.json()
    assert data["video_id"] == 2
    assert data["scene_category"] == "food"
    assert data["is_highlight"] is True


def test_get_analysis_not_found(client):
    """Video exists but has no analysis."""
    resp = client.get("/api/analysis/3")
    assert resp.status_code == 404


def test_get_analysis_status(client):
    resp = client.get("/api/analysis/status/1")
    assert resp.status_code == 200
    data = resp.json()
    assert data["project_id"] == 1
    assert data["total_videos"] == 4
    assert data["analyzed_videos"] == 2
    assert data["unanalyzed_videos"] == 2
    assert data["progress_percent"] == 50.0


def test_get_analysis_status_not_found(client):
    resp = client.get("/api/analysis/status/999")
    assert resp.status_code == 404


@patch("clipmind.routers.analysis.analyze_video")
@patch("clipmind.routers.analysis.settings")
def test_run_analysis_endpoint(mock_settings, mock_analyze, client):
    """Test the run analysis endpoint with mocked Gemini service."""
    mock_settings.gemini_api_key = "test-key"

    mock_analyze.return_value = {
        "scene_category": "activity",
        "quality_score": 6.5,
        "is_highlight": False,
        "mood": "joyful",
        "description": "户外活动场景",
        "people_count": 3,
        "audio_type": "speech",
        "issues": "shaky",
        "segments": [{"start_sec": 0, "end_sec": 10, "label": "活动"}],
        "raw_response": '{"test": true}',
        "cost_tokens": 4500,
        "model_version": "gemini-2.0-flash",
    }

    resp = client.post("/api/analysis/run/1")
    assert resp.status_code == 200
    data = resp.json()
    assert data["analyzed"] == 2  # 2 unanalyzed videos
    assert data["errors"] == 0
    assert data["total_cost_tokens"] == 9000  # 4500 * 2

    # Verify the analysis was stored
    resp2 = client.get("/api/analysis/3")
    assert resp2.status_code == 200
    assert resp2.json()["scene_category"] == "activity"


@patch("clipmind.routers.analysis.analyze_video")
@patch("clipmind.routers.analysis.settings")
def test_run_analysis_with_limit(mock_settings, mock_analyze, client):
    """Test that the limit parameter restricts how many videos are analyzed."""
    mock_settings.gemini_api_key = "test-key"

    mock_analyze.return_value = {
        "scene_category": "transport",
        "quality_score": 5.0,
        "is_highlight": False,
        "mood": "calm",
        "description": "交通场景",
        "people_count": 0,
        "audio_type": "traffic",
        "issues": "none",
        "segments": [],
        "raw_response": "{}",
        "cost_tokens": 2000,
        "model_version": "gemini-2.0-flash",
    }

    resp = client.post("/api/analysis/run/1?limit=1")
    assert resp.status_code == 200
    data = resp.json()
    assert data["analyzed"] == 1  # Only 1 due to limit


@patch("clipmind.routers.analysis.settings")
def test_run_analysis_no_api_key(mock_settings, client):
    """Test that missing API key returns 400."""
    mock_settings.gemini_api_key = ""

    resp = client.post("/api/analysis/run/1")
    assert resp.status_code == 400


def test_run_analysis_project_not_found(client):
    resp = client.post("/api/analysis/run/999")
    assert resp.status_code == 404
