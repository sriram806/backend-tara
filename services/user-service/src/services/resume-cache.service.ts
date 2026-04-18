import { redisClient } from '../queues/connection';

export class ResumeCacheService {
  static buildKey(userId: string) {
    return `resume:${userId}`;
  }

  static async get(userId: string) {
    const cached = await redisClient.get(this.buildKey(userId));
    return cached ? JSON.parse(cached) : null;
  }

  static async set(userId: string, payload: unknown) {
    await redisClient.set(this.buildKey(userId), JSON.stringify(payload), 'EX', 60 * 60);
  }

  static async delete(userId: string) {
    await redisClient.del(this.buildKey(userId));
  }
}
