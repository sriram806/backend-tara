import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import {
  getDb,
  recommendationLogs,
  roadmapRuns,
  skillPerformance,
  userActivityLogs,
  userExams,
  userRecommendations,
  userTargetRoles
} from '@thinkai/db';
import { PersonalizationService } from './personalization.service';
import { ExperimentService } from './experiment.service';
import { FeatureFlagService } from './feature-flag.service';
import { CacheService } from './cache.service';
import { RecommendationAction, RecommendationStatus, RecommendationType } from '../schemas/recommendation.schema';

const RECOMMENDATION_CACHE_TTL_SECONDS = 300;

type RecommendationCandidate = {
  type: RecommendationType;
  title: string;
  description: string;
  priority: number;
};

type RecommendationRow = typeof userRecommendations.$inferSelect;

type RecommendationFeed = {
  recommendations: Array<{
    id: string;
    type: RecommendationType;
    title: string;
    description: string;
    priority: number;
    status: RecommendationStatus;
    createdAt: string;
  }>;
  nextBestAction: {
    id: string;
    type: RecommendationType;
    title: string;
    description: string;
    priority: number;
    status: RecommendationStatus;
    createdAt: string;
  } | null;
  dailyFeed: Array<{
    id: string;
    type: RecommendationType;
    title: string;
    description: string;
    priority: number;
    status: RecommendationStatus;
    createdAt: string;
  }>;
  smartNudges: string[];
  summary: {
    pendingCount: number;
    completedCount: number;
    dismissedCount: number;
    highPriorityCount: number;
  };
};

type RecommendationContext = {
  learningSpeed: 'slow' | 'medium' | 'fast';
  engagementScore: number;
  consistencyScore: number;
  weakSkills: string[];
  strongSkills: string[];
  targetRole: string | null;
  latestExam: {
    skillName: string;
    percentage: number;
    status: string;
    createdAt: Date;
  } | null;
  latestRoadmap: {
    status: string;
    targetRole: string;
    createdAt: Date;
  } | null;
  lastActivityAt: Date | null;
  activityCount7Days: number;
  streakDays: number;
  ignoredByType: Record<RecommendationType, number>;
  actedTitles: Set<string>;
};

function sanitizeText(value: string) {
  return value.replace(/<[^>]*>/g, ' ').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
}

