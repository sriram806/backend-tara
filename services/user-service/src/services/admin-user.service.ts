import {
  and, asc, count, desc, eq, gte, ilike, lte, ne, or, sql
} from 'drizzle-orm';
import {
  getDb,
  adminAuditLogs,
  moderationReports,
  gdprRequests,
  refreshTokens,
  userCustomFields,
  userLoginHistory,
  userProfiles,
  users
} from '@thinkai/db';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

export type ListUsersFilters = {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  status?: string;
  plan?: string;
  fromDate?: string;
  toDate?: string;
  sortBy?: 'createdAt' | 'email' | 'role' | 'status' | 'lastLogin';
  sortOrder?: 'asc' | 'desc';
};

export type UpdateUserInput = {
  role?: 'guest' | 'user' | 'support' | 'moderator' | 'admin';
  plan?: 'LITE' | 'PRO' | 'ENTERPRISE' | null;
  status?: 'active' | 'suspended' | 'deleted';
  password?: string;
  customFields?: Array<{ key: string; value: string }>;
  customRoleId?: string | null;
};

export type AuditLogFilters = {
  page?: number;
  limit?: number;
  action?: string;
  actorId?: string;
  targetUserId?: string;
  fromDate?: string;
  toDate?: string;
};

export class AdminUserService {
  private readonly db = getDb();

  // ─── User Listing & Search ────────────────────────────────────────────────

  async listUsers(filters: ListUsersFilters = {}) {
    const {
      page = 1, limit = 25, search, role, status,
      fromDate, toDate, sortBy = 'createdAt', sortOrder = 'desc'
    } = filters;
    const offset = (page - 1) * limit;

    const conditions: any[] = [];

    if (search) {
      conditions.push(
        or(
          ilike(users.email, `%${search}%`),
          ilike(userProfiles.fullName, `%${search}%`)
        ) as unknown as ReturnType<typeof eq>
      );
    }
    if (role) {
      conditions.push(eq(users.role as any, role));
    }
    if (status) {
      conditions.push(eq(users.status as any, status));
    }
    if (fromDate) {
      conditions.push(gte(users.createdAt, new Date(fromDate)));
    }
    if (toDate) {
      conditions.push(lte(users.createdAt, new Date(toDate)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const orderCol = ({
      createdAt: users.createdAt,
      email: users.email,
      role: users.role as any,
      status: users.status as any,
      lastLogin: users.lastLogin
    } as any)[sortBy] ?? users.createdAt;

    const orderFn = sortOrder === 'asc' ? asc : desc;

    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({
          id: users.id,
          email: users.email,
          role: users.role as any,
          status: users.status as any,
          plan: users.plan as any,
          emailVerified: users.emailVerified,
          isOnboarded: users.isOnboarded,
          createdAt: users.createdAt,
          fullName: userProfiles.fullName
        })
        .from(users)
        .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
        .where(whereClause)
        .orderBy(orderFn(orderCol))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ total: count() })
        .from(users)
        .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
        .where(whereClause)
    ]);

