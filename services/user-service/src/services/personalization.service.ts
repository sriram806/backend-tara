import crypto from 'node:crypto';
import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import {
  getDb,
  skillPerformance,
  skillProgress,
  userActivityLogs,
  userExams,
  userFeatures,
  userTargetRoles
} from '@thinkai/db';
import { UserActivityDto } from '../schemas/personalization.schema';

export type LearningSpeed = 'slow' | 'medium' | 'fast';
export type SkillIntensity = 'weak' | 'improving' | 'strong';

type SkillSnapshot = {
  skillName: string;
  attempts: number;
  avgScore: number;
  lastScore: number;
  status: SkillIntensity;
};

type InsightResult = {
  learningSpeed: LearningSpeed;
  weakSkills: string[];
  strongSkills: string[];
  recommendations: string[];
  dailyPlan: Array<{ title: string; description: string; type: string }>;
  burnoutRisk: 'low' | 'medium' | 'high';
  adaptiveDeadlines: Array<{ skillName: string; suggestedDays: number; reason: string }>;
  features: {
    consistencyScore: number;
    engagementScore: number;
    lastActiveAt: string | null;
  };
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeAction(action: string) {
  return action.trim().toLowerCase().replace(/[^a-z0-9_:-]+/g, '_');
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function anonymizeValue(value: unknown): unknown {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }

    if (trimmed.length > 180) {
      return `${trimmed.slice(0, 72)}...`;
    }

    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return crypto.createHash('sha256').update(trimmed.toLowerCase()).digest('hex');
    }

    return trimmed;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => anonymizeValue(item));
  }

  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const normalizedKey = key.toLowerCase();
      if (['email', 'password', 'otp', 'token', 'secret'].some((blocked) => normalizedKey.includes(blocked))) {
        output[key] = '[redacted]';
        continue;
      }

      output[key] = anonymizeValue(nested);
    }
    return output;
  }

  return value;
}

function summarizeActivityCount(activityCounts: Map<string, number>, windowDays: number) {
  const total = Array.from(activityCounts.values()).reduce((sum, count) => sum + count, 0);
  const activeDays = activityCounts.size;
  const consistencyScore = windowDays > 0 ? Math.round((activeDays / windowDays) * 100) : 0;
  const engagementScore = clamp(Math.round((total * 6) + (activeDays * 10)), 0, 100);
  return { total, activeDays, consistencyScore, engagementScore };
}

export class PersonalizationService {
  static async recordActivity(userId: string, input: UserActivityDto) {
    const db = getDb();
    const createdAt = new Date();
    const action = normalizeAction(input.action);
    const metadata = anonymizeValue(input.metadata) as Record<string, unknown>;

    await db.insert(userActivityLogs).values({
      userId,
      action,
      metadata,
      createdAt
    });

    await this.refreshFeatures(userId, createdAt, input.durationSeconds ?? 0);

    return this.getInsights(userId);
  }

  static async recordExamOutcome(
    userId: string,
    skillName: string,
    percentage: number,
    details: {
      timeLimitSeconds?: number;
      attemptNumber?: number;
      durationSeconds?: number;
      organizationId?: string | null;
    } = {}
  ) {
    const normalizedSkill = skillName.trim().replace(/\s+/g, ' ');
    const db = getDb();
    const now = new Date();

    await db.insert(userActivityLogs).values({
      userId,
      action: 'exam',
      metadata: anonymizeValue({
        skillName: normalizedSkill,
        percentage,
        attemptNumber: details.attemptNumber,
        durationSeconds: details.durationSeconds,
        organizationId: details.organizationId ?? undefined
      }) as Record<string, unknown>,
      createdAt: now
    });

    const [existing] = await db.select().from(skillPerformance).where(and(
      eq(skillPerformance.userId, userId),
      eq(skillPerformance.skillName, normalizedSkill)
    )).limit(1);

    const attempts = (existing?.attempts ?? 0) + 1;
    const prevAvg = existing?.avgScore ?? 0;
    const avgScore = Math.round(((prevAvg * (attempts - 1)) + percentage) / attempts);
    const status = this.resolveSkillStatus(attempts, avgScore, percentage);

    if (existing) {
      await db.update(skillPerformance)
        .set({
          attempts,
          avgScore,
          lastScore: percentage,
          status,
          updatedAt: now
        })
        .where(eq(skillPerformance.id, existing.id));
    } else {
      await db.insert(skillPerformance).values({
        userId,
        skillName: normalizedSkill,
        attempts,
        avgScore,
        lastScore: percentage,
        status,
        updatedAt: now,
        createdAt: now
      });
    }

    await this.refreshFeatures(userId, now, details.durationSeconds ?? 0);
    return this.getInsights(userId);
  }

