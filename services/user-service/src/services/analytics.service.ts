import crypto from 'node:crypto';
import { getDb, users } from '@thinkai/db';
import { and, eq, gte } from 'drizzle-orm';
import { analyticsEventTypeSchema, AnalyticsEventType } from '../schemas/analytics.schema';
import { enqueueAnalyticsEvent } from '../queues/analytics.queue';
import { UserEventModel } from '../models/user-event.model';

type LeanEvent = {
  userId: string;
  eventType: AnalyticsEventType;
  metadata: Record<string, unknown>;
  createdAt: Date;
};

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function startOfWeek(date: Date) {
  const d = startOfDay(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function getString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const next = value.trim();
  return next ? next : null;
}

function getNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function sanitizeMetadata(metadata: Record<string, unknown>) {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    const normalizedKey = key.toLowerCase();
    if (['password', 'token', 'secret', 'otp', 'email'].some((blocked) => normalizedKey.includes(blocked))) {
      output[key] = '[redacted]';
      continue;
    }

    if (typeof value === 'string' && value.length > 200) {
      output[key] = `${value.slice(0, 80)}...`;
      continue;
    }

    output[key] = value;
  }
  return output;
}

function incrementCount(map: Map<string, number>, key: string, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function topEntries(map: Map<string, number>, limit = 5) {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

function uniqueUserCount(events: LeanEvent[]) {
  return new Set(events.map((event) => event.userId)).size;
}

function toISOStringOrNull(date: Date | null) {
  return date ? date.toISOString() : null;
}

export class AnalyticsService {
  static async logEvent(userId: string, eventType: AnalyticsEventType, metadata: Record<string, unknown> = {}) {
    if (!userId.trim()) {
      return;
    }

    const parsedType = analyticsEventTypeSchema.parse(eventType);
    await enqueueAnalyticsEvent({
      userId,
      eventType: parsedType,
      metadata: sanitizeMetadata(metadata),
      createdAt: new Date().toISOString()
    });
  }

  static async getUserInsights(userId: string) {
    const events = await UserEventModel
      .find({ userId })
      .sort({ createdAt: 1 })
      .lean<LeanEvent[]>();

    const passedSkills = new Set<string>();
    const attemptedSkills = new Set<string>();
    const strongSkillCounts = new Map<string, number>();
    const weakSkillCounts = new Map<string, number>();

    let examsTaken = 0;
    let passedExamCount = 0;
    let completedEvents = 0;
    let taskCompletedCount = 0;
    let firstRoadmapTaskAt: Date | null = null;
    let firstEventAt: Date | null = null;
    let lastEventAt: Date | null = null;

    for (const event of events) {
      if (!firstEventAt || event.createdAt < firstEventAt) {
        firstEventAt = event.createdAt;
      }
      if (!lastEventAt || event.createdAt > lastEventAt) {
        lastEventAt = event.createdAt;
      }

      const skillName = getString(event.metadata.skillName);
      if (event.eventType === 'exam_completed') {
        examsTaken += 1;
        const passed = Boolean(event.metadata.passed) || getString(event.metadata.status)?.toLowerCase() === 'pass';
        if (passed) {
          passedExamCount += 1;
        }
        if (skillName) {
          attemptedSkills.add(skillName.toLowerCase());
        }
      }

      if (event.eventType === 'skill_passed' && skillName) {
        const normalized = skillName.toLowerCase();
        passedSkills.add(normalized);
        attemptedSkills.add(normalized);
        incrementCount(strongSkillCounts, skillName);
      }

      if (event.eventType === 'skill_failed' && skillName) {
        attemptedSkills.add(skillName.toLowerCase());
        incrementCount(weakSkillCounts, skillName);
      }

      if (event.eventType === 'task_completed') {
        taskCompletedCount += 1;
        const feature = getString(event.metadata.feature);
        if (!firstRoadmapTaskAt && feature?.toLowerCase() === 'roadmap') {
          firstRoadmapTaskAt = event.createdAt;
        }
      }

      if (event.eventType === 'project_completed') {
        completedEvents += 1;
      }
    }

    const totalSkillOutcomes = strongSkillCounts.size + weakSkillCounts.size;
    const eventPassRate = totalSkillOutcomes > 0
      ? Math.round((strongSkillCounts.size / totalSkillOutcomes) * 100)
      : 0;
    const examPassRate = examsTaken > 0 ? Math.round((passedExamCount / examsTaken) * 100) : 0;
    const passRate = examsTaken > 0 ? examPassRate : eventPassRate;

    const attemptedCount = attemptedSkills.size;
    const progressPercentage = attemptedCount > 0
      ? Math.round((passedSkills.size / attemptedCount) * 100)
      : 0;

    let timeToCompleteRoadmapDays: number | null = null;
    if (firstRoadmapTaskAt && lastEventAt && lastEventAt >= firstRoadmapTaskAt) {
      const diffMs = lastEventAt.getTime() - firstRoadmapTaskAt.getTime();
      timeToCompleteRoadmapDays = Number((diffMs / (1000 * 60 * 60 * 24)).toFixed(2));
    }

    return {
      totalSkillsCompleted: passedSkills.size,
      totalExamsTaken: examsTaken,
      passRate,
      weakSkills: topEntries(weakSkillCounts).map((entry) => entry.name),
      strongSkills: topEntries(strongSkillCounts).map((entry) => entry.name),
      progressPercentage,
      timeToCompleteRoadmapDays,
      learningEfficiencyScore: Math.round((passRate * 0.6) + (progressPercentage * 0.4)),
      activityWindow: {
        firstSeenAt: toISOStringOrNull(firstEventAt),
        lastSeenAt: toISOStringOrNull(lastEventAt),
        taskCompletedCount,
        projectCompletedCount: completedEvents
      }
    };
  }

  static async getAdminMetrics() {
    const now = new Date();
    const dayStart = new Date(now.getTime() - (24 * 60 * 60 * 1000));
    const weekStart = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
    const prevWeekStart = new Date(now.getTime() - (14 * 24 * 60 * 60 * 1000));
    const ninetyDaysStart = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000));

    const [
      allUsers,
      dauEvents,
      wauEvents,
      currentWeekEvents,
      prevWeekEvents,
      recentEvents,
      examScores
    ] = await Promise.all([
      getDb().select({ id: users.id }).from(users),
      UserEventModel.find({ createdAt: { $gte: dayStart } }).select('userId createdAt eventType metadata').lean<LeanEvent[]>(),
      UserEventModel.find({ createdAt: { $gte: weekStart } }).select('userId createdAt eventType metadata').lean<LeanEvent[]>(),
      UserEventModel.find({ createdAt: { $gte: weekStart } }).select('userId createdAt eventType metadata').lean<LeanEvent[]>(),
      UserEventModel.find({ createdAt: { $gte: prevWeekStart, $lt: weekStart } }).select('userId createdAt eventType metadata').lean<LeanEvent[]>(),
      UserEventModel.find({ createdAt: { $gte: ninetyDaysStart } }).select('userId createdAt eventType metadata').lean<LeanEvent[]>(),
      UserEventModel.aggregate<{ avgScore: number }>([
        { $match: { eventType: 'exam_completed' } },
        {
          $project: {
            score: {
              $convert: {
                input: '$metadata.score',
                to: 'double',
                onError: null,
                onNull: null
              }
            }
          }
        },
        { $match: { score: { $ne: null } } },
        { $group: { _id: null, avgScore: { $avg: '$score' } } }
      ])
    ]);

    const totalUsers = allUsers.length;
    const dau = uniqueUserCount(dauEvents);
    const wau = uniqueUserCount(wauEvents);

    const previousUsers = new Set(prevWeekEvents.map((event) => event.userId));
    const currentUsers = new Set(currentWeekEvents.map((event) => event.userId));
    const retained = Array.from(previousUsers).filter((userId) => currentUsers.has(userId)).length;
    const retentionRate = previousUsers.size > 0 ? Math.round((retained / previousUsers.size) * 100) : 0;

    const failedSkills = new Map<string, number>();
    const popularSkills = new Map<string, number>();
    const featureUsage = new Map<string, number>();

    const funnelUsers = {
      resume_updated: new Set<string>(),
      exam_started: new Set<string>(),
      exam_completed: new Set<string>(),
      skill_passed: new Set<string>(),
      project_completed: new Set<string>()
    };

    const firstSeenByUser = new Map<string, Date>();
    const activityByUserWeek = new Map<string, Set<string>>();

    for (const event of recentEvents) {
      incrementCount(featureUsage, event.eventType);

      if (event.eventType in funnelUsers) {
        funnelUsers[event.eventType as keyof typeof funnelUsers].add(event.userId);
      }

      const skillName = getString(event.metadata.skillName);
      if (event.eventType === 'skill_failed' && skillName) {
        incrementCount(failedSkills, skillName);
      }

      if ((event.eventType === 'skill_passed' || event.eventType === 'exam_completed') && skillName) {
        incrementCount(popularSkills, skillName);
      }

      const firstSeen = firstSeenByUser.get(event.userId);
      if (!firstSeen || event.createdAt < firstSeen) {
        firstSeenByUser.set(event.userId, event.createdAt);
      }

      const weekKey = startOfWeek(event.createdAt).toISOString();
      const existingWeeks = activityByUserWeek.get(event.userId) ?? new Set<string>();
      existingWeeks.add(weekKey);
      activityByUserWeek.set(event.userId, existingWeeks);
    }

    const skillPassCounts = new Map<string, number>();
    const skillFailCounts = new Map<string, number>();

    for (const event of recentEvents) {
      const skill = getString(event.metadata.skillName);
      if (!skill) {
        continue;
      }

      if (event.eventType === 'skill_passed') {
        incrementCount(skillPassCounts, skill);
      }
      if (event.eventType === 'skill_failed') {
        incrementCount(skillFailCounts, skill);
      }
    }

    const skillDifficultyRanking = Array.from(new Set([...skillPassCounts.keys(), ...skillFailCounts.keys()]))
      .map((skill) => {
        const pass = skillPassCounts.get(skill) ?? 0;
        const fail = skillFailCounts.get(skill) ?? 0;
        const attempts = pass + fail;
        const failRate = attempts > 0 ? Math.round((fail / attempts) * 100) : 0;
        return { skill, attempts, passRate: 100 - failRate, failRate };
      })
      .sort((a, b) => b.failRate - a.failRate)
      .slice(0, 10);

    const cohortRows = Array.from(firstSeenByUser.entries())
      .map(([userId, firstSeenAt]) => {
        const cohortWeek = startOfWeek(firstSeenAt).toISOString();
        const retainedWeek = new Date(startOfWeek(firstSeenAt));
        retainedWeek.setDate(retainedWeek.getDate() + 7);
        const retainedWeekKey = retainedWeek.toISOString();
        const activeWeeks = activityByUserWeek.get(userId) ?? new Set<string>();
        return {
          cohortWeek,
          retainedNextWeek: activeWeeks.has(retainedWeekKey)
        };
      });

    const cohortMap = new Map<string, { users: number; retained: number }>();
    for (const row of cohortRows) {
      const existing = cohortMap.get(row.cohortWeek) ?? { users: 0, retained: 0 };
      existing.users += 1;
      if (row.retainedNextWeek) {
        existing.retained += 1;
      }
      cohortMap.set(row.cohortWeek, existing);
    }

    const cohortAnalysis = Array.from(cohortMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-8)
      .map(([week, value]) => ({
        cohortWeek: week,
        users: value.users,
        retainedUsers: value.retained,
        retentionRate: value.users > 0 ? Math.round((value.retained / value.users) * 100) : 0
      }));

    return {
      generatedAt: new Date().toISOString(),
      summaryId: crypto.randomUUID(),
      totalUsers,
      activeUsers: wau,
      dau,
      wau,
      retentionRate,
      avgExamScore: Number((examScores[0]?.avgScore ?? 0).toFixed(2)),
      mostFailedSkills: topEntries(failedSkills),
      mostPopularSkills: topEntries(popularSkills),
      featureUsage: topEntries(featureUsage, 20),
      funnelAnalysis: {
        resumeUpdatedUsers: funnelUsers.resume_updated.size,
        examStartedUsers: funnelUsers.exam_started.size,
        examCompletedUsers: funnelUsers.exam_completed.size,
        skillPassedUsers: funnelUsers.skill_passed.size,
        projectCompletedUsers: funnelUsers.project_completed.size
      },
      cohortAnalysis,
      skillDifficultyRanking,
      learningEfficiencyScore: Math.round(((retentionRate * 0.4) + ((topEntries(popularSkills).length > 0 ? 70 : 40) * 0.2) + ((dau > 0 ? Math.min(100, Math.round((dau / Math.max(totalUsers, 1)) * 100)) : 0) * 0.4)))
    };
  }
}
