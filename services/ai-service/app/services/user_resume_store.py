from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Dict, Optional

from app.core.config import settings
from app.database import redis_client


class UserResumeStore:
    def __init__(self) -> None:
        self._pool = None

    async def _get_pool(self):
        if self._pool is not None:
            return self._pool

        database_url = getattr(settings, "DATABASE_URL", "") or None
        if not database_url:
            return None

        try:
            import asyncpg
        except Exception:
            return None

        self._pool = await asyncpg.create_pool(database_url, min_size=1, max_size=3)
        return self._pool

    def _cache_key(self, user_id: str) -> str:
        return f"resume:{user_id}"

    def _analysis_event_key(self, run_id: str) -> str:
        return f"resume-analysis:{run_id}"

    def _roadmap_event_key(self, run_id: str) -> str:
        return f"roadmap-run:{run_id}"

    async def get_current_resume(self, user_id: str, use_cache: bool = True) -> Optional[Dict[str, Any]]:
        if use_cache:
            try:
                cached = await redis_client.get(self._cache_key(user_id))
                if cached:
                    return json.loads(cached)
            except Exception:
                pass

        pool = await self._get_pool()
        if not pool:
            return None

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT id, user_id, title, summary, status, version, completeness_score, ats_score,
                       section_scores, keyword_suggestions, draft_data, is_current, deleted_at,
                       submitted_at, created_at, updated_at
                FROM user_resumes
                WHERE user_id = $1
                  AND is_current = TRUE
                  AND deleted_at IS NULL
                ORDER BY version DESC
                LIMIT 1
                """,
                user_id,
            )

        if not row:
            return None

        async with pool.acquire() as conn:
            payload = await self._hydrate_resume(conn, row)
        await self.set_cache(user_id, payload)
        return payload

    async def get_resume_by_id(self, resume_id: str) -> Optional[Dict[str, Any]]:
        pool = await self._get_pool()
        if not pool:
            return None

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT id, user_id, title, summary, status, version, completeness_score, ats_score,
                       section_scores, keyword_suggestions, draft_data, is_current, deleted_at,
                       submitted_at, created_at, updated_at
                FROM user_resumes
                WHERE id = $1
                LIMIT 1
                """,
                resume_id,
            )

            return await self._hydrate_resume(conn, row) if row else None

    async def mark_processing(self, resume_id: str) -> None:
        await self._execute(
            """
            UPDATE user_resumes
            SET updated_at = NOW()
            WHERE id = $1
            """,
            resume_id,
        )

    async def mark_failed(self, resume_id: str, user_id: str, error_message: str) -> None:
        await self._execute(
            """
            UPDATE user_resumes
            SET updated_at = NOW()
            WHERE id = $1
            """,
            resume_id
        )

        latest = await self.get_resume_by_id(resume_id)
        if latest:
            await self.set_cache(user_id, latest)

    async def set_cache(self, user_id: str, payload: Dict[str, Any]) -> None:
        try:
            await redis_client.set(self._cache_key(user_id), json.dumps(payload, default=str), ex=settings.RESUME_CACHE_SECONDS)
        except Exception:
            pass

    async def get_analysis_run(self, run_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        pool = await self._get_pool()
        if not pool:
            return None

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT ar.id, ar.user_id, ar.resume_id, ar.resume_version, ar.status,
                       r.draft_data, r.summary, r.status AS resume_status, r.ats_score, r.section_scores
                FROM resume_analysis_runs ar
                JOIN user_resumes r ON r.id = ar.resume_id
                WHERE ar.id = $1 AND ar.user_id = $2
                LIMIT 1
                """,
                run_id,
                user_id,
            )

        if not row:
            return None

        payload = dict(row)
        structured_resume = self._json_value(payload.get("draft_data"), {})
        payload["structured_resume"] = structured_resume
        payload["structured_text"] = self._structured_text(structured_resume)
        payload["raw_text"] = self._resume_text(structured_resume)
        return payload

    async def mark_analysis_processing(self, run_id: str) -> None:
        await self._execute(
            """
            UPDATE resume_analysis_runs
            SET status = 'processing',
                error_message = NULL,
                updated_at = NOW()
            WHERE id = $1
            """,
            run_id,
        )

    async def complete_analysis_run(self, run_id: str, payload: Dict[str, Any]) -> None:
        matched_skills = payload.get("matchedSkills") or []
        missing_skills = payload.get("missingSkills") or []
        section_scores = payload.get("sectionScores") or {}
        suggestions = payload.get("suggestions") or []
        ats_score = payload.get("atsScore")

        await self._execute(
            """
            UPDATE resume_analysis_runs
            SET status = 'completed',
                ats_score = $2,
                matched_skills = $3::jsonb,
                missing_skills = $4::jsonb,
                section_scores = $5::jsonb,
                suggestions = $6::jsonb,
                error_message = NULL,
                updated_at = NOW()
            WHERE id = $1
            """,
            run_id,
            int(ats_score) if isinstance(ats_score, (int, float)) else None,
            json.dumps(matched_skills),
            json.dumps(missing_skills),
            json.dumps(section_scores),
            json.dumps(suggestions),
        )

    async def mark_analysis_failed(self, run_id: str, error_message: str) -> None:
        await self._execute(
            """
            UPDATE resume_analysis_runs
            SET status = 'failed',
                error_message = $2,
                updated_at = NOW()
            WHERE id = $1
            """,
            run_id,
            error_message[:2000],
        )

    async def get_roadmap_run(self, run_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        pool = await self._get_pool()
        if not pool:
            return None

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT rr.id, rr.user_id, rr.analysis_run_id, rr.target_role, rr.duration_days,
                       ar.missing_skills
                FROM roadmap_runs rr
                JOIN resume_analysis_runs ar ON ar.id = rr.analysis_run_id
                WHERE rr.id = $1 AND rr.user_id = $2
                LIMIT 1
                """,
                run_id,
                user_id,
            )

        return dict(row) if row else None

    async def mark_roadmap_processing(self, run_id: str) -> None:
        await self._execute(
            """
            UPDATE roadmap_runs
            SET status = 'processing',
                error_message = NULL,
                updated_at = NOW()
            WHERE id = $1
            """,
            run_id,
        )

    async def complete_roadmap_run(self, run_id: str, roadmap_json: Dict[str, Any]) -> None:
        await self._execute(
            """
            UPDATE roadmap_runs
            SET status = 'completed',
                roadmap_json = $2::jsonb,
                error_message = NULL,
                updated_at = NOW()
            WHERE id = $1
            """,
            run_id,
            json.dumps(roadmap_json),
        )

    async def mark_roadmap_failed(self, run_id: str, error_message: str) -> None:
        await self._execute(
            """
            UPDATE roadmap_runs
            SET status = 'failed',
                error_message = $2,
                updated_at = NOW()
            WHERE id = $1
            """,
            run_id,
            error_message[:2000],
        )

    async def _execute(self, query: str, *params: Any) -> None:
        pool = await self._get_pool()
        if not pool:
            return

        async with pool.acquire() as conn:
            await conn.execute(query, *params)

    async def _hydrate_resume(self, conn: Any, row: Any) -> Dict[str, Any]:
        payload = self._serialize_row(row)
        resume_id = payload["id"]

        skills = await conn.fetch(
            """
            SELECT name, category, proficiency
            FROM resume_skills
            WHERE resume_id = $1
            ORDER BY sort_order ASC
            """,
            resume_id,
        )
        experiences = await conn.fetch(
            """
            SELECT company, role, location, start_date, end_date, is_current, bullets, technologies
            FROM resume_experiences
            WHERE resume_id = $1
            ORDER BY sort_order ASC
            """,
            resume_id,
        )
        projects = await conn.fetch(
            """
            SELECT name, role, url, bullets, technologies
            FROM resume_projects
            WHERE resume_id = $1
            ORDER BY sort_order ASC
            """,
            resume_id,
        )
        education = await conn.fetch(
            """
            SELECT institution, degree, field, start_year, end_year, grade, highlights
            FROM resume_education
            WHERE resume_id = $1
            ORDER BY sort_order ASC
            """,
            resume_id,
        )

        structured_resume = {
            "title": payload.get("title") or "Primary resume",
            "summary": payload.get("summary") or "",
            "skills": [
                {
                    "name": item["name"],
                    "category": item["category"],
                    "proficiency": item["proficiency"],
                }
                for item in skills
            ],
            "experience": [
                {
                    "company": item["company"],
                    "role": item["role"],
                    "location": item["location"],
                    "startDate": item["start_date"],
                    "endDate": item["end_date"],
                    "isCurrent": item["is_current"],
                    "bullets": self._json_value(item["bullets"], []),
                    "technologies": self._json_value(item["technologies"], []),
                }
                for item in experiences
            ],
            "projects": [
                {
                    "name": item["name"],
                    "role": item["role"],
                    "url": item["url"],
                    "bullets": self._json_value(item["bullets"], []),
                    "technologies": self._json_value(item["technologies"], []),
                }
                for item in projects
            ],
            "education": [
                {
                    "institution": item["institution"],
                    "degree": item["degree"],
                    "field": item["field"],
                    "startYear": item["start_year"],
                    "endYear": item["end_year"],
                    "grade": item["grade"],
                    "highlights": self._json_value(item["highlights"], []),
                }
                for item in education
            ],
        }

        payload["structured_resume"] = structured_resume
        payload["structured_text"] = self._structured_text(structured_resume)
        payload["raw_text"] = self._resume_text(structured_resume)
        return payload

    def _json_value(self, value: Any, fallback: Any) -> Any:
        if value is None:
            return fallback
        if isinstance(value, str):
            try:
                return json.loads(value)
            except Exception:
                return fallback
        return value

    def _structured_text(self, resume: Dict[str, Any]) -> Dict[str, str]:
        return {
            "Summary": str(resume.get("summary") or ""),
            "Skills": ", ".join(str(item.get("name")) for item in resume.get("skills", []) if isinstance(item, dict)),
            "Experience": "\n\n".join(
                f"{item.get('role', '')}, {item.get('company', '')}\n"
                + "\n".join(f"- {bullet}" for bullet in item.get("bullets", []))
                for item in resume.get("experience", [])
                if isinstance(item, dict)
            ),
            "Projects": "\n\n".join(
                f"{item.get('name', '')}\n" + "\n".join(f"- {bullet}" for bullet in item.get("bullets", []))
                for item in resume.get("projects", [])
                if isinstance(item, dict)
            ),
            "Education": "\n".join(
                f"{item.get('degree', '')}, {item.get('institution', '')}"
                for item in resume.get("education", [])
                if isinstance(item, dict)
            ),
        }

    def _resume_text(self, resume: Dict[str, Any]) -> str:
        sections = self._structured_text(resume)
        return "\n\n".join(f"{section}\n{text}" for section, text in sections.items() if text.strip())

    def _serialize_row(self, row: Any) -> Dict[str, Any]:
        if row is None:
            return {}

        payload = dict(row)
        for key in ("created_at", "updated_at", "deleted_at", "submitted_at"):
            if isinstance(payload.get(key), datetime):
                payload[key] = payload[key].isoformat()
        for key in ("section_scores", "keyword_suggestions", "draft_data"):
            if key in payload:
                payload[key] = self._json_value(payload.get(key), {} if key != "keyword_suggestions" else [])
        return payload


user_resume_store = UserResumeStore()
