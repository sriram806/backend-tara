import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';

export const registerCorePlugins = fp(async (app: FastifyInstance) => {
  await app.register(helmet, { global: true });
  await app.register(rateLimit, {
    global: true,
    max: Number(process.env.RATE_LIMIT_MAX ?? 120),
    timeWindow: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000)
  });
  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024 // 10MB limit
    }
  });
  app.log.debug('Core plugins registered');
});
