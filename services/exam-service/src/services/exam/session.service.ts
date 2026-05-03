import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { 
  getDb, 
  userExams, 
  examQuestions, 
  skillProgress, 
  userResumes, 
  resumeSkills, 
  skillExams 
} from '@thinkai/db';
import { ExamSchemaService } from './schema';
import { QuestionSnapshot, SessionResponse } from './types';
import { 
  normalizeSkillName, 
  normalizeAnswer, 
  toQuestionSnapshot, 
  scoreCodeAnswer, 
  sanitizeAnswer, 
  buildInstructions, 
  detectPrimaryProgrammingLanguage, 
  detectSkillType,
  SUBMISSION_GRACE_WINDOW_SECONDS
} from './utils';
import { ExamTemplateService } from './template.service';
import { ExamCertificateService } from './certificate.service';
import { ExamModerationService } from './moderation.service';

function getSessionDeadline(session: typeof userExams.$inferSelect) {
  return new Date(session.startedAt.getTime() + (session.timeLimitSeconds * 1000));
}

function getRemainingSeconds(session: typeof userExams.$inferSelect, now = new Date()) {
  const remainingMs = getSessionDeadline(session).getTime() - now.getTime();
  return Math.floor(remainingMs / 1000);
}

export class ExamSessionService {
  static async getUserExamCatalog(userId: string) {
    await ExamSchemaService.ensureSchemaCompatibility();
    const db = getDb();
    const extractedSkills = await this.getResumeSkills(userId);
    const templates = await db.select().from(skillExams).orderBy(desc(skillExams.createdAt));
    const questionRows = await db.select().from(examQuestions);
    const progressRows = await db.select().from(skillProgress).where(eq(skillProgress.userId, userId));
    const attemptRows = await db.select().from(userExams).where(eq(userExams.userId, userId)).orderBy(desc(userExams.createdAt));

    const latestTemplateBySkill = new Map<string, typeof skillExams.$inferSelect>();
    for (const template of templates) {
      const key = normalizeSkillName(template.skillName).toLowerCase();
      if (!latestTemplateBySkill.has(key)) {
        latestTemplateBySkill.set(key, template);
      }
    }

    const questionsByExamId = new Map<string, Array<typeof examQuestions.$inferSelect>>();
    for (const question of questionRows) {
      const current = questionsByExamId.get(question.examId) ?? [];
      current.push(question);
      questionsByExamId.set(question.examId, current);
    }

    const progressBySkill = new Map(progressRows.map((row) => [normalizeSkillName(row.skillName).toLowerCase(), row]));
    const latestAttemptBySkill = new Map<string, typeof userExams.$inferSelect>();
    for (const attempt of attemptRows) {
      const key = normalizeSkillName(attempt.skillName).toLowerCase();
      if (!latestAttemptBySkill.has(key)) {
        latestAttemptBySkill.set(key, attempt);
      }
    }

    return extractedSkills.map((skillName) => {
      const key = skillName.toLowerCase();
      const template = latestTemplateBySkill.get(key) ?? null;
      const progress = progressBySkill.get(key) ?? null;
      const latestAttempt = latestAttemptBySkill.get(key) ?? null;
      const questions = template ? questionsByExamId.get(template.id) ?? [] : [];
      const counts = questions.reduce((acc, question) => {
        acc.total += 1;
        if (question.type === 'MCQ') acc.mcq += 1;
        else if (question.type === 'FILL') acc.fill += 1;
        else acc.code += 1;

        if (question.difficulty <= 2) acc.easy += 1;
        else if (question.difficulty === 3 || question.difficulty === 4) acc.medium += 1;
        else acc.hard += 1;

        return acc;
      }, { total: 0, mcq: 0, fill: 0, code: 0, easy: 0, medium: 0, hard: 0 });

      const required = template ? {
        mcq: template.mcqCount,
        fill: template.fillBlankCount,
        code: template.codingCount
      } : { mcq: 0, fill: 0, code: 0 };

      const ready = !!template
        && template.isPublished
        && counts.mcq >= required.mcq
        && counts.fill >= required.fill
        && counts.code >= required.code;

      let status: 'ready' | 'draft' | 'in_progress' | 'passed' | 'failed' = ready ? 'ready' : 'draft';
      if (latestAttempt?.status === 'IN_PROGRESS') {
        status = 'in_progress';
      } else if (latestAttempt?.status === 'PASS') {
        status = 'passed';
      } else if (latestAttempt?.status === 'FAIL') {
        status = 'failed';
      }

      return {
        skillName,
        title: template?.title ?? `${skillName} Assessment`,
        description: template?.description ?? `Assessment readiness for ${skillName}`,
        skillType: template?.skillType ?? detectSkillType(skillName),
        status,
        isPublished: template?.isPublished ?? false,
        isReady: ready,
        passPercentage: template?.passPercentage ?? 65,
        questionBank: {
          total: counts.total,
          mcq: counts.mcq,
          fill: counts.fill,
          code: counts.code,
          required
        },
        progress: progress ? {
          score: progress.lastScore,
          attempts: progress.attempts,
          status: progress.status
        } : null,
        latestAttempt: latestAttempt ? {
          id: latestAttempt.id,
          status: latestAttempt.status,
          percentage: latestAttempt.percentage,
          attemptNumber: latestAttempt.attemptNumber,
          startedAt: latestAttempt.startedAt.toISOString(),
          submittedAt: latestAttempt.submittedAt?.toISOString() ?? null
        } : null
      };
    });
  }

