from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class JobMatchItem(BaseModel):
    jobId: str
    title: str
    company: str
    location: Optional[str] = None
    similarityScore: float
    reason: str
    matchedSkills: List[str] = Field(default_factory=list)
    missingSkills: List[str] = Field(default_factory=list)
    recencyBoost: float = 0.0
    experienceBoost: float = 0.0
    metadata: Optional[Dict[str, Any]] = None


class JobMatchDocument(BaseModel):
    userId: str
    targetRole: str
    matches: List[JobMatchItem] = Field(default_factory=list)
    generatedAt: datetime = Field(default_factory=datetime.utcnow)
    metadata: Optional[Dict[str, Any]] = None


class JobMatchRequest(BaseModel):
    userId: str = "anonymous"
    targetRole: str = "Software Engineer"
    resumeText: Optional[str] = None
    jobFeed: List[Dict[str, Any]] = Field(default_factory=list)
    location: Optional[str] = None
    experienceYears: Optional[int] = None
    topN: int = 5
    forceRefresh: bool = False
