# Think AI - Day 1 Foundation

Production-ready monorepo scaffold for Think AI microservices:

- API Gateway (Fastify)
- Auth Service (Fastify)
- User Service (Fastify)
- AI Service (FastAPI)
- Shared config/types/db packages
- Docker Compose orchestration

## Run with Docker

```bash
cd infra
docker compose up --build
```

## Service Ports

- Gateway: 4000
- Auth Service: 4001
- User Service: 4002
- AI Service: 8000