  static async getOrCreateSession(userId: string, requestedSkillName?: string) {
    await ExamSchemaService.ensureSchemaCompatibility();
    const db = getDb();
    const [existing] = await db.select().from(userExams).where(and(
      eq(userExams.userId, userId),
      eq(userExams.status, 'IN_PROGRESS')
    )).orderBy(desc(userExams.createdAt)).limit(1);

    if (existing) {
      const remainingSeconds = getRemainingSeconds(existing);
      if (remainingSeconds > 0) {
        return this.buildSessionResponse(existing, remainingSeconds);
      }

      await this.finalizeSession(
        existing,
        (existing.answersJson as Record<string, string>) ?? {},
        { timedOut: true, submittedAt: new Date() }
      );
    }

    if (requestedSkillName) {
      return this.createSessionForSkill(userId, normalizeSkillName(requestedSkillName), false);
    }

    const extractedSkills = await this.getResumeSkills(userId);
    const summaries = await this.getSkillSummaries(userId);
    const prioritizedSkills = [
      ...summaries.filter((item) => item.status === 'failed').map((item) => item.skill),
      ...summaries.filter((item) => item.status === 'in-progress').map((item) => item.skill),
      ...extractedSkills.filter((skill) => !summaries.some((item) => item.skill === skill))
    ];

    const uniqueSkills = Array.from(new Set(prioritizedSkills.map((skill) => normalizeSkillName(skill))));

    for (const skill of uniqueSkills) {
      try {
        return await this.createSessionForSkill(userId, skill, false);
      } catch {
        continue;
      }
    }

    throw new Error('No published exam is ready for your skills yet. Add question banks for the extracted resume skills first.');
  }

  static async submitSession(userId: string, sessionId: string, answers: Record<string, string>) {
    await ExamSchemaService.ensureSchemaCompatibility();
    const db = getDb();
    const [session] = await db.select().from(userExams).where(and(
      eq(userExams.id, sessionId),
      eq(userExams.userId, userId)
    )).limit(1);

    if (!session) {
      throw new Error('Exam session not found');
    }

    if (session.status !== 'IN_PROGRESS') {
      throw new Error('Exam session has already been submitted');
    }

    const remainingSeconds = getRemainingSeconds(session);
    if (remainingSeconds < -SUBMISSION_GRACE_WINDOW_SECONDS) {
      throw new Error('This exam session has already expired and can no longer be submitted.');
    }

    return this.finalizeSession(session, answers, {
      timedOut: remainingSeconds <= 0,
      submittedAt: new Date()
    });
  }

  static async scheduleRetake(userId: string, skillName: string) {
    await ExamSchemaService.ensureSchemaCompatibility();
    const db = getDb();
    const normalized = normalizeSkillName(skillName);
    await db.delete(userExams).where(and(
      eq(userExams.userId, userId),
      eq(userExams.skillName, normalized),
      eq(userExams.status, 'IN_PROGRESS')
    ));
    return { success: true };
  }

  static async getSkillSummaries(userId: string) {
    await ExamSchemaService.ensureSchemaCompatibility();
    const db = getDb();
    const extractedSkills = await this.getResumeSkills(userId);
    const progressRows = await db.select().from(skillProgress).where(eq(skillProgress.userId, userId));

    const progressMap = new Map(progressRows.map((row) => [normalizeSkillName(row.skillName).toLowerCase(), row]));
    return extractedSkills.map((skill) => {
      const row = progressMap.get(skill.toLowerCase());
      const lastScore = row?.lastScore ?? 0;
      const status = row?.status === 'PASSED'
        ? 'passed'
        : row && row.attempts > 0 && lastScore < 65
          ? 'failed'
          : 'in-progress';

      return {
        skill,
        progress: lastScore,
        status,
        attempts: row?.attempts ?? 0
      };
    });
  }

