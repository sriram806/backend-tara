import Fastify from 'fastify';
import crypto from 'node:crypto';
import { commonServiceEnvSchema, loadEnv } from '@thinkai/config';
import { UserController } from './controllers/user.controller';
import { registerCorePlugins } from './plugins/core.plugin';
import { healthRoutes } from './routes/health.routes';
import { userRoutes } from './routes/user.routes';
import { UserService } from './services/user.service';

const env = loadEnv(commonServiceEnvSchema);

const userController = new UserController(new UserService());

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

void registerCorePlugins(app);

app.register(healthRoutes(userController));
app.register(userRoutes(userController), { prefix: '/users' });

const start = async () => {
  try {
    await app.listen({ host: env.HOST, port: env.PORT });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

void start();
