import { FastifyInstance } from 'fastify';
import { userAuthMiddleware } from '../middleware/auth.middleware';
import { adminAuthMiddleware, requirePermission } from '../middleware/admin.middleware';
import { NotificationController } from '../controllers/notification.controller';

const ctrl = new NotificationController();

export async function notificationAdminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', userAuthMiddleware);
  app.addHook('preHandler', adminAuthMiddleware);

  // Send notification (single / multi / broadcast)
  app.post('/send', { preHandler: requirePermission('send_notification' as any) },
    (req, reply) => ctrl.send(req, reply));

  // List notifications for a user (admin view)
  app.get('/', { preHandler: requirePermission('user:view') },
    (req, reply) => ctrl.list(req, reply));

  // Mark read
  app.patch('/read', (req, reply) => ctrl.markRead(req, reply));
}
