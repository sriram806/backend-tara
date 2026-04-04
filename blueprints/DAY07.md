You are a Senior AI + Backend Engineer building the roadmap generation and job matching intelligence system for "Think AI".

Day 1–6 are completed:
- Microservices architecture
- Auth system (JWT + OTP + Email)
- NeonDB + MongoDB
- Redis + BullMQ
- AI Service (FastAPI)
- LLM Gateway (Claude/OpenAI)
- NLP pipeline (spaCy)
- Career Analyzer
- Resume Analyzer (ATS + Rewrite)

Now implement DAY 7: ROADMAP ENGINE + JOB MATCHING SYSTEM

====================================================
🚨 CORE ARCHITECTURE DECISION
====================================================

HYBRID AI SYSTEM:

✔ LLM → roadmap generation (high reasoning)
✔ Embeddings → job matching (efficient)
✔ Rules → adaptation logic

====================================================
🚨 STRICT MODULAR STRUCTURE
====================================================

/services/ai-service/
 ├── routers/
 ├── services/
 ├── core/
 ├── models/
 ├── workers/
 ├── utils/
 └── main.py

====================================================
🎯 DAY 7 GOAL
====================================================

Build:

✔ 90-day roadmap generator
✔ Adaptive roadmap system
✔ Task generation system
✔ Job matching system (semantic search)
✔ Embedding pipeline
✔ pgvector integration (NeonDB)
✔ MongoDB storage
✔ Queue integration

====================================================
🧠 PART 1 — ROADMAP GENERATOR
====================================================

INPUT:
- skill gaps (from career analysis)
- target role

----------------------------------------------------

PROCESS:

Use LLM (Claude/OpenAI) to generate:

✔ 90-day roadmap
✔ 3 phases:
  - Phase 1 (Days 1–30)
  - Phase 2 (Days 31–60)
  - Phase 3 (Days 61–90)

----------------------------------------------------

OUTPUT:

{
  "phases": [
    {
      "title": "Foundation",
      "days": [
        { "day": 1, "task": "Learn JS basics" },
        ...
      ]
    }
  ]
}

====================================================
🧩 PART 2 — TASK GENERATION
====================================================

Each roadmap MUST:

✔ Generate daily tasks  
✔ Include:
- title
- description
- difficulty
- type (learning/practice/project)

----------------------------------------------------

Inject into Task Service:

POST /tasks

====================================================
🔄 PART 3 — ADAPTIVE ROADMAP
====================================================

Feature:

- If user misses tasks → adapt roadmap

----------------------------------------------------

RULES:

- If >3 days missed → regenerate remaining plan
- If tasks marked irrelevant → adjust

====================================================
📦 STORAGE (MongoDB)
====================================================

Collection:
roadmap_documents

Fields:
- userId
- phases
- durationDays
- version
- createdAt

====================================================
🧠 PART 4 — JOB MATCHING SYSTEM
====================================================

Goal:
Match users with relevant jobs using semantic similarity

====================================================
🧩 STEP 1 — EMBEDDINGS
====================================================

Use:
- OpenAI text-embedding-3-small

----------------------------------------------------

Generate embeddings for:

✔ user profile
✔ resume
✔ job descriptions

====================================================
🧱 STEP 2 — PGVECTOR (NeonDB)
====================================================

Create tables:

jd_embeddings:
- job_id
- embedding
- metadata

resume_embeddings:
- user_id
- embedding

----------------------------------------------------

Use:
- cosine similarity

====================================================
📊 STEP 3 — MATCHING ENGINE
====================================================

Query:

- find top N jobs
- rank by similarity score

----------------------------------------------------

Enhancements:

✔ recency boost  
✔ location filter  
✔ experience filter  

====================================================
📦 STEP 4 — JOB STORAGE (MongoDB)
====================================================

Collection:
job_feed_cache

Fields:
- userId
- matches
- generatedAt

====================================================
📡 API ROUTES
====================================================

ROADMAP:

POST /ai/roadmap/generate
GET /ai/roadmap/current

----------------------------------------------------

JOBS:

GET /ai/jobs/match

====================================================
🔄 QUEUE INTEGRATION
====================================================

Queues:

- roadmap:queue
- jobs:queue

----------------------------------------------------

Flow:

Node → enqueue job  
FastAPI → process  
MongoDB → store  
WebSocket → notify  

====================================================
⚡ ADVANCED FEATURES
====================================================

1. ROADMAP VERSIONING
- multiple versions stored

----------------------------------------------------

2. JOB MATCH REASONS
- "Matched because of React + Node.js"

----------------------------------------------------

3. EMBEDDING CACHE
- Redis cache embeddings

----------------------------------------------------

4. JOB FEED TTL
- expire after 24 hours

====================================================
🔐 SECURITY
====================================================

- sanitize inputs
- validate embeddings
- limit request size

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

1. Roadmap generator (LLM)
2. Task generation system
3. Adaptive roadmap logic
4. Embedding pipeline
5. pgvector integration
6. Job matching engine
7. MongoDB schemas
8. Queue workers
9. API routes

====================================================
🚨 DO NOT:
====================================================

- Skip embeddings
- Use LLM for matching (use vector search)
- Ignore modular structure
- Mix logic in routers

====================================================
🎯 FINAL RESULT
====================================================

After Day 7:

✔ Personalized 90-day roadmap  
✔ Adaptive learning system  
✔ Semantic job matching  
✔ Embedding-based intelligence  

System becomes:
👉 Full AI Career Platform

====================================================