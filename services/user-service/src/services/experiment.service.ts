import crypto from 'node:crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  experimentVariants,
  experiments,
  getDb,
  userExperimentAssignments
} from '@thinkai/db';
import { redisClient } from '../queues/connection';
import { UserEventModel } from '../models/user-event.model';
import {
  CreateExperimentDto,
  ExperimentStatus,
  ExperimentType,
  TrackExperimentDto
} from '../schemas/experiment.schema';
import { AnalyticsService } from './analytics.service';

type ExperimentConfig = {
  roadmapVersion: 'v1' | 'v2';
  examDifficulty: 'fixed' | 'adaptive';
  recommendationType: 'simple' | 'advanced';
};

type ActiveExperimentWithVariants = {
  experiment: typeof experiments.$inferSelect;
  variants: Array<typeof experimentVariants.$inferSelect>;
};

type LeanEvent = {
  userId: string;
  eventType: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
};

const EXPERIMENT_CACHE_PREFIX = 'exp:assignment';
const CACHE_TTL_SECONDS = 60 * 60 * 6;

const DEFAULT_CONFIG: ExperimentConfig = {
  roadmapVersion: 'v1',
  examDifficulty: 'fixed',
  recommendationType: 'simple'
};

function normalizeConfig(config: Record<string, unknown>): ExperimentConfig {
  const roadmapVersion = config.roadmap_version === 'v2' ? 'v2' : DEFAULT_CONFIG.roadmapVersion;
  const examDifficulty = config.exam_difficulty === 'adaptive' ? 'adaptive' : DEFAULT_CONFIG.examDifficulty;
  const recommendationType = config.recommendation_type === 'advanced' ? 'advanced' : DEFAULT_CONFIG.recommendationType;

  return {
    roadmapVersion,
    examDifficulty,
    recommendationType
  };
}

function assignmentCacheKey(userId: string, experimentId: string) {
  return `${EXPERIMENT_CACHE_PREFIX}:${userId}:${experimentId}`;
}

function stableVariantIndex(userId: string, experimentId: string, variantCount: number) {
  const hash = crypto.createHash('sha256').update(`${userId}:${experimentId}`).digest('hex');
  const value = parseInt(hash.slice(0, 12), 16);
  return value % variantCount;
}

function getString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const next = value.trim();
  return next ? next : null;
}

function getBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return null;
}

async function listActiveExperimentsByType(type?: ExperimentType): Promise<ActiveExperimentWithVariants[]> {
  const db = getDb();
  const activeExperiments = await db.select()
    .from(experiments)
    .where(type
      ? and(eq(experiments.status, 'active'), eq(experiments.type, type))
      : eq(experiments.status, 'active'))
    .orderBy(desc(experiments.createdAt));

  if (!activeExperiments.length) {
    return [];
  }

  const variants = await db.select().from(experimentVariants).where(inArray(
    experimentVariants.experimentId,
    activeExperiments.map((row) => row.id)
  ));

  const byExperiment = new Map<string, Array<typeof experimentVariants.$inferSelect>>();
  for (const variant of variants) {
    const bucket = byExperiment.get(variant.experimentId) ?? [];
    bucket.push(variant);
    byExperiment.set(variant.experimentId, bucket);
  }

  return activeExperiments
    .map((experiment) => ({
      experiment,
      variants: byExperiment.get(experiment.id) ?? []
    }))
    .filter((item) => item.variants.length > 0);
}

export class ExperimentService {
  static async createExperiment(input: CreateExperimentDto, createdBy: string | null) {
    const db = getDb();
    const now = new Date();

    const [createdExperiment] = await db.insert(experiments).values({
      name: input.name,
      description: input.description,
      type: input.type,
      status: input.status,
      createdBy,
      createdAt: now,
      updatedAt: now
    }).returning();

    const createdVariants = await db.insert(experimentVariants).values(
      input.variants.map((variant) => ({
        experimentId: createdExperiment.id,
        variantName: variant.variantName,
        config: variant.config,
        createdAt: now
      }))
    ).returning();

    return {
      experiment: createdExperiment,
      variants: createdVariants
    };
  }

  static async updateStatus(experimentId: string, status: ExperimentStatus) {
    const db = getDb();
    const [updated] = await db.update(experiments)
      .set({
        status,
        updatedAt: new Date()
      })
      .where(eq(experiments.id, experimentId))
      .returning();

    if (!updated) {
      throw new Error('Experiment not found');
    }

    return updated;
  }

