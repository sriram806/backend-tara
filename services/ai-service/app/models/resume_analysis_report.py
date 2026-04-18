from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class ResumeSuggestion(BaseModel):
    type: str
    section: str
    message: str
    priority: str = "medium"


class ResumeSectionScore(BaseModel):
    present: bool
    score: int
    notes: List[str] = Field(default_factory=list)


class ResumeAnalysisReport(BaseModel):
    analysisId: str
    userId: str
    targetRole: str
    atsScore: int
    sectionScores: Dict[str, ResumeSectionScore]
    suggestions: List[ResumeSuggestion] = Field(default_factory=list)
    extractedSkills: List[str] = Field(default_factory=list)
    keywordGaps: List[str] = Field(default_factory=list)
    rawText: str
    structuredText: Dict[str, Any] = Field(default_factory=dict)
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    source: str = "direct"
    jobDescription: Optional[str] = None
    fileName: Optional[str] = None
    analysisVersion: int = 1


class ResumeRewriteRequest(BaseModel):
    sectionName: str
    sectionText: str
    role: str
    userId: str = "anonymous"


class ResumeRewriteResponse(BaseModel):
    sectionName: str
    role: str
    rewrittenText: str
    atsOptimizedText: str
    keywordsAdded: List[str] = Field(default_factory=list)
    suggestions: List[str] = Field(default_factory=list)
