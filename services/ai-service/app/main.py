from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import sentry_sdk
from app.routers.health import router as health_router
from app.routers.career import router as career_router
from app.routers.resume import router as resume_router
from app.routers.roadmap import router as roadmap_router
from app.routers.jobs import router as jobs_router
from app.routers.interview import router as interview_router
from app.routers.github import router as github_router
from app.core.config import settings
from app.workers.bullmq_consumer import start_worker

if settings.SENTRY_DSN:
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
        environment=settings.ENVIRONMENT
    )

worker_instance = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global worker_instance
    try:
        worker_instance = start_worker()
        print("Started AI BullMQ Worker")
    except Exception as e:
        print(f"Failed to start worker: {e}")
    yield
    if worker_instance:
        await worker_instance.close()

def create_app() -> FastAPI:
    allowed_origins = [
        origin.strip()
        for origin in settings.CORS_ORIGIN.split(",")
        if origin.strip()
    ]

    app = FastAPI(
        title="Think AI - AI Service",
        version="0.1.0",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health_router)
    app.include_router(career_router)
    app.include_router(resume_router)
    app.include_router(roadmap_router)
    app.include_router(jobs_router)
    app.include_router(interview_router)
    app.include_router(github_router)
    return app


app = create_app()
