from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Any, Dict

from app.services.github_analyzer import github_analyzer_service

router = APIRouter(prefix="/ai/github", tags=["GitHub Analyzer AI"])


class GithubAnalyzeRequest(BaseModel):
    userId: str = Field(min_length=1)
    githubUsername: str = Field(min_length=1)
    metrics: Dict[str, Any] = Field(default_factory=dict)
    normalizedData: Dict[str, Any] = Field(default_factory=dict)


@router.post("/analyze")
async def analyze_github(payload: GithubAnalyzeRequest):
    try:
        result = await github_analyzer_service.analyze_and_score(
            user_id=payload.userId,
            github_username=payload.githubUsername,
            metrics=payload.metrics,
            normalized_data=payload.normalizedData,
        )
        return {"success": True, "data": result}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
