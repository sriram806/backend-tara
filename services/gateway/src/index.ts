import crypto from 'node:crypto';
import Fastify from 'fastify';
import { commonServiceEnvSchema, loadEnv } from '@thinkai/config';
import { GatewayController } from './controllers/gateway.controller';
import { gatewayAuthMiddleware } from './middleware/auth.middleware';
import { gatewayRateLimitMiddleware } from './middleware/rateLimit.middleware';
import { registerCorePlugins } from './plugins/core.plugin';
import { healthRoutes } from './routes/health.routes';
import { proxyRoutes } from './routes/proxy.routes';
import { GatewayService } from './services/gateway.service';

const env = loadEnv(commonServiceEnvSchema);

const app = Fastify({
  logger: {
    level: env.LOG_LEVEL
  },
  requestIdHeader: 'x-request-id',
  genReqId: () => crypto.randomUUID()
});

const gatewayController = new GatewayController(new GatewayService());

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
