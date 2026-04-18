import os
from pathlib import Path
from pydantic_settings import BaseSettings

ENV_FILE = Path(__file__).resolve().parents[3] / ".env"

class Settings(BaseSettings):
    SERVICE_NAME: str = "ai-service"
    ENVIRONMENT: str = "development"
    AI_MOCK_MODE: bool = False
    AI_MODEL_VERSION: str = "career-analyzer-v1"
    SPACY_MODEL_NAME: str = "en_core_web_sm"
    SEMANTIC_MODEL_NAME: str = "all-MiniLM-L6-v2"
    CAREER_ANALYSIS_COOLDOWN_HOURS: int = 24
    CAREER_ANALYSIS_CACHE_SECONDS: int = 3600
    MAX_RESUME_CHARS: int = 15000
    MAX_RESUME_FILE_SIZE_BYTES: int = 5 * 1024 * 1024
    RESUME_CACHE_SECONDS: int = 3600
    RESUME_ANALYSIS_QUEUE_NAME: str = "resume-analysis"
    ROADMAP_GENERATE_QUEUE_NAME: str = "roadmap-generate"
    RESUME_COLLECTION_NAME: str = "resume_analysis"
    ROADMAP_QUEUE_NAME: str = "roadmap-queue"
    JOBS_QUEUE_NAME: str = "jobs-queue"
    ROADMAP_COLLECTION_NAME: str = "roadmap_documents"
    JOB_FEED_COLLECTION_NAME: str = "job_feed_cache"
    OPENAI_EMBEDDING_MODEL: str = "text-embedding-3-small"
    EMBEDDING_CACHE_SECONDS: int = 24 * 60 * 60
    
    MONGO_URL: str = "mongodb://mongodb:27017/thinkai"
    REDIS_URL: str = "redis://redis:6379"
    DATABASE_URL: str = ""
    CORS_ORIGIN: str = "http://localhost:3000,http://localhost:3001"
    SENTRY_DSN: str = ""
    SENTRY_TRACES_SAMPLE_RATE: float = 0.1
    METRICS_NAMESPACE: str = "ThinkAI/Services"

    # AI Provider Keys
    OPENAI_API_KEY: str = ""
    DEEPSEEK_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    
    # Models
    OPENAI_MODEL: str = "gpt-4o"
    GEMINI_MODEL: str = "gemma-4-31b-it"
    DEEPSEEK_MODEL: str = "deepseek-chat"
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com"
    
    class Config:
        env_file = str(ENV_FILE)
        extra = "allow"

settings = Settings()
