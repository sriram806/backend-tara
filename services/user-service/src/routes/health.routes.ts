import { FastifyPluginAsync } from 'fastify';
import { UserController } from '../controllers/user.controller';

export const healthRoutes = (controller: UserController): FastifyPluginAsync => {
  return async (app) => {
    app.get('/health', async () => controller.health());
  };
};
