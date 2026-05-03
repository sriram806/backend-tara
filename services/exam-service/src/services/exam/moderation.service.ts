import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb, skillRequests, userExams, skillExams, users, organizationMembers } from '@thinkai/db';
import { ExamSchemaService } from './schema';
import { normalizeSkillName } from './utils';

export class ExamModerationService {
  /**
   * Provides detailed analytics for a specific skill exam.
   */
  static async getExamAnalytics(skillName: string) {
    await ExamSchemaService.ensureSchemaCompatibility();
    const db = getDb();
    const normalized = normalizeSkillName(skillName);

    // 1. Fetch all attempts for this skill
    const attempts = await db.select()
      .from(userExams)
      .where(eq(userExams.skillName, normalized))
      .orderBy(desc(userExams.createdAt));

    if (attempts.length === 0) {
      return {
        summary: { totalAttempts: 0, passRate: 0, avgScore: 0 },
        distribution: [],
        questionPerformance: []
      };
    }

    // 2. Calculate summary stats
    const totalAttempts = attempts.length;
    const passedAttempts = attempts.filter(a => a.status === 'PASS').length;
    const passRate = Math.round((passedAttempts / totalAttempts) * 100);
    const avgScore = Math.round(attempts.reduce((acc, a) => acc + a.percentage, 0) / totalAttempts);

    // 3. Score distribution (deciles)
    const distribution = Array.from({ length: 10 }, (_, i) => ({
      range: `${i * 10}-${(i + 1) * 10}%`,
      count: attempts.filter(a => a.percentage >= i * 10 && a.percentage < (i + 1) * 10).length
    }));

    // 4. Question performance analysis
    const questionStats = new Map<string, { total: number; correct: number; prompt: string }>();

    for (const attempt of attempts) {
      const evaluation = (attempt.evaluationJson as any) || {};
      const questions = (attempt.questionSnapshotJson as any[]) || [];

      for (const q of questions) {
        const stats = questionStats.get(q.id) || { total: 0, correct: 0, prompt: q.prompt };
        stats.total += 1;
        if (evaluation[q.id]?.isCorrect) {
          stats.correct += 1;
        }
        questionStats.set(q.id, stats);
      }
    }

    const questionPerformance = Array.from(questionStats.entries()).map(([id, stats]) => ({
      id,
      prompt: stats.prompt,
      successRate: Math.round((stats.correct / stats.total) * 100),
      totalAttempts: stats.total
    })).sort((a, b) => a.successRate - b.successRate);

    // 5. Recent Attempts with User Details
    const recentAttempts = await db.select({
      id: userExams.id,
      userName: (users as any).name,
      status: userExams.status,
      score: userExams.percentage,
      createdAt: userExams.createdAt,
      proctoringLogs: (userExams as any).proctoringLogsJson
    })
      .from(userExams)
      .leftJoin(users, eq(userExams.userId, users.id))
      .where(eq(userExams.skillName, normalized))
      .orderBy(desc(userExams.createdAt))
      .limit(10);

    const mappedAttempts = recentAttempts.map(a => ({
      id: a.id,
      userName: a.userName,
      status: a.status,
      score: a.score,
      createdAt: a.createdAt,
      violationCount: (a.proctoringLogs as any[] || []).filter(l =>
        ['TAB_SWITCH', 'FULLSCREEN_EXIT', 'WINDOW_BLUR'].includes(l.event)
      ).length
    }));

    return {
      summary: {
        totalAttempts,
        passRate,
        avgScore,
        trend: attempts.slice(0, 10).map(a => ({ date: a.createdAt.toISOString(), score: a.percentage }))
      },
      distribution,
      questionPerformance,
      recentAttempts: mappedAttempts
    };
  }

  /**
   * Returns high-level stats for the Admin Moderation Dashboard.
   */
  static async getModerationOverview() {
    await ExamSchemaService.ensureSchemaCompatibility();
    const db = getDb();

    const [totalRequests] = await db.select({ count: sql<number>`count(*)` }).from(skillRequests);
    const [pendingRequests] = await db.select({ count: sql<number>`count(*)` }).from(skillRequests).where(eq(skillRequests.status, 'pending'));

    const templates = await db.select().from(skillExams);
    const draftTemplates = templates.filter(t => !t.isPublished).length;
    const publishedTemplates = templates.filter(t => t.isPublished).length;

    return {
      requests: {
        total: Number(totalRequests?.count ?? 0),
        pending: Number(pendingRequests?.count ?? 0)
      },
      content: {
        totalExams: templates.length,
        draft: draftTemplates,
        published: publishedTemplates
      }
    };
  }

