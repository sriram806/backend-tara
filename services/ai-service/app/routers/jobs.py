from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query

from app.models.job_match_document import JobMatchRequest
from app.models.resume_analysis_report import ResumeAnalysisReport
from app.services.job_matching_service import job_matching_service
from app.services.resume_service import resume_service

router = APIRouter(prefix="/ai/jobs", tags=["Job Matching AI"])


def _parse_job_feed(job_feed: Optional[str]) -> List[Dict[str, Any]]:
    if not job_feed:
        return []
    try:
        parsed = json.loads(job_feed)
        return parsed if isinstance(parsed, list) else []
    except Exception:
        return []


@router.get("/match")
async def match_jobs(
    userId: str = Query(..., min_length=1),
    targetRole: str = Query("Software Engineer"),
    jobFeed: Optional[str] = Query(None),
    location: Optional[str] = Query(None),
    experienceYears: Optional[int] = Query(None, ge=0),
    topN: int = Query(5, ge=1, le=20),
    forceRefresh: bool = Query(False),
):
    try:
        try:
            stored_resume = await resume_service.get_stored_resume(userId)
        except ValueError:
            stored_resume = None

        effective_resume = str((stored_resume or {}).get("raw_text") or "")

        if not (effective_resume or "").strip():
            return {
                "success": True,
                "data": {
                    "userId": userId,
                    "targetRole": targetRole,
                    "matches": [],
                    "generatedAt": None,
                    "metadata": {
                        "location": location,
                        "experienceYears": experienceYears,
                        "sourceCount": len(_parse_job_feed(jobFeed)),
                        "emptyState": "missing_resume_analysis",
                    },
                },
            }

        parsed_feed = _parse_job_feed(jobFeed)
        result = await job_matching_service.match_jobs(
            user_id=userId,
            target_role=targetRole,
            resume_text=effective_resume or "",
            parsed_resume=(stored_resume or {}).get("structured_resume") if stored_resume else None,
            job_feed=parsed_feed,
            location=location,
            experience_years=experienceYears,
            top_n=topN,
            force_refresh=forceRefresh,
        )
        return {"success": True, "data": result}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
