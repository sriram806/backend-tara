import hashlib
import asyncio
import json
import time
import logging
from openai import AsyncOpenAI
import google.generativeai as genai
from app.core.config import settings
from app.database import redis_client, db
from app.models.prompt_log import PromptLog

openai_key = settings.OPENAI_API_KEY if len(settings.OPENAI_API_KEY) > 20 else ""
openai_client = AsyncOpenAI(api_key=openai_key)

gemini_key = settings.GEMINI_API_KEY if len(settings.GEMINI_API_KEY) > 20 else ""
genai.configure(api_key=gemini_key)
gemini_model = genai.GenerativeModel(settings.GEMINI_MODEL)
deepseek_key = settings.DEEPSEEK_API_KEY if len(settings.DEEPSEEK_API_KEY) > 20 else ""
deepseek_client = AsyncOpenAI(api_key=deepseek_key, base_url=settings.DEEPSEEK_BASE_URL) if deepseek_key else None
logger = logging.getLogger(__name__)


def _cloudwatch_emf(namespace: str, metric_name: str, value: float, unit: str, dimensions: dict[str, str]) -> dict:
    dimension_keys = list(dimensions.keys())
    payload = {
        "_aws": {
            "Timestamp": int(time.time() * 1000),
            "CloudWatchMetrics": [
                {
                    "Namespace": namespace,
                    "Dimensions": [dimension_keys],
                    "Metrics": [{"Name": metric_name, "Unit": unit}],
                }
            ],
        },
        metric_name: value,
    }
    payload.update(dimensions)
    return payload


class LLMGateway:
    def __init__(self):
        self.circuit_key_failures = "circuit:llm:failures"
        self.circuit_key_state = "circuit:llm:state"
        self.circuit_timeout = 60 * 5  # 5 minutes

    async def _check_circuit(self) -> bool:
        try:
            state = await redis_client.get(self.circuit_key_state)
            return state == "OPEN"
        except Exception:
            return False

    async def _trip_circuit(self):
        try:
            await redis_client.set(self.circuit_key_state, "OPEN", ex=self.circuit_timeout)
            await redis_client.delete(self.circuit_key_failures)
        except Exception:
            pass

    async def _record_failure(self):
        try:
            failures = await redis_client.incr(self.circuit_key_failures)
            if failures >= 5:
                await self._trip_circuit()
        except Exception:
            pass

    async def _log_usage(self, model: str, tokens: int, latency: float, user_id: str = None):
        if db is None:
            return
        try:
            cost = tokens * 0.00001
            log_entry = PromptLog(
                model=model,
                tokens_used=tokens,
                cost_estimate=cost,
                latency=latency,
                user_id=user_id
            )
            await db.ai_prompt_logs.insert_one(log_entry.model_dump())

            dimensions = {
                "service": settings.SERVICE_NAME,
                "model": model,
            }
            logger.info(json.dumps(_cloudwatch_emf(
                settings.METRICS_NAMESPACE,
                "AiUsageTokens",
                float(tokens),
                "Count",
                dimensions,
            )))
            logger.info(json.dumps(_cloudwatch_emf(
                settings.METRICS_NAMESPACE,
                "AiLatencyMs",
                float(latency * 1000),
                "Milliseconds",
                dimensions,
            )))
            logger.info(json.dumps(_cloudwatch_emf(
                settings.METRICS_NAMESPACE,
                "AiEstimatedCostUsd",
                float(cost),
                "Count",
                dimensions,
            )))
        except Exception:
            pass

    def _get_cache_key(self, prompt: str) -> str:
        prompt_hash = hashlib.sha256(prompt.encode()).hexdigest()
        return f"llm:cache:{prompt_hash}"

    async def _with_retry(self, provider_name: str, generate_fn, prompt: str):
        delay_seconds = 1
        last_error = None

        for attempt in range(3):
            try:
                return await generate_fn(prompt)
            except Exception as error:
                last_error = error
                logger.warning("LLM provider %s failed on attempt %s: %s", provider_name, attempt + 1, error)
                if attempt < 2:
                    await asyncio.sleep(delay_seconds)
                    delay_seconds = min(delay_seconds * 2, 8)

        raise last_error

    def _extract_json(self, raw_text: str) -> dict:
        start_json_idx = raw_text.find('{')
        end_json_idx = raw_text.rfind('}')
        if start_json_idx != -1 and end_json_idx != -1:
            raw_text = raw_text[start_json_idx:end_json_idx + 1]

        return json.loads(raw_text)

    async def _generate_with_gemini(self, prompt: str):
        prompt_formatted = "You are an expert AI. You must return ONLY raw JSON, do not include markdown blocks.\n\n" + prompt
        response = await gemini_model.generate_content_async(
            prompt_formatted,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
            )
        )
        tokens = 0
        if response.usage_metadata:
            tokens = response.usage_metadata.total_token_count

        return response.text, tokens, settings.GEMINI_MODEL

    async def _generate_with_openai_compatible(self, client, model: str, prompt: str):
        response = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "Return only valid JSON. Do not include markdown fences."},
                {"role": "user", "content": prompt}
            ]
        )

        raw_text = response.choices[0].message.content or "{}"
        tokens = 0
        if response.usage:
            tokens = response.usage.total_tokens or 0

        return raw_text, tokens, model

    async def generate_json(self, prompt: str, user_id: str = None) -> dict:
        cache_key = self._get_cache_key(prompt)

        try:
            cached = await redis_client.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception as e:
            print(f"Redis Cache Error: {e}")
            cached = None

        start_time = time.time()
        is_circuit_open = await self._check_circuit()

        providers = []
        if openai_key:
            providers.append(("openai", lambda value: self._with_retry("openai", lambda text: self._generate_with_openai_compatible(openai_client, settings.OPENAI_MODEL, text), value)))
        if deepseek_client:
            providers.append(("deepseek", lambda value: self._with_retry("deepseek", lambda text: self._generate_with_openai_compatible(deepseek_client, settings.DEEPSEEK_MODEL, text), value)))
        providers.append(("gemini", lambda value: self._with_retry("gemini", self._generate_with_gemini, value)))

        if is_circuit_open:
            logger.warning("LLM circuit is open, trying fallback providers first")

        last_error = None
        for provider_name, provider_fn in providers:
            try:
                raw_text, tokens, model_used = await provider_fn(prompt)
                data = self._extract_json(raw_text)

                latency = time.time() - start_time
                await self._log_usage(model=model_used, tokens=tokens, latency=latency, user_id=user_id)

                try:
                    await redis_client.set(cache_key, json.dumps(data), ex=3600)
                except Exception:
                    pass

                try:
                    await redis_client.delete(self.circuit_key_failures)
                    await redis_client.delete(self.circuit_key_state)
                except Exception:
                    pass

                return data
            except Exception as error:
                last_error = error
                logger.warning("LLM provider %s failed: %s", provider_name, error)
                if provider_name == "gemini" and not is_circuit_open:
                    await self._record_failure()

        if cached:
            return json.loads(cached)

        raise IOError(f"AI Generation failed entirely: {str(last_error)}")

llm_gateway = LLMGateway()
