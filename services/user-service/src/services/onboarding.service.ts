import { and, desc, eq } from 'drizzle-orm';
import { getDb, onboardingProgress, userTargetRoles, users } from '@thinkai/db';
import { TargetRoleRequestDto } from '../schemas/onboarding.schema';
import { StructuredResumeDto } from '../schemas/resume.schema';
import { hasActiveSubscription } from '../middleware/subscription.middleware';
import { ResumeService } from './resume.service';
import { RecommendationService } from './recommendation.service';
import { AnalyticsService } from './analytics.service';

export class OnboardingService {
  static async saveResume(userId: string, resume: StructuredResumeDto, mode: 'draft' | 'final') {
    const savedResume = await ResumeService.saveStructuredResume(userId, resume, mode);
    await AnalyticsService.logEvent(userId, 'resume_updated', {
      mode,
      resumeId: savedResume.id,
      isFinal: mode === 'final'
    });
    if (mode === 'final') {
      await this.upsertProgress(userId, { resumeCompleted: true });
    }

    return {
      resume: savedResume,
      onboarding: await this.getStatus(userId)
    };
  }

  static async saveTargetRole(userId: string, input: TargetRoleRequestDto) {
    const db = getDb();
    const now = new Date();

    await db.transaction(async (tx) => {
      await tx
        .update(userTargetRoles)
        .set({ isCurrent: false, updatedAt: now })
        .where(and(eq(userTargetRoles.userId, userId), eq(userTargetRoles.isCurrent, true)));

      await tx.insert(userTargetRoles).values({
        userId,
        title: input.title,
        level: input.level,
        industry: input.industry,
        locationPreference: input.locationPreference,
        keywords: input.keywords,
        isCurrent: true,
        updatedAt: now
      });
    });

    await this.upsertProgress(userId, { targetRoleCompleted: true });
    await RecommendationService.refreshForUser(userId, 'target_role_updated');
    await AnalyticsService.logEvent(userId, 'task_completed', {
      area: 'onboarding',
      step: 'target_role',
      title: input.title,
      level: input.level,
      industry: input.industry
    });

    return this.getStatus(userId);
  }

  static async getStatus(userId: string) {
    const db = getDb();
    await this.ensureProgress(userId);

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const [progress] = await db.select().from(onboardingProgress).where(eq(onboardingProgress.userId, userId)).limit(1);
    const [targetRole] = await db
      .select()
      .from(userTargetRoles)
      .where(and(eq(userTargetRoles.userId, userId), eq(userTargetRoles.isCurrent, true)))
      .orderBy(desc(userTargetRoles.createdAt))
      .limit(1);

    let resume = null;
    try {
      resume = await ResumeService.getResume(userId, false);
    } catch {
      resume = null;
    }

    const subscriptionActive = await hasActiveSubscription(userId);
    const resumeCompleted = Boolean(progress?.resumeCompleted);
    const targetRoleCompleted = Boolean(progress?.targetRoleCompleted);
    const isComplete = subscriptionActive && resumeCompleted && targetRoleCompleted;

    if (isComplete && user && !user.isOnboarded) {
      await db.update(users).set({ isOnboarded: true, onboardedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, userId));
      await db.update(onboardingProgress)
        .set({ currentStep: 'complete', completedAt: new Date(), updatedAt: new Date() })
        .where(eq(onboardingProgress.userId, userId));
    }

    const nextStep = !subscriptionActive
      ? 'subscription'
      : !resumeCompleted
        ? 'resume'
        : !targetRoleCompleted
          ? 'target_role'
          : 'complete';

    return {
      subscriptionActive,
      resumeCompleted,
      targetRoleCompleted,
      isOnboarded: isComplete || Boolean(user?.isOnboarded),
      currentStep: nextStep,
      nextPath: nextStep === 'subscription'
        ? '/pricing'
        : nextStep === 'resume'
          ? '/onboarding/resume'
          : nextStep === 'target_role'
            ? '/onboarding/target-role'
            : '/dashboard',
      resume,
      targetRole: targetRole ? {
        id: targetRole.id,
        title: targetRole.title,
        level: targetRole.level,
        industry: targetRole.industry,
        locationPreference: targetRole.locationPreference,
        keywords: targetRole.keywords
      } : null
    };
  }

  private static async ensureProgress(userId: string) {
    const db = getDb();
    await db.insert(onboardingProgress)
      .values({ userId })
      .onConflictDoNothing();
  }

  private static async upsertProgress(
    userId: string,
    input: { resumeCompleted?: boolean; targetRoleCompleted?: boolean }
  ) {
    const db = getDb();
    const existing = await db
      .select()
      .from(onboardingProgress)
      .where(eq(onboardingProgress.userId, userId))
      .limit(1);

    const resumeCompleted = input.resumeCompleted ?? existing[0]?.resumeCompleted ?? false;
    const targetRoleCompleted = input.targetRoleCompleted ?? existing[0]?.targetRoleCompleted ?? false;
    const complete = resumeCompleted && targetRoleCompleted;
    const now = new Date();

    await db.insert(onboardingProgress)
      .values({
        userId,
        resumeCompleted,
        targetRoleCompleted,
        currentStep: complete ? 'complete' : resumeCompleted ? 'target_role' : 'resume',
        completedAt: complete ? now : null,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: onboardingProgress.userId,
        set: {
          resumeCompleted,
          targetRoleCompleted,
          currentStep: complete ? 'complete' : resumeCompleted ? 'target_role' : 'resume',
          completedAt: complete ? now : existing[0]?.completedAt ?? null,
          updatedAt: now
        }
      });

    if (complete) {
      await db.update(users).set({ isOnboarded: true, onboardedAt: now, updatedAt: now }).where(eq(users.id, userId));
    }
  }
}
