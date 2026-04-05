from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional
from app.services.career_service import analyze_career, get_latest_career_report

router = APIRouter(prefix="/ai/career", tags=["Career AI"])

class CareerRequest(BaseModel):
    resumeText: Optional[str] = ""
    resumeData: Optional[Dict[str, Any]] = Field(default_factory=dict)
    targetRole: Optional[str] = "General Career"
    userId: Optional[str] = "anonymous"
    githubScore: Optional[float] = None
    quizScore: Optional[float] = None

@router.post("")
async def process_career_analysis(req: CareerRequest, forceRefresh: bool = Query(default=False)):
    try:
        data = req.model_dump()
        result = await analyze_career(data, user_id=req.userId, force_refresh=forceRefresh)
        return {"success": True, "data": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/latest")
async def get_latest_analysis(userId: str = Query(..., min_length=1)):
    try:
        latest = await get_latest_career_report(userId)
        return {"success": True, "data": latest}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
