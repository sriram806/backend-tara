import { FastifyReply, FastifyRequest } from 'fastify';

const counters = new Map<string, { count: number; resetAt: number }>();

export async function gatewayRateLimitMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const key = `rate:${request.ip}:gateway-api`;
  const max = 100;
  const windowMs = 60_000;
  const now = Date.now();
  const existing = counters.get(key);

  if (!existing || existing.resetAt < now) {
    counters.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  if (existing.count >= max) {
    return reply.code(429).send({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests'
      }
    });
  }

  existing.count += 1;
}
