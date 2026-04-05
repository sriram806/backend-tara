import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { FastifyInstance } from 'fastify';

export async function registerCorePlugins(app: FastifyInstance) {
  await app.register(cors, {
    origin: true,
    credentials: true
  });

  await app.register(helmet, {
    global: true
  });
}
