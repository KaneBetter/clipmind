from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import pytest

from clipmind.database import Base, get_db
from clipmind.models.project import Project
from clipmind.models.copywrite import Copywrite
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

    db = Session()
    project = Project(name="test", video_dir="/tmp")
    db.add(project)
    db.commit()

    cw = Copywrite(
        project_id=project.id,
        style="cinematic",
        language="zh",
        video_ids=[1, 2],
        narrations=[{"video_id": 1, "text": "测试文案", "timing": "start"}],
        overall_script="整体描述",
        generated_by="claude-cli/cinematic",
    )
    db.add(cw)
    db.commit()
    db.close()

    yield TestClient(app)
    app.dependency_overrides.clear()


def test_get_copywrite(client):
    resp = client.get("/api/copywrite/1")
    assert resp.status_code == 200
    data = resp.json()
    assert data["style"] == "cinematic"
    assert data["generated_by"] == "claude-cli/cinematic"
    assert "created_at" in data


def test_list_copywrites(client):
    resp = client.get("/api/copywrite/project/1")
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 1
    assert "generated_by" in items[0]


def test_create_copywrite(client):
    resp = client.post("/api/copywrite/1", json={
        "video_ids": [1, 2],
        "style": "vlog",
        "language": "zh",
        "narrations": [
            {"video_id": 1, "text": "旁白1", "timing": "start"},
            {"video_id": 2, "text": "旁白2", "timing": "middle"},
        ],
        "overall_script": "主题概述",
        "generated_by": "claude-cli/vlog",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["style"] == "vlog"
    assert len(data["narrations"]) == 2


def test_create_copywrite_missing_project(client):
    resp = client.post("/api/copywrite/999", json={
        "video_ids": [1],
        "narrations": [{"video_id": 1, "text": "test", "timing": "start"}],
    })
    assert resp.status_code == 404


def test_delete_copywrite(client):
    resp = client.delete("/api/copywrite/1")
    assert resp.status_code == 200
    assert resp.json()["deleted"] == 1
    # Verify it's gone
    resp2 = client.get("/api/copywrite/1")
    assert resp2.status_code == 404


def test_delete_copywrite_not_found(client):
    resp = client.delete("/api/copywrite/999")
    assert resp.status_code == 404