  static async recordTaskCompletion(userId: string, action: 'task_complete' | 'task_started' | 'roadmap_generated' | 'resume_saved' | 'profile_view' | 'insight_view' | 'reminder_opened', metadata: Record<string, unknown> = {}, durationSeconds = 0) {
    const db = getDb();
    const now = new Date();
    await db.insert(userActivityLogs).values({
      userId,
      action,
      metadata: anonymizeValue(metadata) as Record<string, unknown>,
      createdAt: now
    });

    await this.refreshFeatures(userId, now, durationSeconds);
    return this.getInsights(userId);
  }

  static async getInsights(userId: string): Promise<InsightResult> {
    const db = getDb();
    const [featureRow] = await db.select().from(userFeatures).where(eq(userFeatures.userId, userId)).limit(1);
    const performanceRows = await db.select().from(skillPerformance).where(eq(skillPerformance.userId, userId));
    const recentActivities = await db.select().from(userActivityLogs)
      .where(eq(userActivityLogs.userId, userId))
      .orderBy(desc(userActivityLogs.createdAt))
      .limit(50);

    const learningSpeed = featureRow?.learningSpeed ?? this.deriveLearningSpeed(performanceRows, recentActivities);
    const weakSkills = performanceRows.filter((row) => row.status === 'weak').map((row) => row.skillName).slice(0, 8);
    const strongSkills = performanceRows.filter((row) => row.status === 'strong').map((row) => row.skillName).slice(0, 8);
    const recommendations = this.buildRecommendations(learningSpeed, weakSkills, strongSkills, recentActivities);
    const dailyPlan = this.buildDailyPlan(learningSpeed, weakSkills, strongSkills);
    const burnoutRisk = this.estimateBurnoutRisk(featureRow?.engagementScore ?? 0, recentActivities);
    const adaptiveDeadlines = this.buildAdaptiveDeadlines(performanceRows, learningSpeed);

    return {
      learningSpeed,
      weakSkills,
      strongSkills,
      recommendations,
      dailyPlan,
      burnoutRisk,
      adaptiveDeadlines,
      features: {
        consistencyScore: featureRow?.consistencyScore ?? 0,
        engagementScore: featureRow?.engagementScore ?? 0,
        lastActiveAt: featureRow?.lastActiveAt ? new Date(featureRow.lastActiveAt).toISOString() : null
      }
    };
  }

  static async getRoadmapContext(
    userId: string,
    context: {
      analysisRunId: string;
      targetRole: string;
      durationDays: number;
    }
  ) {
    const insights = await this.getInsights(userId);
    return {
      learningSpeed: insights.learningSpeed,
      weakSkills: insights.weakSkills,
      strongSkills: insights.strongSkills,
      recommendations: insights.recommendations,
      consistencyScore: insights.features.consistencyScore,
      engagementScore: insights.features.engagementScore,
      adaptiveDeadlineDays: insights.adaptiveDeadlines.slice(0, 5),
      analysisRunId: context.analysisRunId,
      targetRole: context.targetRole,
      durationDays: context.durationDays,
      repetitionMultiplier: insights.learningSpeed === 'slow' ? 2 : insights.learningSpeed === 'fast' ? 0.75 : 1,
      difficultyShift: insights.learningSpeed === 'fast' ? 1 : insights.learningSpeed === 'slow' ? -1 : 0,
      dailyPlan: insights.dailyPlan
    };
  }

