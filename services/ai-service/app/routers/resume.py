from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Body, HTTPException
from pydantic import BaseModel

from app.models.resume_analysis_report import ResumeRewriteRequest
from app.services.resume_service import resume_service

router = APIRouter(prefix="/ai/resume", tags=["Resume AI"])


class StructuredResumeAnalyzeRequest(BaseModel):
    userId: str
    targetRole: Optional[str] = None
    jobDescription: str = ""
    resume: Dict[str, Any]


class StoredResumeAnalyzeRequest(BaseModel):
    userId: str
    targetRole: Optional[str] = None
    jobDescription: str = ""


@router.post("/analyze")
async def analyze_resume(payload: StoredResumeAnalyzeRequest = Body(...)):
    try:
        result = await resume_service.analyze_stored_resume(
            user_id=payload.userId,
            target_role=payload.targetRole,
            job_description=payload.jobDescription,
        )
        return {"success": True, "data": result}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/analyze-structured")
async def analyze_structured_resume(payload: StructuredResumeAnalyzeRequest = Body(...)):
    try:
        result = await resume_service.analyze_structured_resume(
            resume=payload.resume,
            user_id=payload.userId,
            target_role=payload.targetRole,
            job_description=payload.jobDescription,
        )
        return {"success": True, "data": result}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/latest")
async def get_latest_resume_analysis(userId: str = "anonymous"):
    try:
        result = await resume_service.get_stored_resume(user_id=userId)
        return {"success": True, "data": result}
    except ValueError:
        return {"success": True, "data": None}
    except Exception as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/rewrite")
async def rewrite_resume_section(payload: ResumeRewriteRequest = Body(...)):
    try:
        result = await resume_service.rewrite_section(
            section_text=payload.sectionText,
            role=payload.role,
            section_name=payload.sectionName,
            user_id=payload.userId,
        )
        return {"success": True, "data": result}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
