import { PatchMeInput } from '../schemas/user.schema';
import { eq } from 'drizzle-orm';
import { getDb, isDatabaseConfigured, userProfiles, users } from '@thinkai/db';

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

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      emailVerified: user.emailVerified,
      displayName: profile?.fullName ?? null,
      targetRole: profile?.targetRole ?? null,
      preferences: profile?.preferences ?? {},
      bio: null
    };
  }

  updateMe(_input: PatchMeInput) {
    throw new Error('UPDATE_ME_NOT_IMPLEMENTED');
  }
}
