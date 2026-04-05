from contextlib import asynccontextmanager
from fastapi import FastAPI
from app.routers.health import router as health_router
from app.routers.career import router as career_router
from app.routers.resume import router as resume_router
from app.workers.bullmq_consumer import start_worker

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
    app = FastAPI(
        title="Think AI - AI Service",
        version="0.1.0",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan
    )

    app.include_router(health_router)
    app.include_router(career_router)
    app.include_router(resume_router)
    return app


app = create_app()
