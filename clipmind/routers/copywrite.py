"""AI Copywrite CRUD — Claude CLI generates narrations, frontend displays them."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from clipmind.database import get_db
from clipmind.models.project import Project
from clipmind.models.copywrite import Copywrite

router = APIRouter(prefix="/api/copywrite", tags=["copywrite"])


class NarrationIn(BaseModel):
    video_id: int
    text: str
    timing: str = "start"


class CopywriteCreate(BaseModel):
    video_ids: list[int]
    style: str = "cinematic"
    language: str = "zh"
    narrations: list[NarrationIn]
    overall_script: str = ""
    custom_prompt: str | None = None
    generated_by: str = "claude-cli"


@router.post("/{project_id}")
def create_copywrite(
    project_id: int,
    body: CopywriteCreate,
    db: Session = Depends(get_db),
):
    """Save pre-generated narrations (from Claude CLI) to the database."""
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    record = Copywrite(
        project_id=project_id,
        style=body.style,
        language=body.language,
        video_ids=body.video_ids,
        narrations=[n.model_dump() for n in body.narrations],
        overall_script=body.overall_script,
        custom_prompt=body.custom_prompt,
        generated_by=body.generated_by,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return {
        "id": record.id,
        "style": record.style,
        "overall_script": record.overall_script,
        "narrations": record.narrations,
    }


@router.get("/{copywrite_id}")
def get_copywrite(copywrite_id: int, db: Session = Depends(get_db)):
    record = db.get(Copywrite, copywrite_id)
    if not record:
        raise HTTPException(404, "Copywrite not found")
    return {
        "id": record.id,
        "project_id": record.project_id,
        "style": record.style,
        "language": record.language,
        "video_ids": record.video_ids,
        "narrations": record.narrations,
        "overall_script": record.overall_script,
        "generated_by": record.generated_by,
        "custom_prompt": record.custom_prompt,
        "created_at": record.created_at.isoformat() if record.created_at else None,
    }


@router.get("/project/{project_id}")
def list_copywrites(project_id: int, db: Session = Depends(get_db)):
    records = (
        db.query(Copywrite)
        .filter(Copywrite.project_id == project_id)
        .order_by(Copywrite.created_at.desc())
        .all()
    )
    return [
        {
            "id": r.id,
            "style": r.style,
            "language": r.language,
            "video_count": len(r.video_ids) if r.video_ids else 0,
            "generated_by": r.generated_by,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in records
    ]


@router.delete("/{copywrite_id}")
def delete_copywrite(copywrite_id: int, db: Session = Depends(get_db)):
    record = db.get(Copywrite, copywrite_id)
    if not record:
        raise HTTPException(404, "Copywrite not found")
    db.delete(record)
    db.commit()
    return {"deleted": copywrite_id}