  static async listExperiments() {
    const db = getDb();
    const rows = await db.select().from(experiments).orderBy(desc(experiments.createdAt));

    if (!rows.length) {
      return [];
    }

    const variants = await db.select().from(experimentVariants).where(inArray(
      experimentVariants.experimentId,
      rows.map((row) => row.id)
    ));

    const assignments = await db.select().from(userExperimentAssignments).where(inArray(
      userExperimentAssignments.experimentId,
      rows.map((row) => row.id)
    ));

    const variantsByExperiment = new Map<string, Array<typeof experimentVariants.$inferSelect>>();
    for (const variant of variants) {
      const bucket = variantsByExperiment.get(variant.experimentId) ?? [];
      bucket.push(variant);
      variantsByExperiment.set(variant.experimentId, bucket);
    }

    const assignmentsByExperiment = new Map<string, number>();
    for (const assignment of assignments) {
      assignmentsByExperiment.set(
        assignment.experimentId,
        (assignmentsByExperiment.get(assignment.experimentId) ?? 0) + 1
      );
    }

    return rows.map((row) => ({
      ...row,
      assignmentCount: assignmentsByExperiment.get(row.id) ?? 0,
      variants: variantsByExperiment.get(row.id) ?? []
    }));
  }

  static async getAssignedVariant(userId: string, type?: ExperimentType) {
    const activeExperiments = await listActiveExperimentsByType(type);
    if (!activeExperiments.length) {
      return {
        experimentId: null,
        variantId: null,
        variant: 'default',
        config: DEFAULT_CONFIG
      };
    }

    const selected = activeExperiments[0];
    const variant = await this.resolveAssignment(userId, selected);
    const normalized = normalizeConfig((variant?.config ?? {}) as Record<string, unknown>);

    return {
      experimentId: selected.experiment.id,
      variantId: variant?.id ?? null,
      variant: variant?.variantName ?? 'default',
      config: normalized,
      experimentType: selected.experiment.type
    };
  }

  static async getMergedConfig(userId: string) {
    const merged: ExperimentConfig = { ...DEFAULT_CONFIG };
    const assignments = await Promise.all([
      this.getAssignedVariant(userId, 'roadmap'),
      this.getAssignedVariant(userId, 'exam'),
      this.getAssignedVariant(userId, 'recommendation')
    ]);

    for (const assignment of assignments) {
      if (assignment.experimentType === 'roadmap') {
        merged.roadmapVersion = assignment.config.roadmapVersion;
      }
      if (assignment.experimentType === 'exam') {
        merged.examDifficulty = assignment.config.examDifficulty;
      }
      if (assignment.experimentType === 'recommendation') {
        merged.recommendationType = assignment.config.recommendationType;
      }
    }

    return merged;
  }

  static async trackInteraction(userId: string, input: TrackExperimentDto) {
    const db = getDb();
    const [experiment] = await db.select().from(experiments).where(eq(experiments.id, input.experimentId)).limit(1);
    if (!experiment) {
      throw new Error('Experiment not found');
    }

    const [assignment] = await db.select().from(userExperimentAssignments).where(and(
      eq(userExperimentAssignments.userId, userId),
      eq(userExperimentAssignments.experimentId, input.experimentId)
    )).limit(1);

    if (!assignment) {
      throw new Error('User is not assigned to this experiment');
    }

    if (input.variantId && input.variantId !== assignment.variantId) {
      throw new Error('Provided variant does not match user assignment');
    }

    await AnalyticsService.logEvent(userId, 'task_completed', {
      area: 'experiment',
      action: input.action,
      experimentId: input.experimentId,
      variantId: assignment.variantId,
      experimentType: experiment.type,
      ...input.metadata
    });

    return {
      tracked: true,
      experimentId: input.experimentId,
      variantId: assignment.variantId,
      action: input.action
    };
  }

