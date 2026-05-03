import crypto from 'node:crypto';
import Fastify from 'fastify';
import { z } from 'zod';
import { commonServiceEnvSchema, loadEnv } from '@thinkai/config';
import { GatewayController } from './controllers/gateway.controller';
import { gatewayAuthMiddleware } from './middleware/auth.middleware';
import { gatewayRateLimitMiddleware } from './middleware/rateLimit.middleware';
import { registerCorePlugins } from './plugins/core.plugin';
import { healthRoutes } from './routes/health.routes';
import { proxyRoutes } from './routes/proxy.routes';
import { GatewayService } from './services/gateway.service';


const env = loadEnv(commonServiceEnvSchema.merge(z.object({
  EXAM_SERVICE_URL: z.string().url().default('http://localhost:4111'),
  AUTH_SERVICE_URL: z.string().url().default('http://localhost:4101'),
  AI_SERVICE_URL: z.string().url().default('http://localhost:8000'),
  BILLING_SERVICE_URL: z.string().url().default('http://localhost:4102'),
  INTERVIEW_SERVICE_URL: z.string().url().default('http://localhost:4103'),
  NOTIFICATION_SERVICE_URL: z.string().url().default('http://localhost:4104'),
  USER_SERVICE_URL: z.string().url().default('http://localhost:4105')
})));

const app = Fastify({
  logger: {
    level: env.LOG_LEVEL
  },
  requestIdHeader: 'x-request-id',
  genReqId: () => crypto.randomUUID()
});

const gatewayController = new GatewayController(new GatewayService({
  examServiceUrl: env.EXAM_SERVICE_URL,
  authServiceUrl: env.AUTH_SERVICE_URL,
  aiServiceUrl: env.AI_SERVICE_URL,
  billingServiceUrl: env.BILLING_SERVICE_URL,
  interviewServiceUrl: env.INTERVIEW_SERVICE_URL,
  notificationServiceUrl: env.NOTIFICATION_SERVICE_URL,
  userServiceUrl: env.USER_SERVICE_URL
}));

void registerCorePlugins(app);

app.addHook('preHandler', gatewayRateLimitMiddleware);
app.addHook('onRequest', gatewayAuthMiddleware);

app.addHook('onResponse', async (request, reply) => {
  app.log.info({
    requestId: request.id,
    route: request.url,
    method: request.method,
    statusCode: reply.statusCode,
    responseTimeMs: reply.elapsedTime
  });
});

app.register(healthRoutes(gatewayController));
app.register(proxyRoutes(gatewayController));

const start = async () => {
  try {
    const { setupWebSockets } = await import('./services/socket.service');
    setupWebSockets(app.server);

    await app.listen({
      host: env.HOST,
      port: env.PORT
    });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

void start();
