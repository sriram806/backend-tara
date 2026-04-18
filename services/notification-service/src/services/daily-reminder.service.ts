import { getDb, users } from '@thinkai/db';
import { eq } from 'drizzle-orm';
import { enqueueNotification } from './queue.service';

export function scheduleDailyReminders() {
  const dayMs = 24 * 60 * 60 * 1000;
  setInterval(() => {
    void sendDailyReminders();
  }, dayMs);
}

async function sendDailyReminders() {
  const db = getDb();
  const activeUsers = await db.select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.status, 'active'));

  for (const user of activeUsers) {
    await enqueueNotification({
      userId: user.id,
      type: 'in_app',
      title: 'Daily reminder',
      message: 'Take a small step today. Run an analysis or continue your roadmap.'
    });

    await enqueueNotification({
      userId: user.id,
      type: 'email',
      title: 'Your daily Think AI reminder',
      message: 'Stay consistent today and keep building momentum.',
      metadata: {
        email: user.email
      }
    });
  }
}
