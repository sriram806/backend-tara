from __future__ import annotations

import hashlib
import json
import math
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.core.config import settings
from app.database import db, redis_client
from app.models.job_match_document import JobMatchDocument, JobMatchItem
from app.services.embedding_service import embedding_service
from app.services.pgvector_store import pgvector_store
from app.services.skill_dictionary import expected_skills_for_role, normalize_skill
from app.utils.security import sanitize_input, scrub_pii


def _stable_hash(payload: Dict[str, Any]) -> str:
    encoded = json.dumps(payload, sort_keys=True, ensure_ascii=True)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _cosine(v1: List[float], v2: List[float]) -> float:
    dot = sum(a * b for a, b in zip(v1, v2))
    n1 = math.sqrt(sum(a * a for a in v1))
    n2 = math.sqrt(sum(b * b for b in v2))
    if not n1 or not n2:
        return 0.0
    return dot / (n1 * n2)


class JobMatchingService:
    def _collection(self):
        return getattr(db, settings.JOB_FEED_COLLECTION_NAME)

    def _cache_key(self, user_id: str, target_role: str, resume_text: str, location: Optional[str], experience_years: Optional[int], top_n: int) -> str:
        payload = {
            "userId": user_id,
            "targetRole": target_role,
            "resumeText": resume_text,
            "location": location,
            "experienceYears": experience_years,
            "topN": top_n,
        }
        return f"jobs:match:{_stable_hash(payload)}"

    def _normalize_feed_item(self, item: Dict[str, Any]) -> Dict[str, Any]:
        title = str(item.get("title") or item.get("jobTitle") or "Untitled role")
        company = str(item.get("company") or item.get("companyName") or "Unknown company")
        description = str(item.get("description") or item.get("jobDescription") or "")
        skills = item.get("skills") or item.get("requiredSkills") or []
        if isinstance(skills, str):
            skills = [part.strip() for part in skills.split(",") if part.strip()]
        normalized_skills = [normalize_skill(skill) for skill in skills if normalize_skill(skill)]

        return {
            "jobId": str(item.get("jobId") or item.get("id") or uuid.uuid4()),
            "title": title,
            "company": company,
            "location": item.get("location"),
            "description": description,
            "skills": normalized_skills,
            "postedAt": item.get("postedAt") or item.get("createdAt"),
            "minExperienceYears": item.get("minExperienceYears") or item.get("experienceYears"),
        }

    def _build_reason(self, matched_skills: List[str], expected_skills: List[str], location: Optional[str], recency_boost: float) -> str:
        if matched_skills:
            reason = f"Matched because of {', '.join(matched_skills[:3])}"
        else:
            reason = f"Aligned with {expected_skills[0] if expected_skills else 'role requirements'}"
        if location:
            reason += f" and location preference {location}"
        if recency_boost > 0:
            reason += " with recent posting boost"
        return reason

    def _boosts(self, job: Dict[str, Any], location: Optional[str], experience_years: Optional[int]) -> Dict[str, float]:
        recency_boost = 0.0
        posted_at = job.get("postedAt")
        if posted_at:
            try:
                posted_dt = datetime.fromisoformat(str(posted_at).replace("Z", "+00:00"))
                age_days = max((datetime.now(timezone.utc) - posted_dt.astimezone(timezone.utc)).days, 0)
                recency_boost = max(0.0, 0.12 - (age_days * 0.01))
            except Exception:
                recency_boost = 0.0

        experience_boost = 0.0
        min_years = job.get("minExperienceYears")
        if experience_years is not None and min_years is not None:
            try:
                min_years_int = int(min_years)
                if experience_years >= min_years_int:
                    experience_boost = 0.08
                else:
                    experience_boost = max(-0.1, -0.02 * (min_years_int - experience_years))
            except Exception:
                experience_boost = 0.0

        location_boost = 0.0
        if location and job.get("location"):
            if location.lower().strip() in str(job.get("location")).lower():
                location_boost = 0.06

        return {
            "recencyBoost": recency_boost,
            "experienceBoost": experience_boost + location_boost,
        }

    async def _match_local_feed(
        self,
        resume_embedding: List[float],
        resume_skills: List[str],
        job_feed: List[Dict[str, Any]],
        target_role: str,
        location: Optional[str],
        experience_years: Optional[int],
        top_n: int,
    ) -> List[Dict[str, Any]]:
        expected_skills = expected_skills_for_role(target_role)
        resume_skill_set = {normalize_skill(skill).lower() for skill in resume_skills}
        scored: List[Dict[str, Any]] = []

        for raw_job in job_feed:
            job = self._normalize_feed_item(raw_job)
            job_text = " ".join([job.get("title", ""), job.get("company", ""), job.get("description", ""), " ".join(job.get("skills", []))])
            job_embedding = await embedding_service.embed_text(scrub_pii(sanitize_input(job_text)), cache=True)
            similarity = _cosine(resume_embedding, job_embedding)
            boosts = self._boosts(job, location, experience_years)

            job_skill_set = {normalize_skill(skill).lower() for skill in job.get("skills", [])}
            matched_skills = [skill for skill in expected_skills if skill.lower() in resume_skill_set or skill.lower() in job_skill_set]
            missing_skills = [skill for skill in expected_skills if skill.lower() not in resume_skill_set and skill.lower() not in job_skill_set]

            score = min(1.0, max(0.0, similarity + boosts["recencyBoost"] + boosts["experienceBoost"]))
            scored.append({
                "jobId": job["jobId"],
                "title": job["title"],
                "company": job["company"],
                "location": job.get("location"),
                "similarityScore": round(score, 4),
                "reason": self._build_reason(matched_skills, expected_skills, job.get("location") or location, boosts["recencyBoost"]),
                "matchedSkills": matched_skills[:5],
                "missingSkills": missing_skills[:5],
                "recencyBoost": round(boosts["recencyBoost"], 4),
                "experienceBoost": round(boosts["experienceBoost"], 4),
                "metadata": job,
            })

        scored.sort(key=lambda item: item["similarityScore"], reverse=True)
        return scored[:top_n]

    async def match_jobs(
        self,
        user_id: str,
        target_role: str,
        resume_text: str,
        parsed_resume: Optional[Dict[str, Any]],
        job_feed: List[Dict[str, Any]],
        location: Optional[str] = None,
        experience_years: Optional[int] = None,
        top_n: int = 5,
        force_refresh: bool = False,
    ) -> Dict[str, Any]:
        cleaned_resume = scrub_pii(sanitize_input(resume_text or ""))
        if not cleaned_resume:
            raise ValueError("Resume text is required for job matching")

        cache_key = self._cache_key(user_id, target_role, cleaned_resume, location, experience_years, top_n)
        if not force_refresh:
            try:
                cached = await redis_client.get(cache_key)
                if cached:
                    return json.loads(cached)
            except Exception:
                pass

        resume_embedding = await embedding_service.embed_text(cleaned_resume, cache=True)
        parsed_resume = parsed_resume or {}
        raw_skills = parsed_resume.get("skills", []) if isinstance(parsed_resume, dict) else []
        resume_skills = [normalize_skill(skill) for skill in raw_skills if normalize_skill(skill)] or expected_skills_for_role(target_role)

        if job_feed:
            matches = await self._match_local_feed(resume_embedding, resume_skills, job_feed, target_role, location, experience_years, top_n)
        else:
            matches = []
            if not settings.AI_MOCK_MODE:
                matches = await pgvector_store.search_jobs(resume_embedding, limit=top_n, location=location, experience_years=experience_years)

        document = JobMatchDocument(
            userId=user_id,
            targetRole=target_role,
            matches=[JobMatchItem(**match) for match in matches],
            generatedAt=datetime.utcnow(),
            metadata={
                "location": location,
                "experienceYears": experience_years,
                "sourceCount": len(job_feed),
                "embeddingModel": settings.OPENAI_EMBEDDING_MODEL,
            },
        )
        payload = document.model_dump(mode="json")
        response_payload = json.loads(json.dumps(payload, default=str))
        stored_payload = json.loads(json.dumps(response_payload, default=str))

        collection = self._collection()
        await collection.insert_one(stored_payload)

        if job_feed:
            try:
                await pgvector_store.upsert_resume_embedding(user_id, resume_embedding, {"targetRole": target_role})
                for job in job_feed:
                    normalized = self._normalize_feed_item(job)
                    job_text = " ".join([normalized.get("title", ""), normalized.get("company", ""), normalized.get("description", ""), " ".join(normalized.get("skills", []))])
                    job_embedding = await embedding_service.embed_text(job_text, cache=True)
                    await pgvector_store.upsert_job_embedding(normalized["jobId"], job_embedding, normalized)
            except Exception:
                pass

        try:
            await redis_client.set(cache_key, json.dumps(response_payload, default=str), ex=settings.CAREER_ANALYSIS_CACHE_SECONDS)
            await redis_client.set(f"jobs:match:latest:{user_id}", json.dumps(response_payload, default=str), ex=settings.CAREER_ANALYSIS_CACHE_SECONDS)
        except Exception:
            pass

        return response_payload

    async def get_current_matches(self, user_id: str) -> Optional[Dict[str, Any]]:
        try:
            cached = await redis_client.get(f"jobs:match:latest:{user_id}")
            if cached:
                return json.loads(cached)
        except Exception:
            pass

        latest = await self._collection().find_one({"userId": user_id}, sort=[("generatedAt", -1)])
        if not latest:
            return None
        latest.pop("_id", None)
        return latest


job_matching_service = JobMatchingService()
