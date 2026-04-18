import { FastifyPluginAsync } from 'fastify';
import { userAuthMiddleware } from '../middleware/auth.middleware';
import { RecommendationController } from '../controllers/recommendation.controller';

export const recommendationRoutes: FastifyPluginAsync = async (app) => {
  const controller = new RecommendationController();

  app.get('/recommendations', {
    preHandler: userAuthMiddleware
  }, (request, reply) => controller.list(request, reply));

  app.post('/recommendations/:id/action', {
    preHandler: userAuthMiddleware
  }, (request, reply) => controller.action(request, reply));
};