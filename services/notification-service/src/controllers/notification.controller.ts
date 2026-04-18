import { FastifyReply, FastifyRequest } from 'fastify';
import { emitNotificationSchema } from '../schemas/notification.schema';
import { AchievementService } from '../services/achievement.service';
import { NotificationDispatcherService } from '../services/notification-dispatcher.service';
import { enqueueNotification } from '../services/queue.service';
import { sendError, sendSuccess } from '../utils/response';

export class NotificationController {
  constructor(
    private readonly notificationDispatcher: NotificationDispatcherService,
    private readonly achievementService: AchievementService
  ) {}

  emit = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = emitNotificationSchema.parse(request.body);
      await enqueueNotification(body);
      return sendSuccess(reply, { queued: true }, 202);
    } catch (error) {
      return sendError(reply, 400, 'NOTIFICATION_EMIT_FAILED', error instanceof Error ? error.message : 'Failed to emit notification');
    }
  };

  listNotifications = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.userContext?.userId;
      if (!userId) return sendError(reply, 401, 'UNAUTHORIZED', 'Missing user context');

      const data = await this.notificationDispatcher.listNotifications(userId);
      return sendSuccess(reply, data);
    } catch (error) {
      return sendError(reply, 500, 'NOTIFICATIONS_FETCH_FAILED', error instanceof Error ? error.message : 'Failed to fetch notifications');
    }
  };

  markRead = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.userContext?.userId;
      if (!userId) return sendError(reply, 401, 'UNAUTHORIZED', 'Missing user context');

      const params = request.params as { id: string };
      const data = await this.notificationDispatcher.markRead(userId, params.id);
      return sendSuccess(reply, data);
    } catch (error) {
      return sendError(reply, 404, 'NOTIFICATION_NOT_FOUND', error instanceof Error ? error.message : 'Notification not found');
    }
  };

  listAchievements = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.userContext?.userId;
      if (!userId) return sendError(reply, 401, 'UNAUTHORIZED', 'Missing user context');

      const data = await this.achievementService.listForUser(userId);
      return sendSuccess(reply, data);
    } catch (error) {
      return sendError(reply, 500, 'ACHIEVEMENTS_FETCH_FAILED', error instanceof Error ? error.message : 'Failed to fetch achievements');
    }
  };

  leaderboard = async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = await this.achievementService.topLeaderboard(20);
      return sendSuccess(reply, data);
    } catch (error) {
      return sendError(reply, 500, 'LEADERBOARD_FETCH_FAILED', error instanceof Error ? error.message : 'Failed to fetch leaderboard');
    }
  };
}
