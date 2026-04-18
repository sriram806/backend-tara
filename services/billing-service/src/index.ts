import crypto from 'node:crypto';
import cors from '@fastify/cors';
import Fastify from 'fastify';
import * as Sentry from '@sentry/node';
import { z } from 'zod';
import { commonServiceEnvSchema, createCloudWatchMetricEvent, loadEnv } from '@thinkai/config';
import { BillingController } from './controllers/billing.controller';
import { registerCorePlugins } from './plugins/core.plugin';
import { registerRawBodyPlugin } from './plugins/raw-body.plugin';
import { billingRoutes } from './routes/billing.routes';
import { BillingService } from './services/billing.service';
import { RazorpayService } from './services/razorpay.service';

const env = loadEnv(commonServiceEnvSchema.merge(z.object({
  CORS_ORIGIN: z.string().default('http://localhost:3000,http://localhost:3001'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().url().default('redis://redis:6379'),
  JWT_ACCESS_SECRET: z.string().min(32),
  RAZORPAY_KEY_ID: z.string().min(1),
  RAZORPAY_KEY_SECRET: z.string().min(1),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1)
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

  if (reply.statusCode >= 500) {
    app.log.info(createCloudWatchMetricEvent(
      env.METRICS_NAMESPACE,
      'ApiErrorCount',
      1,
      'Count',
      {
        service: env.SERVICE_NAME,
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

const razorpayService = new RazorpayService(
  env.RAZORPAY_KEY_ID,
  env.RAZORPAY_KEY_SECRET,
  env.RAZORPAY_WEBHOOK_SECRET
);
const billingController = new BillingController(new BillingService(razorpayService));

void registerCorePlugins(app);
void registerRawBodyPlugin(app);

app.get('/health', async () => ({
  status: 'ok',
  service: 'billing-service'
}));

app.register(billingRoutes(billingController), { prefix: '/billing' });

const start = async () => {
  try {
    await app.listen({ host: env.HOST, port: env.PORT });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

void start();
