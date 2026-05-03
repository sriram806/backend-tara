import { FastifyReply, FastifyRequest } from 'fastify';
import { rateLimitService } from '../services/rate-limit.service';

type RateLimitPolicy = {
  scope: string;
  max: number;
  windowMs: number;
};

export function createRateLimitMiddleware(policy: RateLimitPolicy) {
  return async function rateLimitMiddleware(request: FastifyRequest, reply: FastifyReply) {
    const key = `rate:${request.ip}:${policy.scope}`;
    const result = await rateLimitService.check(key, policy.max, policy.windowMs);

    reply.header('x-ratelimit-limit', String(policy.max));
    reply.header('x-ratelimit-remaining', String(result.remaining));
    reply.header('x-ratelimit-reset', String(result.resetAt));

    if (!result.allowed) {
      return reply.code(429).send({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests, please try again later'
        }
      });
    }
  };
}

export const globalApiRateLimit = createRateLimitMiddleware({
  scope: 'api',
  max: 100,
  windowMs: 60_000
});

export const loginRateLimit = createRateLimitMiddleware({
  scope: 'auth-login',
  max: 5,
  windowMs: 60_000
});

export const otpRateLimit = createRateLimitMiddleware({
  scope: 'auth-otp',
  max: 3,
  windowMs: 60_000
});
