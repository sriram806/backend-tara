import { PatchMeInput } from '../schemas/user.schema';
import { desc, eq } from 'drizzle-orm';
import { getDb, isDatabaseConfigured, userProfiles, userTargetRoles, users } from '@thinkai/db';
import { CacheService } from './cache.service';

const USER_ME_CACHE_TTL_SECONDS = 300;

export class UserService {
  private readonly db = this.resolveDb();

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

  async getMe(userId: string) {
    const cacheKey = `user:me:${userId}`;
    const cached = await CacheService.getJson<{
      id: string;
      email: string;
      role: string;
      status: string;
      emailVerified: boolean;
      isOnboarded: boolean;
      displayName: string | null;
      targetRole: string | null;
      preferences: Record<string, unknown>;
      bio: string | null;
    }>(cacheKey);

    if (cached) {
      return cached;
    }

    if (!this.db) {
      throw new Error('DATABASE_NOT_CONFIGURED');
    }

    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return null;
    }

    const [profile] = await this.db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);

    const [targetRole] = await this.db
      .select()
      .from(userTargetRoles)
      .where(eq(userTargetRoles.userId, userId))
      .orderBy(desc(userTargetRoles.createdAt))
      .limit(1);

    const profilePayload = {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      emailVerified: user.emailVerified,
      isOnboarded: user.isOnboarded,
      displayName: profile?.fullName ?? null,
      targetRole: targetRole?.title ?? null,
      preferences: profile?.preferences ?? {},
      bio:
        profile?.preferences &&
        typeof profile.preferences === 'object' &&
        'bio' in profile.preferences &&
        typeof profile.preferences.bio === 'string'
          ? profile.preferences.bio
          : null
    };

      await CacheService.setJson(cacheKey, profilePayload, USER_ME_CACHE_TTL_SECONDS);
      return profilePayload;
  }

  async updateMe(userId: string, input: PatchMeInput) {
    const database = this.db;
    if (!database) throw new Error('DATABASE_NOT_CONFIGURED');

    const [user] = await database
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) return null;

    const [profile] = await database
      .select({
        fullName: userProfiles.fullName,
        preferences: userProfiles.preferences
      })
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);

    const existingPreferences = (profile?.preferences ?? {}) as Record<string, unknown>;
    const nextPreferences: Record<string, unknown> = { ...existingPreferences };

    if (input.bio !== undefined) {
      nextPreferences.bio = input.bio;
    }

    if (profile) {
      await database
        .update(userProfiles)
        .set({
          fullName: input.displayName ?? profile.fullName,
          preferences: nextPreferences
        })
        .where(eq(userProfiles.userId, userId));
    } else {
      await database.insert(userProfiles).values({
        userId,
        fullName: input.displayName ?? null,
        preferences: nextPreferences
      });
    }

    await CacheService.delete(`user:me:${userId}`);

    return this.getMe(userId);
  }
}
