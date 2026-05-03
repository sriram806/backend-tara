import { desc, eq } from 'drizzle-orm';
import { getDb, subscriptions, users } from '@thinkai/db';
import { FastifyReply, FastifyRequest } from 'fastify';
import { redisClient } from '../queues/connection';

type Feature = 'career' | 'resume' | 'roadmap' | 'jobs' | 'interview' | 'assessment';
type GuardedFeature = Feature | 'onboarding';
type Plan = 'LITE' | 'PRO' | 'ENTERPRISE';

const PLAN_LIMITS: Record<Plan, Record<Feature, number | null>> = {
  LITE: {
    career: 10,
    resume: 5,
    roadmap: 5,
    jobs: 10,
    interview: 0,
    assessment: 10
  },
  PRO: {
    career: null,
    resume: null,
    roadmap: null,
    jobs: null,
    interview: null,
    assessment: null
  },
  ENTERPRISE: {
    career: null,
    resume: null,
    roadmap: null,
    jobs: null,
    interview: null,
    assessment: null
  }
};

const RESTRICTED_FEATURES: Record<Plan, Feature[]> = {
  LITE: ['interview'],
  PRO: [],
  ENTERPRISE: []
};

async function resolveActiveSubscription(userId: string) {
  const db = getDb();

  // Check users table for role and direct plan assignment
  const [user] = await db.select({
    plan: users.plan,
    role: users.role
  }).from(users).where(eq(users.id, userId)).limit(1);

  // 🛡️ Guest Bypass: Universal access for developers/testers
  if (user?.role === 'guest') {
    return { plan: 'ENTERPRISE', status: 'active', endDate: new Date('2099-12-31') };
  }

  if (!user || !user.plan) {
    return null;
  }

  const now = new Date();
  const rows = await db.select().from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);

  if (rows.length === 0) {
    // Manual Override / Admin assigned plan
    return { plan: user.plan, status: 'active', endDate: new Date('2099-12-31') };
  }

  const active = rows[0];
  if (active.status === 'active' && active.endDate > now) {
    return active;
  }

  return null;
}

export async function hasActiveSubscription(userId: string) {
  const db = getDb();
  const [user] = await db.select({
    plan: users.plan,
    role: users.role
  }).from(users).where(eq(users.id, userId)).limit(1);

  return user?.role === 'guest' || Boolean(user?.plan);
}

export function requireActiveSubscription(feature: GuardedFeature = 'onboarding') {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.userContext?.userId;
    if (!userId) {
      return reply.code(401).send({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing user context'
        }
      });
    }

    const subscription = await resolveActiveSubscription(userId);
    if (!subscription) {
      return reply.code(402).send({
        success: false,
        error: {
          code: 'SUBSCRIPTION_REQUIRED',
          message: `An active subscription is required before using ${feature}`
        }
      });
    }

    return;
  };
}

export function requireSubscription(feature: Feature) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.userContext?.userId;
    if (!userId) {
      return reply.code(401).send({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing user context'
        }
      });
    }

    const subscription = await resolveActiveSubscription(userId);
    if (!subscription) {
      return reply.code(402).send({
        success: false,
        error: {
          code: 'SUBSCRIPTION_REQUIRED',
          message: `An active subscription is required before using ${feature}`
        }
      });
    }

    const plan = subscription.plan as Plan;
    if (RESTRICTED_FEATURES[plan].includes(feature)) {
      return reply.code(403).send({
        success: false,
        error: {
          code: 'FEATURE_RESTRICTED',
          message: `Feature ${feature} is not available on ${plan} plan`
        }
      });
    }

    const limit = PLAN_LIMITS[plan][feature];
    if (limit === null) {
      return;
    }

    const month = new Date().toISOString().slice(0, 7);
    const key = `ai:quota:${userId}:${feature}:${month}`;
    const currentRaw = await redisClient.get(key);
    const current = currentRaw ? Number(currentRaw) : 0;

    if (current >= limit) {
      return reply.code(429).send({
        success: false,
        error: {
          code: 'QUOTA_EXCEEDED',
          message: `Monthly quota exceeded for ${feature} on ${plan} plan`
        }
      });
    }

    await redisClient.incr(key);
    await redisClient.expire(key, 35 * 24 * 60 * 60);
  };
}
