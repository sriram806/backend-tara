import { FastifyReply, FastifyRequest } from 'fastify';

const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 90;
const requestCounts = new Map<string, { count: number; windowStart: number }>();

export async function interviewRateLimitMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const ip = request.ip;
  const now = Date.now();
  const current = requestCounts.get(ip);

  if (!current || now - current.windowStart > WINDOW_MS) {
    requestCounts.set(ip, { count: 1, windowStart: now });
    return;
  }

  current.count += 1;
  if (current.count > MAX_REQUESTS_PER_WINDOW) {
    return reply.code(429).send({
      success: false,
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Rate limit exceeded. Please try again shortly.'
      }
    });
  }
}
