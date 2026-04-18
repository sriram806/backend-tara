import { and, eq } from 'drizzle-orm';
import { getDb, resumeAnalysisRuns, roadmapRuns } from '@thinkai/db';

export class RoadmapRunRepository {
  static async getBySignature(analysisRunId: string, targetRole: string, durationDays: number) {
    const db = getDb();
    const rows = await db.select().from(roadmapRuns).where(and(
      eq(roadmapRuns.analysisRunId, analysisRunId),
      eq(roadmapRuns.targetRole, targetRole),
      eq(roadmapRuns.durationDays, durationDays)
    )).limit(1);

    return rows[0] ?? null;
  }

  static async getCompletedAnalysisForUser(analysisRunId: string, userId: string) {
    const db = getDb();
    const rows = await db.select().from(resumeAnalysisRuns).where(and(
      eq(resumeAnalysisRuns.id, analysisRunId),
      eq(resumeAnalysisRuns.userId, userId)
    )).limit(1);

    return rows[0] ?? null;
  }

  static async create(values: typeof roadmapRuns.$inferInsert) {
    const db = getDb();
    const rows = await db.insert(roadmapRuns).values(values).returning();
    return rows[0];
  }

  static async getByIdForUser(runId: string, userId: string) {
    const db = getDb();
    const rows = await db.select().from(roadmapRuns).where(and(
      eq(roadmapRuns.id, runId),
      eq(roadmapRuns.userId, userId)
    )).limit(1);

    return rows[0] ?? null;
  }
}
