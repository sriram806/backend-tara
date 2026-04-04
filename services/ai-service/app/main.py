from fastapi import FastAPI
from app.routers.health import router as health_router


def create_app() -> FastAPI:
    app = FastAPI(
        title="Think AI - AI Service",
        version="0.1.0",
        docs_url="/docs",
        redoc_url="/redoc"
    )

    app.include_router(health_router)
    return app


app = create_app()
