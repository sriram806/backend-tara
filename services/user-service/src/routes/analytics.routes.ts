import { FastifyPluginAsync } from 'fastify';
import { AnalyticsController } from '../controllers/analytics.controller';
import { userAuthMiddleware } from '../middleware/auth.middleware';
import { adminAuthMiddleware } from '../middleware/admin.middleware';

export const analyticsRoutes: FastifyPluginAsync = async (app) => {
  const controller = new AnalyticsController();

  app.post('/event', {
    preHandler: userAuthMiddleware
  }, (request, reply) => controller.event(request, reply));

  app.get('/user', {
    preHandler: userAuthMiddleware
  }, (request, reply) => controller.userInsights(request, reply));

  app.get('/admin', {
    preHandler: [userAuthMiddleware, adminAuthMiddleware]
  }, (request, reply) => controller.adminInsights(request, reply));
};
