import Fastify from 'fastify';
import * as Sentry from '@sentry/node';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import crypto from 'node:crypto';
import { z } from 'zod';
import { commonServiceEnvSchema, loadEnv } from '@thinkai/config';
import { AuthController } from './controllers/auth.controller';
import { registerErrorMiddleware } from './middleware/error.middleware';
import { globalApiRateLimit } from './middleware/rateLimit.middleware';
import { registerCookiePlugin } from './plugins/cookie.plugin';
import { authRoutes } from './routes/auth.routes';
import { healthRoutes } from './routes/health.routes';
import { AuthService } from './services/auth.service';
import { AuthStore } from './services/auth.store';
import { EmailService } from './services/email.service';

const env = loadEnv(commonServiceEnvSchema.merge(z.object({
  DATABASE_URL: z.string().url().optional(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('30d'),
  REFRESH_COOKIE_NAME: z.string().default('refreshToken'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
  OTP_EXPIRY_MINUTES: z.coerce.number().int().min(1).max(10).default(5),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM_EMAIL: z.string().email().default('no-reply@thinkai.dev'),
  CORS_ORIGIN: z.string().default('http://localhost:3000,http://localhost:3001'),
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
  METRICS_NAMESPACE: z.string().default('ThinkAI/Services'),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),
  REDIS_URL: z.string().url().optional(),
  MAX_LOGIN_ATTEMPTS: z.coerce.number().int().min(1).default(5),
  LOCKOUT_DURATION_MINUTES: z.coerce.number().int().min(1).default(15)
})));

const createCloudWatchMetricEvent = (
  namespace: string,
  metricName: string,
  value: number,
  unit: 'Count' | 'Milliseconds' | 'Seconds',
  dimensions: Record<string, string>
) => ({
  _aws: {
    Timestamp: Date.now(),
    CloudWatchMetrics: [{
      Namespace: namespace,
      Dimensions: [Object.keys(dimensions)],
      Metrics: [{ Name: metricName, Unit: unit }]
    }]
  },
  ...dimensions,
  [metricName]: value
});

const allowedOrigins = env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean);
const sentryDsn = env.SENTRY_DSN;
const metricsNamespace = env.METRICS_NAMESPACE;

if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: env.NODE_ENV,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE
  });
}

const emailService = new EmailService({
  smtpHost: env.SMTP_HOST,
  smtpPort: env.SMTP_PORT,
  smtpUser: env.SMTP_USER,
  smtpPass: env.SMTP_PASS,
  fromEmail: env.SMTP_FROM_EMAIL
});

const authService = new AuthService(new AuthStore(), emailService, {
  bcryptRounds: env.BCRYPT_ROUNDS,
  otpExpiryMinutes: env.OTP_EXPIRY_MINUTES,
  otpMaxAttempts: env.OTP_MAX_ATTEMPTS,
  accessSecret: env.JWT_ACCESS_SECRET,
  accessTtl: env.ACCESS_TOKEN_TTL,
  refreshSecret: env.JWT_REFRESH_SECRET,
  refreshTtl: env.REFRESH_TOKEN_TTL,
  exposeOtpInResponse: env.NODE_ENV !== 'production'
});

const authController = new AuthController(authService, {
  refreshCookieName: env.REFRESH_COOKIE_NAME,
  secureCookie: env.NODE_ENV === 'production',
  sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
  cookiePath: '/',
  exposeRefreshTokenInResponse: env.NODE_ENV !== 'production'
});

const app = Fastify({
  logger: {
    level: env.LOG_LEVEL,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers.set-cookie',
        'password',
        'accessToken',
        'refreshToken',
        'token',
        'otp',
        'smtpPass'
      ],
      censor: '[REDACTED]'
    }
  },
  disableRequestLogging: true,
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

void app.register(helmet, { global: true });
void app.register(rateLimit, {
  global: true,
  max: env.RATE_LIMIT_MAX,
  timeWindow: env.RATE_LIMIT_WINDOW_MS
});

app.addHook('onResponse', async (request, reply) => {
  app.log.info({
    requestId: request.id,
    route: request.routeOptions?.url ?? request.url,
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
      service: env.SERVICE_NAME,
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

app.addHook('preHandler', globalApiRateLimit);

void registerCookiePlugin(app);
registerErrorMiddleware(app);

app.register(healthRoutes);
app.register(authRoutes(authController), { prefix: '/auth' });

const start = async () => {
  try {
    await app.listen({ host: env.HOST, port: env.PORT });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

void start();