  private static async createSessionForSkill(userId: string, skillName: string, forceRetake: boolean) {
    const db = getDb();
    const template = await ExamTemplateService.getTemplateBySkill(skillName);
    const questionRows = await db.select().from(examQuestions).where(eq(examQuestions.examId, template.id));
    const selectedQuestions = ExamTemplateService.selectQuestions(template, questionRows);

    if (!selectedQuestions.length) {
      throw new Error(`Question bank for ${skillName} is incomplete`);
    }

    const [latestAttempt] = await db.select().from(userExams).where(and(
      eq(userExams.userId, userId),
      eq(userExams.skillName, skillName)
    )).orderBy(desc(userExams.createdAt)).limit(1);

    if (!forceRetake && latestAttempt?.status === 'PASS') {
      throw new Error(`Skill ${skillName} is already passed`);
    }

    await db.delete(userExams).where(and(
      eq(userExams.userId, userId),
      eq(userExams.skillName, skillName),
      eq(userExams.status, 'IN_PROGRESS')
    ));

    const [created] = await db.insert(userExams).values({
      userId,
      organizationId: template.organizationId,
      skillName,
      examId: template.id,
      attemptNumber: (latestAttempt?.attemptNumber ?? 0) + 1,
      timeLimitSeconds: template.skillType === 'PROGRAMMING_LANGUAGE' ? 75 * 60 : 45 * 60,
      passPercentage: template.passPercentage,
      questionSnapshotJson: selectedQuestions.map((question) => toQuestionSnapshot(question)),
      evaluationJson: {
        skillType: template.skillType,
        blueprint: {
          mcqCount: template.mcqCount,
          fillBlankCount: template.fillBlankCount,
          codingCount: template.codingCount
        }
      },
      createdAt: new Date(),
      startedAt: new Date()
    }).returning();

    return this.buildSessionResponse(created, created.timeLimitSeconds);
  }

  private static async finalizeSession(
    session: typeof userExams.$inferSelect,
    rawAnswers: Record<string, string>,
    options: { timedOut: boolean; submittedAt: Date }
  ) {
    const db = getDb();
    const questionIds = ((session.questionSnapshotJson as QuestionSnapshot[]) ?? []).map((question) => question.id);
    const allowedQuestionIds = new Set(questionIds);
    const answers = Object.entries(rawAnswers).reduce<Record<string, string>>((acc, [questionId, value]) => {
      if (!allowedQuestionIds.has(questionId) || typeof value !== 'string') {
        return acc;
      }

      acc[questionId] = sanitizeAnswer(value);
      return acc;
    }, {});

    const questionRows = questionIds.length
      ? await db.select().from(examQuestions).where(inArray(examQuestions.id, questionIds))
      : [];
    const questionMap = new Map(questionRows.map((question) => [question.id, question]));

    let score = 0;
    let totalMarks = 0;
    const evaluation: Array<Record<string, unknown>> = [];

    for (const snapshot of (session.questionSnapshotJson as QuestionSnapshot[]) ?? []) {
      const question = questionMap.get(snapshot.id);
      if (!question) {
        continue;
      }

      const submitted = answers[snapshot.id] ?? '';
      const submittedAnswer = question.type === 'MCQ' && !question.options?.includes(submitted) ? '' : submitted;
      const marks = question.marks ?? 1;
      totalMarks += marks;

      let correct = false;
      if (question.type === 'CODE') {
        correct = scoreCodeAnswer(question, submittedAnswer);
      } else {
        correct = normalizeAnswer(submittedAnswer) === normalizeAnswer(question.answer);
      }

      if (correct) {
        score += marks;
      }

      evaluation.push({
        questionId: question.id,
        type: question.type,
        prompt: question.question,
        expectedAnswer: question.type === 'CODE' ? '[hidden]' : question.answer,
        submittedAnswer,
        correct,
        marksAwarded: correct ? marks : 0,
        marks
      });
    }

    const percentage = totalMarks > 0 ? Math.round((score / totalMarks) * 100) : 0;
    const passed = percentage >= session.passPercentage;

    await db.update(userExams)
      .set({
        score,
        totalMarks,
        percentage,
        status: passed ? 'PASS' : 'FAIL',
        answersJson: answers,
        evaluationJson: {
          passed,
          percentage,
          score,
          totalMarks,
          timedOut: options.timedOut,
          submittedAt: options.submittedAt.toISOString(),
          questions: evaluation
        },
        submittedAt: options.submittedAt
      } as any)
      .where(eq(userExams.id, session.id));

    if (passed) {
      try {
        await ExamCertificateService.issueCertificate(session.userId, session.id);
      } catch (err) {
        console.error('Failed to issue certificate:', err);
      }
    }

    const [existingProgress] = await db.select().from(skillProgress).where(and(
      eq(skillProgress.userId, session.userId),
      eq(skillProgress.skillName, session.skillName)
    )).limit(1);

    if (existingProgress) {
      await db.update(skillProgress)
        .set({
          status: passed ? 'PASSED' : 'LEARNING',
          lastScore: percentage,
          attempts: session.attemptNumber,
          updatedAt: options.submittedAt
        } as any)
        .where(eq(skillProgress.id, existingProgress.id));
    } else {
      await db.insert(skillProgress).values({
        userId: session.userId,
        skillName: session.skillName,
        status: passed ? 'PASSED' : 'LEARNING',
        lastScore: percentage,
        attempts: session.attemptNumber,
        createdAt: options.submittedAt,
        updatedAt: options.submittedAt
      } as any);
    }

    return {
      sessionId: session.id,
      score: percentage,
      passed,
      timedOut: options.timedOut,
      skill: session.skillName,
      threshold: session.passPercentage,
      totalMarks,
      scoredMarks: score,
      submittedAt: options.submittedAt.toISOString(),
      questions: evaluation.map((item) => ({
        questionId: String(item.questionId),
        type: String(item.type).toLowerCase(),
        prompt: String(item.prompt),
        expectedAnswer: String(item.expectedAnswer),
        submittedAnswer: String(item.submittedAnswer),
        correct: Boolean(item.correct),
        marksAwarded: Number(item.marksAwarded),
        marks: Number(item.marks),
        explanation: questionMap.get(String(item.questionId))?.explanation ?? null
      }))
    };
  }

