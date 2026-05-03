import { FastifyInstance } from 'fastify';
import { userAuthMiddleware } from '../middleware/auth.middleware';
import { adminAuthMiddleware, requirePermission } from '../middleware/admin.middleware';
import { ModerationController } from '../controllers/moderation.controller';

const ctrl = new ModerationController();

/**
 * Moderation routes — accessible by both moderators and admins.
 * Registered under /admin/moderation.
 */
export async function moderationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', userAuthMiddleware);
  app.addHook('preHandler', adminAuthMiddleware);

  // Flag a user (create a moderation report)
  app.post('/flag/:userId', { preHandler: requirePermission('user:ban') },
    (req, reply) => ctrl.flagUser(req, reply));

  // List all moderation reports
  app.get('/reports', { preHandler: requirePermission('audit:view') },
    (req, reply) => ctrl.listReports(req, reply));

  // Resolve a specific report
  app.patch('/reports/:reportId/resolve', { preHandler: requirePermission('user:ban') },
    (req, reply) => ctrl.resolveReport(req, reply));

  // All reports for a specific user
  app.get('/users/:userId/reports', { preHandler: requirePermission('user:view') },
    (req, reply) => ctrl.getUserReports(req, reply));
}
