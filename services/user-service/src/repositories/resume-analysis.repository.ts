import { and, eq, isNull } from 'drizzle-orm';
import { getDb, resumeAnalysisRuns, userResumes } from '@thinkai/db';

export class ResumeAnalysisRepository {
  static async getCurrentResumeForUser(userId: string, resumeId: string) {
    const db = getDb();
    const rows = await db.select().from(userResumes).where(and(
      eq(userResumes.id, resumeId),
      eq(userResumes.userId, userId),
      eq(userResumes.isCurrent, true),
      isNull(userResumes.deletedAt)
    )).limit(1);

    return rows[0] ?? null;
  }

  static async getByResumeVersion(resumeId: string, resumeVersion: number) {
    const db = getDb();
    const rows = await db.select().from(resumeAnalysisRuns).where(and(
      eq(resumeAnalysisRuns.resumeId, resumeId),
      eq(resumeAnalysisRuns.resumeVersion, resumeVersion)
    )).limit(1);

    return rows[0] ?? null;
  }

  static async create(values: typeof resumeAnalysisRuns.$inferInsert) {
    const db = getDb();
    const rows = await db.insert(resumeAnalysisRuns).values(values).returning();
    return rows[0];
  }

  static async getByIdForUser(runId: string, userId: string) {
    const db = getDb();
    const rows = await db.select().from(resumeAnalysisRuns).where(and(
      eq(resumeAnalysisRuns.id, runId),
      eq(resumeAnalysisRuns.userId, userId)
    )).limit(1);

    return rows[0] ?? null;
  }
}
