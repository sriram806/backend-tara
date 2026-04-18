import crypto from 'node:crypto';
import { and, desc, eq, gt, isNull, lt } from 'drizzle-orm';
import { getDb, isDatabaseConfigured, otpVerifications, refreshTokens, userProfiles, users } from '@thinkai/db';

export type UserRole = 'guest' | 'free' | 'pro' | 'admin';
export type OtpType = 'VERIFY_EMAIL' | 'RESET_PASSWORD';

export type UserRecord = {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  status: 'active' | 'suspended' | 'deleted';
  emailVerified: boolean;
  createdAt: Date;
};

export type OtpRecord = {
  id: string;
  userId: string | null;
  email: string;
  otpCode: string;
  type: OtpType;
  expiresAt: Date;
  attempts: number;
};

type CreateUserInput = {
  email: string;
  passwordHash: string;
  fullName?: string;
  preferences?: Record<string, unknown>;
};

type SaveRefreshTokenInput = {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  ipAddress?: string;
  deviceInfo?: string;
};

export class AuthStore {
  private readonly db = this.resolveDb();

  private readonly memoryUsers = new Map<string, UserRecord>();
  private readonly memoryUsersById = new Map<string, UserRecord>();
  private readonly memoryRefresh = new Map<
    string,
    { id: string; userId: string; tokenHash: string; expiresAt: Date; revokedAt: Date | null }
  >();
  private readonly memoryOtp = new Map<string, OtpRecord>();

  private resolveDb() {
    if (!isDatabaseConfigured()) {
      return null;
    }

    try {
      return getDb();
    } catch {
      return null;
    }
  }

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    if (this.db) {
      const row = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
      if (!row[0]) {
        return null;
      }
      return {
        id: row[0].id,
        email: row[0].email,
        passwordHash: row[0].passwordHash,
        role: row[0].role,
        status: row[0].status,
        emailVerified: row[0].emailVerified,
        createdAt: row[0].createdAt
      };
    }

