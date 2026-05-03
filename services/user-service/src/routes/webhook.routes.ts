import { FastifyInstance } from 'fastify';
import { userAuthMiddleware } from '../middleware/auth.middleware';
import { adminAuthMiddleware, requirePermission } from '../middleware/admin.middleware';
import { WebhookController } from '../controllers/webhook.controller';

const ctrl = new WebhookController();

/**
 * Webhook routes — admin only.
 * Registered under /admin/webhooks.
 */
export async function webhookRoutes(app: FastifyInstance) {
  app.addHook('preHandler', userAuthMiddleware);
  app.addHook('preHandler', adminAuthMiddleware);

  app.post('/', { preHandler: requirePermission('manage_webhook' as any) }, (req, reply) => ctrl.createEndpoint(req, reply));
  app.get('/', { preHandler: requirePermission('audit:view') }, (req, reply) => ctrl.listEndpoints(req, reply));
  app.patch('/:id', { preHandler: requirePermission('manage_webhook' as any) }, (req, reply) => ctrl.updateEndpoint(req, reply));
  app.delete('/:id', { preHandler: requirePermission('manage_webhook' as any) }, (req, reply) => ctrl.deleteEndpoint(req, reply));
}
