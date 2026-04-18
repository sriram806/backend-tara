import crypto from 'node:crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  featureFlagOverrides,
  featureFlags,
  getDb,
  organizationMembers
} from '@thinkai/db';
import { redisClient } from '../queues/connection';
import { ExperimentService } from './experiment.service';
import {
  CreateFeatureFlagDto,
  CreateFeatureFlagOverrideDto,
  UpdateFeatureFlagDto
} from '../schemas/feature-flag.schema';

type FeatureFlagRow = typeof featureFlags.$inferSelect;
type FeatureFlagOverrideRow = typeof featureFlagOverrides.$inferSelect;

type CachedFeatureFlagBundle = {
  flag: FeatureFlagRow;
  overrides: FeatureFlagOverrideRow[];
};

export type FeatureFlagDecision = {
  enabled: boolean;
  source: 'user_override' | 'organization_override' | 'experiment' | 'rollout' | 'global' | 'missing' | 'scheduled';
  key: string;
  flagId: string | null;
  variantName?: string | null;
  experimentId?: string | null;
  variantId?: string | null;
  rolloutPercentage?: number;
};

const CACHE_PREFIX = 'feature';
const CACHE_TTL_SECONDS = 60 * 30;

const EXPERIMENT_FLAG_MAP: Record<string, { type: 'roadmap' | 'exam' | 'recommendation'; evaluator: (config: Record<string, unknown>) => boolean }> = {
  roadmap_v2: {
    type: 'roadmap',
    evaluator: (config) => config.roadmapVersion === 'v2'
  },
  adaptive_exam: {
    type: 'exam',
    evaluator: (config) => config.examDifficulty === 'adaptive'
  },
  advanced_recommendations: {
    type: 'recommendation',
    evaluator: (config) => config.recommendationType === 'advanced'
  }
};

function cacheKey(featureKey: string) {
  return `${CACHE_PREFIX}:${featureKey}`;
}

function stablePercentage(userId: string, featureKey: string) {
  const hash = crypto.createHash('sha256').update(`${userId}:${featureKey}`).digest('hex');
  return Number.parseInt(hash.slice(0, 8), 16) % 100;
}

function toDate(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value : new Date(value);
}

