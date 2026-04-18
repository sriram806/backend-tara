import { redisClient } from '../queues/connection';

export class CacheService {
  static async getJson<T>(key: string): Promise<T | null> {
    try {
      const cached = await redisClient.get(key);
      return cached ? JSON.parse(cached) as T : null;
    } catch {
      return null;
    }
  }

  static async setJson(key: string, value: unknown, ttlSeconds: number) {
    try {
      await redisClient.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      // Cache is best-effort.
    }
  }

  static async delete(key: string) {
    try {
      await redisClient.del(key);
    } catch {
      // Cache is best-effort.
    }
  }

  static async bumpVersion(key: string): Promise<number> {
    try {
      return await redisClient.incr(key);
    } catch {
      return Date.now();
    }
  }
}