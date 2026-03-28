"""API endpoints for exporting timelines to CapCut Mate / JianYing."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from clipmind.database import get_db
from clipmind.models.project import Project
from clipmind.models.export import Export as ExportModel
from clipmind.services.capcut_export import export_timeline, export_all_timelines, register_in_jianying

router = APIRouter(prefix="/api/export", tags=["export"])


class ExportRequest(BaseModel):
    timeline_id: int
    draft_name: str | None = None


class ExportAllRequest(BaseModel):
    draft_name: str | None = None


@router.post("/{project_id}/all")
def trigger_export_all(
    project_id: int,
    body: ExportAllRequest,
    db: Session = Depends(get_db),
):
    """Export ALL timelines into a single CapCut Mate draft and register in JianYing."""
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    export_record = ExportModel(
        project_id=project_id,
        format="capcut",
        video_ids=[],
        config={"type": "all", "draft_name": body.draft_name},
        status="running",
    )
    db.add(export_record)
    db.commit()

    try:
        result = export_all_timelines(
            db=db,
            project_id=project_id,
            draft_name=body.draft_name,
        )
        export_record.output_path = result.get("output_path")
        export_record.status = "completed"

        if result.get("output_path"):
            jianying_path = register_in_jianying(
                result["output_path"],
                result.get("draft_name", "ClipMind Export All"),
            )
            if jianying_path:
                result["jianying_path"] = jianying_path

    except Exception as e:
        export_record.status = "error"
        export_record.output_path = str(e)
        db.commit()
        raise HTTPException(500, f"Export failed: {e}")

    db.commit()
    db.refresh(export_record)

    return {
        "id": export_record.id,
        "status": export_record.status,
        "output_path": export_record.output_path,
        "timeline_count": result.get("timeline_count", 0),
        "video_count": result.get("video_count", 0),
        "subtitle_count": result.get("subtitle_count", 0),
        "music_count": result.get("music_count", 0),
        "total_duration_sec": result.get("total_duration_sec", 0),
        "draft_name": result.get("draft_name"),
    }


@router.post("/{project_id}")
def trigger_export(
    project_id: int,
    body: ExportRequest,
    db: Session = Depends(get_db),
):
    """Export a timeline to CapCut Mate draft and register in JianYing."""
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    # Create export record
    export_record = ExportModel(
        project_id=project_id,
        format="capcut",
        video_ids=[],
        config={"timeline_id": body.timeline_id, "draft_name": body.draft_name},
        status="running",
    )
    db.add(export_record)
    db.commit()

    try:
        result = export_timeline(
            db=db,
            timeline_id=body.timeline_id,
            draft_name=body.draft_name,
        )
        export_record.output_path = result.get("output_path")
        export_record.status = "completed"

        # Register in JianYing
        if result.get("output_path"):
            jianying_path = register_in_jianying(
                result["output_path"],
                result.get("draft_name", "ClipMind Export"),
            )
            if jianying_path:
                result["jianying_path"] = jianying_path

    except Exception as e:
        export_record.status = "error"
        export_record.output_path = str(e)
        db.commit()
        raise HTTPException(500, f"Export failed: {e}")

    db.commit()
    db.refresh(export_record)

    return {
        "id": export_record.id,
        "status": export_record.status,
        "output_path": export_record.output_path,
        "video_count": result.get("video_count", 0),
        "subtitle_count": result.get("subtitle_count", 0),
        "music_count": result.get("music_count", 0),
        "draft_name": result.get("draft_name"),
    }


@router.get("/{export_id}")
def get_export(export_id: int, db: Session = Depends(get_db)):
    record = db.get(ExportModel, export_id)
    if not record:
        raise HTTPException(404, "Export not found")
    return {
        "id": record.id,
        "project_id": record.project_id,
        "format": record.format,
        "status": record.status,
        "output_path": record.output_path,
        "config": record.config,
        "created_at": record.created_at.isoformat(),
    }


@router.get("/project/{project_id}")
def list_exports(project_id: int, db: Session = Depends(get_db)):
    records = (
        db.query(ExportModel)
        .filter(ExportModel.project_id == project_id)
        .order_by(ExportModel.created_at.desc())
        .all()
    )
    return [
        {
            "id": r.id,
            "format": r.format,
            "status": r.status,
            "config": r.config,
            "created_at": r.created_at.isoformat(),
        }
        for r in records
    ]
