import { FastifyPluginAsync } from 'fastify';
import { userAuthMiddleware } from '../middleware/auth.middleware';
import { PersonalizationController } from '../controllers/personalization.controller';

export const personalizationRoutes: FastifyPluginAsync = async (app) => {
  const controller = new PersonalizationController();

  app.get('/profile/insights', {
    preHandler: userAuthMiddleware
  }, (request, reply) => controller.insights(request, reply));

  app.post('/activity', {
    preHandler: userAuthMiddleware
  }, (request, reply) => controller.activity(request, reply));
};
