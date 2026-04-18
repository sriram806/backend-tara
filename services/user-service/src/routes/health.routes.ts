import { FastifyPluginAsync } from 'fastify';
import { UserHealthController } from '../controllers/health.controller';

export const healthRoutes = (controller: UserHealthController): FastifyPluginAsync => {
  return async (app) => {
    app.get('/', async () => controller.health());
    app.get('/ready', async () => controller.ready());
  };
};