  static async recommendExamDifficulty(userId: string, skillName: string, fallbackDifficulty = 2) {
    const db = getDb();
    const [performance] = await db.select().from(skillPerformance).where(and(
      eq(skillPerformance.userId, userId),
      eq(skillPerformance.skillName, skillName.trim().replace(/\s+/g, ' '))
    )).limit(1);

    if (!performance) {
      return fallbackDifficulty;
    }

    if (performance.status === 'strong' && performance.avgScore >= 80) {
      return Math.min(3, fallbackDifficulty + 1);
    }

    if (performance.status === 'weak' && performance.lastScore < 55) {
      return Math.max(1, fallbackDifficulty - 1);
    }

    return fallbackDifficulty;
  }

  static async getSkillSnapshot(userId: string) {
    const db = getDb();
    const rows = await db.select().from(skillPerformance).where(eq(skillPerformance.userId, userId));
    return rows.map((row) => ({
      skillName: row.skillName,
      attempts: row.attempts,
      avgScore: row.avgScore,
      lastScore: row.lastScore,
      status: row.status
    }));
  }

  private static async refreshFeatures(userId: string, lastActiveAt: Date, durationSeconds: number) {
    const db = getDb();
    const activityRows = await db.select().from(userActivityLogs).where(eq(userActivityLogs.userId, userId)).orderBy(desc(userActivityLogs.createdAt)).limit(30);
    const activityCounts = new Map<string, number>();
    const today = new Date();
    for (const row of activityRows) {
      const dayKey = new Date(row.createdAt).toISOString().slice(0, 10);
      activityCounts.set(dayKey, (activityCounts.get(dayKey) ?? 0) + 1);
    }

    const windowDays = Math.max(1, Math.min(30, new Set(activityRows.map((row) => new Date(row.createdAt).toISOString().slice(0, 10))).size || 1));
    const summary = summarizeActivityCount(activityCounts, windowDays);
    const performanceRows = await db.select().from(skillPerformance).where(eq(skillPerformance.userId, userId));
    const learningSpeed = this.deriveLearningSpeed(performanceRows, activityRows);
    const consistencyScore = clamp(summary.consistencyScore, 0, 100);
    const engagementScore = clamp(Math.round((summary.engagementScore * 0.7) + Math.min(durationSeconds / 60, 30) * 2), 0, 100);

    const [existing] = await db.select().from(userFeatures).where(eq(userFeatures.userId, userId)).limit(1);
    if (existing) {
      await db.update(userFeatures)
        .set({
          learningSpeed,
          consistencyScore,
          engagementScore,
          lastActiveAt,
          updatedAt: today
        })
        .where(eq(userFeatures.id, existing.id));
    } else {
      await db.insert(userFeatures).values({
        userId,
        learningSpeed,
        consistencyScore,
        engagementScore,
        lastActiveAt,
        createdAt: today,
        updatedAt: today
      });
    }
  }

  private static deriveLearningSpeed(performanceRows: Array<{ attempts: number; avgScore: number; lastScore: number }>, activityRows: Array<{ createdAt: Date | string }>) : LearningSpeed {
    if (!performanceRows.length) {
      return activityRows.length > 18 ? 'medium' : 'slow';
    }

    const avgScore = performanceRows.reduce((sum, row) => sum + row.avgScore, 0) / performanceRows.length;
    const lastScore = performanceRows.reduce((sum, row) => sum + row.lastScore, 0) / performanceRows.length;
    const attempts = performanceRows.reduce((sum, row) => sum + row.attempts, 0);
    const activityDays = new Set(activityRows.map((row) => new Date(row.createdAt).toISOString().slice(0, 10))).size;
    const scoreDelta = lastScore - avgScore;

    if ((avgScore >= 82 && attempts <= 4 && activityDays >= 8) || scoreDelta >= 10) {
      return 'fast';
    }

    if (avgScore >= 60 || activityDays >= 5 || scoreDelta >= 0) {
      return 'medium';
    }

    return 'slow';
  }

