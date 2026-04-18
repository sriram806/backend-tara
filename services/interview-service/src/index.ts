import crypto from 'node:crypto';
import cors from '@fastify/cors';
import Fastify from 'fastify';
import * as Sentry from '@sentry/node';
import mongoose from 'mongoose';
import { z } from 'zod';
import { commonServiceEnvSchema, createCloudWatchMetricEvent, loadEnv } from '@thinkai/config';
import { InterviewController } from './controllers/interview.controller';
import { interviewAuthMiddleware } from './middleware/auth.middleware';
import { interviewRateLimitMiddleware } from './middleware/rateLimit.middleware';
import { registerCorePlugins } from './plugins/core.plugin';
import { setupInterviewSockets } from './plugins/socket.plugin';
import { interviewRoutes } from './routes/interview.routes';
import { InterviewService } from './services/interview.service';

const env = loadEnv(
  commonServiceEnvSchema.merge(
    z.object({
      CORS_ORIGIN: z.string().default('http://localhost:3000,http://localhost:3001'),
      REDIS_URL: z.string().url().default('redis://redis:6379'),
      MONGO_URL: z.string().default('mongodb://mongodb:27017/thinkai'),
      AI_SERVICE_URL: z.string().url().default('http://localhost:8000'),
      INTERVIEW_SESSION_TTL_SECONDS: z.coerce.number().int().min(60).default(6 * 60 * 60),
      INTERVIEW_TIMEOUT_MINUTES: z.coerce.number().int().min(1).default(10),
      MAX_INTERVIEW_QUESTIONS: z.coerce.number().int().min(1).max(20).default(6),
      AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).default(30_000)
    })
  )
);

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

const interviewService = new InterviewService({
  maxQuestions: env.MAX_INTERVIEW_QUESTIONS,
  sessionTtlSeconds: env.INTERVIEW_SESSION_TTL_SECONDS,
  aiServiceBaseUrl: env.AI_SERVICE_URL,
  aiTimeoutMs: env.AI_REQUEST_TIMEOUT_MS
});

const interviewController = new InterviewController(interviewService);

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

app.addHook('onRequest', interviewAuthMiddleware);
app.addHook('preHandler', interviewRateLimitMiddleware);

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

void registerCorePlugins(app);
app.get('/health', async () => ({
  status: 'ok',
  service: 'interview-service'
}));
app.register(interviewRoutes(interviewController), { prefix: '/interview' });

const start = async () => {
  try {
    await mongoose.connect(env.MONGO_URL);
    app.log.info('Connected to MongoDB');

    setupInterviewSockets(app.server, interviewService, env.INTERVIEW_TIMEOUT_MINUTES * 60 * 1000);

    await app.listen({ host: env.HOST, port: env.PORT });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

void start();