  static async listSkillRequests() {
    await ExamSchemaService.ensureSchemaCompatibility();
    const db = getDb();

    const results = await db.select()
      .from(skillRequests)
      .orderBy(desc(skillRequests.requestCount));

    return results;
  }

  static async updateSkillRequestStatus(requestId: string, status: 'pending' | 'approved' | 'rejected' | 'implemented') {
    await ExamSchemaService.ensureSchemaCompatibility();
    const db = getDb();

    const [updated] = await db.update(skillRequests)
      .set({ status })
      .where(eq(skillRequests.id, requestId))
      .returning();

    return updated;
  }

  static async requestSkill(userId: string, skillName: string) {
    await ExamSchemaService.ensureSchemaCompatibility();
    const db = getDb();
    const normalized = normalizeSkillName(skillName);

    const [existing] = await db.select()
      .from(skillRequests)
      .where(eq(skillRequests.skillName, normalized))
      .limit(1);

    if (existing) {
      await db.update(skillRequests)
        .set({
          requestCount: existing.requestCount + 1,
          lastRequestedAt: new Date()
        })
        .where(eq(skillRequests.id, existing.id));

      return { message: 'Skill request updated', id: existing.id };
    }

    const [created] = await db.insert(skillRequests)
      .values({
        userId,
        skillName: normalized,
        status: 'pending'
      })
      .returning();

    return { message: 'Skill request submitted', id: created.id };
  }

  static async getSkillSuggestions(query: string, limit = 10) {
    await ExamSchemaService.ensureSchemaCompatibility();
    const db = getDb();

    const results = await db.select({
      skillName: skillExams.skillName,
      title: skillExams.title,
      type: skillExams.skillType
    })
      .from(skillExams)
      .where(and(
        eq(skillExams.isPublished, true),
        sql`LOWER(${skillExams.skillName}) LIKE ${'%' + query.toLowerCase() + '%'}`
      ))
      .limit(limit);

    return results;
  }

  static async getOrganizationOverview(orgId: string) {
    await ExamSchemaService.ensureSchemaCompatibility();
    const db = getDb();

    const members = await db.select().from(organizationMembers).where(eq(organizationMembers.organizationId, orgId));

    const attempts = await db.select({
      id: userExams.id,
      userId: userExams.userId,
      skillName: userExams.skillName,
      score: userExams.percentage,
      status: userExams.status,
      createdAt: userExams.createdAt
    })
      .from(userExams)
      .where(eq(userExams.organizationId, orgId))
      .orderBy(desc(userExams.createdAt));

    const totalAttempts = attempts.length;
    const passedAttempts = attempts.filter(a => a.status === 'PASS').length;
    const avgScore = totalAttempts > 0
      ? Math.round(attempts.reduce((acc, a) => acc + a.score, 0) / totalAttempts)
      : 0;

    const skillMap = new Map<string, { count: number; avg: number; passRate: number }>();
    attempts.forEach(a => {
      const stats = skillMap.get(a.skillName) || { count: 0, avg: 0, passRate: 0 };
      stats.count += 1;
      stats.avg += a.score;
      if (a.status === 'PASS') stats.passRate += 1;
      skillMap.set(a.skillName, stats);
    });

    const skillStats = Array.from(skillMap.entries()).map(([name, stats]) => ({
      name,
      count: stats.count,
      avgScore: Math.round(stats.avg / stats.count),
      passRate: Math.round((stats.passRate / stats.count) * 100)
    }));

    return {
      summary: {
        totalMembers: members.length,
        totalAttempts,
        passRate: totalAttempts > 0 ? Math.round((passedAttempts / totalAttempts) * 100) : 0,
        avgScore
      },
      skillStats,
      recentAttempts: attempts.slice(0, 10)
    };
  }
}
