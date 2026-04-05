import hashlib
import json
import time
from openai import AsyncOpenAI
import google.generativeai as genai
from tenacity import retry, stop_after_attempt, wait_exponential
from app.core.config import settings
from app.database import redis_client, db
from app.models.prompt_log import PromptLog

openai_key = settings.OPENAI_API_KEY if len(settings.OPENAI_API_KEY) > 20 else ""
openai_client = AsyncOpenAI(api_key=openai_key)

gemini_key = settings.GEMINI_API_KEY if len(settings.GEMINI_API_KEY) > 20 else ""
genai.configure(api_key=gemini_key)
gemini_model = genai.GenerativeModel('gemini-2.0-flash')
class LLMGateway:
    def __init__(self):
        self.circuit_key_failures = "circuit:openai:failures"
        self.circuit_key_state = "circuit:openai:state"
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
        except Exception:
            pass

    def _get_cache_key(self, prompt: str) -> str:
        prompt_hash = hashlib.sha256(prompt.encode()).hexdigest()
        return f"llm:cache:{prompt_hash}"

    async def generate_json(self, prompt: str, user_id: str = None) -> dict:
        cache_key = self._get_cache_key(prompt)
        
        try:
            cached = await redis_client.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception as e:
            print(f"Redis Cache Error: {e}")
            pass

        start_time = time.time()
        is_circuit_open = await self._check_circuit()

        try:
            prompt_formatted = "You are an expert AI. You must return ONLY raw JSON, do not include markdown blocks.\n\n" + prompt
            response = await gemini_model.generate_content_async(
                prompt_formatted,
                generation_config=genai.GenerationConfig(
                    response_mime_type="application/json",
                )
            )
            raw_text = response.text
            tokens = 0
            if response.usage_metadata:
                tokens = response.usage_metadata.total_token_count
            model_used = 'gemini-1.5-flash'

            start_json_idx = raw_text.find('{')
            end_json_idx = raw_text.rfind('}')
            if start_json_idx != -1 and end_json_idx != -1:
                raw_text = raw_text[start_json_idx:end_json_idx+1]
                
            data = json.loads(raw_text)

            latency = time.time() - start_time
            await self._log_usage(model=model_used, tokens=tokens, latency=latency, user_id=user_id)
            
            try:
                await redis_client.set(cache_key, json.dumps(data), ex=3600)
            except Exception:
                pass
                
            return data

        except Exception as e:
            print(e)
            if not is_circuit_open:
                await self._record_failure()
            raise IOError(f"AI Generation failed entirely: {str(e)}")

llm_gateway = LLMGateway()
