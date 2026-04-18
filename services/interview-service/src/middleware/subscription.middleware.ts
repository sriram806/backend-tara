import { desc, eq } from 'drizzle-orm';
import { getDb, subscriptions } from '@thinkai/db';

export async function canUseInterviewFeature(userId: string): Promise<boolean> {
  const db = getDb();
  const rows = await db.select().from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);

  if (rows.length === 0) {
    return false;
  }

  const sub = rows[0];
  const now = new Date();
  const grace = new Date(sub.endDate);
  grace.setDate(grace.getDate() + 3);

  if (sub.status !== 'active') {
    return false;
  }

  if (sub.plan === 'FREE' && sub.endDate <= now && grace <= now) {
    return false;
  }

  return sub.plan !== 'FREE' || grace > now || sub.endDate > now;
}
