import Fastify from 'fastify';
import * as Sentry from '@sentry/node';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import crypto from 'node:crypto';
import { createCloudWatchMetricEvent } from '@thinkai/config';
import { authPlugin } from './plugins/auth';
import { rateLimitPlugin } from './plugins/rate-limit';
import { healthRoutes } from './routes/health';
import { proxyRoutes } from './routes/proxy';

export function buildGatewayApp() {
  const sentryDsn = process.env.SENTRY_DSN;
  if (sentryDsn) {
    Sentry.init({
      dsn: sentryDsn,
      environment: process.env.NODE_ENV ?? 'development',
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1)
    });
  }

  const metricsNamespace = process.env.METRICS_NAMESPACE ?? 'ThinkAI/Services';

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

    app.log.info(createCloudWatchMetricEvent(
      metricsNamespace,
      'ApiLatencyMs',
      reply.elapsedTime,
      'Milliseconds',
      {
        service: process.env.SERVICE_NAME ?? 'gateway',
        route: request.routeOptions?.url ?? request.url,
        method: request.method
      }
    ));

    if (reply.statusCode >= 500) {
      app.log.info(createCloudWatchMetricEvent(
        metricsNamespace,
        'ApiErrorCount',
        1,
        'Count',
        {
          service: process.env.SERVICE_NAME ?? 'gateway',
          route: request.routeOptions?.url ?? request.url,
          method: request.method
        }
      ));
    }
  });

  app.addHook('onError', async (_request, _reply, error) => {
    if (sentryDsn) {
      Sentry.captureException(error);
    }
  });

  app.register(healthRoutes);
  app.register(proxyRoutes);

  return app;
}
