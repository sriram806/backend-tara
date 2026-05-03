import IORedis from 'ioredis';

// ─── Redis client (lazy, shared) ─────────────────────────────────────────────
let redisClient: IORedis | null = null;

function getRedis(): IORedis | null {
  if (redisClient) return redisClient;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  try {
    redisClient = new IORedis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
    return redisClient;
  } catch {
    return null;
  }
}

// ─── In-memory fallback ───────────────────────────────────────────────────────
type MemEntry = { count: number; resetAt: number };
const memStore = new Map<string, MemEntry>();

function checkMemory(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const current = memStore.get(key);
  if (!current || current.resetAt < now) {
    const next: MemEntry = { count: 1, resetAt: now + windowMs };
    memStore.set(key, next);
    return { allowed: true, remaining: max - 1, resetAt: next.resetAt };
  }
  if (current.count >= max) {
    return { allowed: false, remaining: 0, resetAt: current.resetAt };
  }
  current.count += 1;
  return { allowed: true, remaining: max - current.count, resetAt: current.resetAt };
}

// ─── Rate Limit Service ───────────────────────────────────────────────────────

export class RateLimitService {
  /**
   * Checks and increments the rate limit counter for `key`.
   *
   * Uses Redis INCR + EXPIRE for atomic, distributed-safe counting.
   * Falls back to an in-memory Map if Redis is unavailable.
   */
  async check(key: string, max: number, windowMs: number) {
    const redis = getRedis();

    if (redis) {
      try {
        const windowSec = Math.ceil(windowMs / 1000);
        const count = await redis.incr(key);
        if (count === 1) {
          // First hit in this window — set expiry
          await redis.expire(key, windowSec);
        }
        const ttl = await redis.pttl(key);
        const resetAt = Date.now() + Math.max(ttl, 0);

        if (count > max) {
          return { allowed: false, remaining: 0, resetAt };
        }
        return { allowed: true, remaining: max - count, resetAt };
      } catch {
        // Redis error — fall through to memory fallback
      }
    }

    return checkMemory(key, max, windowMs);
  }
}

export const rateLimitService = new RateLimitService();
