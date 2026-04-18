from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.models.interview_session import EvaluateRequest, QuestionRequest, StreamResponseRequest
from app.services.interview_service import interview_service

router = APIRouter(prefix="/ai/interview", tags=["Interview AI"])


@router.post("/questions")
async def generate_question(payload: QuestionRequest):
    try:
        result = await interview_service.generate_question(payload)
        return {"success": True, "data": result}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/stream-response")
async def stream_response(payload: StreamResponseRequest):
    try:
        return StreamingResponse(
            interview_service.stream_response(payload),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/evaluate")
async def evaluate(payload: EvaluateRequest):
    try:
        result = await interview_service.evaluate(payload)
        return {"success": True, "data": result.model_dump()}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
