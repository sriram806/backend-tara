import { FastifyPluginAsync } from 'fastify';
import { UserController } from '../controllers/user.controller';
import { userAuthMiddleware } from '../middleware/auth.middleware';

export const userRoutes = (controller: UserController): FastifyPluginAsync => {
  return async (app) => {
    app.get('/me', { preHandler: userAuthMiddleware }, (request, reply) => controller.me(request, reply));
    app.patch('/me', { preHandler: userAuthMiddleware }, (request, reply) => controller.updateMe(request, reply));
  };
};
