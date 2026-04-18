from fastapi import APIRouter
from app.core.config import settings
from app.database import db, redis_client

router = APIRouter()


@router.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": getattr(settings, "SERVICE_NAME", "ai-service")
    }


@router.get("/ready")
async def ready() -> dict[str, object]:
    redis_ready = False
    mongo_ready = False

    try:
        redis_ready = await redis_client.ping()
    except Exception:
        redis_ready = False

    try:
        await db.command("ping")
        mongo_ready = True
    except Exception:
        mongo_ready = False

    return {
        "status": "ok" if redis_ready and mongo_ready else "degraded",
        "service": getattr(settings, "SERVICE_NAME", "ai-service"),
        "dependencies": {
            "redis": redis_ready,
            "mongo": mongo_ready
        }
    }
