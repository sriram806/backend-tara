from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field


InterviewType = Literal["technical", "behavioral", "hr"]
MessageRole = Literal["user", "assistant", "system"]


class InterviewMessage(BaseModel):
    role: MessageRole
    content: str = Field(min_length=1, max_length=4000)
    timestamp: Optional[str] = None


class QuestionRequest(BaseModel):
    sessionId: str = Field(min_length=8, max_length=128)
    userId: str = Field(min_length=1, max_length=128)
    role: str = Field(min_length=2, max_length=120)
    type: InterviewType
    messages: List[InterviewMessage] = Field(default_factory=list)


class StreamResponseRequest(BaseModel):
    sessionId: str = Field(min_length=8, max_length=128)
    userId: str = Field(min_length=1, max_length=128)
    role: str = Field(min_length=2, max_length=120)
    type: InterviewType
    userMessage: str = Field(min_length=1, max_length=2000)
    messages: List[InterviewMessage] = Field(default_factory=list)


class EvaluateRequest(BaseModel):
    sessionId: str = Field(min_length=8, max_length=128)
    userId: str = Field(min_length=1, max_length=128)
    role: str = Field(min_length=2, max_length=120)
    type: InterviewType
    messages: List[InterviewMessage] = Field(default_factory=list)


class InterviewScores(BaseModel):
    technicalAccuracy: int = Field(ge=1, le=10)
    communicationClarity: int = Field(ge=1, le=10)
    confidence: int = Field(ge=1, le=10)


class EvaluateResponse(BaseModel):
    scores: InterviewScores
    feedback: List[str] = Field(default_factory=list)
    improvements: List[str] = Field(default_factory=list)
