import Fastify from 'fastify';
import cors from '@fastify/cors';
import crypto from 'node:crypto';
import { z } from 'zod';
import { commonServiceEnvSchema, loadEnv } from '@thinkai/config';
import { UserController } from './controllers/user.controller';
import { registerCorePlugins } from './plugins/core.plugin';
import { healthRoutes } from './routes/health.routes';
import { userRoutes } from './routes/user.routes';
import { analysisRoutes } from './routes/analysis.routes';
import { UserService } from './services/user.service';
import mongoose from 'mongoose';

const env = loadEnv(commonServiceEnvSchema.merge(z.object({
  CORS_ORIGIN: z.string().default('http://localhost:3000')
})));

const allowedOrigins = env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean);

const userController = new UserController(new UserService());

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
});

void registerCorePlugins(app);

app.register(healthRoutes(userController));
app.register(userRoutes(userController), { prefix: '/users' });
app.register(analysisRoutes, { prefix: '/analysis' });

const start = async () => {
  try {
    if (process.env.MONGO_URL) {
      await mongoose.connect(process.env.MONGO_URL);
      app.log.info('Connected to MongoDB');
    }
    await app.listen({ host: env.HOST, port: env.PORT });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

void start();
