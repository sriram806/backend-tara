from __future__ import annotations

from typing import List

from fastapi import APIRouter, HTTPException, Query

from app.models.roadmap_document import RoadmapAdaptRequest, RoadmapGenerateRequest
from app.services.career_service import get_latest_career_report
from app.services.roadmap_service import roadmap_service
from app.services.resume_service import resume_service

router = APIRouter(prefix="/ai/roadmap", tags=["Roadmap AI"])


@router.post("/generate")
async def generate_roadmap(req: RoadmapGenerateRequest):
    try:
        skill_gaps = req.skillGaps
        if not skill_gaps:
            latest_career = await get_latest_career_report(req.userId)
            if latest_career:
                skill_gaps = [str(skill) for skill in latest_career.get("skillGaps", [])]
        if not skill_gaps:
            try:
                stored_resume = await resume_service.get_stored_resume(req.userId)
            except Exception:
                stored_resume = None
            if stored_resume:
                suggestions = stored_resume.get("keyword_suggestions") or []
                skill_gaps = [
                    str(item.get("keyword"))
                    for item in suggestions
                    if isinstance(item, dict) and item.get("keyword")
                ]

        result = await roadmap_service.generate_roadmap(
            user_id=req.userId,
            target_role=req.targetRole,
            skill_gaps=skill_gaps,
            duration_days=req.durationDays,
            adaptive_context=req.adaptiveContext,
            force_refresh=req.forceRefresh,
        )
        return {"success": True, "data": result}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/current")
async def get_current_roadmap(userId: str = Query(..., min_length=1)):
    try:
        result = await roadmap_service.get_current_roadmap(userId)
        return {"success": True, "data": result}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/adapt")
async def adapt_roadmap(req: RoadmapAdaptRequest):
    try:
        result = await roadmap_service.adapt_roadmap(
            user_id=req.userId,
            target_role=req.targetRole,
            skill_gaps=req.skillGaps,
            missed_days=req.missedDays,
            irrelevant_tasks=req.irrelevantTasks,
            base_roadmap=req.baseRoadmap,
        )
        return {"success": True, "data": result}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
