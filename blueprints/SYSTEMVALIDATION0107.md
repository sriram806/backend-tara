You are a Senior Backend Architect performing a FULL SYSTEM AUDIT for "Think AI".

The system includes:

- Microservices (Fastify)
- API Gateway (BFF)
- Auth system (JWT + OTP + Email via Nodemailer)
- NeonDB (Drizzle ORM)
- MongoDB (AI data)
- Redis (cache + quota + cooldown)
- BullMQ queues
- FastAPI AI service
- LLM Gateway (Claude + OpenAI)
- NLP pipeline (spaCy)
- Resume Analyzer (ATS + Rewrite)
- Career Analyzer
- Roadmap Generator
- Job Matching (pgvector)
- WebSocket system

Your task:

👉 VALIDATE, FIX, and IMPROVE the entire system

====================================================
🚨 STEP 1 — FILE STRUCTURE VALIDATION
====================================================

Check ALL services inside /services:

Ensure each service follows EXACT structure:

/src/
 ├── routes/
 ├── controllers/
 ├── services/
 ├── utils/
 ├── middleware/
 ├── schemas/
 ├── plugins/
 └── index.ts

----------------------------------------------------

IF ANY SERVICE BREAKS THIS RULE:
👉 Refactor completely

====================================================
🚨 STEP 2 — SERVICE RESPONSIBILITY CHECK
====================================================

Ensure:

✔ Gateway:
- only routing
- auth validation
- WebSocket

❌ NO business logic

----------------------------------------------------

✔ Auth Service:
- login/register
- OTP/email
- JWT

----------------------------------------------------

✔ AI Service:
- ALL AI logic
- LLM calls
- NLP pipeline

❌ Node services MUST NOT call AI APIs

====================================================
🚨 STEP 3 — DATABASE VALIDATION
====================================================

Check:

✔ NeonDB:
- users
- profiles
- refresh_tokens

✔ MongoDB:
- career_analysis_reports
- resume_analysis
- roadmap_documents
- job_feed_cache
- ai_prompt_logs

✔ pgvector:
- embeddings working

----------------------------------------------------

Fix:
- missing indexes
- schema mismatches
- relations

====================================================
🚨 STEP 4 — AUTH FLOW VALIDATION
====================================================

Test FULL FLOW:

1. Register
2. Email OTP verification
3. Login
4. Refresh token
5. Logout
6. Forgot password
7. Reset password

----------------------------------------------------

Check:

✔ password hashing
✔ OTP expiry (5 min)
✔ OTP max attempts
✔ refresh token rotation
✔ httpOnly cookies

Fix any bugs.

====================================================
🚨 STEP 5 — REDIS SYSTEM VALIDATION
====================================================

Check keys:

✔ rate limiting
✔ quota system
✔ cooldown
✔ JWT blacklist
✔ caching

----------------------------------------------------

Fix:
- incorrect TTL
- missing keys
- race conditions

====================================================
🚨 STEP 6 — QUEUE SYSTEM VALIDATION
====================================================

Check BullMQ:

✔ queues exist:
  - analysis
  - resume
  - roadmap
  - jobs

✔ retry works
✔ DLQ works
✔ backoff works

----------------------------------------------------

Fix:
- stuck jobs
- missing workers
- duplicate jobs

====================================================
🚨 STEP 7 — AI PIPELINE VALIDATION
====================================================

Check FULL FLOW:

Client → Node → Queue → FastAPI → LLM → MongoDB → WebSocket

----------------------------------------------------

Verify:

✔ Node never calls AI directly  
✔ FastAPI handles all AI  
✔ LLM Gateway works  
✔ fallback works  
✔ retry works  

Fix:
- broken flow
- wrong service boundaries

====================================================
🚨 STEP 8 — LLM GATEWAY VALIDATION
====================================================

Check:

✔ Claude API works  
✔ OpenAI fallback works  
✔ Redis caching works  
✔ circuit breaker works  

----------------------------------------------------

Fix:
- API errors
- invalid responses
- timeout issues

====================================================
🚨 STEP 9 — NLP + AI LOGIC VALIDATION
====================================================

Check:

✔ spaCy pipeline works  
✔ skill extraction accurate  
✔ embeddings working  
✔ similarity logic correct  

Fix:
- wrong outputs
- performance issues

====================================================
🚨 STEP 10 — RESUME ANALYZER VALIDATION
====================================================

Check:

✔ PDF parsing works  
✔ ATS scoring correct  
✔ section detection works  
✔ rewrite API works  

Fix:
- parsing errors
- scoring bugs

====================================================
🚨 STEP 11 — ROADMAP + JOB MATCH VALIDATION
====================================================

Check:

✔ roadmap generation valid  
✔ tasks generated  
✔ adaptive logic works  

✔ job matching:
- embeddings stored
- similarity correct

Fix:
- ranking issues
- incorrect outputs

====================================================
🚨 STEP 12 — WEBSOCKET VALIDATION
====================================================

Check:

✔ job completion events  
✔ real-time updates  
✔ reconnect handling  

Fix:
- missing events
- connection issues

====================================================
🚨 STEP 13 — SECURITY AUDIT
====================================================

Check:

✔ no plain passwords  
✔ OTP hashed  
✔ no secrets exposed  
✔ input validation  

✔ PII scrubbing before LLM  

Fix:
- vulnerabilities
- leaks

====================================================
🚨 STEP 14 — PERFORMANCE + SCALABILITY
====================================================

Check:

✔ no blocking APIs  
✔ async processing everywhere  
✔ caching implemented  
✔ DB optimized  

Fix:
- slow queries
- memory issues

====================================================
🚨 STEP 15 — FINAL OUTPUT
====================================================

You MUST:

1. List ALL issues found
2. Fix them with code
3. Refactor where needed
4. Ensure system works end-to-end
5. Provide updated clean structure

====================================================
🎯 FINAL RESULT
====================================================

After this audit:

✔ System fully working  
✔ Clean architecture  
✔ No bugs  
✔ Production-ready  

System should behave like:
👉 Real SaaS AI platform

====================================================