function normalizeConfig(config: Record<string, unknown>) {
  return {
    roadmapVersion: config.roadmapVersion === 'v2' ? 'v2' : 'v1',
    examDifficulty: config.examDifficulty === 'adaptive' ? 'adaptive' : 'fixed',
    recommendationType: config.recommendationType === 'advanced' ? 'advanced' : 'simple'
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error';
}

export class FeatureFlagService {
  private static async invalidate(featureKey: string) {
    await redisClient.del(cacheKey(featureKey));
  }

  private static async resolveBundle(featureKey: string): Promise<CachedFeatureFlagBundle | null> {
    const cached = await redisClient.get(cacheKey(featureKey));
    if (cached) {
      try {
        return JSON.parse(cached) as CachedFeatureFlagBundle;
      } catch {
        await this.invalidate(featureKey);
      }
    }

    const db = getDb();
    const [flag] = await db.select().from(featureFlags).where(eq(featureFlags.key, featureKey)).limit(1);
    if (!flag) {
      return null;
    }

    const overrides = await db.select().from(featureFlagOverrides).where(eq(featureFlagOverrides.featureFlagId, flag.id)).orderBy(desc(featureFlagOverrides.createdAt));
    const bundle: CachedFeatureFlagBundle = { flag, overrides };

    await redisClient.set(cacheKey(featureKey), JSON.stringify(bundle), 'EX', CACHE_TTL_SECONDS);

    return bundle;
  }

  private static async resolveExperimentDecision(userId: string, featureKey: string) {
    const mapping = EXPERIMENT_FLAG_MAP[featureKey];
    if (!mapping) {
      return null;
    }

    const experimentContext = await ExperimentService.getExperimentContext(userId, mapping.type);
    if (!experimentContext.experimentId || !experimentContext.variantId) {
      return null;
    }

    return {
      enabled: mapping.evaluator(normalizeConfig(experimentContext.config as Record<string, unknown>)),
      source: 'experiment' as const,
      experimentId: experimentContext.experimentId,
      variantId: experimentContext.variantId,
      variantName: experimentContext.variantName
    };
  }

  static async createFlag(input: CreateFeatureFlagDto) {
    const db = getDb();
    const now = new Date();

    const [created] = await db.insert(featureFlags).values({
      key: input.key,
      description: input.description,
      isEnabled: input.isEnabled,
      rolloutPercentage: input.rolloutPercentage,
      scheduledRolloutAt: input.scheduledRolloutAt ?? null,
      createdAt: now,
      updatedAt: now
    }).returning();

    await this.invalidate(created.key);

    return created;
  }

  static async updateFlag(id: string, input: UpdateFeatureFlagDto) {
    const db = getDb();
    const existing = await db.select().from(featureFlags).where(eq(featureFlags.id, id)).limit(1);
    if (existing.length === 0) {
      throw new Error('Feature flag not found');
    }

    const current = existing[0];
    const [updated] = await db.update(featureFlags).set({
      description: input.description ?? current.description,
      isEnabled: input.isEnabled ?? current.isEnabled,
      rolloutPercentage: input.rolloutPercentage ?? current.rolloutPercentage,
      scheduledRolloutAt: input.scheduledRolloutAt === undefined ? current.scheduledRolloutAt : input.scheduledRolloutAt,
      updatedAt: new Date()
    }).where(eq(featureFlags.id, id)).returning();

    await this.invalidate(updated.key);

    return updated;
  }

  static async listFlags() {
    const db = getDb();
    const flags = await db.select().from(featureFlags).orderBy(desc(featureFlags.createdAt));
    if (flags.length === 0) {
      return [];
    }

    const overrides = await db.select().from(featureFlagOverrides).where(inArray(
      featureFlagOverrides.featureFlagId,
      flags.map((flag) => flag.id)
    ));

    const overridesByFlag = new Map<string, FeatureFlagOverrideRow[]>();
    for (const override of overrides) {
      const bucket = overridesByFlag.get(override.featureFlagId) ?? [];
      bucket.push(override);
      overridesByFlag.set(override.featureFlagId, bucket);
    }

    return flags.map((flag) => ({
      ...flag,
      scheduledRolloutAt: flag.scheduledRolloutAt,
      overrides: overridesByFlag.get(flag.id) ?? [],
      overrideCount: overridesByFlag.get(flag.id)?.length ?? 0
    }));
  }

  static async getFlagByKey(featureKey: string) {
    return this.resolveBundle(featureKey);
  }

  static async getFlagById(id: string) {
    const db = getDb();
    const [flag] = await db.select().from(featureFlags).where(eq(featureFlags.id, id)).limit(1);
    if (!flag) {
      return null;
    }

    const overrides = await db.select().from(featureFlagOverrides).where(eq(featureFlagOverrides.featureFlagId, flag.id)).orderBy(desc(featureFlagOverrides.createdAt));

    return {
      flag,
      overrides
    };
  }

  static async createOverride(featureFlagId: string, input: CreateFeatureFlagOverrideDto) {
    const db = getDb();
    const existing = await db.select().from(featureFlags).where(eq(featureFlags.id, featureFlagId)).limit(1);
    if (existing.length === 0) {
      throw new Error('Feature flag not found');
    }

    const targetWhere = input.userId
      ? and(
        eq(featureFlagOverrides.featureFlagId, featureFlagId),
        eq(featureFlagOverrides.userId, input.userId)
      )
      : and(
        eq(featureFlagOverrides.featureFlagId, featureFlagId),
        eq(featureFlagOverrides.organizationId, input.organizationId as string)
      );

    const [current] = await db.select().from(featureFlagOverrides).where(targetWhere).limit(1);
    const values = {
      featureFlagId,
      userId: input.userId ?? null,
      organizationId: input.organizationId ?? null,
      isEnabled: input.isEnabled,
      createdAt: new Date()
    };

    const override = current
      ? (await db.update(featureFlagOverrides).set({
        isEnabled: input.isEnabled,
        createdAt: new Date()
      }).where(eq(featureFlagOverrides.id, current.id)).returning())[0]
      : (await db.insert(featureFlagOverrides).values(values).returning())[0];

    await this.invalidate(existing[0].key);

    return override;
  }

  static async deleteOverride(featureFlagId: string, overrideId: string) {
    const db = getDb();
    const [flag] = await db.select().from(featureFlags).where(eq(featureFlags.id, featureFlagId)).limit(1);
    if (!flag) {
      throw new Error('Feature flag not found');
    }

    const deleted = await db.delete(featureFlagOverrides).where(and(
      eq(featureFlagOverrides.id, overrideId),
      eq(featureFlagOverrides.featureFlagId, featureFlagId)
    )).returning();

    if (deleted.length === 0) {
      throw new Error('Feature flag override not found');
    }

    await this.invalidate(flag.key);

    return deleted[0];
  }

  static async getFeatureDecision(userId: string, featureKey: string): Promise<FeatureFlagDecision> {
    const bundle = await this.resolveBundle(featureKey);
    if (!bundle) {
      return {
        enabled: false,
        source: 'missing',
        key: featureKey,
        flagId: null
      };
    }

    const { flag, overrides } = bundle;

    const userOverride = overrides.find((override) => override.userId === userId);
    if (userOverride) {
      return {
        enabled: userOverride.isEnabled,
        source: 'user_override',
        key: flag.key,
        flagId: flag.id
      };
    }

    const memberships = await getDb().select({ organizationId: organizationMembers.organizationId }).from(organizationMembers).where(eq(organizationMembers.userId, userId));
    const organizationIds = new Set(memberships.map((membership) => membership.organizationId));
    const organizationOverride = overrides.find((override) => override.organizationId && organizationIds.has(override.organizationId));
    if (organizationOverride) {
      return {
        enabled: organizationOverride.isEnabled,
        source: 'organization_override',
        key: flag.key,
        flagId: flag.id
      };
    }

    const experimentDecision = await this.resolveExperimentDecision(userId, featureKey);
    if (experimentDecision) {
      return {
        enabled: experimentDecision.enabled,
        source: experimentDecision.source,
        key: flag.key,
        flagId: flag.id,
        experimentId: experimentDecision.experimentId,
        variantId: experimentDecision.variantId,
        variantName: experimentDecision.variantName
      };
    }

    if (!flag.isEnabled) {
      return {
        enabled: false,
        source: 'global',
        key: flag.key,
        flagId: flag.id
      };
    }

    const scheduledRolloutAt = toDate(flag.scheduledRolloutAt);
    if (scheduledRolloutAt && scheduledRolloutAt.getTime() > Date.now()) {
      return {
        enabled: false,
        source: 'scheduled',
        key: flag.key,
        flagId: flag.id,
        rolloutPercentage: flag.rolloutPercentage
      };
    }

    if (flag.rolloutPercentage <= 0) {
      return {
        enabled: false,
        source: 'rollout',
        key: flag.key,
        flagId: flag.id,
        rolloutPercentage: flag.rolloutPercentage
      };
    }

    if (flag.rolloutPercentage >= 100) {
      return {
        enabled: true,
        source: 'rollout',
        key: flag.key,
        flagId: flag.id,
        rolloutPercentage: flag.rolloutPercentage
      };
    }

    const enabled = stablePercentage(userId, featureKey) < flag.rolloutPercentage;
    return {
      enabled,
      source: 'rollout',
      key: flag.key,
      flagId: flag.id,
      rolloutPercentage: flag.rolloutPercentage
    };
  }

  static async isFeatureEnabled(userId: string, featureKey: string) {
    const decision = await this.getFeatureDecision(userId, featureKey);
    return decision.enabled;
  }

  static async getFeatureDecisionOrThrow(userId: string, featureKey: string) {
    try {
      return await this.getFeatureDecision(userId, featureKey);
    } catch (error) {
      throw new Error(`Failed to resolve feature flag ${featureKey}: ${getErrorMessage(error)}`);
    }
  }
}