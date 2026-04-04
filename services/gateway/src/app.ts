import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import crypto from 'node:crypto';
import { authPlugin } from './plugins/auth';
import { rateLimitPlugin } from './plugins/rate-limit';
import { healthRoutes } from './routes/health';
import { proxyRoutes } from './routes/proxy';

export function buildGatewayApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info'
    },
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID()
  });

  app.register(cors, {
    origin: true,
    credentials: true
  });

  app.register(helmet, {
    global: true
  });

  app.register(rateLimitPlugin);
  app.register(authPlugin);

  app.addHook('onResponse', async (request, reply) => {
    app.log.info({
      requestId: request.id,
      route: request.url,
      method: request.method,
      statusCode: reply.statusCode,
      responseTimeMs: reply.elapsedTime
    });
  });

  app.register(healthRoutes);
  app.register(proxyRoutes);

  return app;
}
