import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    SERVICE_NAME: str = "ai-service"
    ENVIRONMENT: str = "development"
    AI_MOCK_MODE: bool = True
    AI_MODEL_VERSION: str = "career-analyzer-v1"
    SPACY_MODEL_NAME: str = "en_core_web_sm"
    SEMANTIC_MODEL_NAME: str = "all-MiniLM-L6-v2"
    CAREER_ANALYSIS_COOLDOWN_HOURS: int = 24
    CAREER_ANALYSIS_CACHE_SECONDS: int = 3600
    MAX_RESUME_CHARS: int = 15000
    
    MONGO_URL: str = "mongodb://mongodb:27017/thinkai"
    REDIS_URL: str = "redis://localhost:6379"

    # AI Provider Keys
    OPENAI_API_KEY: str = ""
    DEEPSEEK_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    
    # Models
    OPENAI_MODEL: str = "gpt-4o"
    DEEPSEEK_MODEL: str = "deepseek-chat"
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com"
    
    class Config:
        env_file = ".env"
        extra = "allow"

settings = Settings()
