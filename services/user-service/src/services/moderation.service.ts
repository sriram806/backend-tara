import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import { getDb, moderationReports, users } from '@thinkai/db';

export type FlagUserInput = {
  reportedUserId: string;
  reportedBy: string;
  reason: string;
  category?: typeof moderationReports.$inferInsert['category'];
};

export type ListReportsFilters = {
  status?: 'pending' | 'reviewed' | 'dismissed';
  reportedUserId?: string;
  page?: number;
  limit?: number;
};

export type ResolveReportInput = {
  reportId: string;
  resolvedBy: string;
  decision: 'reviewed' | 'dismissed';
  resolutionNote?: string;
};

export class ModerationService {
  private get db() { return getDb(); }

  // ─── Flag / Report a User ─────────────────────────────────────────────────

  async flagUser(input: FlagUserInput) {
    const [report] = await this.db
      .insert(moderationReports)
      .values({
        reportedUserId: input.reportedUserId,
        reportedBy: input.reportedBy,
        reason: input.reason,
        category: input.category ?? 'other',
        status: 'pending'
      })
      .returning();

    return report;
  }

  // ─── List Reports ─────────────────────────────────────────────────────────

  async listReports(filters: ListReportsFilters = {}) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, filters.limit ?? 20);
    const offset = (page - 1) * limit;

    const conditions = [];
    if (filters.status) {
      conditions.push(eq(moderationReports.status, filters.status));
    }
    if (filters.reportedUserId) {
      conditions.push(eq(moderationReports.reportedUserId, filters.reportedUserId));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalResult, reports] = await Promise.all([
      this.db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(moderationReports)
        .where(where),
      this.db
        .select({
          report: moderationReports,
          reportedUser: {
            id: users.id,
            email: users.email,
            role: users.role as any,
            status: users.status as any
          }
        })
        .from(moderationReports)
        .leftJoin(users, eq(moderationReports.reportedUserId, users.id))
        .where(where)
        .orderBy(desc(moderationReports.createdAt))
        .limit(limit)
        .offset(offset)
    ]);

    const total = totalResult[0]?.count ?? 0;

    return {
      reports: reports.map(({ report, reportedUser }) => ({ ...report, reportedUser })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  // ─── Resolve a Report ─────────────────────────────────────────────────────

  async resolveReport(input: ResolveReportInput) {
    const [updated] = await this.db
      .update(moderationReports)
      .set({
        status: input.decision,
        resolvedBy: input.resolvedBy,
        resolvedAt: new Date(),
        resolutionNote: input.resolutionNote
      })
      .where(eq(moderationReports.id, input.reportId))
      .returning();

    return updated;
  }

  // ─── Get Reports for a Specific User ─────────────────────────────────────

  async getUserReports(userId: string) {
    return this.db
      .select()
      .from(moderationReports)
      .where(eq(moderationReports.reportedUserId, userId))
      .orderBy(desc(moderationReports.createdAt));
  }
}
