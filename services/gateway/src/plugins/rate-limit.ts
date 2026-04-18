import { FastifyPluginAsync } from 'fastify';
import rateLimit from '@fastify/rate-limit';

export const rateLimitPlugin: FastifyPluginAsync = async (app) => {
  await app.register(rateLimit, {
    global: true,
    max: Number(process.env.RATE_LIMIT_MAX ?? 150),
    timeWindow: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
    errorResponseBuilder: () => ({
      code: 429,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please try again shortly.'
    })
  });
};
