from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, Optional
from app.services.resume_service import analyze_resume

router = APIRouter(prefix="/ai/resume", tags=["Resume AI"])

class ResumeRequest(BaseModel):
    resumeText: str
    userId: Optional[str] = "anonymous"

@router.post("")
async def process_resume_analysis(req: ResumeRequest):
    try:
        data = req.model_dump()
        result = await analyze_resume(data, user_id=req.userId)
        return {"success": True, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