    return {
      users: rows,
      pagination: {
        page,
        limit,
        total: Number(total),
        totalPages: Math.ceil(Number(total) / limit)
      }
    };
  }

  // ─── Get Full User Profile ────────────────────────────────────────────────

  async getUserById(id: string) {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!user) return null;

    const [profile] = await this.db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, id))
      .limit(1);

    const customFields = await this.db
      .select()
      .from(userCustomFields)
      .where(eq(userCustomFields.userId, id));

    return { ...user, profile, customFields };
  }

  // ─── Update User ──────────────────────────────────────────────────────────

  async updateUser(id: string, patch: UpdateUserInput, actorId: string) {
    const [user] = await this.db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(and(eq(users.id, id), ne(users.status, 'deleted')))
      .limit(1);

    if (!user) return null;

    const updateFields: Partial<typeof users.$inferInsert> = {};
    if (patch.role !== undefined) updateFields.role = patch.role;
    if (patch.status !== undefined) updateFields.status = patch.status;
    if (patch.plan !== undefined) updateFields.plan = patch.plan;
    if (patch.password !== undefined) {
      const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS ?? '12', 10);
      updateFields.passwordHash = await bcrypt.hash(patch.password, BCRYPT_ROUNDS);
    }

    if (Object.keys(updateFields).length > 0) {
      updateFields.updatedAt = new Date();
      await this.db.update(users).set(updateFields).where(eq(users.id, id));
    }

    if (patch.customFields?.length) {
      for (const cf of patch.customFields) {
        // upsert per (userId, key)
        await this.db
          .insert(userCustomFields)
          .values({ userId: id, key: cf.key, value: cf.value, createdBy: actorId })
          .onConflictDoUpdate({
            target: [userCustomFields.userId, userCustomFields.key],
            set: { value: cf.value, updatedAt: new Date() }
          });
      }
    }

    if (patch.customRoleId !== undefined) {
      const val = patch.customRoleId;
      if (val === null) {
        await this.db.delete(userCustomFields).where(and(eq(userCustomFields.userId, id), eq(userCustomFields.key, 'customRoleId')));
      } else {
        await this.db
          .insert(userCustomFields)
          .values({ userId: id, key: 'customRoleId', value: val, createdBy: actorId })
          .onConflictDoUpdate({
            target: [userCustomFields.userId, userCustomFields.key],
            set: { value: val, updatedAt: new Date() }
          });
      }
    }

    return this.getUserById(id);
  }

  // ─── Lock / Unlock ────────────────────────────────────────────────────────

  async lockUser(id: string) {
    await this.db
      .update(users)
      .set({ status: 'suspended', updatedAt: new Date() })
      .where(eq(users.id, id));
  }

  async unlockUser(id: string) {
    await this.db
      .update(users)
      .set({ status: 'active', updatedAt: new Date() })
      .where(eq(users.id, id));
  }

  // ─── Soft Delete ──────────────────────────────────────────────────────────

  async softDeleteUser(id: string) {
    await this.db
      .update(users)
      .set({ status: 'deleted', email: sql`email || '.deleted.' || id`, updatedAt: new Date() })
      .where(eq(users.id, id));
    // Revoke all tokens
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.userId, id), eq(refreshTokens.revokedAt, null as unknown as Date)));
  }

  // ─── Impersonation ────────────────────────────────────────────────────────

  async createImpersonationToken(userId: string, adminId: string) {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) throw new Error('JWT_ACCESS_SECRET not configured');

    const [user] = await this.db
      .select({ id: users.id, role: users.role, email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) return null;

    const token = jwt.sign(
      {
        userId: user.id,
        role: user.role,
        type: 'access',
        impersonated: true,
        impersonatedBy: adminId
      },
      secret,
      { expiresIn: '15m' }
    );

    return { token, expiresIn: '15m', targetUser: { id: user.id, email: user.email, role: user.role } };
  }

  // ─── Sessions ─────────────────────────────────────────────────────────────

  async getUserSessions(userId: string) {
    return this.db
      .select()
      .from(refreshTokens)
      .where(and(eq(refreshTokens.userId, userId), eq(refreshTokens.revokedAt, null as unknown as Date)))
      .orderBy(desc(refreshTokens.id));
  }

  async revokeSession(sessionId: string) {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.id, sessionId));
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.userId, userId), eq(refreshTokens.revokedAt, null as unknown as Date)));
  }

  // ─── Login History ────────────────────────────────────────────────────────

  async getLoginHistory(userId: string, page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(userLoginHistory)
        .where(eq(userLoginHistory.userId, userId))
        .orderBy(desc(userLoginHistory.createdAt))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ total: count() })
        .from(userLoginHistory)
        .where(eq(userLoginHistory.userId, userId))
    ]);
    return { history: rows, pagination: { page, limit, total: Number(total) } };
  }

  // ─── Audit Logs ───────────────────────────────────────────────────────────

  async writeAuditLog(entry: {
    actorId: string | null;
    actorEmail: string | null;
    actorRole: string | null;
    action: typeof adminAuditLogs.$inferInsert['action'];
    targetUserId?: string | null;
    targetEmail?: string | null;
    resourceType?: string;
    resourceId?: string;
    metadata?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
  }) {
    await this.db.insert(adminAuditLogs).values({
      actorId: entry.actorId,
      actorEmail: entry.actorEmail,
      actorRole: entry.actorRole,
      action: entry.action,
      targetUserId: entry.targetUserId,
      targetEmail: entry.targetEmail,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      metadata: entry.metadata ?? {},
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent
    });
  }

  async getAuditLogs(filters: AuditLogFilters = {}) {
    const { page = 1, limit = 50, action, actorId, targetUserId, fromDate, toDate } = filters;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (action) conditions.push(eq(adminAuditLogs.action, action as typeof adminAuditLogs.action._.data));
    if (actorId) conditions.push(eq(adminAuditLogs.actorId, actorId));
    if (targetUserId) conditions.push(eq(adminAuditLogs.targetUserId, targetUserId));
    if (fromDate) conditions.push(gte(adminAuditLogs.createdAt, new Date(fromDate)));
    if (toDate) conditions.push(lte(adminAuditLogs.createdAt, new Date(toDate)));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(adminAuditLogs)
        .where(where)
        .orderBy(desc(adminAuditLogs.createdAt))
        .limit(limit)
        .offset(offset),
      this.db.select({ total: count() }).from(adminAuditLogs).where(where)
    ]);

    return { logs: rows, pagination: { page, limit, total: Number(total), totalPages: Math.ceil(Number(total) / limit) } };
  }

  // ─── GDPR ─────────────────────────────────────────────────────────────────

  async createGdprRequest(userId: string, type: 'export' | 'delete', requestedBy: string) {
    const [req] = await this.db
      .insert(gdprRequests)
      .values({ userId, type, requestedBy, status: 'pending' })
      .returning();
    return req;
  }

  async listGdprRequests(page = 1, limit = 25, statusFilter?: string) {
    const offset = (page - 1) * limit;
    const where = statusFilter
      ? eq(gdprRequests.status, statusFilter as typeof gdprRequests.status._.data)
      : undefined;

    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(gdprRequests)
        .where(where)
        .orderBy(desc(gdprRequests.createdAt))
        .limit(limit)
        .offset(offset),
      this.db.select({ total: count() }).from(gdprRequests).where(where)
    ]);

    return { requests: rows, pagination: { page, limit, total: Number(total) } };
  }

  // ─── Export ───────────────────────────────────────────────────────────────

  async exportUsers(filters: ListUsersFilters) {
    // Fetch up to 10k rows for export (adjust as needed)
    const result = await this.listUsers({ ...filters, limit: 10000, page: 1 });
    const header = 'id,email,role,status,plan,emailVerified,isOnboarded,fullName,createdAt\n';
    const rows = result.users
      .map((u) =>
        [
          u.id, u.email, u.role, u.status,
          u.plan ?? 'NONE', u.emailVerified, u.isOnboarded,
          (u.fullName ?? '').replace(/,/g, ' '), u.createdAt?.toISOString()
        ].join(',')
      )
      .join('\n');
    return header + rows;
  }

  // ─── Admin: Create User ─────────────────────────────────────────────────────

  async createUser(input: {
    email: string;
    password: string;
    fullName?: string;
    role?: typeof users.$inferInsert['role'];
    status?: typeof users.$inferInsert['status'];
    createdByAdminId: string;
  }) {
    const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS ?? '12', 10);
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

    const [user] = await this.db
      .insert(users)
      .values({
        email: input.email,
        passwordHash,
        role: input.role ?? 'user',
        status: input.status ?? 'active',
        emailVerified: true,      // admin-created users skip email verification
        authProvider: 'local'
      })
      .returning();

    const derivedFullName = input.fullName?.trim() || input.email.split('@')[0];
    await this.db.insert(userProfiles).values({
      userId: user.id,
      fullName: derivedFullName,
      preferences: {}
    });

    return this.getUserById(user.id);
  }

  // ─── Moderation: Ban / Unban ────────────────────────────────────────────────────

  async banUser(id: string, reason?: string, bannedBy?: string) {
    await this.db
      .update(users)
      .set({
        status: 'suspended',
        bannedBy: bannedBy ?? null,
        bannedReason: reason ?? null,
        bannedAt: new Date(),
        updatedAt: new Date()
      })
      .where(and(eq(users.id, id), ne(users.status, 'deleted')));

    // Revoke all active sessions on ban
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.userId, id), eq(refreshTokens.revokedAt, null as unknown as Date)));

    return { banned: true, reason, bannedBy, bannedAt: new Date() };
  }

  async unbanUser(id: string) {
    await this.db
      .update(users)
      .set({
        status: 'active',
        bannedBy: null,
        bannedReason: null,
        bannedAt: null,
        updatedAt: new Date()
      })
      .where(and(eq(users.id, id), ne(users.status, 'deleted')));
    return { unbanned: true };
  }

  // ─── Moderation: Mute / Unmute ───────────────────────────────────────────────────

  async muteUser(id: string, durationHours: number) {
    const mutedUntil = new Date(Date.now() + durationHours * 60 * 60 * 1000);
    await this.db
      .update(users)
      .set({ mutedUntil, updatedAt: new Date() })
      .where(and(eq(users.id, id), ne(users.status, 'deleted')));
    return { muted: true, mutedUntil };
  }

  async unmuteUser(id: string) {
    await this.db
      .update(users)
      .set({ mutedUntil: null, updatedAt: new Date() })
      .where(and(eq(users.id, id), ne(users.status, 'deleted')));
    return { unmuted: true };
  }

  // ─── Real-Time Dashboard ──────────────────────────────────────────────────

  async getRealtimeDashboard() {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [activeSessionsData] = await this.db.select({ count: count() }).from(refreshTokens).where(gte(refreshTokens.expiresAt, now));
    const [recentLoginsData] = await this.db.select({ count: count() }).from(userLoginHistory).where(gte(userLoginHistory.createdAt, twentyFourHoursAgo));
    const [activeModerationReportsData] = await this.db.select({ count: count() }).from(moderationReports).where(eq(moderationReports.status, 'pending'));

    const recentActions = await this.db.select({
      id: adminAuditLogs.id,
      action: adminAuditLogs.action,
      actorId: adminAuditLogs.actorId,
      createdAt: adminAuditLogs.createdAt
    }).from(adminAuditLogs).orderBy(desc(adminAuditLogs.createdAt)).limit(10);

    return {
      activeSessions: Number(activeSessionsData?.count ?? 0),
      loginsLast24h: Number(recentLoginsData?.count ?? 0),
      pendingModerationReports: Number(activeModerationReportsData?.count ?? 0),
      recentAdminActions: recentActions
    };
  }
}
