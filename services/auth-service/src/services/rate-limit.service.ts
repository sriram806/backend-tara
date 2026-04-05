type Entry = {
  count: number;
  resetAt: number;
};

export class RateLimitService {
  private readonly store = new Map<string, Entry>();

  check(key: string, max: number, windowMs: number) {
    const now = Date.now();
    const current = this.store.get(key);

    if (!current || current.resetAt < now) {
      const next: Entry = {
        count: 1,
        resetAt: now + windowMs
      };
      this.store.set(key, next);
      return {
        allowed: true,
        remaining: max - 1,
        resetAt: next.resetAt
      };
    }

    if (current.count >= max) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: current.resetAt
      };
    }

    current.count += 1;
    return {
      allowed: true,
      remaining: max - current.count,
      resetAt: current.resetAt
    };
  }
}

export const rateLimitService = new RateLimitService();
