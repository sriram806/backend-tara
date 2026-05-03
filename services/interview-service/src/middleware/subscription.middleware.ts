import { desc, eq } from 'drizzle-orm';
import { getDb, subscriptions, users } from '@thinkai/db';

export async function canUseInterviewFeature(userId: string): Promise<boolean> {
  const db = getDb();
  // 1. Check user persona and plan directly
  const [user] = await db.select({
    role: users.role,
    plan: users.plan
  })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return false;

  // Guest role bypass
  if (user.role === 'guest') return true;

  // 2. Check active subscription record
  const rows = await db.select().from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);

  if (rows.length === 0) {
    // If no subscription record, fallback to the users.plan column (e.g. for enterprise or manually assigned)
    return !!user.plan;
  }

  const sub = rows[0];
  const now = new Date();
  const grace = new Date(sub.endDate);
  grace.setDate(grace.getDate() + 3);

  if (sub.status !== 'active') {
    return false;
  }

  // Grace period handling
  if (sub.endDate <= now && grace <= now) {
    return false;
  }

  return true;
}
