import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Shared connection for BullMQ
export const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});

// Redis client for general caching, quota, and cooldown
export const redisClient = new Redis(redisUrl);
