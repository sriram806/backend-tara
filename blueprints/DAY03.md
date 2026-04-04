You are a Senior Backend + AI Engineer building the async AI pipeline layer for "Think AI".

Day 1 & Day 2 are completed:
- Microservices (Fastify)
- Modular architecture enforced
- Auth system (JWT + OTP + email)
- NeonDB (Drizzle ORM)
- Nodemailer + SMTP
- Security + rate limiting

Now implement DAY 3 with FULL PRODUCTION-LEVEL ASYNC SYSTEM.

====================================================
🚨 CRITICAL RULE — STRICT MODULAR STRUCTURE
====================================================

ALL services MUST follow:

/services/{service}/src/
 ├── routes/
 ├── controllers/
 ├── services/
 ├── utils/
 ├── middleware/
 ├── schemas/
 ├── plugins/
 └── index.ts

NO EXCEPTIONS.

- routes → only route definitions
- controllers → request handling
- services → business logic
- utils → helpers
- middleware → rate limit/auth
- index.ts → bootstrap only

====================================================
🎯 DAY 3 GOAL
====================================================

Build:

✔ Redis integration (cache + state + rate limit)
✔ BullMQ queue system (async jobs)
✔ AI job pipeline (Node → Queue → FastAPI)
✔ WebSocket real-time updates
✔ MongoDB AI result storage
✔ Job tracking system
✔ Feature: cooldown + quota + caching

====================================================
🧱 REDIS SETUP (CORE SYSTEM)
====================================================

Use:
- ioredis (Node.js)
- redis-py (FastAPI)

----------------------------------------------------

REDIS FEATURES:

1. RATE LIMIT (already integrated, upgrade)
key: rate:{userId}:{route}

----------------------------------------------------

2. JWT REVOCATION
key: session:revoked:{jti}

----------------------------------------------------

3. AI QUOTA SYSTEM
key: ai:quota:{userId}:{feature}:{month}

----------------------------------------------------

4. ANALYSIS COOLDOWN
key: analysis:cooldown:{userId}
TTL: 24 hours

----------------------------------------------------

5. DASHBOARD CACHE
key: dashboard:summary:{userId}
TTL: 5 minutes

----------------------------------------------------

6. LLM CACHE
key: llm:cache:{hash}
TTL: 1 hour

====================================================
📦 QUEUE SYSTEM (BullMQ)
====================================================

Install:
- bullmq
- ioredis

----------------------------------------------------

QUEUES:

1. analysis:queue
2. resume:queue
3. roadmap:queue

----------------------------------------------------

Each queue must support:
- retries (3 attempts)
- exponential backoff
- dead-letter queue (DLQ)

----------------------------------------------------

Folder structure (Node):

/services/{service}/src/
 ├── queues/
 │   ├── producer.ts
 │   ├── queues.ts
 │   └── connection.ts

====================================================
🤖 AI PIPELINE (CORE FEATURE)
====================================================

FLOW:

Client → Gateway → Service → Queue → FastAPI → MongoDB → WebSocket → Client

----------------------------------------------------

STEP 1 — JOB CREATION (Node)

POST /analysis/jobs

- validate request
- check cooldown (Redis)
- check quota
- push job to BullMQ

Return:
{
  jobId,
  status: "pending"
}

----------------------------------------------------

STEP 2 — FASTAPI WORKER

- consume queue job
- process AI logic
- store result in MongoDB
- emit event

----------------------------------------------------

STEP 3 — RESULT DELIVERY

Options:
1. Poll API
2. WebSocket push (preferred)

====================================================
📊 JOB TRACKING SYSTEM
====================================================

Create:

MongoDB collection:
ai_jobs

Fields:
- jobId
- userId
- type
- status (pending, processing, completed, failed)
- progress
- result
- error
- createdAt

----------------------------------------------------

API:

GET /analysis/jobs/:jobId
GET /analysis/latest

====================================================
🔌 FASTAPI AI WORKER (IMPORTANT)
====================================================

Structure:

ai-service/
 ├── workers/
 │   └── bullmq_consumer.py
 ├── services/
 │   └── career_analyzer.py

----------------------------------------------------

WORKER LOGIC:

- receive job
- acquire Redis lock
- process AI
- save result
- emit event
- handle retries

====================================================
📡 WEBSOCKET SYSTEM (REAL-TIME)
====================================================

Location:
Gateway

Use:
- Socket.IO

----------------------------------------------------

Features:

- namespace: /ws/dashboard
- event: job:completed
- event: job:failed

----------------------------------------------------

Payload:
{
  jobId,
  status,
  result
}

====================================================
🧠 AI FEATURES (SIMULATED FOR NOW)
====================================================

For now implement mock AI:

Return:
- readinessScore
- strengths
- skillGaps

Later replace with LLM

====================================================
⚡ ADVANCED FEATURES (MANDATORY)
====================================================

1. COOLDOWN SYSTEM
- 1 analysis per 24 hours

----------------------------------------------------

2. QUOTA SYSTEM
- limit AI usage

----------------------------------------------------

3. REDIS LOCK
- prevent duplicate jobs

----------------------------------------------------

4. ERROR HANDLING
- retry failed jobs
- move to DLQ

----------------------------------------------------

5. LOGGING
- job lifecycle logs

====================================================
📦 RESPONSE FORMAT
====================================================

{
  success: true,
  data: {...}
}

====================================================
⚡ OUTPUT REQUIREMENTS
====================================================

Generate FULL CODE for:

1. Redis setup (Node + Python)
2. BullMQ queues (producer + config)
3. AI job routes/controllers/services
4. MongoDB schema for jobs
5. FastAPI worker
6. WebSocket system
7. Cooldown + quota logic
8. Modular folder structure

====================================================
🚨 DO NOT:
====================================================

- Block HTTP requests for AI
- Mix AI logic in Node.js
- Skip queue system
- Ignore retries

====================================================
🎯 FINAL RESULT
====================================================

After Day 3:

✔ Async AI pipeline working  
✔ Redis fully integrated  
✔ Queue system running  
✔ WebSocket real-time updates  
✔ AI job tracking system  

System should behave like:
👉 Real AI SaaS backend (async + scalable)

====================================================