  private static resolveSkillStatus(attempts: number, avgScore: number, lastScore: number): SkillIntensity {
    if (avgScore >= 80 && lastScore >= 80 && attempts >= 2) {
      return 'strong';
    }

    if (avgScore >= 60 || lastScore >= 60) {
      return 'improving';
    }

    return 'weak';
  }

  private static buildRecommendations(learningSpeed: LearningSpeed, weakSkills: string[], strongSkills: string[], activityRows: Array<{ action: string }>) {
    const recommendations: string[] = [];

    if (weakSkills.length) {
      recommendations.push(`Focus on ${weakSkills.slice(0, 3).join(', ')} before broadening into new topics.`);
    }

    if (learningSpeed === 'slow') {
      recommendations.push('Use smaller daily goals with repetition and review checkpoints.');
    } else if (learningSpeed === 'fast') {
      recommendations.push('Skip fundamentals where possible and move quickly into harder practice.');
    } else {
      recommendations.push('Maintain a balanced pace with alternating practice and review sessions.');
    }

    const taskCompletions = activityRows.filter((row) => row.action === 'task_complete').length;
    if (taskCompletions < 3) {
      recommendations.push('Increase task completion frequency to strengthen consistency.');
    }

    if (!strongSkills.length) {
      recommendations.push('Convert one weak skill into a strong skill with a targeted mini-project.');
    }

    recommendations.push('Retake exams after a short review cycle once the same skill improves twice in a row.');
    return Array.from(new Set(recommendations)).slice(0, 6);
  }

  private static buildDailyPlan(learningSpeed: LearningSpeed, weakSkills: string[], strongSkills: string[]) {
    const focusSkill = weakSkills[0] ?? strongSkills[0] ?? 'core system design';
    if (learningSpeed === 'slow') {
      return [
        { title: `Review ${focusSkill}`, description: 'Revisit the skill with one example and one practice question.', type: 'review' },
        { title: 'Repeat a mini task', description: 'Repeat one smaller task to reinforce the concept.', type: 'practice' },
        { title: 'Short recap', description: 'Write a short note on what improved and what still feels weak.', type: 'reflection' }
      ];
    }

    if (learningSpeed === 'fast') {
      return [
        { title: `Hard drill on ${focusSkill}`, description: 'Skip basics and solve a harder scenario with constraints.', type: 'challenge' },
        { title: 'Timed practice', description: 'Complete a timed practice session to maintain momentum.', type: 'practice' },
        { title: 'Stretch project', description: 'Add one stretch goal that pushes beyond comfort level.', type: 'project' }
      ];
    }

    return [
      { title: `Practice ${focusSkill}`, description: 'Balance review with a moderate challenge.', type: 'practice' },
      { title: 'One focused drill', description: 'Complete one question set or micro-task.', type: 'practice' },
      { title: 'End-of-day reflection', description: 'Capture what changed after today’s session.', type: 'reflection' }
    ];
  }

  private static estimateBurnoutRisk(engagementScore: number, activityRows: Array<{ createdAt: Date | string }>) {
    const recentDayKeys = new Set(activityRows.slice(0, 7).map((row) => new Date(row.createdAt).toISOString().slice(0, 10)));
    const recentActivity = recentDayKeys.size;
    if (engagementScore < 35 && recentActivity <= 1) {
      return 'high';
    }

    if (engagementScore < 60 || recentActivity <= 3) {
      return 'medium';
    }

    return 'low';
  }

  private static buildAdaptiveDeadlines(performanceRows: SkillSnapshot[], learningSpeed: LearningSpeed) {
    const baseDays = learningSpeed === 'fast' ? 7 : learningSpeed === 'slow' ? 18 : 12;
    return performanceRows.slice(0, 5).map((skill) => ({
      skillName: skill.skillName,
      suggestedDays: skill.status === 'weak' ? baseDays + 5 : skill.status === 'strong' ? Math.max(4, baseDays - 3) : baseDays,
      reason: skill.status === 'weak' ? 'Needs extra repetition and smaller checkpoints.' : skill.status === 'strong' ? 'Can move faster with less repetition.' : 'Can follow the default pacing.'
    }));
  }
}
