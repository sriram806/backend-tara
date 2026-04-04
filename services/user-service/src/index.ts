import Fastify from 'fastify';
import crypto from 'node:crypto';
import { commonServiceEnvSchema, loadEnv } from '@thinkai/config';
import { healthRoutes } from './routes/health';
import { meRoutes } from './routes/me';

const env = loadEnv(commonServiceEnvSchema);

const app = Fastify({
  logger: { level: env.LOG_LEVEL },
  requestIdHeader: 'x-request-id',
  genReqId: () => crypto.randomUUID()
});

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
app.register(meRoutes, { prefix: '/users' });

const start = async () => {
  try {
    await app.listen({ host: env.HOST, port: env.PORT });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

void start();
