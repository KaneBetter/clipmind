from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from clipmind.database import get_db
from clipmind.models.project import Project
from clipmind.models.video import Video
from clipmind.models.analysis import Analysis
from clipmind.schemas.project import ProjectCreate, ProjectRead, ProjectUpdate

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.post("", status_code=201, response_model=ProjectRead)
def create_project(body: ProjectCreate, db: Session = Depends(get_db)):
    project = Project(
        name=body.name, video_dir=body.video_dir or "",
        photo_dir=body.photo_dir, music_dir=body.music_dir,
        description=body.description,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return _to_read(db, project)


@router.get("", response_model=list[ProjectRead])
def list_projects(db: Session = Depends(get_db)):
    projects = db.query(Project).order_by(Project.created_at.desc()).all()
    return [_to_read(db, p) for p in projects]


@router.get("/{project_id}", response_model=ProjectRead)
def get_project(project_id: int, db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    return _to_read(db, project)


@router.put("/{project_id}", response_model=ProjectRead)
def update_project(project_id: int, body: ProjectUpdate, db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    if body.name is not None:
        project.name = body.name
    if body.video_dir is not None:
        project.video_dir = body.video_dir or None
    if body.photo_dir is not None:
        project.photo_dir = body.photo_dir or None
    if body.music_dir is not None:
        project.music_dir = body.music_dir or None
    if body.description is not None:
        project.description = body.description or None
    db.commit()
    db.refresh(project)
    return _to_read(db, project)


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: int, db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    db.delete(project)
    db.commit()


def _to_read(db: Session, project: Project) -> ProjectRead:
    video_count = db.query(func.count(Video.id)).filter(Video.project_id == project.id).scalar()
    analyzed_count = (
        db.query(func.count(Analysis.id))
        .join(Video)
        .filter(Video.project_id == project.id)
        .scalar()
    )
    return ProjectRead(
        id=project.id,
        name=project.name,
        video_dir=project.video_dir or None,
        photo_dir=project.photo_dir or None,
        music_dir=project.music_dir or None,
        description=project.description,
        created_at=project.created_at,
        video_count=video_count or 0,
        analyzed_count=analyzed_count or 0,
    )
