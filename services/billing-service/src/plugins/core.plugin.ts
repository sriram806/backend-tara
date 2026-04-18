import { FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';

export async function registerCorePlugins(app: FastifyInstance) {
  await app.register(helmet, { global: true });
  await app.register(rateLimit, {
    global: true,
    max: Number(process.env.RATE_LIMIT_MAX ?? 120),
    timeWindow: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000)
  });
}
