import { FastifyPluginAsync } from 'fastify';
import { adminAuthMiddleware } from '../middleware/admin.middleware';
import { userAuthMiddleware } from '../middleware/auth.middleware';
import { FeatureFlagController } from '../controllers/feature-flag.controller';

export const featureFlagRoutes: FastifyPluginAsync = async (app) => {
  const controller = new FeatureFlagController();

  app.get('/:key', {
    preHandler: userAuthMiddleware
  }, (request, reply) => controller.evaluate(request, reply));

  app.get('', {
    preHandler: [userAuthMiddleware, adminAuthMiddleware]
  }, (request, reply) => controller.list(request, reply));

  app.post('', {
    preHandler: [userAuthMiddleware, adminAuthMiddleware]
  }, (request, reply) => controller.create(request, reply));

  app.put('/:id', {
    preHandler: [userAuthMiddleware, adminAuthMiddleware]
  }, (request, reply) => controller.update(request, reply));

  app.post('/:id/overrides', {
    preHandler: [userAuthMiddleware, adminAuthMiddleware]
  }, (request, reply) => controller.createOverride(request, reply));

  app.delete('/:id/overrides/:overrideId', {
    preHandler: [userAuthMiddleware, adminAuthMiddleware]
  }, (request, reply) => controller.deleteOverride(request, reply));
};