    return this.memoryUsers.get(email) ?? null;
  }

  async findUserById(userId: string): Promise<UserRecord | null> {
    if (this.db) {
      const row = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!row[0]) {
        return null;
      }
      return {
        id: row[0].id,
        email: row[0].email,
        passwordHash: row[0].passwordHash,
        role: row[0].role,
        status: row[0].status,
        emailVerified: row[0].emailVerified,
        createdAt: row[0].createdAt
      };
    }

    return this.memoryUsersById.get(userId) ?? null;
  }

  async createUser(input: CreateUserInput): Promise<UserRecord> {
    if (this.db) {
      const derivedFullName = input.fullName?.trim() || input.email.split('@')[0];

      const [newUser] = await this.db
        .insert(users)
        .values({
          email: input.email,
          passwordHash: input.passwordHash,
          role: 'free',
          status: 'active',
          emailVerified: false,
          authProvider: 'local'
        })
        .returning();

      await this.db.insert(userProfiles).values({
        userId: newUser.id,
        fullName: derivedFullName,
        preferences: input.preferences ?? {}
      });

      return {
        id: newUser.id,
        email: newUser.email,
        passwordHash: newUser.passwordHash,
        role: newUser.role,
        status: newUser.status,
        emailVerified: newUser.emailVerified,
        createdAt: newUser.createdAt
      };
    }

    const user: UserRecord = {
      id: crypto.randomUUID(),
      email: input.email,
      passwordHash: input.passwordHash,
      role: 'free',
      status: 'active',
      emailVerified: false,
      createdAt: new Date()
    };

    this.memoryUsers.set(input.email, user);
    this.memoryUsersById.set(user.id, user);
    return user;
  }

  async deleteExpiredUnverifiedUserByEmail(email: string, olderThan: Date) {
    if (this.db) {
      const [staleUser] = await this.db
        .select({
          id: users.id
        })
        .from(users)
        .where(
          and(
            eq(users.email, email),
            eq(users.emailVerified, false),
            lt(users.createdAt, olderThan)
          )
        )
        .limit(1);

      if (!staleUser) {
        return false;
      }

      await this.db.delete(users).where(eq(users.id, staleUser.id));
      return true;
    }

    const staleUser = this.memoryUsers.get(email);
    if (!staleUser || staleUser.emailVerified) {
      return false;
    }

    if (staleUser.createdAt >= olderThan) {
      return false;
    }

    this.memoryUsers.delete(email);
    this.memoryUsersById.delete(staleUser.id);
    this.memoryOtp.delete(`${email}:VERIFY_EMAIL`);

    return true;
  }

  async markUserEmailVerified(userId: string) {
    if (this.db) {
      await this.db.update(users).set({ emailVerified: true, updatedAt: new Date() }).where(eq(users.id, userId));
      return;
    }

    const user = this.memoryUsersById.get(userId);
    if (user) {
      user.emailVerified = true;
    }
  }

  async updatePassword(userId: string, passwordHash: string) {
    if (this.db) {
      await this.db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, userId));
      return;
    }

    const user = this.memoryUsersById.get(userId);
    if (user) {
      user.passwordHash = passwordHash;
    }
  }

  async saveRefreshToken(input: SaveRefreshTokenInput) {
    if (this.db) {
      const [token] = await this.db
        .insert(refreshTokens)
        .values({
          userId: input.userId,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
          ipAddress: input.ipAddress,
          deviceInfo: input.deviceInfo
        })
        .returning();
      return token;
    }

    const token = {
      id: crypto.randomUUID(),
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      revokedAt: null as Date | null
    };
    this.memoryRefresh.set(input.tokenHash, token);
    return token;
  }

  async findActiveRefreshToken(tokenHash: string) {
    if (this.db) {
      const [row] = await this.db
        .select()
        .from(refreshTokens)
        .where(
          and(
            eq(refreshTokens.tokenHash, tokenHash),
            isNull(refreshTokens.revokedAt),
            gt(refreshTokens.expiresAt, new Date())
          )
        )
        .limit(1);
      return row ?? null;
    }

    const token = this.memoryRefresh.get(tokenHash);
    if (!token || token.revokedAt || token.expiresAt <= new Date()) {
      return null;
    }
    return token;
  }

  async revokeRefreshToken(tokenId: string) {
    if (this.db) {
      await this.db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, tokenId));
      return;
    }

    for (const entry of this.memoryRefresh.values()) {
      if (entry.id === tokenId) {
        entry.revokedAt = new Date();
        break;
      }
    }
  }

  async revokeAllUserRefreshTokens(userId: string) {
    if (this.db) {
      await this.db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
      return;
    }

    for (const entry of this.memoryRefresh.values()) {
      if (entry.userId === userId && !entry.revokedAt) {
        entry.revokedAt = new Date();
      }
    }
  }

  async upsertOtp(input: {
    userId: string | null;
    email: string;
    otpCode: string;
    type: OtpType;
    expiresAt: Date;
  }) {
    if (this.db) {
      await this.db.delete(otpVerifications).where(and(eq(otpVerifications.email, input.email), eq(otpVerifications.type, input.type)));
      const [record] = await this.db
        .insert(otpVerifications)
        .values({
          userId: input.userId,
          email: input.email,
          otpCode: input.otpCode,
          type: input.type,
          expiresAt: input.expiresAt,
          attempts: 0
        })
        .returning();
      return record;
    }

    const key = `${input.email}:${input.type}`;
    const record: OtpRecord = {
      id: crypto.randomUUID(),
      userId: input.userId,
      email: input.email,
      otpCode: input.otpCode,
      type: input.type,
      expiresAt: input.expiresAt,
      attempts: 0
    };
    this.memoryOtp.set(key, record);
    return record;
  }

  async getLatestOtp(email: string, type: OtpType): Promise<OtpRecord | null> {
    if (this.db) {
      const [record] = await this.db
        .select()
        .from(otpVerifications)
        .where(and(eq(otpVerifications.email, email), eq(otpVerifications.type, type)))
        .orderBy(desc(otpVerifications.createdAt))
        .limit(1);

      return record ?? null;
    }

    return this.memoryOtp.get(`${email}:${type}`) ?? null;
  }

  async incrementOtpAttempts(otpId: string) {
    if (this.db) {
      const record = await this.db.select().from(otpVerifications).where(eq(otpVerifications.id, otpId)).limit(1);
      if (record[0]) {
        await this.db
          .update(otpVerifications)
          .set({ attempts: record[0].attempts + 1 })
          .where(eq(otpVerifications.id, otpId));
      }
      return;
    }

    for (const otp of this.memoryOtp.values()) {
      if (otp.id === otpId) {
        otp.attempts += 1;
        return;
      }
    }
  }

  async deleteOtp(otpId: string) {
    if (this.db) {
      await this.db.delete(otpVerifications).where(eq(otpVerifications.id, otpId));
      return;
    }

    for (const [key, otp] of this.memoryOtp.entries()) {
      if (otp.id === otpId) {
        this.memoryOtp.delete(key);
        return;
      }
    }
  }
}