  static async getExperimentResults(experimentId?: string) {
    const db = getDb();
    const rows = experimentId
      ? await db.select().from(experiments).where(eq(experiments.id, experimentId)).limit(1)
      : await db.select().from(experiments).orderBy(desc(experiments.createdAt));

    if (!rows.length) {
      return [];
    }

    const ids = rows.map((row) => row.id);
    const variants = await db.select().from(experimentVariants).where(inArray(experimentVariants.experimentId, ids));
    const assignments = await db.select().from(userExperimentAssignments).where(inArray(userExperimentAssignments.experimentId, ids));

    const events = await UserEventModel.find({
      'metadata.experimentId': { $in: ids }
    }).select('userId eventType metadata createdAt').lean<LeanEvent[]>();

    const variantsByExperiment = new Map<string, Array<typeof experimentVariants.$inferSelect>>();
    for (const variant of variants) {
      const bucket = variantsByExperiment.get(variant.experimentId) ?? [];
      bucket.push(variant);
      variantsByExperiment.set(variant.experimentId, bucket);
    }

    const assignmentsByExperiment = new Map<string, Array<typeof userExperimentAssignments.$inferSelect>>();
    for (const assignment of assignments) {
      const bucket = assignmentsByExperiment.get(assignment.experimentId) ?? [];
      bucket.push(assignment);
      assignmentsByExperiment.set(assignment.experimentId, bucket);
    }

    return rows.map((experiment) => {
      const experimentVariantsRows = variantsByExperiment.get(experiment.id) ?? [];
      const experimentAssignments = assignmentsByExperiment.get(experiment.id) ?? [];
      const assignmentsByVariant = new Map<string, Set<string>>();

      for (const assignment of experimentAssignments) {
        const users = assignmentsByVariant.get(assignment.variantId) ?? new Set<string>();
        users.add(assignment.userId);
        assignmentsByVariant.set(assignment.variantId, users);
      }

      const variantResults = experimentVariantsRows.map((variant) => {
        const variantUsers = assignmentsByVariant.get(variant.id) ?? new Set<string>();
        const variantEvents = events.filter((event) => {
          const eventExperimentId = getString(event.metadata.experimentId);
          const eventVariantId = getString(event.metadata.variantId);
          return eventExperimentId === experiment.id && eventVariantId === variant.id;
        });

        const activeUsers = new Set(variantEvents.map((event) => event.userId));
        const completionUsers = new Set<string>();
        const passUsers = new Set<string>();
        const activityByUser = new Map<string, number>();

        for (const event of variantEvents) {
          activityByUser.set(event.userId, (activityByUser.get(event.userId) ?? 0) + 1);
          if (
            event.eventType === 'task_completed'
            || event.eventType === 'project_completed'
          ) {
            completionUsers.add(event.userId);
          }

          if (event.eventType === 'exam_completed' && getBoolean(event.metadata.passed)) {
            passUsers.add(event.userId);
          }
        }

        const retainedUsers = new Set(
          Array.from(activityByUser.entries())
            .filter(([, count]) => count >= 2)
            .map(([userId]) => userId)
        );

        const assignedCount = variantUsers.size;
        const engagementCount = activeUsers.size;
        const completionCount = completionUsers.size;
        const passCount = passUsers.size;
        const retainedCount = retainedUsers.size;

        const denominator = Math.max(assignedCount, 1);

        return {
          variantId: variant.id,
          variantName: variant.variantName,
          assignedUsers: assignedCount,
          engagement: {
            users: engagementCount,
            rate: Math.round((engagementCount / denominator) * 100)
          },
          completionRate: Math.round((completionCount / denominator) * 100),
          examPassRate: Math.round((passCount / denominator) * 100),
          retentionRate: Math.round((retainedCount / denominator) * 100)
        };
      });

      const winner = [...variantResults].sort((left, right) => {
        if (right.completionRate !== left.completionRate) {
          return right.completionRate - left.completionRate;
        }
        if (right.examPassRate !== left.examPassRate) {
          return right.examPassRate - left.examPassRate;
        }
        return right.engagement.rate - left.engagement.rate;
      })[0] ?? null;

      return {
        experiment,
        variants: variantResults,
        winner: winner ? {
          variantId: winner.variantId,
          variantName: winner.variantName,
          completionRate: winner.completionRate,
          examPassRate: winner.examPassRate,
          engagementRate: winner.engagement.rate
        } : null
      };
    });
  }

  static async getExperimentContext(userId: string, type: ExperimentType) {
    const assignment = await this.getAssignedVariant(userId, type);
    return {
      experimentId: assignment.experimentId,
      variantId: assignment.variantId,
      variantName: assignment.variant,
      config: assignment.config,
      experimentType: assignment.experimentType
    };
  }

  private static async resolveAssignment(
    userId: string,
    payload: ActiveExperimentWithVariants
  ) {
    const db = getDb();
    const cacheKey = assignmentCacheKey(userId, payload.experiment.id);

    const cached = await redisClient.get(cacheKey);
    if (cached) {
      const variant = payload.variants.find((row) => row.id === cached);
      if (variant) {
        return variant;
      }
    }

    const [existing] = await db.select().from(userExperimentAssignments).where(and(
      eq(userExperimentAssignments.userId, userId),
      eq(userExperimentAssignments.experimentId, payload.experiment.id)
    )).limit(1);

    if (existing) {
      await redisClient.set(cacheKey, existing.variantId, 'EX', CACHE_TTL_SECONDS);
      return payload.variants.find((row) => row.id === existing.variantId) ?? payload.variants[0];
    }

    const sortedVariants = [...payload.variants].sort((left, right) => left.variantName.localeCompare(right.variantName));
    const selectedVariant = sortedVariants[stableVariantIndex(userId, payload.experiment.id, sortedVariants.length)] ?? sortedVariants[0];

    await db.insert(userExperimentAssignments).values({
      userId,
      experimentId: payload.experiment.id,
      variantId: selectedVariant.id,
      assignedAt: new Date()
    });

    await redisClient.set(cacheKey, selectedVariant.id, 'EX', CACHE_TTL_SECONDS);

    await AnalyticsService.logEvent(userId, 'task_completed', {
      area: 'experiment',
      action: 'assignment_created',
      experimentId: payload.experiment.id,
      variantId: selectedVariant.id,
      variantName: selectedVariant.variantName,
      experimentType: payload.experiment.type
    });

    return selectedVariant;
  }
}
