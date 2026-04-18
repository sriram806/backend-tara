from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.core.config import settings
from app.database import db, redis_client
from app.models.roadmap_document import RoadmapDocument, RoadmapPhase, RoadmapTask
from app.services.llm_gateway import llm_gateway
from app.utils.security import sanitize_input


def _stable_hash(payload: Dict[str, Any]) -> str:
    encoded = json.dumps(payload, sort_keys=True, ensure_ascii=True)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _phase_title_for_index(index: int) -> str:
    return ["Foundation", "Build", "Launch"][index]


def _task_type_for_day(day: int) -> str:
    if day <= 30:
        return "learning"
    if day <= 60:
        return "practice"
    return "project"


class RoadmapService:
    def _collection(self):
        return getattr(db, settings.ROADMAP_COLLECTION_NAME)

    def _roadmap_cache_key(self, user_id: str, target_role: str, skill_gaps: List[str], duration_days: int) -> str:
        payload = {
            "userId": user_id,
            "targetRole": target_role,
            "skillGaps": skill_gaps,
            "durationDays": duration_days,
        }
        return f"roadmap:cache:{_stable_hash(payload)}"

    def _build_mock_roadmap(self, target_role: str, skill_gaps: List[str], duration_days: int) -> List[RoadmapPhase]:
        phase_specs = [
            ("Foundation", 1, 30, skill_gaps[:3] or [f"Core {target_role} fundamentals"]),
            ("Build", 31, 60, skill_gaps[3:6] or ["Hands-on implementation", "Interview prep"]),
            ("Launch", 61, 90, ["Portfolio polish", "Mock interviews", "System design review"]),
        ]

        phases: List[RoadmapPhase] = []
        for phase_index, (title, start_day, end_day, focus_items) in enumerate(phase_specs):
            tasks: List[RoadmapTask] = []
            cursor = start_day
            focus_index = 0
            while cursor <= end_day and cursor <= duration_days:
                focus = focus_items[focus_index % len(focus_items)]
                tasks.append(
                    RoadmapTask(
                        day=cursor,
                        title=f"{focus} - Day {cursor}",
                        description=f"Make progress on {focus.lower()} for the {target_role} path.",
                        difficulty="easy" if cursor < 31 else "medium" if cursor < 61 else "hard",
                        type=_task_type_for_day(cursor),
                    )
                )
                cursor += 1
                focus_index += 1
            phases.append(RoadmapPhase(title=title, days=tasks))

        return phases

    async def _generate_with_llm(self, target_role: str, skill_gaps: List[str], duration_days: int, adaptive_context: Optional[Dict[str, Any]], user_id: str) -> List[RoadmapPhase]:
        prompt = f"""
Create a 90-day roadmap as strict JSON for the target role.
Return exactly this schema:
{{
  "phases": [
    {{
      "title": "Foundation",
      "days": [
        {{"day": 1, "title": "...", "description": "...", "difficulty": "easy", "type": "learning"}}
      ]
    }}
  ]
}}

Target role: {target_role}
Skill gaps: {', '.join(skill_gaps) or 'none'}
Duration days: {duration_days}
Adaptive context: {json.dumps(adaptive_context or {}, ensure_ascii=True)}
""".strip()

        payload = await llm_gateway.generate_json(prompt, user_id=user_id)
        phases = payload.get("phases", []) if isinstance(payload, dict) else []
        normalized: List[RoadmapPhase] = []
        for phase in phases:
            if not isinstance(phase, dict):
                continue
            days = []
            for day in phase.get("days", []):
                if not isinstance(day, dict):
                    continue
                days.append(
                    RoadmapTask(
                        day=int(day.get("day", 0)),
                        title=str(day.get("title", "Task")),
                        description=str(day.get("description", "")),
                        difficulty=str(day.get("difficulty", "medium")),
                        type=str(day.get("type", "learning")),
                    )
                )
            normalized.append(RoadmapPhase(title=str(phase.get("title", "Phase")), days=days))

        return normalized or self._build_mock_roadmap(target_role, skill_gaps, duration_days)

    def _adapt_roadmap(self, phases: List[RoadmapPhase], missed_days: int, irrelevant_tasks: List[str], skill_gaps: List[str], target_role: str, duration_days: int) -> List[RoadmapPhase]:
        if missed_days <= 0 and not irrelevant_tasks:
            return phases

        remaining_tasks: List[RoadmapTask] = []
        for phase in phases:
            for task in phase.days:
                if task.title in irrelevant_tasks:
                    continue
                if task.day <= missed_days:
                    continue
                remaining_tasks.append(task)

        if missed_days > 3:
            regenerated = self._build_mock_roadmap(target_role, skill_gaps, duration_days)
            remaining_tasks = []
            for phase in regenerated:
                for task in phase.days:
                    if task.day > missed_days:
                        remaining_tasks.append(task)

        if not remaining_tasks:
            return self._build_mock_roadmap(target_role, skill_gaps, duration_days)

        cutoff_1 = min(30, duration_days)
        cutoff_2 = min(60, duration_days)
        grouped = {"Foundation": [], "Build": [], "Launch": []}
        for task in remaining_tasks:
            if task.day <= cutoff_1:
                grouped["Foundation"].append(task)
            elif task.day <= cutoff_2:
                grouped["Build"].append(task)
            else:
                grouped["Launch"].append(task)

        return [RoadmapPhase(title=title, days=tasks) for title, tasks in grouped.items() if tasks]

    async def generate_roadmap(
        self,
        user_id: str,
        target_role: str,
        skill_gaps: List[str],
        duration_days: int = 90,
        adaptive_context: Optional[Dict[str, Any]] = None,
        force_refresh: bool = False,
    ) -> Dict[str, Any]:
        cleaned_role = sanitize_input(target_role or "Software Engineer") or "Software Engineer"
        cleaned_gaps = [sanitize_input(skill) for skill in skill_gaps if sanitize_input(skill)]
        duration_days = max(30, min(duration_days or 90, 90))

        cache_key = self._roadmap_cache_key(user_id, cleaned_role, cleaned_gaps, duration_days)
        if not force_refresh:
            try:
                cached = await redis_client.get(cache_key)
                if cached:
                    return json.loads(cached)
            except Exception:
                pass

        if settings.AI_MOCK_MODE:
            phases = self._build_mock_roadmap(cleaned_role, cleaned_gaps, duration_days)
        else:
            try:
                phases = await self._generate_with_llm(cleaned_role, cleaned_gaps, duration_days, adaptive_context, user_id)
            except Exception:
                phases = self._build_mock_roadmap(cleaned_role, cleaned_gaps, duration_days)

        version = await self._next_version(user_id)
        document = RoadmapDocument(
            roadmapId=str(uuid.uuid4()),
            userId=user_id,
            targetRole=cleaned_role,
            skillGaps=cleaned_gaps,
            phases=phases,
            durationDays=duration_days,
            version=version,
            adaptationNotes=["Generated from hybrid roadmap system"],
            source="hybrid",
            createdAt=datetime.utcnow(),
            metadata={"adaptiveContext": adaptive_context or {}},
        )
        payload = document.model_dump(mode="json")
        response_payload = json.loads(json.dumps(payload, default=str))
        stored_payload = json.loads(json.dumps(response_payload, default=str))

        collection = self._collection()
        await collection.insert_one(stored_payload)

        try:
            await redis_client.set(cache_key, json.dumps(response_payload, default=str), ex=settings.CAREER_ANALYSIS_CACHE_SECONDS)
            await redis_client.set(f"roadmap:current:{user_id}", json.dumps(response_payload, default=str), ex=settings.CAREER_ANALYSIS_CACHE_SECONDS)
        except Exception:
            pass

        return response_payload

    async def get_current_roadmap(self, user_id: str) -> Optional[Dict[str, Any]]:
        try:
            cached = await redis_client.get(f"roadmap:current:{user_id}")
            if cached:
                return json.loads(cached)
        except Exception:
            pass

        collection = self._collection()
        latest = await collection.find_one({"userId": user_id}, sort=[("createdAt", -1)])
        if not latest:
            return None
        latest.pop("_id", None)
        return latest

    async def adapt_roadmap(
        self,
        user_id: str,
        target_role: str,
        skill_gaps: List[str],
        missed_days: int,
        irrelevant_tasks: List[str],
        base_roadmap: Optional[Dict[str, Any]] = None,
        duration_days: int = 90,
    ) -> Dict[str, Any]:
        if base_roadmap and isinstance(base_roadmap, dict):
            phases = []
            for phase in base_roadmap.get("phases", []):
                tasks = [RoadmapTask(**task) for task in phase.get("days", []) if isinstance(task, dict)]
                phases.append(RoadmapPhase(title=str(phase.get("title", "Phase")), days=tasks))
        else:
            phases = self._build_mock_roadmap(target_role, skill_gaps, duration_days)

        adapted = self._adapt_roadmap(phases, missed_days, irrelevant_tasks, skill_gaps, target_role, duration_days)
        version = await self._next_version(user_id)
        document = RoadmapDocument(
            roadmapId=str(uuid.uuid4()),
            userId=user_id,
            targetRole=target_role,
            skillGaps=skill_gaps,
            phases=adapted,
            durationDays=duration_days,
            version=version,
            adaptationNotes=[f"Adapted after {missed_days} missed days"],
            source="adaptive",
            createdAt=datetime.utcnow(),
            metadata={"irrelevantTasks": irrelevant_tasks},
        )
        payload = document.model_dump(mode="json")
        response_payload = json.loads(json.dumps(payload, default=str))
        stored_payload = json.loads(json.dumps(response_payload, default=str))
        await self._collection().insert_one(stored_payload)
        return response_payload

    async def _next_version(self, user_id: str) -> int:
        count = await self._collection().count_documents({"userId": user_id})
        return count + 1


roadmap_service = RoadmapService()
