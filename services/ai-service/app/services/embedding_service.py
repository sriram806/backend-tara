from __future__ import annotations

import hashlib
import math
import re
from typing import Any, List

from openai import AsyncOpenAI

from app.core.config import settings
from app.database import redis_client
from app.utils.security import sanitize_input, scrub_pii


class EmbeddingService:
    def __init__(self):
        self._client: AsyncOpenAI | None = None

    def _get_client(self) -> AsyncOpenAI:
        if self._client is None:
            api_key = settings.OPENAI_API_KEY if len(settings.OPENAI_API_KEY) > 20 else ""
            self._client = AsyncOpenAI(api_key=api_key)
        return self._client

    def _cache_key(self, text: str) -> str:
        digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
        return f"embedding:cache:{digest}"

    def _hash_vector(self, text: str, dimensions: int = 64) -> List[float]:
        tokens = re.findall(r"[A-Za-z0-9\+\.#/-]{2,30}", text.lower())
        vector = [0.0] * dimensions
        if not tokens:
            return vector

        for token in tokens:
            token_hash = int(hashlib.sha256(token.encode("utf-8")).hexdigest(), 16)
            index = token_hash % dimensions
            weight = ((token_hash >> 8) % 1000) / 1000.0
            vector[index] += 1.0 + weight

        norm = math.sqrt(sum(value * value for value in vector))
        if not norm:
            return vector
        return [round(value / norm, 6) for value in vector]

    async def _generate_openai_embedding(self, text: str) -> List[float]:
        client = self._get_client()
        response = await client.embeddings.create(
            model=settings.OPENAI_EMBEDDING_MODEL,
            input=text,
        )
        return [float(value) for value in response.data[0].embedding]

    async def embed_text(self, text: str, *, cache: bool = True) -> List[float]:
        cleaned = scrub_pii(sanitize_input(text or ""))
        if not cleaned.strip():
            return self._hash_vector("")

        cache_key = self._cache_key(cleaned)
        if cache:
            try:
                cached = await redis_client.get(cache_key)
                if cached:
                    return [float(value) for value in cached.split(",") if value]
            except Exception:
                pass

        if settings.AI_MOCK_MODE or not settings.OPENAI_API_KEY:
            vector = self._hash_vector(cleaned)
        else:
            try:
                vector = await self._generate_openai_embedding(cleaned)
            except Exception:
                vector = self._hash_vector(cleaned)

        if cache:
            try:
                await redis_client.set(cache_key, ",".join(str(value) for value in vector), ex=settings.EMBEDDING_CACHE_SECONDS)
            except Exception:
                pass

        return vector


embedding_service = EmbeddingService()
