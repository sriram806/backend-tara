import { eq, desc } from 'drizzle-orm';
import { getDb, notifications } from '@thinkai/db';
import { EmailService } from './email.service';
import { AchievementService } from './achievement.service';
import { redisClient } from './redis.service';
import { enqueueNotification } from './queue.service';

type NotificationPayload = {
  userId: string;
  type: 'email' | 'in_app';
  title: string;
  message: string;
  eventType?: string;
  metadata?: Record<string, unknown>;
};

export class NotificationDispatcherService {
  constructor(
    private readonly emailService: EmailService,
    private readonly achievementService: AchievementService
  ) {}

  async dispatch(payloadInput: Record<string, unknown>) {
    const payload = payloadInput as unknown as NotificationPayload;
    const db = getDb();

    await db.insert(notifications).values({
      userId: payload.userId,
      type: payload.type,
      title: payload.title,
      message: payload.message,
      read: false
    });

    if (payload.type === 'email') {
      const html = this.emailService.renderTemplate(payload.title, payload.message);
      const to = String((payload.metadata?.email as string | undefined) ?? '');
      if (to) {
        await this.emailService.send({
          to,
          subject: payload.title,
          html
        });
      }
    }

    await redisClient.publish('ws:notification:created', JSON.stringify({
      userId: payload.userId,
      title: payload.title,
      message: payload.message,
      type: payload.type
    }));

    await this.processAchievements(payload);
  }

  private async processAchievements(payload: NotificationPayload) {
    if (payload.eventType === 'first_login') {
      const unlocked = await this.achievementService.unlock(payload.userId, 'first_login');
      if (unlocked) {
        await enqueueNotification({
          userId: payload.userId,
          type: 'in_app',
          title: unlocked.title,
          message: `${unlocked.description} (+${unlocked.xp} XP)`
        });
      }
    }

    if (payload.eventType === 'analysis_completed') {
      const unlocked = await this.achievementService.unlock(payload.userId, 'first_analysis');
      if (unlocked) {
        await enqueueNotification({
          userId: payload.userId,
          type: 'in_app',
          title: unlocked.title,
          message: `${unlocked.description} (+${unlocked.xp} XP)`
        });
      }
      await this.achievementService.addXp(payload.userId, 10);
    }

    if (payload.eventType === 'roadmap_completed') {
      const unlocked = await this.achievementService.unlock(payload.userId, 'roadmap_completed');
      if (unlocked) {
        await enqueueNotification({
          userId: payload.userId,
          type: 'in_app',
          title: unlocked.title,
          message: `${unlocked.description} (+${unlocked.xp} XP)`
        });
      }
    }

    if (payload.eventType === 'resume_ready') {
      const score = Number(payload.metadata?.score ?? 0);
      if (score > 80) {
        const unlocked = await this.achievementService.unlock(payload.userId, 'resume_80');
        if (unlocked) {
          await enqueueNotification({
            userId: payload.userId,
            type: 'in_app',
            title: unlocked.title,
            message: `${unlocked.description} (+${unlocked.xp} XP)`
          });
        }
      }
      await this.achievementService.addXp(payload.userId, 10);
    }
  }

  async listNotifications(userId: string) {
    const db = getDb();
    return db.select().from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt));
  }

  async markRead(userId: string, notificationId: string) {
    const db = getDb();
    const updated = await db.update(notifications)
      .set({ read: true })
      .where(eq(notifications.id, notificationId))
      .returning();

    const notification = updated[0];
    if (!notification || notification.userId !== userId) {
      throw new Error('Notification not found');
    }

    return notification;
  }
}
