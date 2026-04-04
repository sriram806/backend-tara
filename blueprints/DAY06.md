You are a Senior AI + Backend Engineer building the Resume Intelligence System for "Think AI".

Day 1–5 are completed:
- Microservices architecture
- Auth system (JWT + OTP + Email)
- NeonDB + MongoDB
- Redis + BullMQ
- AI Service (FastAPI)
- LLM Gateway (Claude/OpenAI)
- NLP pipeline (spaCy)
- Career Analyzer system

Now implement DAY 6: RESUME ANALYZER SYSTEM (ATS + AI REWRITE)

====================================================
🚨 CORE ARCHITECTURE DECISION
====================================================

HYBRID AI SYSTEM:

✔ NLP + rules → ATS scoring (cheap + fast)
✔ LLM API → suggestions + rewriting

DO NOT use LLM for everything.

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
🎯 DAY 6 GOAL
====================================================

Build:

✔ Resume PDF parsing system
✔ ATS scoring engine
✔ Section detection system
✔ Skill extraction from resume
✔ AI-based suggestions
✔ Resume rewrite engine
✔ MongoDB storage
✔ Queue integration

====================================================
📄 STEP 1 — PDF PARSING
====================================================

Use:
- pdfplumber

----------------------------------------------------

Process:
- Extract text from PDF
- Preserve structure (sections if possible)

----------------------------------------------------

Output:
- raw_text
- structured_text

====================================================
🧩 STEP 2 — SECTION DETECTION
====================================================

Detect sections:

- Summary
- Experience
- Skills
- Projects
- Education

----------------------------------------------------

Method:
- rule-based matching (keywords)
- NLP fallback

====================================================
📊 STEP 3 — ATS SCORING ENGINE
====================================================

Build rule-based scoring:

----------------------------------------------------

1. KEYWORD MATCH (40%)
- compare resume vs target role

2. SECTION COMPLETENESS (20%)
- missing sections → penalty

3. FORMAT QUALITY (20%)
- length
- structure

4. SKILL MATCH (20%)
- relevant skills presence

----------------------------------------------------

Output:
ATS Score (0–100)

====================================================
🧠 STEP 4 — NLP + SKILL EXTRACTION
====================================================

Use:
- spaCy pipeline (Day 5)

----------------------------------------------------

Extract:
- skills
- technologies
- roles

====================================================
🤖 STEP 5 — AI SUGGESTIONS (LLM)
====================================================

Use:
- LLM Gateway (Claude/OpenAI)

----------------------------------------------------

Generate:

- section improvements
- missing keywords
- formatting suggestions

----------------------------------------------------

Output:
{
  "suggestions": [
    {
      "type": "warning",
      "section": "Skills",
      "message": "Add backend technologies"
    }
  ]
}

====================================================
✍️ STEP 6 — RESUME REWRITE ENGINE
====================================================

Feature:
Rewrite specific section

----------------------------------------------------

API:
POST /ai/resume/rewrite

Input:
- section text
- role

----------------------------------------------------

LLM Output:
- improved version
- ATS optimized

====================================================
📦 STEP 7 — MONGODB STORAGE
====================================================

Collection:
resume_analysis

Fields:
- userId
- atsScore
- sectionScores
- suggestions
- extractedSkills
- rawText
- createdAt

====================================================
🔄 STEP 8 — QUEUE INTEGRATION
====================================================

Queue:
resume:queue

----------------------------------------------------

Flow:

Node → enqueue job  
FastAPI → process resume  
MongoDB → store  
WebSocket → notify  

====================================================
📡 API ROUTES
====================================================

POST /ai/resume/analyze
GET /ai/resume/latest
POST /ai/resume/rewrite

====================================================
⚡ ADVANCED FEATURES (IMPORTANT)
====================================================

1. FILE VALIDATION
- max 5MB
- only PDF

----------------------------------------------------

2. PRE-SIGNED URL (future)
- upload directly to S3

----------------------------------------------------

3. RESULT CACHING
- Redis cache

----------------------------------------------------

4. MULTIPLE ANALYSIS HISTORY
- versioning

----------------------------------------------------

5. KEYWORD GAP DETECTION
- compare job vs resume

====================================================
🔐 SECURITY
====================================================

- sanitize extracted text
- remove PII before LLM
- limit file size

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

1. PDF parsing (pdfplumber)
2. Section detection logic
3. ATS scoring engine
4. NLP integration
5. AI suggestions (LLM)
6. Resume rewrite API
7. MongoDB schema
8. Queue worker
9. Routes + controllers

====================================================
🚨 DO NOT:
====================================================

- Use LLM for ATS scoring
- Skip NLP layer
- Ignore modular structure
- Mix logic in routes

====================================================
🎯 FINAL RESULT
====================================================

After Day 6:

✔ Resume ATS scoring working  
✔ AI suggestions generated  
✔ Resume rewrite feature  
✔ Async processing pipeline  

System becomes:
👉 AI Resume Optimizer (production-level)

====================================================