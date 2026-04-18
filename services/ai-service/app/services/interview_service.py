from __future__ import annotations

import json
import os
import re
from typing import Any, AsyncGenerator, Dict, Iterable, List

from anthropic import AsyncAnthropic

from app.database import redis_client
from app.models.interview_session import EvaluateRequest, EvaluateResponse, InterviewMessage, InterviewScores, QuestionRequest, StreamResponseRequest
from app.services.resume_service import resume_service
from app.utils.security import sanitize_input


class InterviewAIService:
    def __init__(self) -> None:
        self.anthropic_api_key = os.getenv("ANTHROPIC_API_KEY", "")
        self.anthropic_model = os.getenv("ANTHROPIC_MODEL", "claude-3-5-sonnet-20241022")
        self.session_ttl_seconds = int(os.getenv("INTERVIEW_SESSION_TTL_SECONDS", "21600"))
        self.max_history_messages = int(os.getenv("INTERVIEW_MAX_HISTORY", "40"))
        self.max_response_tokens = int(os.getenv("INTERVIEW_MAX_RESPONSE_TOKENS", "300"))
        self.client = AsyncAnthropic(api_key=self.anthropic_api_key) if self.anthropic_api_key else None
        self._resume_summary_context = ""

    async def generate_question(self, payload: QuestionRequest) -> Dict[str, Any]:
        context = await self._load_context(payload.sessionId, payload.userId, payload.role, payload.type, payload.messages)
        self._resume_summary_context = str(context.get("resumeSummary", ""))
        confidence = self._estimate_confidence(payload.messages)
        difficulty = self._pick_difficulty(confidence, payload.messages)
        question_prompt = self._build_question_prompt(payload.role, payload.type, difficulty, payload.messages)

        question = await self._generate_text(question_prompt, max_tokens=180)
        if not question.strip():
            question = self._fallback_question(payload.role, payload.type, difficulty)

        context["lastDifficulty"] = difficulty
        context["lastConfidenceScore"] = confidence
        context["lastQuestion"] = question
        await self._save_context(payload.sessionId, context)

        return {
            "question": question.strip(),
            "difficulty": difficulty,
            "confidenceScore": confidence,
        }

    async def stream_response(self, payload: StreamResponseRequest) -> AsyncGenerator[str, None]:
        context = await self._load_context(payload.sessionId, payload.userId, payload.role, payload.type, payload.messages)
        self._resume_summary_context = str(context.get("resumeSummary", ""))
        user_message = sanitize_input(payload.userMessage)

        if not user_message:
            yield self._sse_data({"error": "Message is empty after sanitization"})
            yield self._sse_data({"done": True})
            return

        prompt = self._build_stream_prompt(payload.role, payload.type, user_message, payload.messages)

        assistant_text = ""
        try:
            if self.client is None:
                mock = self._mock_stream_reply(payload.type)
                for token in mock.split(" "):
                    chunk = token + " "
                    assistant_text += chunk
                    yield self._sse_data({"token": chunk})
            else:
                stream = await self.client.messages.stream(
                    model=self.anthropic_model,
                    max_tokens=self.max_response_tokens,
                    temperature=0.2,
                    messages=[{"role": "user", "content": prompt}],
                )
                async with stream as response_stream:
                    async for text in response_stream.text_stream:
                        if text:
                            assistant_text += text
                            yield self._sse_data({"token": text})
        except Exception as exc:
            yield self._sse_data({"error": f"Streaming failed: {str(exc)}"})
            yield self._sse_data({"done": True})
            return

        await self._append_context_messages(payload.sessionId, [
            InterviewMessage(role="user", content=user_message),
            InterviewMessage(role="assistant", content=assistant_text.strip()),
        ])

        yield self._sse_data({"done": True})

    async def evaluate(self, payload: EvaluateRequest) -> EvaluateResponse:
        context = await self._load_context(payload.sessionId, payload.userId, payload.role, payload.type, payload.messages)
        self._resume_summary_context = str(context.get("resumeSummary", ""))
        prompt = self._build_evaluation_prompt(payload.role, payload.type, payload.messages)

        evaluation_json: Dict[str, Any]
        try:
            raw = await self._generate_text(prompt, max_tokens=400)
            evaluation_json = self._coerce_json(raw)
        except Exception:
            evaluation_json = self._heuristic_evaluation(payload.messages)

        scores = evaluation_json.get("scores") if isinstance(evaluation_json.get("scores"), dict) else {}
        response = EvaluateResponse(
            scores=InterviewScores(
                technicalAccuracy=int(self._clip(scores.get("technicalAccuracy", 6), 1, 10)),
                communicationClarity=int(self._clip(scores.get("communicationClarity", 6), 1, 10)),
                confidence=int(self._clip(scores.get("confidence", 6), 1, 10)),
            ),
            feedback=[str(item) for item in evaluation_json.get("feedback", [])][:6],
            improvements=[str(item) for item in evaluation_json.get("improvements", [])][:6],
        )

        context["finalScores"] = response.scores.model_dump()
        context["finalFeedback"] = response.feedback
        context["finalImprovements"] = response.improvements
        await self._save_context(payload.sessionId, context)

        return response

    async def _generate_text(self, prompt: str, max_tokens: int) -> str:
        if self.client is None:
            return ""

        response = await self.client.messages.create(
            model=self.anthropic_model,
            max_tokens=max_tokens,
            temperature=0.2,
            messages=[{"role": "user", "content": prompt}],
        )

        parts: List[str] = []
        for block in response.content:
            text = getattr(block, "text", None)
            if isinstance(text, str):
                parts.append(text)

        return "".join(parts).strip()

    async def _load_context(
        self,
        session_id: str,
        user_id: str,
        role: str,
        interview_type: str,
        fallback_messages: Iterable[InterviewMessage],
    ) -> Dict[str, Any]:
        key = self._context_key(session_id)
        raw = await redis_client.get(key)

        if raw:
            try:
                context = json.loads(raw)
            except Exception:
                context = {}
        else:
            context = {}

        context.setdefault("sessionId", session_id)
        context.setdefault("userId", user_id)
        context.setdefault("role", role)
        context.setdefault("type", interview_type)
        context.setdefault("resumeSummary", await self._build_resume_summary(user_id))

        if not context.get("messages"):
            context["messages"] = [msg.model_dump() for msg in fallback_messages][-self.max_history_messages :]

        return context

    async def _save_context(self, session_id: str, context: Dict[str, Any]) -> None:
        await redis_client.set(self._context_key(session_id), json.dumps(context), ex=self.session_ttl_seconds)

    async def _append_context_messages(self, session_id: str, messages: List[InterviewMessage]) -> None:
        context = await self._load_context(session_id, "unknown", "unknown", "technical", [])
        current = context.get("messages", [])
        for msg in messages:
            current.append(msg.model_dump())
        context["messages"] = current[-self.max_history_messages :]
        await self._save_context(session_id, context)

    def _build_question_prompt(self, role: str, interview_type: str, difficulty: str, messages: List[InterviewMessage]) -> str:
        recent_answers = [m.content for m in messages if m.role == "user"][-3:]
        summarized = " | ".join(recent_answers) if recent_answers else "No prior answers"
        resume_summary = getattr(self, "_resume_summary_context", "")

        return (
            "You are an expert interviewer. Output ONLY one concise interview question. "
            f"Role: {sanitize_input(role)}. Interview type: {interview_type}. "
            f"Candidate resume summary: {sanitize_input(resume_summary)}. "
            f"Difficulty: {difficulty}. Candidate recent answers: {sanitize_input(summarized)}. "
            "Question should be specific and practical. No bullets, no commentary."
        )

    def _build_stream_prompt(self, role: str, interview_type: str, user_message: str, messages: List[InterviewMessage]) -> str:
        previous_question = next((m.content for m in reversed(messages) if m.role == "assistant"), "")
        resume_summary = getattr(self, "_resume_summary_context", "")
        return (
            "You are an interview coach speaking in real-time. "
            f"Interview type: {interview_type}. Role: {sanitize_input(role)}. "
            f"Candidate resume summary: {sanitize_input(resume_summary)}. "
            f"Latest interview question: {sanitize_input(previous_question)}. "
            f"Candidate answer: {sanitize_input(user_message)}. "
            "Provide a brief interviewer response in 2-4 sentences: acknowledge, evaluate quality, and nudge improvement."
        )

    def _build_evaluation_prompt(self, role: str, interview_type: str, messages: List[InterviewMessage]) -> str:
        transcript = [m.model_dump() for m in messages][-30:]
        resume_summary = getattr(self, "_resume_summary_context", "")
        return (
            "Evaluate this interview transcript and return ONLY raw JSON with this shape: "
            '{"scores":{"technicalAccuracy":1-10,"communicationClarity":1-10,"confidence":1-10},'
            '"feedback":["..."],"improvements":["..."]}. '
            f"Interview type: {interview_type}. Role: {sanitize_input(role)}. "
            f"Candidate resume summary: {sanitize_input(resume_summary)}. "
            f"Transcript: {json.dumps(transcript, ensure_ascii=True)}"
        )

    async def _build_resume_summary(self, user_id: str) -> str:
        if not user_id or user_id == "anonymous":
            return ""

        try:
            stored_resume = await resume_service.get_stored_resume(user_id)
        except Exception:
            return ""

        structured = stored_resume.get("structured_resume") or {}
        skills = ", ".join(
            str(item.get("name", item)) for item in structured.get("skills", [])[:8]
        ) if isinstance(structured, dict) else ""
        experience = structured.get("experience", []) if isinstance(structured, dict) else []
        latest_experience = ""
        if isinstance(experience, list) and experience:
            latest = experience[0]
            if isinstance(latest, dict):
                latest_experience = " ".join(str(bullet) for bullet in latest.get("bullets", [])[:2])

        summary_parts = [skills, latest_experience]
        return " | ".join(part for part in summary_parts if part)

    def _estimate_confidence(self, messages: List[InterviewMessage]) -> float:
        answers = [m.content for m in messages if m.role == "user"][-3:]
        if not answers:
            return 0.5

        score = 0.0
        for answer in answers:
            clean = sanitize_input(answer)
            words = len(clean.split())
            has_structure = bool(re.search(r"\b(first|second|because|therefore|result)\b", clean, re.IGNORECASE))
            score += min(words / 120.0, 1.0)
            if has_structure:
                score += 0.2
            if re.search(r"\b(maybe|not sure|probably)\b", clean, re.IGNORECASE):
                score -= 0.15

        normalized = score / max(len(answers), 1)
        return round(self._clip(normalized, 0.1, 0.95), 2)

    def _pick_difficulty(self, confidence: float, messages: List[InterviewMessage]) -> str:
        answer_count = len([m for m in messages if m.role == "user"])
        if answer_count < 2:
            return "medium"
        if confidence >= 0.72:
            return "hard"
        if confidence <= 0.45:
            return "easy"
        return "medium"

    def _fallback_question(self, role: str, interview_type: str, difficulty: str) -> str:
        if interview_type == "behavioral":
            return f"Tell me about a time you handled conflict while working as a {role}. What was your approach and outcome?"
        if interview_type == "hr":
            return f"Why are you interested in this {role} opportunity, and how does it align with your long-term goals?"
        if difficulty == "hard":
            return f"For a senior {role}, design a resilient system and explain key trade-offs under heavy traffic."
        if difficulty == "easy":
            return f"As a {role}, walk me through a recent project and your main technical contribution."
        return f"As a {role}, explain how you would break down and solve a moderately complex production issue."

    def _mock_stream_reply(self, interview_type: str) -> str:
        if interview_type == "technical":
            return "Good structure overall. Add concrete trade-offs and mention a measurable impact to strengthen your answer."
        if interview_type == "behavioral":
            return "You explained the situation clearly. Emphasize your specific actions and the final result with metrics."
        return "Clear motivation. Include a sharper example showing ownership and collaboration to make this stronger."

    def _heuristic_evaluation(self, messages: List[InterviewMessage]) -> Dict[str, Any]:
        answers = [m.content for m in messages if m.role == "user"]
        avg_words = sum(len(a.split()) for a in answers) / max(len(answers), 1)
        confidence = 6 if avg_words > 40 else 5

        return {
            "scores": {
                "technicalAccuracy": 6,
                "communicationClarity": int(self._clip(4 + avg_words / 25, 1, 10)),
                "confidence": confidence,
            },
            "feedback": [
                "Responses showed a reasonable understanding of core concepts.",
                "Communication was generally clear with room for tighter structure.",
            ],
            "improvements": [
                "Use more quantified outcomes in examples.",
                "State assumptions and trade-offs explicitly.",
                "Keep answers concise using a repeatable framework (e.g., STAR).",
            ],
        }

    def _coerce_json(self, raw_text: str) -> Dict[str, Any]:
        cleaned = raw_text.strip()
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start == -1 or end == -1 or end < start:
            raise ValueError("No JSON object found")

        return json.loads(cleaned[start : end + 1])

    def _sse_data(self, payload: Dict[str, Any]) -> str:
        return f"data: {json.dumps(payload, ensure_ascii=True)}\n\n"

    def _context_key(self, session_id: str) -> str:
        return f"interview:session:{session_id}"

    @staticmethod
    def _clip(value: Any, min_value: float, max_value: float) -> float:
        numeric = float(value)
        if numeric < min_value:
            return min_value
        if numeric > max_value:
            return max_value
        return numeric


interview_service = InterviewAIService()
