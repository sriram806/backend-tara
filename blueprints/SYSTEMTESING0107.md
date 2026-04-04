You are a Senior QA Engineer + Backend Architect testing a production-grade AI system called "Think AI".

The system includes:

- Microservices (Fastify)
- API Gateway
- Auth system (JWT + OTP + Email)
- NeonDB (PostgreSQL)
- MongoDB
- Redis
- BullMQ queues
- FastAPI AI service
- LLM Gateway (Claude + OpenAI)
- NLP pipeline
- Resume Analyzer
- Career Analyzer
- Roadmap Generator
- Job Matching system
- WebSockets

Your task:

👉 DESIGN and EXECUTE a COMPLETE TESTING STRATEGY

====================================================
🎯 TESTING GOALS
====================================================

- Verify all services work correctly
- Validate end-to-end flows
- Detect bugs and edge cases
- Ensure security + performance

====================================================
🧪 STEP 1 — UNIT TESTS
====================================================

Test:

✔ Auth utils (JWT, hashing, OTP)
✔ Rate limiter
✔ Redis helpers
✔ LLM Gateway functions
✔ NLP pipeline
✔ ATS scoring logic

----------------------------------------------------

Use:
- Jest (Node.js)
- Pytest (FastAPI)

====================================================
🧪 STEP 2 — API TESTING (CRITICAL)
====================================================

Test ALL endpoints:

----------------------------------------------------

AUTH:

- POST /auth/register
- POST /auth/login
- POST /auth/refresh
- POST /auth/verify-email
- POST /auth/forgot-password
- POST /auth/reset-password

----------------------------------------------------

AI:

- POST /analysis/jobs
- GET /analysis/jobs/:id
- POST /ai/resume/analyze
- POST /ai/roadmap/generate
- GET /ai/jobs/match

----------------------------------------------------

Check:

✔ status codes  
✔ response format  
✔ error handling  

Use:
- Postman / Thunder Client / Supertest

====================================================
🧪 STEP 3 — INTEGRATION TESTS
====================================================

Test service interactions:

✔ Auth → DB  
✔ Gateway → services  
✔ Node → Queue → FastAPI  
✔ FastAPI → MongoDB  
✔ Redis → rate limit + cache  

----------------------------------------------------

Verify:

- Data consistency
- Correct flow

====================================================
🧪 STEP 4 — END-TO-END (E2E TESTING)
====================================================

Simulate real user flow:

----------------------------------------------------

FLOW 1:

Register → Verify Email → Login → Get Profile

----------------------------------------------------

FLOW 2:

Login → Upload Resume → Analyze → Get Result

----------------------------------------------------

FLOW 3:

Run Career Analysis → Generate Roadmap → Get Tasks

----------------------------------------------------

FLOW 4:

Get Job Matches → Apply → Track

----------------------------------------------------

Verify:

✔ All steps work  
✔ No crashes  
✔ Correct outputs  

====================================================
🧪 STEP 5 — QUEUE TESTING
====================================================

Test:

✔ job creation  
✔ job processing  
✔ retry logic  
✔ DLQ handling  

----------------------------------------------------

Edge cases:

- job failure  
- duplicate jobs  
- worker crash  

====================================================
🧪 STEP 6 — REDIS TESTING
====================================================

Test:

✔ rate limiting  
✔ quota system  
✔ cooldown logic  
✔ caching  

----------------------------------------------------

Edge cases:

- rapid requests  
- expired keys  
- concurrent users  

====================================================
🧪 STEP 7 — AI SYSTEM TESTING
====================================================

Test:

✔ LLM responses  
✔ fallback logic  
✔ retry mechanism  
✔ invalid outputs  

----------------------------------------------------

Mock:
- API failures
- slow responses

====================================================
🧪 STEP 8 — SECURITY TESTING
====================================================

Test:

✔ brute force login  
✔ OTP abuse  
✔ invalid tokens  
✔ SQL injection  
✔ prompt injection  

----------------------------------------------------

Verify:

✔ inputs sanitized  
✔ errors safe  

====================================================
🧪 STEP 9 — PERFORMANCE TESTING
====================================================

Use:
- k6 or Artillery

Test:

✔ 100+ concurrent users  
✔ API latency  
✔ queue load  

----------------------------------------------------

Check:

✔ response time < 200ms (non-AI)  
✔ AI jobs async  

====================================================
🧪 STEP 10 — WEBSOCKET TESTING
====================================================

Test:

✔ connection  
✔ real-time events  
✔ reconnect  

====================================================
📊 STEP 11 — TEST REPORT
====================================================

Generate:

✔ Passed tests  
✔ Failed tests  
✔ Bugs found  
✔ Fix suggestions  

====================================================
⚡ OUTPUT REQUIREMENTS
====================================================

Provide:

1. Test cases (structured)
2. Test scripts (Jest + Pytest)
3. API test examples
4. Load test script
5. Bug report
6. Fix recommendations

====================================================
🎯 FINAL RESULT
====================================================

System must be:

✔ Fully tested  
✔ Bug-free  
✔ Secure  
✔ Production-ready  

====================================================