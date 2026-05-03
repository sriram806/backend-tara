import { FastifyInstance } from 'fastify';
import { userAuthMiddleware } from '../middleware/auth.middleware';
import { adminAuthMiddleware, requirePermission } from '../middleware/admin.middleware';
import { ApiKeyController } from '../controllers/api-key.controller';

const ctrl = new ApiKeyController();

/**
 * API Key routes — admin only.
 * Registered under /admin/api-keys.
 */
export async function apiKeyRoutes(app: FastifyInstance) {
  app.addHook('preHandler', userAuthMiddleware);
  app.addHook('preHandler', adminAuthMiddleware);

  app.post('/', { preHandler: requirePermission('manage_api_key' as any) }, (req, reply) => ctrl.createApiKey(req, reply));
  app.get('/', { preHandler: requirePermission('manage_api_key' as any) }, (req, reply) => ctrl.listApiKeys(req, reply));
  app.delete('/:id', { preHandler: requirePermission('manage_api_key' as any) }, (req, reply) => ctrl.revokeApiKey(req, reply));
}
