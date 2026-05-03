import crypto from 'node:crypto';
import cors from '@fastify/cors';
import * as Sentry from '@sentry/node';
import Fastify from 'fastify';
import { z } from 'zod';
import { commonServiceEnvSchema, createCloudWatchMetricEvent, loadEnv } from '@thinkai/config';
import { healthRoutes } from './routes/health.routes';
import { examRoutes } from './routes/exam.routes';
import { skillsRoutes } from './routes/skills.routes';

const env = loadEnv(commonServiceEnvSchema.merge(z.object({
  CORS_ORIGIN: z.string().default('http://localhost:3000,http://localhost:3001'),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32)
})));

const allowedOrigins = env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean);
const sentryDsn = env.SENTRY_DSN;

if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: env.NODE_ENV,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE
  });
}

const app = Fastify({
  logger: { level: env.LOG_LEVEL },
  requestIdHeader: 'x-request-id',
  genReqId: () => crypto.randomUUID()
});

void app.register(cors, {
  credentials: true,
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`Origin ${origin} not allowed by CORS`), false);
  }
});

app.addHook('onResponse', async (request, reply) => {
  app.log.info({
    requestId: request.id,
    route: request.url,
    method: request.method,
    statusCode: reply.statusCode,
    responseTimeMs: reply.elapsedTime
  });

  app.log.info(createCloudWatchMetricEvent(
    env.METRICS_NAMESPACE,
    'ApiLatencyMs',
    reply.elapsedTime,
    'Milliseconds',
    {
      service: env.SERVICE_NAME,
      route: request.routeOptions?.url ?? request.url,
      method: request.method
    }
  ));
});

app.addHook('onError', async (_request, _reply, error) => {
  if (sentryDsn) {
    Sentry.captureException(error);
  }
});

app.register(healthRoutes);
app.register(examRoutes, { prefix: '/exam' });
app.register(skillsRoutes, { prefix: '/skills' });

const start = async () => {
  try {
    await app.listen({ host: env.HOST, port: env.PORT });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

void start();