  private static buildSessionResponse(session: typeof userExams.$inferSelect, remainingSeconds: number): SessionResponse {
    const skillType = ((session.evaluationJson as Record<string, unknown>)?.skillType === 'PROGRAMMING_LANGUAGE'
      ? 'PROGRAMMING_LANGUAGE'
      : 'STANDARD') as 'STANDARD' | 'PROGRAMMING_LANGUAGE';
    const questions = (session.questionSnapshotJson as QuestionSnapshot[]) ?? [];
    const codingLanguage = detectPrimaryProgrammingLanguage(session.skillName, questions);

    return {
      id: session.id,
      title: `${session.skillName} Assessment`,
      skillName: session.skillName,
      skillType,
      durationInSeconds: session.timeLimitSeconds,
      timeRemainingInSeconds: remainingSeconds,
      startedAt: session.startedAt.toISOString(),
      endsAt: getSessionDeadline(session).toISOString(),
      passPercentage: session.passPercentage,
      instructions: buildInstructions(skillType, session.skillName, codingLanguage),
      questions
    };
  }

  private static async getResumeSkills(userId: string) {
    const db = getDb();
    const [currentResume] = await db.select().from(userResumes).where(and(
      eq(userResumes.userId, userId),
      eq(userResumes.isCurrent, true),
      isNull(userResumes.deletedAt)
    )).orderBy(desc(userResumes.updatedAt)).limit(1);

    if (!currentResume) {
      return [];
    }

    const rows = await db.select().from(resumeSkills).where(eq(resumeSkills.resumeId, currentResume.id));
    const map = new Map<string, string>();
    for (const row of rows) {
      const normalized = normalizeSkillName(row.name);
      if (!normalized) {
        continue;
      }

      const key = normalized.toLowerCase();
      if (!map.has(key)) {
        map.set(key, normalized);
      }
    }

    return Array.from(map.values());
  }

  static async logProctoringEvent(userId: string, sessionId: string, event: string, metadata?: Record<string, unknown>) {
    await ExamSchemaService.ensureSchemaCompatibility();
    const db = getDb();
    const [session] = await db.select().from(userExams).where(and(
      eq(userExams.id, sessionId),
      eq(userExams.userId, userId)
    )).limit(1);

    if (!session) {
      throw new Error('Session not found');
    }

    if (session.status !== 'IN_PROGRESS') {
      throw new Error('Cannot log events for a completed session');
    }

    const currentLogs = ((session as any).proctoringLogsJson as any[]) || [];
    const newLog = {
      event,
      timestamp: new Date().toISOString(),
      metadata
    };

    await db.update(userExams)
      .set({
        proctoringLogsJson: [...currentLogs, newLog]
      } as any)
      .where(eq(userExams.id, sessionId));

    return { success: true };
  }

