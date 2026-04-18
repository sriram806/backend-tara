import { and, eq } from 'drizzle-orm';
import { achievements, getDb, userXp } from '@thinkai/db';
import { redisClient } from './redis.service';

const WEEKLY_LEADERBOARD_KEY = 'leaderboard:weekly';

type EventType = 'first_login' | 'first_analysis' | 'streak_7' | 'resume_80' | 'roadmap_completed';

const ACHIEVEMENT_CONFIG: Record<EventType, { title: string; description: string; xp: number }> = {
  first_login: {
    title: 'First Login',
    description: 'Completed your first login.',
    xp: 5
  },
  first_analysis: {
    title: 'First Analysis',
    description: 'Ran your first AI analysis.',
    xp: 10
  },
  streak_7: {
    title: '7-Day Streak',
    description: 'Stayed active for seven days in a row.',
    xp: 25
  },
  resume_80: {
    title: 'Resume Pro',
    description: 'Scored above 80 in resume analysis.',
    xp: 20
  },
  roadmap_completed: {
    title: 'Roadmap Complete',
    description: 'Completed the roadmap milestone.',
    xp: 100
  }
};

export class AchievementService {
  async unlock(userId: string, eventType: EventType) {
    const db = getDb();
    const existing = await db.select().from(achievements)
      .where(and(eq(achievements.userId, userId), eq(achievements.type, eventType)))
      .limit(1);

    if (existing.length > 0) {
      return null;
    }

    const config = ACHIEVEMENT_CONFIG[eventType];
    const created = await db.insert(achievements).values({
      userId,
      type: eventType,
      title: config.title,
      description: config.description,
      xp: config.xp
    }).returning();

    await this.addXp(userId, config.xp);
    return created[0];
  }

  async addXp(userId: string, xp: number) {
    const db = getDb();
    const existing = await db.select().from(userXp).where(eq(userXp.userId, userId)).limit(1);

    let totalXp = xp;
    if (existing.length > 0) {
      totalXp = existing[0].totalXp + xp;
      await db.update(userXp)
        .set({ totalXp, updatedAt: new Date() })
        .where(eq(userXp.id, existing[0].id));
    } else {
      await db.insert(userXp).values({ userId, totalXp });
    }

    await redisClient.zadd(WEEKLY_LEADERBOARD_KEY, totalXp, userId);
    return totalXp;
  }

  async listForUser(userId: string) {
    const db = getDb();
    return db.select().from(achievements)
      .where(eq(achievements.userId, userId));
  }

  async topLeaderboard(limit = 10) {
    const rows = await redisClient.zrevrange(WEEKLY_LEADERBOARD_KEY, 0, limit - 1, 'WITHSCORES');
    const result: Array<{ userId: string; xp: number }> = [];
    for (let i = 0; i < rows.length; i += 2) {
      result.push({ userId: rows[i], xp: Number(rows[i + 1] ?? 0) });
    }
    return result;
  }

  scheduleWeeklyReset() {
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    setInterval(() => {
      void redisClient.del(WEEKLY_LEADERBOARD_KEY);
    }, weekMs);
  }
}
