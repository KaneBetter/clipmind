from fastapi.testclient import TestClient
from sqlalchemy import create_engine, StaticPool
from sqlalchemy.orm import sessionmaker
import pytest

from clipmind.database import Base, get_db
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
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_create_project(client):
    resp = client.post("/api/projects", json={
        "name": "美西旅行",
        "video_dir": "/tmp/videos",
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "美西旅行"
    assert data["id"] is not None


def test_list_projects(client):
    client.post("/api/projects", json={"name": "trip1", "video_dir": "/tmp/1"})
    client.post("/api/projects", json={"name": "trip2", "video_dir": "/tmp/2"})

    resp = client.get("/api/projects")
    assert resp.status_code == 200
    assert len(resp.json()) == 2


def test_get_project(client):
    create_resp = client.post("/api/projects", json={"name": "test", "video_dir": "/tmp"})
    pid = create_resp.json()["id"]

    resp = client.get(f"/api/projects/{pid}")
    assert resp.status_code == 200
    assert resp.json()["name"] == "test"


def test_get_project_not_found(client):
    resp = client.get("/api/projects/999")
    assert resp.status_code == 404
