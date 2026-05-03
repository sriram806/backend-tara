import { eq, and, inArray, sql } from 'drizzle-orm';
import { getDb, notifications, users } from '@thinkai/db';
import { emailQueue } from '../queues/email.queue';
import { Queue } from 'bullmq';
import { connection } from '../queues/connection';

// ─── Broadcast queue (large fan-out kept off the hot path) ────────────────────
const BROADCAST_QUEUE_NAME = 'admin-notification-broadcast';
export const broadcastQueue = new Queue(BROADCAST_QUEUE_NAME, {
  connection,
  defaultJobOptions: { attempts: 2, removeOnComplete: true, removeOnFail: false }
});

export type NotificationPayload = {
  title: string;
  message: string;
  type?: 'in_app' | 'email';
  category?: 'info' | 'success' | 'warning' | 'error' | 'system' | 'promotion';
  actionUrl?: string;
  /** Email template to use when type includes 'email' */
  emailTemplate?: 'admin_message';
};

export class AdminNotificationService {
  private get db() { return getDb(); }

  // ─── Single User ─────────────────────────────────────────────────────────

  async sendToUser(userId: string, payload: NotificationPayload, sentBy?: string) {
    const [notification] = await this.db
      .insert(notifications)
      .values({
        userId,
        sentBy,
        type: payload.type ?? 'in_app',
        category: payload.category ?? 'info',
        title: payload.title,
        message: payload.message,
        actionUrl: payload.actionUrl
      })
      .returning();

    if (payload.type === 'email') {
      const [user] = await this.db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (user) {
        await emailQueue.add('email:send', {
          to: user.email,
          templateName: payload.emailTemplate ?? 'admin_message',
          variables: { title: payload.title, message: payload.message }
        });
      }
    }

    return notification;
  }

  // ─── Multiple Users ───────────────────────────────────────────────────────

  async sendToMany(userIds: string[], payload: NotificationPayload, sentBy?: string) {
    if (userIds.length === 0) return { sent: 0 };

    const rows = userIds.map((userId) => ({
      userId,
      sentBy,
      type: (payload.type ?? 'in_app') as 'in_app' | 'email',
      category: payload.category ?? 'info',
      title: payload.title,
      message: payload.message,
      actionUrl: payload.actionUrl
    }));

    // Batch insert in chunks of 500 to stay within Postgres parameter limits
    const CHUNK_SIZE = 500;
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      await this.db.insert(notifications).values(rows.slice(i, i + CHUNK_SIZE));
    }

    if (payload.type === 'email') {
      const targetUsers = await this.db
        .select({ email: users.email })
        .from(users)
        .where(inArray(users.id, userIds));

      await Promise.all(
        targetUsers.map((u) =>
          emailQueue.add('email:send', {
            to: u.email,
            templateName: payload.emailTemplate ?? 'admin_message',
            variables: { title: payload.title, message: payload.message }
          })
        )
      );
    }

    return { sent: rows.length };
  }

  // ─── Broadcast (all active users) ─────────────────────────────────────────

  async broadcast(payload: NotificationPayload, sentBy?: string) {
    // Enqueue as a broadcast job — worker chunks through ALL active users
    await broadcastQueue.add('notification:broadcast', {
      payload,
      sentBy,
      enqueuedAt: new Date().toISOString()
    });
    return { queued: true };
  }

  // ─── Get user notifications ───────────────────────────────────────────────

  async getUserNotifications(userId: string, page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    const [countResult, rows] = await Promise.all([
      this.db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(notifications)
        .where(eq(notifications.userId, userId)),
      this.db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, userId))
        .orderBy(sql`${notifications.createdAt} DESC`)
        .limit(limit)
        .offset(offset)
    ]);
    return { notifications: rows, total: countResult[0]?.count ?? 0 };
  }

  // ─── Mark as read ─────────────────────────────────────────────────────────

  async markRead(userId: string, notificationIds: string[]) {
    await this.db
      .update(notifications)
      .set({ read: true })
      .where(
        and(
          eq(notifications.userId, userId),
          inArray(notifications.id, notificationIds)
        )
      );
    return { updated: notificationIds.length };
  }

  async markAllRead(userId: string): Promise<void> {
    await this.db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
  }
}
