from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional

class PromptLog(BaseModel):
    model: str
    tokens_used: int
    cost_estimate: float
    latency: float
    user_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
