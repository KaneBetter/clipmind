from clipmind.models.project import Project
from clipmind.models.video import Video


def test_create_project(db_session):
    project = Project(name="美西旅行", video_dir="/tmp/videos")
    db_session.add(project)
    db_session.commit()

    assert project.id is not None
    assert project.name == "美西旅行"


def test_create_video(db_session):
    project = Project(name="test", video_dir="/tmp")
    db_session.add(project)
    db_session.commit()

    video = Video(
        project_id=project.id,
        filename="IMG_0001.MOV",
        path="/tmp/IMG_0001.MOV",
        duration=5.2,
        width=1920,
        height=1080,
        lat=36.1156,
        lon=-115.1741,
    )
    db_session.add(video)
    db_session.commit()

    assert video.id is not None
    assert video.project_id == project.id
    assert video.lat == 36.1156


def test_project_video_relationship(db_session):
    project = Project(name="test", video_dir="/tmp")
    db_session.add(project)
    db_session.commit()

    v1 = Video(project_id=project.id, filename="a.mov", path="/tmp/a.mov", duration=1.0)
    v2 = Video(project_id=project.id, filename="b.mov", path="/tmp/b.mov", duration=2.0)
    db_session.add_all([v1, v2])
    db_session.commit()

    db_session.refresh(project)
    assert len(project.videos) == 2
