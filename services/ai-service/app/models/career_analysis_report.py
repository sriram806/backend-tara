from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class CareerAnalysisReport(BaseModel):
    userId: str
    targetRole: str
    readinessScore: int
    strengths: List[str]
    skillGaps: List[str]
    recommendations: List[str]
    marketInsights: Dict[str, Any] = Field(default_factory=dict)
    modelVersion: str = "career-analyzer-v1"
    similarityScore: float = 0.0
    matchedSkills: List[str] = Field(default_factory=list)
    extractedSkills: List[str] = Field(default_factory=list)
    source: str = "hybrid"
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    metadata: Optional[Dict[str, Any]] = None
