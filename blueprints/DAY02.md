You are a Senior Backend Engineer building a production-grade authentication and user system for "Think AI".

Day 1 is already completed:
- Microservices architecture (Fastify)
- API Gateway
- Docker setup
- Config package
- Basic service scaffolding

Now implement DAY 2 with FULL ADVANCED FEATURES, SECURITY, and STRICT MODULAR ARCHITECTURE.

====================================================
🚨 CRITICAL RULE — STRICT MODULAR STRUCTURE
====================================================

ALL services MUST follow this EXACT structure:

/services/{service-name}/
 ├── src/
 │   ├── routes/
 │   ├── controllers/
 │   ├── services/
 │   ├── utils/
 │   ├── middleware/
 │   ├── schemas/
 │   ├── plugins/
 │   └── index.ts
 ├── Dockerfile
 └── package.json

RULES:
- routes → only route definitions
- controllers → request/response handling
- services → business logic + DB
- utils → helper functions
- middleware → auth, rate limit
- schemas → validation (Zod)
- index.ts → app bootstrap ONLY

If ANY service violates this:
👉 REFACTOR it completely

====================================================
🎯 DAY 2 GOAL
====================================================

Build a COMPLETE AUTH SYSTEM including:

✔ NeonDB (PostgreSQL via Drizzle)
✔ JWT Authentication (Access + Refresh)
✔ Refresh Token Rotation
✔ Forgot Password (OTP-based)
✔ Email Verification (OTP-based)
✔ SMTP Email System (Nodemailer)
✔ Rate Limiting (Redis-ready design)
✔ OTP Expiry (5 minutes)
✔ Security best practices
✔ Modular architecture

====================================================
🧱 DATABASE DESIGN (NeonDB + Drizzle)
====================================================

Tables:

1. USERS
- id (UUID)
- email (unique)
- password_hash
- auth_provider
- role (guest/free/pro/admin)
- status (active/suspended/deleted)
- email_verified (boolean)
- created_at
- updated_at

----------------------------------------------------

2. USER_PROFILES
- user_id (FK)
- full_name
- target_role
- preferences (JSONB)

----------------------------------------------------

3. REFRESH_TOKENS
- id
- user_id
- token_hash
- expires_at
- revoked_at
- device_info
- ip_address

----------------------------------------------------

4. OTP_VERIFICATIONS (IMPORTANT)

- id
- user_id
- email
- otp_code (hashed)
- type (VERIFY_EMAIL / RESET_PASSWORD)
- expires_at (5 minutes)
- attempts (max 5)
- created_at

----------------------------------------------------

INDEXES:
- email (users)
- token_hash
- otp lookup

====================================================
🔐 AUTH SYSTEM (ADVANCED)
====================================================

1. PASSWORD SECURITY
- bcrypt (12 rounds)

----------------------------------------------------

2. JWT SYSTEM

Access Token:
- expiry: 15 minutes
- payload: userId, role, jti

Refresh Token:
- expiry: 30 days
- stored hashed in DB

----------------------------------------------------

3. TOKEN ROTATION
- revoke old refresh token
- issue new pair

----------------------------------------------------

4. TOKEN REVOCATION
- support blacklist (future Redis)

====================================================
📧 EMAIL SYSTEM (SMTP + NODEMAILER)
====================================================

Use:
- Nodemailer
- SMTP (Gmail / AWS SES)

Features:
- Send OTP emails
- Send verification email
- Send password reset email

Templates:
- Clean HTML email
- OTP highlighted

Example:
"Your OTP is 483921 (valid for 5 minutes)"

====================================================
🔢 OTP SYSTEM (CRITICAL)
====================================================

- 6-digit OTP
- Expiry: 5 minutes
- Max attempts: 5
- Store hashed OTP (SHA256)

Flows:

1. EMAIL VERIFICATION:
- Send OTP after register
- Verify OTP → mark email_verified = true

2. FORGOT PASSWORD:
- Send OTP
- Verify OTP
- Allow password reset

Security:
- OTP cannot be reused
- Delete after success

====================================================
📡 AUTH SERVICE (FULL FEATURES)
====================================================

Structure:

/routes/auth.routes.ts
/controllers/auth.controller.ts
/services/auth.service.ts
/services/email.service.ts
/utils/jwt.ts
/utils/hash.ts
/utils/otp.ts
/schemas/auth.schema.ts
/middleware/rateLimit.middleware.ts
/index.ts

----------------------------------------------------

ROUTES:

POST /auth/register
POST /auth/login
POST /auth/refresh
DELETE /auth/logout

POST /auth/send-verify-otp
POST /auth/verify-email

POST /auth/forgot-password
POST /auth/reset-password

----------------------------------------------------

FLOWS:

REGISTER:
- validate input
- hash password
- create user
- send verification OTP

LOGIN:
- verify password
- check email_verified
- generate tokens

VERIFY EMAIL:
- validate OTP
- mark verified

FORGOT PASSWORD:
- generate OTP
- send email

RESET PASSWORD:
- validate OTP
- update password

====================================================
⚡ RATE LIMITING (IMPORTANT)
====================================================

Implement middleware:

- login: 5 attempts/min
- OTP: 3 requests/min
- API: 100 req/min

Design:
- Redis-ready (use in-memory fallback)
- key: rate:{ip}:{route}

====================================================
🛡️ SECURITY FEATURES
====================================================

- Input validation (Zod)
- Hash passwords + OTP
- httpOnly cookies (refresh token)
- Secure flag (HTTPS)
- Prevent brute force
- Limit OTP attempts
- Error handling (no sensitive leaks)

====================================================
📦 RESPONSE FORMAT
====================================================

{
  success: true,
  data: {...}
}

{
  success: false,
  error: {
    code: "ERROR_CODE",
    message: "Message"
  }
}

====================================================
⚡ OUTPUT REQUIREMENTS
====================================================

Generate FULL CODE for:

1. Complete modular folder structure
2. Drizzle DB setup
3. Auth service (ALL routes)
4. OTP system
5. Email service (Nodemailer)
6. JWT utils
7. Password utils
8. Rate limit middleware
9. Validation schemas
10. Error handling

====================================================
🚨 DO NOT:
====================================================

- Store plain passwords
- Store plain OTP
- Skip validation
- Mix logic in routes
- Ignore modular structure

====================================================
🎯 FINAL RESULT
====================================================

After Day 2:

✔ Fully working authentication system  
✔ Email verification via OTP  
✔ Forgot password system  
✔ Secure JWT flow  
✔ Rate limiting  
✔ Production-ready modular backend  

System should be equal to:
👉 Real SaaS authentication backend

====================================================