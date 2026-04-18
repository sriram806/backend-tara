from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.core.config import settings


class PgVectorStore:
    def __init__(self):
        self._pool = None

    def _vector_literal(self, embedding: List[float]) -> str:
        values = ",".join(f"{float(value):.8f}" for value in embedding)
        return f"[{values}]"

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

    async def ensure_schema(self) -> None:
        pool = await self._get_pool()
        if not pool:
            return

        async with pool.acquire() as conn:
            await conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
            await conn.execute(
                """
                CREATE TABLE IF NOT EXISTS jd_embeddings (
                    job_id TEXT PRIMARY KEY,
                    embedding vector(64) NOT NULL,
                    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
            await conn.execute(
                """
                CREATE TABLE IF NOT EXISTS resume_embeddings (
                    user_id TEXT PRIMARY KEY,
                    embedding vector(64) NOT NULL,
                    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )

    async def upsert_job_embedding(self, job_id: str, embedding: List[float], metadata: Optional[Dict[str, Any]] = None) -> None:
        pool = await self._get_pool()
        if not pool:
            return

        await self.ensure_schema()
        payload = metadata or {}
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO jd_embeddings (job_id, embedding, metadata)
                VALUES ($1, $2::vector, $3::jsonb)
                ON CONFLICT (job_id)
                DO UPDATE SET embedding = EXCLUDED.embedding, metadata = EXCLUDED.metadata, created_at = NOW()
                """,
                job_id,
                self._vector_literal(embedding),
                json.dumps(payload),
            )

    async def upsert_resume_embedding(self, user_id: str, embedding: List[float], metadata: Optional[Dict[str, Any]] = None) -> None:
        pool = await self._get_pool()
        if not pool:
            return

        await self.ensure_schema()
        payload = metadata or {}
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO resume_embeddings (user_id, embedding, metadata)
                VALUES ($1, $2::vector, $3::jsonb)
                ON CONFLICT (user_id)
                DO UPDATE SET embedding = EXCLUDED.embedding, metadata = EXCLUDED.metadata, updated_at = NOW()
                """,
                user_id,
                self._vector_literal(embedding),
                json.dumps(payload),
            )

    async def search_jobs(
        self,
        embedding: List[float],
        limit: int = 5,
        location: Optional[str] = None,
        experience_years: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        pool = await self._get_pool()
        if not pool:
            return []

        await self.ensure_schema()
        filters: List[str] = []
        params: List[Any] = [self._vector_literal(embedding)]

        if location:
            filters.append(f"LOWER(metadata->>'location') LIKE LOWER(${len(params) + 1})")
            params.append(f"%{location}%")
        if experience_years is not None:
            filters.append(f"COALESCE((metadata->>'minExperienceYears')::int, 0) <= ${len(params) + 1}")
            params.append(experience_years)

        where_clause = f"WHERE {' AND '.join(filters)}" if filters else ""
        params.append(limit)

        query = f"""
            SELECT job_id, metadata,
                   1 - (embedding <=> $1::vector) AS similarity
            FROM jd_embeddings
            {where_clause}
            ORDER BY embedding <=> $1::vector ASC
            LIMIT ${len(params)}
        """

        async with pool.acquire() as conn:
            rows = await conn.fetch(query, *params)

        results: List[Dict[str, Any]] = []
        for row in rows:
            metadata = dict(row["metadata"] or {})
            results.append({
                "jobId": row["job_id"],
                "similarityScore": float(row["similarity"] or 0.0),
                "metadata": metadata,
            })
        return results


pgvector_store = PgVectorStore()
