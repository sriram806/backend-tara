import { getDb, adminApiKeys } from '@thinkai/db';
import { eq } from 'drizzle-orm';
import crypto from 'node:crypto';

export type CreateApiKeyInput = {
  name: string;
  scopes: string[];
  expiresAt?: Date;
  createdBy: string;
};

export class ApiKeyService {
  private get db() { return getDb(); }

  /**
   * Generates a new API Key.
   * Returns the raw key (only shown once) and the stored record.
   */
  async createApiKey(input: CreateApiKeyInput) {
    const rawKey = `tk_${crypto.randomBytes(32).toString('base64url')}`;
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    const prefix = rawKey.substring(0, 8);

    const [apiKey] = await this.db.insert(adminApiKeys).values({
      name: input.name,
      keyHash,
      keyPrefix: prefix,
      scopes: input.scopes,
      expiresAt: input.expiresAt,
      createdBy: input.createdBy
    }).returning();

    return { apiKey, rawKey };
  }

  async listApiKeys() {
    return this.db.select({
      id: adminApiKeys.id,
      name: adminApiKeys.name,
      keyPrefix: adminApiKeys.keyPrefix,
      scopes: adminApiKeys.scopes,
      expiresAt: adminApiKeys.expiresAt,
      lastUsedAt: adminApiKeys.lastUsedAt,
      createdAt: adminApiKeys.createdAt,
      createdBy: adminApiKeys.createdBy
    }).from(adminApiKeys).orderBy(adminApiKeys.createdAt);
  }

  async revokeApiKey(id: string) {
    await this.db.delete(adminApiKeys).where(eq(adminApiKeys.id, id));
    return { revoked: true };
  }

  /**
   * Validates a raw API key. If valid and not expired, updates lastUsedAt and returns the scopes.
   */
  async validateApiKey(rawKey: string): Promise<string[] | null> {
    if (!rawKey.startsWith('tk_')) return null;

    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const [apiKey] = await this.db.select().from(adminApiKeys).where(eq(adminApiKeys.keyHash, keyHash)).limit(1);

    if (!apiKey) return null;
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) return null;

    // Update last used (fire and forget to not block auth)
    this.db.update(adminApiKeys).set({ lastUsedAt: new Date() }).where(eq(adminApiKeys.id, apiKey.id)).catch(() => {});

    return apiKey.scopes;
  }
}
