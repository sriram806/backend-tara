from __future__ import annotations

from datetime import datetime, timedelta
import hashlib
import json
from typing import Any, Dict, Optional

from app.core.config import settings
from app.database import db, redis_client
from app.models.career_analysis_report import CareerAnalysisReport
from app.services.llm_gateway import llm_gateway
from app.services.nlp_pipeline import nlp_pipeline
from app.services.semantic_matcher import semantic_matcher
from app.utils.security import sanitize_input


def _stable_payload_hash(payload: Dict[str, Any]) -> str:
    encoded = json.dumps(payload, sort_keys=True, ensure_ascii=True)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _extract_resume_text(data: Dict[str, Any]) -> str:
    resume_text = sanitize_input(str(data.get("resumeText", "")))
    if resume_text.strip():
        return resume_text

    resume_data = data.get("resumeData", {}) or {}
    return sanitize_input(json.dumps(resume_data, ensure_ascii=True))


def _dummy_llm_result(target_role: str, semantic: Dict[str, Any], github_score: Optional[float], quiz_score: Optional[float]) -> Dict[str, Any]:
    matched = semantic.get("matchedSkills", [])
    missing = semantic.get("missingSkills", [])
    similarity = float(semantic.get("similarityScore", 0.0))
    base = 55 + int(similarity * 35)
    bonus = 0
    if github_score is not None:
        bonus += int(min(max(github_score, 0), 100) * 0.05)
    if quiz_score is not None:
        bonus += int(min(max(quiz_score, 0), 100) * 0.05)
    score = max(0, min(100, base + bonus))

    return {
        "readinessScore": score,
        "strengths": matched[:4] if matched else ["Problem solving", "Learning agility"],
        "skillGaps": missing[:5],
        "recommendations": [
            f"Prioritize projects that demonstrate {target_role} responsibilities",
            "Add quantified outcomes to recent work experience",
            "Prepare 3 STAR stories tied to system impact and ownership",
        ],
        "marketInsights": {
            "trend": "Hiring favors candidates with measurable delivery impact",
            "demandLevel": "high",
            "topSkillsToPrioritize": missing[:3],
        },
    }


def _coerce_llm_result(payload: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "readinessScore": int(max(0, min(100, int(payload.get("readinessScore", 0))))),
        "strengths": [str(x) for x in payload.get("strengths", [])][:8],
        "skillGaps": [str(x) for x in payload.get("skillGaps", [])][:10],
        "recommendations": [str(x) for x in payload.get("recommendations", [])][:10],
        "marketInsights": payload.get("marketInsights", {}) if isinstance(payload.get("marketInsights", {}), dict) else {},
    }


def _json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        cleaned = {}
        for k, v in value.items():
            if k == "_id":
                continue
            cleaned[k] = _json_safe(v)
        return cleaned
    if isinstance(value, list):
        return [_json_safe(v) for v in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


async def _get_latest_report_document(user_id: str) -> Optional[Dict[str, Any]]:
    if db is None or not user_id:
        return None
    try:
        return await db.career_analysis_reports.find_one({"userId": user_id}, sort=[("createdAt", -1)])
    except Exception:
        return None


def _is_cooldown_active(created_at: Optional[datetime]) -> bool:
    if not created_at:
        return False
    window = timedelta(hours=settings.CAREER_ANALYSIS_COOLDOWN_HOURS)
    return datetime.utcnow() - created_at < window


def _build_prompt(target_role: str, nlp_features: Dict[str, Any], semantic: Dict[str, Any], github_score: Optional[float], quiz_score: Optional[float]) -> str:
    return f"""
You are an expert career strategist. Provide concise, realistic analysis as strict JSON.

Target role: {target_role}
Extracted NLP Features: {json.dumps(nlp_features, ensure_ascii=True)}
Semantic Match Result: {json.dumps(semantic, ensure_ascii=True)}
GitHub score: {github_score}
Quiz score: {quiz_score}

Respond with exactly this JSON schema:
{{
  "readinessScore": <0-100 integer>,
  "strengths": [<string>],
  "skillGaps": [<string>],
  "recommendations": [<string>],
  "marketInsights": {{
    "trend": <string>,
    "demandLevel": <string>,
    "topSkillsToPrioritize": [<string>]
  }}
}}
"""


async def get_latest_career_report(user_id: str) -> Optional[Dict[str, Any]]:
    latest = await _get_latest_report_document(user_id)
    if not latest:
        return None
    latest.pop("_id", None)
    return latest


async def analyze_career(data: Dict[str, Any], user_id: str = None, force_refresh: bool = False) -> Dict[str, Any]:
    effective_user_id = user_id or str(data.get("userId") or "anonymous")
    target_role = sanitize_input(str(data.get("targetRole", "General Career"))) or "General Career"
    github_score = data.get("githubScore")
    quiz_score = data.get("quizScore")

    resume_text = _extract_resume_text(data)
    if len(resume_text.strip()) < 20:
        raise ValueError("Resume input is too short for analysis")

    if len(resume_text) > settings.MAX_RESUME_CHARS:
        raise ValueError(f"Resume input exceeds max allowed length: {settings.MAX_RESUME_CHARS}")

    cache_payload = {
        "userId": effective_user_id,
        "targetRole": target_role,
        "resumeText": resume_text,
        "githubScore": github_score,
        "quizScore": quiz_score,
    }
    cache_key = f"career:analysis:{_stable_payload_hash(cache_payload)}"

    if not force_refresh:
        try:
            cached = await redis_client.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception:
            pass

    if effective_user_id != "anonymous" and not force_refresh:
        latest = await _get_latest_report_document(effective_user_id)
        if latest and _is_cooldown_active(latest.get("createdAt")):
            latest.pop("_id", None)
            latest["cooldownActive"] = True
            return latest

    nlp_features = nlp_pipeline.run(resume_text)
    semantic = semantic_matcher.compare(nlp_features.get("skills", []), target_role)

    if settings.AI_MOCK_MODE:
        llm_result = _dummy_llm_result(target_role, semantic, github_score, quiz_score)
    else:
        prompt = _build_prompt(target_role, nlp_features, semantic, github_score, quiz_score)
        llm_result = await llm_gateway.generate_json(prompt, user_id=effective_user_id)

    result = _coerce_llm_result(llm_result)

    report = CareerAnalysisReport(
        userId=effective_user_id,
        targetRole=target_role,
        readinessScore=result["readinessScore"],
        strengths=result["strengths"],
        skillGaps=result["skillGaps"],
        recommendations=result["recommendations"],
        marketInsights=result["marketInsights"],
        modelVersion=settings.AI_MODEL_VERSION,
        similarityScore=float(semantic.get("similarityScore", 0.0)),
        matchedSkills=[str(x) for x in semantic.get("matchedSkills", [])],
        extractedSkills=[str(x) for x in nlp_features.get("skills", [])],
        source="hybrid",
        metadata={
            "githubScore": github_score,
            "quizScore": quiz_score,
            "experienceYears": nlp_features.get("experienceYears", 0),
            "entityCount": len(nlp_features.get("entities", [])),
        },
    )

    payload = report.model_dump()

    if db is not None:
        try:
            await db.career_analysis_reports.insert_one(payload)
        except Exception:
            pass

    payload = _json_safe(payload)

    try:
        await redis_client.set(cache_key, json.dumps(payload), ex=settings.CAREER_ANALYSIS_CACHE_SECONDS)
    except Exception:
        pass

    return payload
