import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL ?? 'redis://redis:6379';

export const redisClient = new Redis(redisUrl, {
  maxRetriesPerRequest: null
});
