You are a Senior AI + Backend Engineer building the AI core system for "Think AI".

Day 1–3 are completed:
- Microservices (Fastify)
- Modular structure enforced
- Auth system (JWT + OTP + email)
- NeonDB (Drizzle)
- Redis + BullMQ queues
- Async job pipeline
- WebSocket system

Now implement DAY 4: AI SERVICE CORE (API-FIRST DESIGN)

====================================================
🚨 CRITICAL RULE — ARCHITECTURE
====================================================

AI SYSTEM MUST FOLLOW:

👉 CURRENT:
- Use external AI APIs (Claude, OpenAI, Groq)
- Use API keys ONLY

👉 FUTURE:
- Add selective custom ML models
- DO NOT replace LLM APIs fully

----------------------------------------------------

STRICT RULE:

❌ Node.js MUST NOT call AI APIs  
✅ ONLY FastAPI handles AI calls  

====================================================
🚨 CRITICAL RULE — MODULAR STRUCTURE
====================================================

AI service MUST follow:

/services/ai-service/
 ├── routers/
 ├── services/
 ├── core/
 ├── models/
 ├── workers/
 ├── utils/
 └── main.py

====================================================
🎯 DAY 4 GOAL
====================================================

Build:

✔ LLM Gateway (Claude + OpenAI unified)
✔ AI service modular architecture
✔ API-based AI calls (no local models)
✔ Redis caching for AI responses
✔ Retry + fallback system
✔ Circuit breaker for API failures
✔ Token usage tracking
✔ Logging system for AI calls

====================================================
🧠 LLM GATEWAY (MOST IMPORTANT)
====================================================

File:
services/ai-service/services/llm_gateway.py

----------------------------------------------------

RESPONSIBILITIES:

- Single entry point for ALL AI calls
- Support multiple providers:
  - Claude (primary)
  - OpenAI (fallback)
  - Groq (optional)

----------------------------------------------------

FUNCTIONS:

1. generate_text(prompt, model, temperature)
2. generate_json(prompt)
3. stream_response(prompt)

----------------------------------------------------

FEATURES:

✔ Retry logic (3 attempts)
✔ Fallback model switching
✔ Token counting
✔ Cost tracking
✔ Redis caching
✔ Timeout handling

----------------------------------------------------

REDIS CACHE:

Key:
llm:cache:{sha256(prompt)}

TTL:
1 hour

====================================================
🔁 CIRCUIT BREAKER SYSTEM
====================================================

Implement Redis-based circuit breaker:

Keys:
- circuit:claude:failures
- circuit:claude:state

Logic:

- If failures > 5 → OPEN circuit
- Switch to OpenAI automatically
- Reset after timeout

====================================================
📊 TOKEN USAGE TRACKING
====================================================

Store in MongoDB:

collection: ai_prompt_logs

Fields:
- model
- tokens_used
- cost_estimate
- latency
- userId
- createdAt

====================================================
🧠 AI SERVICE MODULES
====================================================

Create base modules:

/services/ai-service/services/

1. career_service.py
2. resume_service.py
3. interview_service.py
4. embedding_service.py (future-ready)

----------------------------------------------------

CURRENT IMPLEMENTATION:

👉 ALL use LLM API calls  
👉 NO custom ML yet  

====================================================
📡 API ROUTERS
====================================================

Create:

/routers/
- career.py
- resume.py

Routes:

POST /ai/career
POST /ai/resume

----------------------------------------------------

These routes:
- receive request
- call service layer
- return structured response

====================================================
🧩 PROMPT ENGINEERING (IMPORTANT)
====================================================

Design structured prompts:

Example (career):

Return JSON:
{
  "readinessScore": number,
  "strengths": [],
  "skillGaps": [],
  "recommendations": []
}

----------------------------------------------------

RULES:

- Always ask LLM for JSON output
- Validate response format
- Handle invalid responses

====================================================
🔐 SECURITY (AI LAYER)
====================================================

1. PII SCRUBBING:
- remove email, phone, Aadhaar patterns

2. PROMPT INJECTION DEFENSE:
- fixed system prompt
- never trust user input directly

3. INPUT SANITIZATION

====================================================
⚡ PERFORMANCE FEATURES
====================================================

✔ Async processing only
✔ Redis caching
✔ Batch requests (future)
✔ Streaming support (optional)

====================================================
📦 OUTPUT FORMAT
====================================================

{
  success: true,
  data: {...}
}

====================================================
⚡ OUTPUT REQUIREMENTS
====================================================

Generate FULL CODE for:

1. LLM Gateway (Claude + OpenAI)
2. Redis caching system
3. Circuit breaker
4. Token usage logging
5. AI services (career, resume)
6. FastAPI routers
7. Prompt templates
8. Error handling

====================================================
🚨 DO NOT:
====================================================

- Build custom LLM models
- Call AI from Node.js
- Skip caching or retry logic
- Ignore modular structure

====================================================
🎯 FINAL RESULT
====================================================

After Day 4:

✔ AI service fully functional  
✔ Uses external APIs  
✔ Scalable + fault-tolerant  
✔ Ready for NLP + ML extension  

System behaves like:
👉 Production AI backend (API-first architecture)

====================================================