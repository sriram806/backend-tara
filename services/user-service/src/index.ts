import Fastify from 'fastify';
import * as Sentry from '@sentry/node';
import cors from '@fastify/cors';
import crypto from 'node:crypto';
import { z } from 'zod';
import { commonServiceEnvSchema, createCloudWatchMetricEvent, loadEnv } from '@thinkai/config';
import { UserController } from './controllers/user.controller';
import { registerCorePlugins } from './plugins/core.plugin';
import { healthRoutes } from './routes/health.routes';
import { userRoutes } from './routes/user.routes';
import { analysisRoutes } from './routes/analysis.routes';
import { resumeRoutes } from './routes/resume.routes';
import { roadmapRoutes } from './routes/roadmap.routes';
import { jobMatchRoutes } from './routes/job-match.routes';
import { resumeAnalysisRoutes } from './routes/resume-analysis.routes';
import { onboardingRoutes } from './routes/onboarding.routes';
import { orgRoutes } from './routes/org.routes';
import { personalizationRoutes } from './routes/personalization.routes';
import { recommendationRoutes } from './routes/recommendation.routes';
import { skillsRoutes } from './routes/skills.routes';
import { analyticsRoutes } from './routes/analytics.routes';
import { experimentRoutes } from './routes/experiment.routes';
import { featureFlagRoutes } from './routes/feature-flag.routes';
import { adminRoutes } from './routes/admin.routes';
import { moderationRoutes } from './routes/moderation.routes';
import { notificationAdminRoutes } from './routes/notification.routes';
import { customRolesRoutes } from './routes/custom-roles.routes';
import { webhookRoutes } from './routes/webhook.routes';
import { apiKeyRoutes } from './routes/api-key.routes';
import { UserService } from './services/user.service';
import { SchemaCompatibilityService } from './services/schema-compatibility.service';
import mongoose from 'mongoose';
import { UserHealthController } from './controllers/health.controller';
import { startAnalyticsWorker } from './queues/analytics.queue';
import { startAnalyticsAggregationScheduler } from './services/analytics-aggregation.service';
import { startEmailWorker } from './queues/email.queue';
import { startBulkImportWorker } from './queues/bulk-import.queue';
import { startWebhookWorker } from './queues/webhook.queue';
import { startCronWorker, initCronJobs } from './queues/cron.queue';

const env = loadEnv(commonServiceEnvSchema.merge(z.object({
  CORS_ORIGIN: z.string().default('http://localhost:3000,http://localhost:3001'),
  JWT_ACCESS_SECRET: z.string().min(32),
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
  METRICS_NAMESPACE: z.string().default('ThinkAI/Services')
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

const userController = new UserController(new UserService());
const userHealthController = new UserHealthController();

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
    Sentry.withScope((scope) => {
      if (_request.userContext) {
        scope.setUser({ id: _request.userContext.userId, role: _request.userContext.role });
      }
      if (_request.apiKeyScopes) {
        scope.setTag('api_client', 'true');
        scope.setExtra('scopes', _request.apiKeyScopes);
      }
      scope.setExtra('route', _request.routeOptions?.url ?? _request.url);
      scope.setExtra('method', _request.method);
      Sentry.captureException(error);
    });
  }
});

app.register(registerCorePlugins);

app.register(healthRoutes(userHealthController), { prefix: '/' });
app.register(userRoutes(userController), { prefix: '/users' });
app.register(resumeRoutes, { prefix: '/user/resume' });
app.register(onboardingRoutes, { prefix: '/onboarding' });
app.register(resumeAnalysisRoutes, { prefix: '/ai/resume' });
app.register(analysisRoutes, { prefix: '/ai/analysis' });
app.register(roadmapRoutes, { prefix: '/ai/roadmap' });
app.register(jobMatchRoutes, { prefix: '/ai/jobs' });
app.register(orgRoutes, { prefix: '/org' });
app.register(personalizationRoutes, { prefix: '/user' });
app.register(recommendationRoutes, { prefix: '/user' });
app.register(skillsRoutes, { prefix: '/skills' });
app.register(analyticsRoutes, { prefix: '/analytics' });
app.register(experimentRoutes, { prefix: '/experiments' });
app.register(featureFlagRoutes, { prefix: '/feature-flags' });
app.register(adminRoutes, { prefix: '/admin' });
app.register(moderationRoutes, { prefix: '/admin/moderation' });
app.register(notificationAdminRoutes, { prefix: '/admin/notifications' });
app.register(customRolesRoutes, { prefix: '/admin/roles' });
app.register(webhookRoutes, { prefix: '/admin/webhooks' });
app.register(apiKeyRoutes, { prefix: '/admin/api-keys' });
// ✅ JSON Health API

const start = async () => {
  try {
    await SchemaCompatibilityService.ensure();
    if (process.env.MONGO_URL) {
      await mongoose.connect(process.env.MONGO_URL);
      app.log.info('Connected to MongoDB');
      startAnalyticsWorker(app.log);
      startAnalyticsAggregationScheduler(app.log);
      startEmailWorker(app.log);
      startBulkImportWorker(app.log);
      startWebhookWorker(app.log);
      startCronWorker(app.log);
      await initCronJobs();
    }
    await app.listen({ host: env.HOST, port: env.PORT });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

void start();
