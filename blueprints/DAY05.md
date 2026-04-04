You are a Senior AI Engineer building the intelligence layer of "Think AI".

Day 1–4 are completed:
- Microservices (Fastify)
- Auth system (JWT + OTP + Email)
- NeonDB + MongoDB
- Redis + BullMQ queues
- AI service (FastAPI)
- LLM Gateway (Claude + OpenAI with fallback)
- API-based AI system

Now implement DAY 5: NLP + CAREER ANALYZER SYSTEM

====================================================
🚨 CORE ARCHITECTURE DECISION
====================================================

HYBRID AI SYSTEM:

👉 Use LLM APIs for reasoning (Claude/OpenAI)
👉 Use NLP + ML locally for preprocessing

----------------------------------------------------

RULE:

✔ Cheap operations → NLP / ML (local)
✔ Complex reasoning → LLM API

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
🎯 DAY 5 GOAL
====================================================

Build:

✔ NLP pipeline (spaCy)
✔ Skill extraction system
✔ Skill normalization system
✔ Semantic matching (MiniLM embeddings)
✔ Career Analyzer engine
✔ Hybrid AI flow (NLP + LLM)
✔ MongoDB storage of analysis

====================================================
🧠 NLP PIPELINE (spaCy)
====================================================

File:
services/ai-service/services/nlp_pipeline.py

----------------------------------------------------

Install:
- spacy
- en_core_web_sm

----------------------------------------------------

PIPELINE STEPS:

1. Text cleaning
2. Tokenization
3. Named Entity Recognition (NER)
4. Skill extraction

----------------------------------------------------

Extract:

- SKILLS
- ROLE
- EXPERIENCE
- TECHNOLOGIES

====================================================
🧩 SKILL EXTRACTION SYSTEM
====================================================

Build custom skill dictionary:

Example:
- React
- Node.js
- Python
- MongoDB
- AWS

----------------------------------------------------

Normalize:

"ReactJS" → "React"  
"NodeJS" → "Node.js"

----------------------------------------------------

Output:
skills = ["React", "Node.js", "MongoDB"]

====================================================
🧠 SEMANTIC MATCHING (MiniLM)
====================================================

Install:
- sentence-transformers

Model:
- all-MiniLM-L6-v2

----------------------------------------------------

Use for:

- comparing user skills vs target role
- detecting skill gaps

----------------------------------------------------

Output:
- similarity score
- missing skills

====================================================
🧠 CAREER ANALYZER ENGINE
====================================================

File:
services/ai-service/services/career_service.py

----------------------------------------------------

INPUT:
- resume text
- target role
- GitHub score (optional)
- quiz score (optional)

----------------------------------------------------

PROCESS:

STEP 1:
Run NLP pipeline → extract skills

STEP 2:
Semantic comparison → find gaps

STEP 3:
Prepare structured input

STEP 4:
Call LLM (Claude/OpenAI)

----------------------------------------------------

LLM OUTPUT:

{
  "readinessScore": 0–100,
  "strengths": [],
  "skillGaps": [],
  "recommendations": [],
  "marketInsights": {}
}

====================================================
📦 MONGODB STORAGE
====================================================

Collection:
career_analysis_reports

Fields:
- userId
- readinessScore
- strengths
- skillGaps
- recommendations
- modelVersion
- createdAt

====================================================
🔄 QUEUE INTEGRATION
====================================================

Queue:
analysis:queue

----------------------------------------------------

FLOW:

Node → enqueue job  
FastAPI → process job  
MongoDB → store result  
WebSocket → notify  

====================================================
⚡ ADVANCED FEATURES
====================================================

1. ANALYSIS COOLDOWN
- 1 analysis per 24 hours

----------------------------------------------------

2. RESULT VERSIONING
- store multiple reports

----------------------------------------------------

3. CACHED RESULTS
- Redis cache recent analysis

----------------------------------------------------

4. INPUT VALIDATION
- clean + sanitize text

====================================================
🔐 SECURITY (IMPORTANT)
====================================================

- Remove PII before LLM call
- Validate input size
- Prevent prompt injection

====================================================
📡 API ROUTES
====================================================

POST /ai/career
GET /ai/career/latest

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

1. NLP pipeline (spaCy)
2. Skill extraction system
3. Skill normalization
4. Sentence-transformers integration
5. Career analyzer service
6. LLM integration (via gateway)
7. MongoDB schema
8. Queue worker integration
9. API routes

====================================================
🚨 DO NOT:
====================================================

- Skip NLP layer
- Use LLM for everything
- Ignore modular structure
- Mix logic in routers

====================================================
🎯 FINAL RESULT
====================================================

After Day 5:

✔ Real intelligence system  
✔ NLP + LLM hybrid pipeline  
✔ Skill gap detection  
✔ Career readiness scoring  

System becomes:
👉 Smart AI Career Engine

====================================================