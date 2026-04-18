from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class RoadmapTask(BaseModel):
    day: int
    title: str
    description: str
    difficulty: str
    type: str


class RoadmapPhase(BaseModel):
    title: str
    days: List[RoadmapTask] = Field(default_factory=list)


class RoadmapDocument(BaseModel):
    roadmapId: str
    userId: str
    targetRole: str
    skillGaps: List[str] = Field(default_factory=list)
    phases: List[RoadmapPhase] = Field(default_factory=list)
    durationDays: int = 90
    version: int = 1
    adaptationNotes: List[str] = Field(default_factory=list)
    source: str = "hybrid"
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    metadata: Optional[Dict[str, Any]] = None


class RoadmapGenerateRequest(BaseModel):
    userId: str = "anonymous"
    targetRole: str = "Software Engineer"
    skillGaps: List[str] = Field(default_factory=list)
    durationDays: int = 90
    adaptiveContext: Optional[Dict[str, Any]] = None
    forceRefresh: bool = False


class RoadmapAdaptRequest(BaseModel):
    userId: str = "anonymous"
    targetRole: str = "Software Engineer"
    skillGaps: List[str] = Field(default_factory=list)
    missedDays: int = 0
    irrelevantTasks: List[str] = Field(default_factory=list)
    baseRoadmap: Optional[Dict[str, Any]] = None
