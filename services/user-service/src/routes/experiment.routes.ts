import { FastifyPluginAsync } from 'fastify';
import { userAuthMiddleware } from '../middleware/auth.middleware';
import { adminAuthMiddleware } from '../middleware/admin.middleware';
import { ExperimentController } from '../controllers/experiment.controller';

export const experimentRoutes: FastifyPluginAsync = async (app) => {
  const controller = new ExperimentController();

  app.get('/variant', {
    preHandler: userAuthMiddleware
  }, (request, reply) => controller.variant(request, reply));

  app.post('/track', {
    preHandler: userAuthMiddleware
  }, (request, reply) => controller.track(request, reply));

  app.get('', {
    preHandler: [userAuthMiddleware, adminAuthMiddleware]
  }, (request, reply) => controller.list(request, reply));

  app.get('/results', {
    preHandler: [userAuthMiddleware, adminAuthMiddleware]
  }, (request, reply) => controller.results(request, reply));

  app.post('', {
    preHandler: [userAuthMiddleware, adminAuthMiddleware]
  }, (request, reply) => controller.create(request, reply));

  app.patch('/:experimentId/status', {
    preHandler: [userAuthMiddleware, adminAuthMiddleware]
  }, (request, reply) => controller.updateStatus(request, reply));
};
