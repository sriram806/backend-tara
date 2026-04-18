import { FastifyInstance } from 'fastify';
import { notificationAuthMiddleware } from '../middleware/auth.middleware';
import { NotificationController } from '../controllers/notification.controller';

export function notificationRoutes(controller: NotificationController) {
  return async (app: FastifyInstance) => {
    app.post('/emit', controller.emit);

    app.get('/notifications', { preHandler: notificationAuthMiddleware }, controller.listNotifications);
    app.patch('/notifications/:id/read', { preHandler: notificationAuthMiddleware }, controller.markRead);

    app.get('/achievements', { preHandler: notificationAuthMiddleware }, controller.listAchievements);
    app.get('/leaderboard', controller.leaderboard);
  };
}