  static async getAuditTrail(attemptId: string) {
    await ExamSchemaService.ensureSchemaCompatibility();
    const db = getDb();
    const [attempt] = await db.select().from(userExams).where(eq(userExams.id, attemptId)).limit(1);

    if (!attempt) {
      throw new Error('Attempt not found');
    }

    return {
      id: attempt.id,
      skillName: attempt.skillName,
      status: attempt.status,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      logs: (attempt as any).proctoringLogsJson,
      summary: {
        score: attempt.score,
        percentage: attempt.percentage,
        tabSwitches: ((attempt as any).proctoringLogsJson as any[] || []).filter((l: any) => l.event === 'TAB_SWITCH').length,
        fullscreenViolations: ((attempt as any).proctoringLogsJson as any[] || []).filter((l: any) => l.event === 'FULLSCREEN_EXIT').length
      }
    };
  }

  static async getUserSkillStats(userId: string) {
    await ExamSchemaService.ensureSchemaCompatibility();
    const db = getDb();

    // Fetch all passed attempts to determine proficiency
    const attempts = await db.select({
      skillName: userExams.skillName,
      percentage: userExams.percentage,
      status: userExams.status,
      submittedAt: userExams.submittedAt
    })
      .from(userExams)
      .where(eq(userExams.userId, userId))
      .orderBy(desc(userExams.submittedAt));

    if (attempts.length === 0) {
      return [];
    }

    const skillMap = new Map<string, { total: number; count: number; lastScore: number }>();

    for (const a of attempts) {
      const current = skillMap.get(a.skillName) || { total: 0, count: 0, lastScore: a.percentage };
      current.total += a.percentage;
      current.count += 1;
      // The first one we encounter is the latest due to orderBy desc
      skillMap.set(a.skillName, current);
    }

    return Array.from(skillMap.entries()).map(([skill, stats]) => ({
      skill,
      average: Math.round(stats.total / stats.count),
      latest: stats.lastScore,
      fullMark: 100
    }));
  }

  static async getDashboardInsights(userId: string) {
    await ExamSchemaService.ensureSchemaCompatibility();
    const db = getDb();

    // 1. Skill Progress (Aggregated)
    const skillStats = await this.getUserSkillStats(userId);

    // 2. Recent Activity
    const activity = await db.select({
      id: userExams.id,
      title: sql<string>`'Assessment: ' || ${userExams.skillName}`,
      type: sql<string>`'Exam Result: ' || ${userExams.status}`,
      timestamp: userExams.createdAt
    })
      .from(userExams)
      .where(eq(userExams.userId, userId))
      .orderBy(desc(userExams.createdAt))
      .limit(5);

    // 3. AI Recommendations (Bridging to Roadmap)
    // We'll use the latest failed attempt or the lowest score attempt to suggest improvements
    const [weakestAttempt] = await db.select().from(userExams)
      .where(and(eq(userExams.userId, userId), eq(userExams.status, 'FAIL')))
      .orderBy(desc(userExams.createdAt))
      .limit(1);

    let recommendations = [
      { id: '1', title: 'Start your first assessment', description: 'Take a quick diagnostic test to unlock personalized roadmaps.' }
    ];

    if (skillStats.length > 0) {
      recommendations = skillStats
        .filter(s => s.average < 80)
        .slice(0, 3)
        .map(s => ({
          id: s.skill,
          title: `Master ${s.skill}`,
          description: `You're currently at ${s.average}%. Level up to 90% to unlock the ${s.skill} Expert badge.`
        }));
    }

    if (weakestAttempt) {
      recommendations.unshift({
        id: 'weakness-focus',
        title: `Bridge the ${weakestAttempt.skillName} Gap`,
        description: `Review your last attempt at ${weakestAttempt.skillName}. We've identified specific areas for improvement in the Roadmap center.`
      });
    }

    return {
      greeting: skillStats.length > 0 ? 'Verified and active.' : 'Ready for your first validation?',
      streak: 5, // Simulated for now
      tasksDueToday: skillStats.length === 0 ? 1 : 0,
      skillProgress: skillStats.map(s => ({ skill: s.skill, progress: s.average })),
      recommendations,
      activity
    };
  }
}
