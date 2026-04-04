You are a Senior Backend Architect building a production-grade AI platform called "Think AI".

Your task is to implement DAY 1 with FULL production-level standards, modular architecture, scalability, and clean code.

====================================================
🎯 DAY 1 GOAL
====================================================

Build the COMPLETE backend foundation for a microservices-based AI platform.

This includes:
- Monorepo setup
- Core microservices scaffolding
- API Gateway (BFF)
- Base FastAPI AI service
- Docker infrastructure
- Shared config system
- Logging + health checks
- Dev standards

The system must be scalable, modular, and production-ready.

====================================================
🏗️ SYSTEM ARCHITECTURE (FOLLOW STRICTLY)
====================================================

- Microservices architecture
- Node.js (Fastify) → backend services
- FastAPI (Python) → AI services
- NeonDB (future DB)
- MongoDB (future AI storage)
- Redis (future caching + queues)

IMPORTANT:
- No business logic in Gateway
- Services must be independent
- Use Docker for all services

====================================================
📁 PROJECT STRUCTURE (MANDATORY)
====================================================

thinkai/
├── apps/
│   └── web/ (ignore for now)
├── services/
│   ├── gateway/
│   ├── auth-service/
│   ├── user-service/
│   └── ai-service/
├── packages/
│   ├── config/
│   ├── types/
│   └── db/
├── infra/
│   └── docker-compose.yml
├── .github/workflows/
├── pnpm-workspace.yaml
├── package.json

====================================================
⚙️ STEP 1 — MONOREPO SETUP
====================================================

- Initialize PNPM workspace
- Add TypeScript globally
- Setup base scripts

Install:
- typescript
- ts-node-dev
- eslint
- prettier
- dotenv
- zod

====================================================
🧩 STEP 2 — SHARED CONFIG PACKAGE
====================================================

Create reusable config system:

packages/config:
- env validation using Zod
- environment loader

Features:
- Strict env validation
- Fail-fast if missing variables
- Reusable across all services

====================================================
🚀 STEP 3 — API GATEWAY (CORE)
====================================================

Location:
services/gateway

Tech:
- Fastify

Features:
- CORS
- Helmet (security headers)
- Logger (pino)
- Request validation structure
- Rate limit placeholder
- JWT middleware placeholder

Routes:
- GET /health
- Base routing system (proxy placeholder)

Responsibilities:
- Authentication validation (future)
- Request routing
- Aggregation layer

IMPORTANT:
- NO business logic here

====================================================
🔐 STEP 4 — AUTH SERVICE (SKELETON)
====================================================

Location:
services/auth-service

Tech:
- Fastify

Routes:
- POST /register
- POST /login
- POST /refresh
- DELETE /logout

Features:
- Structure only (no DB yet)
- Validation placeholders
- Response format standardization

====================================================
👤 STEP 5 — USER SERVICE (SKELETON)
====================================================

Location:
services/user-service

Routes:
- GET /me
- PATCH /me

Features:
- Dummy response
- Structure ready for DB integration

====================================================
🤖 STEP 6 — AI SERVICE (FASTAPI BASE)
====================================================

Location:
services/ai-service

Tech:
- FastAPI

Structure:
- main.py
- routers/
- services/
- models/
- core/

Routes:
- GET /health

Features:
- Base structure for AI system
- Ready for NLP + LLM integration

====================================================
🐳 STEP 7 — DOCKER SETUP (MANDATORY)
====================================================

Create docker-compose:

Services:
- gateway (4000)
- auth-service (4001)
- user-service (4002)
- ai-service (8000)

Features:
- All services containerized
- Internal networking
- Health checks

====================================================
📜 STEP 8 — LOGGING SYSTEM
====================================================

- Use Fastify built-in logger (pino)
- Structured JSON logs

Include:
- requestId
- route
- method
- response time

====================================================
🧪 STEP 9 — HEALTH CHECK SYSTEM
====================================================

Every service MUST implement:

GET /health

Response:
{
  "status": "ok",
  "service": "service-name"
}

====================================================
🧱 STEP 10 — CODE QUALITY SETUP
====================================================

Add:
- ESLint
- Prettier
- TypeScript config

Rules:
- Clean code
- Consistent formatting
- No unused variables

====================================================
🔄 STEP 11 — GIT + INITIAL COMMIT
====================================================

- Initialize git repo
- First commit: "Day 1: Foundation setup"

====================================================
⚡ OUTPUT REQUIREMENTS
====================================================

Generate FULL CODE for:

1. Monorepo setup
2. PNPM workspace
3. Gateway service (complete)
4. Auth service (structure)
5. User service (structure)
6. FastAPI AI service (base)
7. Docker setup
8. Config package
9. Logging system
10. Health checks

====================================================
🚨 IMPORTANT RULES
====================================================

DO:
- Use modular structure
- Write scalable code
- Follow microservices principles
- Keep services independent

DO NOT:
- Add business logic
- Connect DB yet
- Skip Docker
- Mix services

====================================================
🎯 FINAL RESULT
====================================================

At the end of Day 1:

- All services should run via Docker
- Gateway should be accessible
- Health endpoints should work
- Structure should be production-ready

====================================================

Generate everything with:
- File structure
- Full code
- Best practices
- Comments explaining logic