function normalizeKey(value: string) {
  return sanitizeText(value).toLowerCase();
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function toIso(value: Date | string | null | undefined) {
  if (!value) {
    return new Date().toISOString();
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function daysBetween(left: Date, right: Date) {
  return Math.floor((right.getTime() - left.getTime()) / (24 * 60 * 60 * 1000));
}

function uniqueByKey(items: RecommendationCandidate[]) {
  const seen = new Set<string>();
  const output: RecommendationCandidate[] = [];

  for (const item of items) {
    const key = `${item.type}:${normalizeKey(item.title)}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(item);
  }

  return output;
}

function sortCandidates(items: RecommendationCandidate[]) {
  return [...items].sort((left, right) => {
    if (right.priority !== left.priority) {
      return right.priority - left.priority;
    }

    return normalizeKey(left.title).localeCompare(normalizeKey(right.title));
  });
}

function recommendationRevisionKey(userId: string) {
  return `recommendations:revision:${userId}`;
}

function recommendationFeedKey(userId: string, limit: number, revision: number) {
  return `recommendations:feed:${userId}:${limit}:${revision}`;
}

export class RecommendationService {
  static async getRecommendations(userId: string, options: { limit?: number; refresh?: boolean } = {}): Promise<RecommendationFeed> {
    const limit = clamp(options.limit ?? 10, 1, 20);
    if (options.refresh) {
      await this.refreshForUser(userId, 'manual');
    }

    return this.buildFeed(userId, limit);
  }

  static async refreshForUser(
    userId: string,
    reason: 'manual' | 'exam_completed' | 'roadmap_updated' | 'skill_changed' | 'activity_logged' | 'resume_updated' | 'target_role_updated' = 'manual'
  ) {
    const db = getDb();
    const context = await this.getContext(userId);
    const advancedRecommendationFeatureEnabled = await FeatureFlagService.isFeatureEnabled(userId, 'advanced_recommendations');
    const experimentContext = await ExperimentService.getExperimentContext(userId, 'recommendation');
    const recommendationStrategy: 'simple' | 'advanced' = advancedRecommendationFeatureEnabled || experimentContext.config.recommendationType === 'advanced'
      ? 'advanced'
      : 'simple';
    const candidates = await this.buildCandidates(userId, context, reason, recommendationStrategy);
    const nextCandidates = uniqueByKey(sortCandidates(candidates)).slice(0, 8);

    await db.transaction(async (tx) => {
      // Clear existing pending feed items before inserting the refreshed feed.
      // This avoids status-transition collisions with the unique index
      // (userId, type, title, status) when old pending items are later dismissed/completed.
      await tx.delete(userRecommendations)
        .where(and(eq(userRecommendations.userId, userId), eq(userRecommendations.status, 'pending')));

      for (const candidate of nextCandidates) {
        await tx.insert(userRecommendations)
          .values({
            userId,
            type: candidate.type,
            title: candidate.title,
            description: candidate.description,
            priority: candidate.priority,
            status: 'pending' as const,
            createdAt: new Date()
          })
          .onConflictDoUpdate({
            target: [
              userRecommendations.userId,
              userRecommendations.type,
              userRecommendations.title,
              userRecommendations.status
            ],
            set: {
              description: candidate.description,
              priority: candidate.priority,
              createdAt: new Date()
            }
          });
      }
    });

    await CacheService.bumpVersion(recommendationRevisionKey(userId));

    if (experimentContext.experimentId && experimentContext.variantId) {
      await ExperimentService.trackInteraction(userId, {
        experimentId: experimentContext.experimentId,
        variantId: experimentContext.variantId,
        action: 'recommendation_refresh',
        metadata: {
          reason,
          strategy: recommendationStrategy,
          featureFlags: {
            advancedRecommendationsEnabled: advancedRecommendationFeatureEnabled
          },
          recommendationCount: nextCandidates.length
        }
      }).catch(() => {
        // Best-effort tracking so recommendation generation never fails.
      });
    }

    return this.buildFeed(userId, 10);
  }

  static async recordAction(userId: string, recommendationId: string, action: RecommendationAction) {
    const db = getDb();
    const [recommendation] = await db.select().from(userRecommendations).where(and(
      eq(userRecommendations.id, recommendationId),
      eq(userRecommendations.userId, userId)
    )).limit(1);

    if (!recommendation) {
      throw new Error('Recommendation not found');
    }

    const nextStatus: RecommendationStatus = action === 'clicked' ? recommendation.status : action === 'completed' ? 'completed' : 'dismissed';

    await db.insert(recommendationLogs).values({
      userId,
      recommendationId: recommendation.id,
      action,
      createdAt: new Date()
    });

    if (action !== 'clicked') {
      await db.delete(userRecommendations)
        .where(and(
          eq(userRecommendations.userId, userId),
          eq(userRecommendations.type, recommendation.type),
          eq(userRecommendations.title, recommendation.title),
          eq(userRecommendations.status, nextStatus),
          ne(userRecommendations.id, recommendation.id)
        ));

      await db.update(userRecommendations)
        .set({
          status: nextStatus
        })
        .where(eq(userRecommendations.id, recommendation.id));
    }

    if (action === 'completed' || action === 'ignored') {
      await this.refreshForUser(userId, 'manual');
    }

    const feed = await this.buildFeed(userId, 10);
    return {
      recommendationId: recommendation.id,
      action,
      recommendation: {
        id: recommendation.id,
        type: recommendation.type,
        title: recommendation.title,
        description: recommendation.description,
        priority: recommendation.priority,
        status: nextStatus,
        createdAt: toIso(recommendation.createdAt)
      },
      nextBestAction: feed.nextBestAction,
      recommendations: feed.recommendations
    };
  }

  static async buildNextBestAction(userId: string) {
    const feed = await this.buildFeed(userId, 5);
    return feed.nextBestAction;
  }

  private static async buildFeed(userId: string, limit: number): Promise<RecommendationFeed> {
    const db = getDb();
    const revision = Number((await CacheService.getJson<number>(recommendationRevisionKey(userId))) ?? 0);
    const cacheKey = recommendationFeedKey(userId, limit, revision);
    const cached = await CacheService.getJson<RecommendationFeed>(cacheKey);
    if (cached) {
      return cached;
    }

    const recommendations = await db.select().from(userRecommendations).where(eq(userRecommendations.userId, userId)).orderBy(desc(userRecommendations.priority), desc(userRecommendations.createdAt)).limit(limit);
    const logs = await db.select({
      action: recommendationLogs.action,
      type: userRecommendations.type,
      title: userRecommendations.title,
      createdAt: recommendationLogs.createdAt
    }).from(recommendationLogs)
      .innerJoin(userRecommendations, eq(recommendationLogs.recommendationId, userRecommendations.id))
      .where(eq(recommendationLogs.userId, userId))
      .orderBy(desc(recommendationLogs.createdAt))
      .limit(40);

    const pending = recommendations.filter((item) => item.status === 'pending').map((item) => this.serialize(item));
    const completedCount = recommendations.filter((item) => item.status === 'completed').length;
    const dismissedCount = recommendations.filter((item) => item.status === 'dismissed').length;
    const highPriorityCount = pending.filter((item) => item.priority >= 4).length;

    const smartNudges = this.buildSmartNudges(pending, logs);

    const feed = {
      recommendations: pending,
      nextBestAction: pending[0] ?? null,
      dailyFeed: pending.slice(0, 3),
      smartNudges,
      summary: {
        pendingCount: pending.length,
        completedCount,
        dismissedCount,
        highPriorityCount
      }
    };

    await CacheService.setJson(cacheKey, feed, RECOMMENDATION_CACHE_TTL_SECONDS);
    return feed;
  }

  private static async getContext(userId: string): Promise<RecommendationContext> {
    const db = getDb();
    const insights = await PersonalizationService.getInsights(userId);
    const [targetRole] = await db.select().from(userTargetRoles).where(and(
      eq(userTargetRoles.userId, userId),
      eq(userTargetRoles.isCurrent, true)
    )).orderBy(desc(userTargetRoles.createdAt)).limit(1);

    const [latestExam] = await db.select().from(userExams).where(eq(userExams.userId, userId)).orderBy(desc(userExams.createdAt)).limit(1);
    const [latestRoadmap] = await db.select().from(roadmapRuns).where(eq(roadmapRuns.userId, userId)).orderBy(desc(roadmapRuns.createdAt)).limit(1);
    const activityRows = await db.select().from(userActivityLogs).where(eq(userActivityLogs.userId, userId)).orderBy(desc(userActivityLogs.createdAt)).limit(60);
    const performanceRows = await db.select().from(skillPerformance).where(eq(skillPerformance.userId, userId)).orderBy(desc(skillPerformance.updatedAt));
    const recentLogs = await db.select({
      action: recommendationLogs.action,
      type: userRecommendations.type,
      title: userRecommendations.title,
      createdAt: recommendationLogs.createdAt
    }).from(recommendationLogs)
      .innerJoin(userRecommendations, eq(recommendationLogs.recommendationId, userRecommendations.id))
      .where(eq(recommendationLogs.userId, userId))
      .orderBy(desc(recommendationLogs.createdAt))
      .limit(60);

    const ignoredByType: Record<RecommendationType, number> = {
      skill: 0,
      task: 0,
      exam: 0,
      project: 0
    };
    const actedTitles = new Set<string>();

    for (const log of recentLogs) {
      const key = `${log.type}:${normalizeKey(log.title)}`;
      if (log.action === 'completed' || log.action === 'ignored') {
        actedTitles.add(key);
      }

      if (log.action === 'ignored') {
        ignoredByType[log.type] += 1;
      }
    }

    const activityDates = activityRows.map((row) => new Date(row.createdAt).toISOString().slice(0, 10));
    const activityCount7Days = activityRows.filter((row) => daysBetween(new Date(row.createdAt), new Date()) <= 7).length;
    const lastActivityAt = activityRows[0]?.createdAt ? new Date(activityRows[0].createdAt) : null;
    const streakDays = this.calculateStreak(activityDates);
    const weakSkills = insights.weakSkills.slice(0, 4);
    const strongSkills = insights.strongSkills.slice(0, 4);

    return {
      learningSpeed: insights.learningSpeed,
      engagementScore: insights.features.engagementScore,
      consistencyScore: insights.features.consistencyScore,
      weakSkills,
      strongSkills,
      targetRole: targetRole?.title ?? null,
      latestExam: latestExam ? {
        skillName: latestExam.skillName,
        percentage: latestExam.percentage,
        status: latestExam.status,
        createdAt: new Date(latestExam.createdAt)
      } : null,
      latestRoadmap: latestRoadmap ? {
        status: latestRoadmap.status,
        targetRole: latestRoadmap.targetRole,
        createdAt: new Date(latestRoadmap.createdAt)
      } : null,
      lastActivityAt,
      activityCount7Days,
      streakDays,
      ignoredByType,
      actedTitles
    };
  }

  private static async buildCandidates(
    userId: string,
    context: RecommendationContext,
    reason: string,
    recommendationMode: 'simple' | 'advanced'
  ) {
    const candidates: RecommendationCandidate[] = [];
    const weakPerformanceRows = await getDb().select().from(skillPerformance).where(and(
      eq(skillPerformance.userId, userId),
      inArray(skillPerformance.skillName, context.weakSkills.length ? context.weakSkills : [''])
    )).orderBy(desc(skillPerformance.updatedAt));

    for (const row of weakPerformanceRows.slice(0, 3)) {
      const severity = row.avgScore < 45 || row.lastScore < 45 ? 5 : row.avgScore < 65 ? 4 : 3;
      const title = `Learn ${row.skillName}`;
      candidates.push({
        type: 'skill',
        title,
        description: this.buildSkillDescription(row.skillName, context.learningSpeed, row.lastScore, reason),
        priority: this.adjustPriority(severity, 'skill', context)
      });

      if (row.lastScore < 85) {
        candidates.push({
          type: 'exam',
          title: `Retake ${row.skillName} test`,
          description: this.buildExamDescription(row.skillName, row.lastScore, context.learningSpeed),
          priority: this.adjustPriority(row.lastScore < 55 ? 5 : 4, 'exam', context)
        });
      }
    }

    if (context.latestExam) {
      const score = context.latestExam.percentage;
      if (score < 60) {
        candidates.push({
          type: 'task',
          title: `Complete 5 practice problems on ${context.latestExam.skillName}`,
          description: 'Use short, focused repetition before the retest so the same mistakes do not repeat.',
          priority: this.adjustPriority(5, 'task', context)
        });
      } else if (score >= 85) {
        candidates.push({
          type: 'project',
          title: `Build a mini project with ${context.latestExam.skillName}`,
          description: 'Apply the strong skill in a real deliverable so the knowledge sticks beyond exam mode.',
          priority: this.adjustPriority(4, 'project', context)
        });
      }
    }

    if (context.latestRoadmap && context.latestRoadmap.status !== 'completed') {
      candidates.push({
        type: 'task',
        title: `Continue your ${context.latestRoadmap.targetRole} roadmap`,
        description: context.learningSpeed === 'slow'
          ? 'Work on the next small roadmap step and keep the scope narrow.'
          : 'Push the next roadmap milestone forward and keep momentum.',
        priority: this.adjustPriority(4, 'task', context)
      });
    }

    if (context.activityCount7Days <= 1 || (!context.lastActivityAt || daysBetween(context.lastActivityAt, new Date()) >= 3)) {
      candidates.push({
        type: 'task',
        title: 'Complete one short practice session today',
        description: 'A 10-15 minute session is enough to keep the loop active and build consistency.',
        priority: this.adjustPriority(4, 'task', context)
      });
    }

    if (context.streakDays >= 3) {
      candidates.push({
        type: 'task',
        title: 'Protect your streak with one review block',
        description: 'Keep the streak alive with a quick review or one solved problem.',
        priority: this.adjustPriority(3, 'task', context)
      });
    }

    if (context.activityCount7Days >= 5 && context.learningSpeed !== 'slow') {
      candidates.push({
        type: 'project',
        title: context.targetRole ? `Build a ${context.targetRole} project` : 'Build a portfolio project',
        description: 'Use your current momentum to create one project that combines multiple weak and strong skills.',
        priority: this.adjustPriority(4, 'project', context)
      });
    }

    if (context.strongSkills.length > 0) {
      candidates.push({
        type: 'skill',
        title: `Expand ${context.strongSkills[0]} into an advanced workflow`,
        description: 'Move from correctness into speed, architecture, and production-ready trade-offs.',
        priority: this.adjustPriority(3, 'skill', context)
      });
    }

    if (recommendationMode === 'advanced') {
      candidates.push({
        type: 'project',
        title: 'Run an advanced interview simulation project',
        description: 'Combine roadmap, exam patterns, and system design in one timed simulation.',
        priority: this.adjustPriority(4, 'project', context)
      });
    }

    if (candidates.length === 0) {
      candidates.push({
        type: 'task',
        title: 'Review your next best step',
        description: 'Open your roadmap, review weak skills, and start with one focused practice block.',
        priority: 2
      });
    }

    const filtered = candidates.filter((candidate) => {
      const key = `${candidate.type}:${normalizeKey(candidate.title)}`;
      return !context.actedTitles.has(key) && candidate.priority > 0 && candidate.priority <= 5 && context.ignoredByType[candidate.type] < 4;
    });

    if (recommendationMode === 'simple') {
      return filtered.filter((candidate) => candidate.type !== 'project').slice(0, 6);
    }

    return filtered;
  }

  private static adjustPriority(basePriority: number, type: RecommendationType, context: RecommendationContext) {
    let priority = basePriority;

    if (context.learningSpeed === 'slow') {
      if (type === 'task' || type === 'skill') {
        priority += 1;
      }
      if (type === 'project') {
        priority -= 1;
      }
    }

    if (context.learningSpeed === 'fast') {
      if (type === 'project' || type === 'exam') {
        priority += 1;
      }
      if (type === 'task' && context.engagementScore > 70) {
        priority -= 1;
      }
    }

    if (context.engagementScore < 40) {
      if (type === 'task') {
        priority += 1;
      }
      if (type === 'project') {
        priority -= 1;
      }
    }

    if (context.engagementScore > 75 && context.streakDays >= 3 && type === 'project') {
      priority += 1;
    }

    if (context.ignoredByType[type] >= 2) {
      priority -= 1;
    }

    return clamp(priority, 1, 5);
  }

  private static buildSkillDescription(skillName: string, learningSpeed: string, lastScore: number, reason: string) {
    const pace = learningSpeed === 'slow'
      ? 'keep the scope small and repeat the basics'
      : learningSpeed === 'fast'
        ? 'skip the easy parts and move to practical edge cases'
        : 'balance review with one practical challenge';

    return `Your recent ${skillName} performance is ${lastScore}%. ${pace}. Triggered by ${reason}.`;
  }

  private static buildExamDescription(skillName: string, lastScore: number, learningSpeed: string) {
    if (lastScore < 55) {
      return `The last ${skillName} exam was below passing. Practice the gap areas and retake soon.`;
    }

    if (learningSpeed === 'fast') {
      return `You are moving quickly on ${skillName}. Retake with a harder setting to confirm the skill.`;
    }

    return `Retake ${skillName} after one focused review session to lock in the improvement.`;
  }

  private static buildSmartNudges(pending: Array<{ type: RecommendationType; title: string; priority: number }>, logs: Array<{ action: RecommendationAction; type: RecommendationType }>) {
    const nudges: string[] = [];
    const highPriority = pending.filter((item) => item.priority >= 4);
    if (highPriority.length > 0) {
      nudges.push(`Next best action: ${highPriority[0].title}`);
    }

    const ignored = logs.filter((log) => log.action === 'ignored').length;
    if (ignored >= 2) {
      nudges.push('You have been ignoring some suggestions. The feed will shift toward smaller, clearer steps.');
    }

    const completed = logs.filter((log) => log.action === 'completed').length;
    if (completed >= 3) {
      nudges.push('You are completing recommendations regularly. Time to stretch into a harder challenge.');
    }

    if (!nudges.length && pending.length > 0) {
      nudges.push(`Start with ${pending[0].title} and keep the session under 20 minutes.`);
    }

    return nudges.slice(0, 3);
  }

  private static calculateStreak(activityDates: string[]) {
    if (!activityDates.length) {
      return 0;
    }

    const uniqueDates = Array.from(new Set(activityDates)).sort((left, right) => right.localeCompare(left));
    let streak = 0;
    let cursor = new Date();

    for (const date of uniqueDates) {
      const expected = cursor.toISOString().slice(0, 10);
      if (date !== expected) {
        const previousDay = new Date(cursor);
        previousDay.setDate(previousDay.getDate() - 1);
        if (date === previousDay.toISOString().slice(0, 10) && streak === 0) {
          streak += 1;
          cursor = previousDay;
          continue;
        }
        break;
      }

      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    return streak;
  }

  private static serialize(row: RecommendationRow) {
    return {
      id: row.id,
      type: row.type as RecommendationType,
      title: row.title,
      description: row.description,
      priority: row.priority,
      status: row.status as RecommendationStatus,
      createdAt: toIso(row.createdAt)
    };
  }
}
