import crypto from 'node:crypto';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import {
  examQuestions,
  getDb,
  resumeAnalysisRuns,
  resumeSkills,
  skillExams,
  skillProgress,
  userExams,
  userResumes,
  userTargetRoles
} from '@thinkai/db';
import { OrganizationService } from './organization.service';
import { RecommendationService } from './recommendation.service';
import { PersonalizationService } from './personalization.service';
import { AnalyticsService } from './analytics.service';
import { ExperimentService } from './experiment.service';
import { FeatureFlagService } from './feature-flag.service';

type DifficultyLevel = 1 | 2 | 3;
type QuestionType = 'MCQ' | 'FILL' | 'CODE';
type ProgressStatus = 'NOT_STARTED' | 'LEARNING' | 'PASSED';

type GeneratedQuestion = {
  type: QuestionType;
  question: string;
  options: string[] | null;
  answer: string;
  difficulty: DifficultyLevel;
};

type StartExamInput = {
  skillName?: string;
  difficultyLevel?: number;
  timeLimitSeconds?: number;
  isRetest?: boolean;
  organizationId?: string;
};

type SubmitInput = {
  userExamId: string;
  answers: Array<{ questionId: string; answer: string }>;
};

const PASS_PERCENTAGE = 75;
const MAX_ATTEMPTS_PER_SKILL = 8;
const MCQ_COUNT = 15;
const FILL_COUNT = 15;
const CODE_COUNT = 3;

const DIFFICULTY_LABELS: Record<DifficultyLevel, string> = {
  1: 'easy',
  2: 'medium',
  3: 'hard'
};

const BASE_TOPICS = [
  'state management',
  'error handling',
  'performance optimization',
  'testing strategy',
  'security basics',
  'data modeling',
  'api design',
  'debugging workflow',
  'code readability',
  'deployment fundamentals',
  'scalability',
  'observability'
];

function normalizeSkillName(skill: string) {
  return skill.trim().replace(/\s+/g, ' ');
}

function normalizeText(value: string) {
  return value.toLowerCase().trim().replace(/\s+/g, ' ');
}

function uniqueSkills(skills: string[]) {
  const map = new Map<string, string>();
  for (const raw of skills) {
    const clean = normalizeSkillName(raw);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (!map.has(key)) {
      map.set(key, clean);
    }
  }
  return Array.from(map.values());
}

function seededRandom(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }

  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    const t = (h ^= h >>> 16) >>> 0;
    return t / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number) {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const temp = next[i];
    next[i] = next[j];
    next[j] = temp;
  }
  return next;
}

function weightedMark(type: QuestionType) {
  if (type === 'CODE') return 5;
  return 1;
}

function ensureDifficulty(value?: number): DifficultyLevel {
  if (value === 1 || value === 2 || value === 3) {
    return value;
  }
  return 2;
}

function pickTopics(skillName: string, weakTopics: string[], random: () => number) {
  const merged = uniqueSkills([...weakTopics, ...BASE_TOPICS]);
  const picked = shuffle(merged, random).slice(0, 18);
  if (!picked.length) {
    return [`${skillName} fundamentals`];
  }

  return picked;
}

function makeMcq(skillName: string, topic: string, difficulty: DifficultyLevel, random: () => number): GeneratedQuestion {
  const correct = `Improve ${topic} in ${skillName}`;
  const distractors = [
    `Avoid ${topic} completely`,
    `Ignore quality checks for ${topic}`,
    `Prioritize random changes over ${topic}`,
    `Skip documentation and tests for ${topic}`
  ];

  const options = shuffle([correct, ...distractors].slice(0, 4), random);
  return {
    type: 'MCQ',
    question: `[${DIFFICULTY_LABELS[difficulty]}] In ${skillName}, what is the best next action for ${topic}?`,
    options,
    answer: correct,
    difficulty
  };
}

function makeFill(skillName: string, topic: string, difficulty: DifficultyLevel): GeneratedQuestion {
  const answer = 'best practice';
  return {
    type: 'FILL',
    question: `[${DIFFICULTY_LABELS[difficulty]}] In ${skillName}, ${topic} should follow ____ before production release.`,
    options: null,
    answer,
    difficulty
  };
}

function makeCode(skillName: string, topic: string, difficulty: DifficultyLevel): GeneratedQuestion {
  const expectedKeywords = ['validation', 'error handling', 'tests'];
  return {
    type: 'CODE',
    question: `[${DIFFICULTY_LABELS[difficulty]}] Write a short ${skillName} snippet that demonstrates ${topic} with input validation and clear error handling. Mention testing approach.`,
    options: null,
    answer: expectedKeywords.join('|'),
    difficulty
  };
}

function evaluateCodeAnswer(expected: string, provided: string) {
  const expectedTokens = expected.split('|').map((token) => normalizeText(token)).filter(Boolean);
  const normalized = normalizeText(provided);
  if (!expectedTokens.length) return 0;

  let hits = 0;
  for (const token of expectedTokens) {
    if (normalized.includes(token)) {
      hits += 1;
    }
  }

  return hits / expectedTokens.length;
}

function generateLearningTasks(skill: string) {
  return [
    `Review ${skill} fundamentals and common failure patterns.`,
    `Complete 10 focused practice problems for ${skill}.`,
    `Build one small feature using ${skill} with tests.`,
    `Write a short retrospective documenting mistakes and fixes for ${skill}.`
  ];
}

function generateProjectUsage(skill: string) {
  return `Use ${skill} in architecture decisions, implementation tasks, and delivery documentation.`;
}

export class SkillAssessmentService {
  static async startExam(userId: string, input: StartExamInput) {
    const db = getDb();
    const context = await this.getSkillContext(userId);
    const adaptiveExamFeatureEnabled = await FeatureFlagService.isFeatureEnabled(userId, 'adaptive_exam');
    const experimentContext = await ExperimentService.getExperimentContext(userId, 'exam');

    const progressRows = await db.select().from(skillProgress).where(eq(skillProgress.userId, userId));
    const progressBySkill = new Map(progressRows.map((row) => [row.skillName.toLowerCase(), row]));

    const passedSkills = new Set(
      progressRows
        .filter((row) => row.status === 'PASSED')
        .map((row) => row.skillName.toLowerCase())
    );

    const desiredSkill = input.skillName ? normalizeSkillName(input.skillName) : null;
    const candidateSkills = uniqueSkills([
      ...context.extractedSkills,
      ...context.missingSkills
    ]).filter((skill) => !passedSkills.has(skill.toLowerCase()));

    const skillName = desiredSkill ?? candidateSkills[0];
    if (!skillName) {
      throw new Error('No skill available for assessment. Complete onboarding and resume analysis first.');
    }

    const existingProgress = progressBySkill.get(skillName.toLowerCase());
    if ((existingProgress?.attempts ?? 0) >= MAX_ATTEMPTS_PER_SKILL && existingProgress?.status !== 'PASSED') {
      throw new Error('Attempt limit reached for this skill. Contact support to unlock more attempts.');
    }

    const adaptiveDifficulty = input.difficultyLevel
      ? input.difficultyLevel
      : (adaptiveExamFeatureEnabled || experimentContext.config.examDifficulty === 'adaptive')
        ? await PersonalizationService.recommendExamDifficulty(userId, skillName, 2)
        : 2;
    const difficulty = ensureDifficulty(adaptiveDifficulty);
    const weakTopics = this.getWeakTopicsFromProgress(existingProgress?.lastScore ?? 0, skillName);
    const questions = this.generateExamQuestions(skillName, difficulty, weakTopics);

    const [exam] = await db.insert(skillExams).values({
      organizationId: input.organizationId ?? null,
      skillName,
      difficultyLevel: difficulty
    }).returning();

    const insertedQuestions = await db.insert(examQuestions).values(
      questions.map((question) => ({
        examId: exam.id,
        type: question.type,
        question: question.question,
        options: question.options,
        answer: question.answer,
        difficulty: question.difficulty
      }))
    ).returning();

    const [createdUserExam] = await db.insert(userExams).values({
      userId,
      organizationId: input.organizationId ?? null,
      skillName,
      examId: exam.id,
      status: 'IN_PROGRESS',
      score: 0,
      totalMarks: 0,
      percentage: 0,
      attemptNumber: (existingProgress?.attempts ?? 0) + 1,
      timeLimitSeconds: input.timeLimitSeconds ?? 2700,
      evaluationJson: {
        mode: input.isRetest ? 'RETEST' : 'INITIAL',
        featureFlags: {
          adaptiveExamEnabled: adaptiveExamFeatureEnabled
        },
        experiment: {
          experimentId: experimentContext.experimentId,
          variantId: experimentContext.variantId,
          variantName: experimentContext.variantName,
          examDifficulty: experimentContext.config.examDifficulty
        }
      }
    }).returning();

    await db.insert(skillProgress).values({
      userId,
      skillName,
      status: existingProgress?.status ?? 'NOT_STARTED',
      lastScore: existingProgress?.lastScore ?? 0,
      attempts: existingProgress?.attempts ?? 0,
      updatedAt: new Date()
    }).onConflictDoNothing();

    const publicQuestions = shuffle(insertedQuestions, seededRandom(`${createdUserExam.id}:public`)).map((question) => ({
      id: question.id,
      type: question.type,
      question: question.question,
      options: question.options,
      difficulty: question.difficulty
    }));

    return {
      userExamId: createdUserExam.id,
      examId: exam.id,
      skillName,
      difficultyLevel: difficulty,
      timeLimitSeconds: createdUserExam.timeLimitSeconds,
      questionCount: publicQuestions.length,
      questions: publicQuestions,
      experiment: {
        experimentId: experimentContext.experimentId,
        variantId: experimentContext.variantId,
        variantName: experimentContext.variantName,
        examDifficulty: experimentContext.config.examDifficulty
      },
      featureFlags: {
        adaptiveExamEnabled: adaptiveExamFeatureEnabled
      },
      antiCheating: {
        randomized: true,
        answerExposurePrevented: true,
        maxAttemptsPerSkill: MAX_ATTEMPTS_PER_SKILL
      }
    };
  }

  static async submitExam(userId: string, input: SubmitInput) {
    const db = getDb();
    const [examAttempt] = await db.select().from(userExams).where(and(
      eq(userExams.id, input.userExamId),
      eq(userExams.userId, userId)
    )).limit(1);

    if (!examAttempt) {
      throw new Error('Exam attempt not found');
    }

    if (examAttempt.status !== 'IN_PROGRESS' || examAttempt.submittedAt) {
      throw new Error('This exam attempt has already been submitted');
    }

    const questionRows = await db.select().from(examQuestions).where(eq(examQuestions.examId, examAttempt.examId));
    if (!questionRows.length) {
      throw new Error('Exam questions not found');
    }

    const validIds = new Set(questionRows.map((row) => row.id));
    for (const response of input.answers) {
      if (!validIds.has(response.questionId)) {
        throw new Error('Submission contains invalid question identifiers');
      }
    }

    const answerByQuestion = new Map<string, string>();
    for (const answer of input.answers) {
      if (!answerByQuestion.has(answer.questionId)) {
        answerByQuestion.set(answer.questionId, answer.answer);
      }
    }

    let score = 0;
    let totalMarks = 0;
    const byType: Record<QuestionType, { correct: number; total: number }> = {
      MCQ: { correct: 0, total: 0 },
      FILL: { correct: 0, total: 0 },
      CODE: { correct: 0, total: 0 }
    };

    const wrongQuestionIds: string[] = [];

    for (const question of questionRows) {
      const type = question.type as QuestionType;
      const mark = weightedMark(type);
      totalMarks += mark;
      byType[type].total += 1;

      const submitted = answerByQuestion.get(question.id);
      if (!submitted) {
        wrongQuestionIds.push(question.id);
        continue;
      }

      let gained = 0;
      if (type === 'CODE') {
        gained = Math.round(mark * evaluateCodeAnswer(question.answer, submitted));
      } else {
        gained = normalizeText(submitted) === normalizeText(question.answer) ? mark : 0;
      }

      score += gained;
      if (gained >= mark) {
        byType[type].correct += 1;
      } else {
        wrongQuestionIds.push(question.id);
      }
    }

    const percentage = totalMarks > 0 ? Math.round((score / totalMarks) * 100) : 0;
    const status = percentage >= PASS_PERCENTAGE ? 'PASS' : 'FAIL';
    const progressStatus: ProgressStatus = status === 'PASS' ? 'PASSED' : 'LEARNING';

    const [currentProgress] = await db.select().from(skillProgress).where(and(
      eq(skillProgress.userId, userId),
      eq(skillProgress.skillName, examAttempt.skillName)
    )).limit(1);

    const experimentMeta = (
      examAttempt.evaluationJson
      && typeof examAttempt.evaluationJson === 'object'
      && 'experiment' in examAttempt.evaluationJson
      ? (examAttempt.evaluationJson as Record<string, unknown>).experiment
      : null
    ) as Record<string, unknown> | null;

    const now = new Date();
    const weakTopics = questionRows
      .filter((row) => wrongQuestionIds.includes(row.id))
      .slice(0, 5)
      .map((row) => row.question.split('] ').pop() || row.question);

    await db.update(userExams)
      .set({
        score,
        totalMarks,
        percentage,
        status,
        submittedAt: now,
        evaluationJson: {
          answeredCount: answerByQuestion.size,
          wrongQuestionIds,
          byType,
          weakTopics
        }
      })
      .where(eq(userExams.id, examAttempt.id));

    if (currentProgress) {
      await db.update(skillProgress)
        .set({
          status: progressStatus,
          lastScore: percentage,
          attempts: currentProgress.attempts + 1,
          updatedAt: now
        })
        .where(eq(skillProgress.id, currentProgress.id));
    } else {
      await db.insert(skillProgress).values({
        userId,
        skillName: examAttempt.skillName,
        status: progressStatus,
        lastScore: percentage,
        attempts: 1,
        updatedAt: now
      });
    }

    if (examAttempt.organizationId) {
      try {
        await OrganizationService.syncLeaderboard(examAttempt.organizationId);
      } catch {
        // Leaderboard sync is best-effort.
      }
    }

    await PersonalizationService.recordExamOutcome(userId, examAttempt.skillName, percentage, {
      attemptNumber: examAttempt.attemptNumber,
      timeLimitSeconds: examAttempt.timeLimitSeconds,
      durationSeconds: Math.max(0, Math.round((now.getTime() - new Date(examAttempt.createdAt).getTime()) / 1000)),
      organizationId: examAttempt.organizationId
    });

    await AnalyticsService.logEvent(userId, 'exam_completed', {
      userExamId: examAttempt.id,
      examId: examAttempt.examId,
      skillName: examAttempt.skillName,
      score,
      totalMarks,
      percentage,
      status,
      passed: status === 'PASS',
      attemptNumber: examAttempt.attemptNumber,
      organizationId: examAttempt.organizationId ?? null,
      experimentId: typeof experimentMeta?.experimentId === 'string' ? experimentMeta.experimentId : null,
      variantId: typeof experimentMeta?.variantId === 'string' ? experimentMeta.variantId : null,
      variantName: typeof experimentMeta?.variantName === 'string' ? experimentMeta.variantName : null
    });

    await AnalyticsService.logEvent(userId, status === 'PASS' ? 'skill_passed' : 'skill_failed', {
      userExamId: examAttempt.id,
      skillName: examAttempt.skillName,
      percentage,
      attemptNumber: examAttempt.attemptNumber,
      weakTopics,
      organizationId: examAttempt.organizationId ?? null,
      experimentId: typeof experimentMeta?.experimentId === 'string' ? experimentMeta.experimentId : null,
      variantId: typeof experimentMeta?.variantId === 'string' ? experimentMeta.variantId : null,
      variantName: typeof experimentMeta?.variantName === 'string' ? experimentMeta.variantName : null
    });

    await RecommendationService.refreshForUser(userId, 'exam_completed');

    const roadmap = await this.generateRoadmap(userId);
    const finalValidation = await this.computeFinalValidation(userId);

    return {
      userExamId: examAttempt.id,
      skillName: examAttempt.skillName,
      score,
      totalMarks,
      percentage,
      status,
      passThreshold: PASS_PERCENTAGE,
      nextStep: status === 'PASS' ? 'Skill marked as PASSED' : 'Skill moved to LEARNING and retest required',
      weakTopics,
      roadmap,
      finalValidation
    };
  }

  static async retestSkill(userId: string, skillName: string, timeLimitSeconds?: number, organizationId?: string) {
    const db = getDb();
    const normalizedSkill = normalizeSkillName(skillName);
    const [progress] = await db.select().from(skillProgress).where(and(
      eq(skillProgress.userId, userId),
      eq(skillProgress.skillName, normalizedSkill)
    )).limit(1);

    const attempts = progress?.attempts ?? 0;
    const lastScore = progress?.lastScore ?? 0;
    const boostedDifficulty = Math.min(
      3,
      1 + Math.floor(attempts / 2) + (lastScore >= 60 ? 1 : 0)
    );

    return this.startExam(userId, {
      skillName: normalizedSkill,
      difficultyLevel: boostedDifficulty,
      timeLimitSeconds,
      isRetest: true,
      organizationId
    });
  }

  static async getExamResult(userId: string, userExamId?: string, skillName?: string, organizationId?: string) {
    const db = getDb();

    const examRows = await db.select().from(userExams).where(organizationId
      ? and(eq(userExams.userId, userId), eq(userExams.organizationId, organizationId))
      : eq(userExams.userId, userId)).orderBy(desc(userExams.createdAt));
    const normalizedSkill = skillName ? normalizeSkillName(skillName).toLowerCase() : null;
    const selected = userExamId
      ? examRows.find((row) => row.id === userExamId)
      : normalizedSkill
        ? examRows.find((row) => row.skillName.toLowerCase() === normalizedSkill)
        : examRows[0];

    if (!selected) {
      throw new Error('Exam result not found');
    }

    const roadmap = await this.generateRoadmap(userId);
    const finalValidation = await this.computeFinalValidation(userId);

    return {
      userExamId: selected.id,
      skillName: selected.skillName,
      score: selected.score,
      totalMarks: selected.totalMarks,
      percentage: selected.percentage,
      status: selected.status,
      createdAt: selected.createdAt,
      submittedAt: selected.submittedAt,
      evaluation: selected.evaluationJson,
      roadmap,
      finalValidation
    };
  }

  static async getSkillsProgress(userId: string) {
    const db = getDb();
    const context = await this.getSkillContext(userId);
    const progress = await db.select().from(skillProgress).where(eq(skillProgress.userId, userId)).orderBy(desc(skillProgress.updatedAt));
    const roadmap = await this.generateRoadmap(userId);
    const finalValidation = await this.computeFinalValidation(userId);

    return {
      skillExtraction: {
        skills: context.extractedSkillDetails,
        total: context.extractedSkillDetails.length
      },
      extractedSkills: context.extractedSkills,
      missingSkills: context.missingSkills,
      targetRole: context.targetRole,
      progress,
      roadmap,
      finalValidation
    };
  }

  private static async getSkillContext(userId: string) {
    const db = getDb();

    const [currentResume] = await db.select().from(userResumes).where(and(
      eq(userResumes.userId, userId),
      eq(userResumes.isCurrent, true),
      isNull(userResumes.deletedAt)
    )).orderBy(desc(userResumes.updatedAt)).limit(1);

    const extractedSkillRows = currentResume
      ? await db.select().from(resumeSkills).where(eq(resumeSkills.resumeId, currentResume.id)).orderBy(resumeSkills.sortOrder)
      : [];

    const [analysis] = await db.select().from(resumeAnalysisRuns).where(and(
      eq(resumeAnalysisRuns.userId, userId),
      eq(resumeAnalysisRuns.status, 'completed')
    )).orderBy(desc(resumeAnalysisRuns.createdAt)).limit(1);

    const [targetRole] = await db.select().from(userTargetRoles).where(and(
      eq(userTargetRoles.userId, userId),
      eq(userTargetRoles.isCurrent, true)
    )).orderBy(desc(userTargetRoles.createdAt)).limit(1);

    const missingSkills = Array.isArray(analysis?.missingSkills) ? analysis.missingSkills : [];

    return {
      extractedSkills: uniqueSkills(extractedSkillRows.map((row) => row.name)),
      extractedSkillDetails: extractedSkillRows.map((row) => ({
        name: row.name,
        proficiencyEstimate: row.proficiency
      })),
      missingSkills: uniqueSkills(missingSkills),
      targetRole: targetRole?.title ?? null
    };
  }

  private static getWeakTopicsFromProgress(lastScore: number, skillName: string) {
    if (lastScore >= PASS_PERCENTAGE) {
      return [`advanced ${skillName} optimization`, `high-scale ${skillName} architecture`];
    }

    if (lastScore >= 50) {
      return [`${skillName} implementation quality`, `${skillName} debugging`];
    }

    return [`${skillName} fundamentals`, `${skillName} syntax basics`, `${skillName} testing basics`];
  }

  private static generateExamQuestions(skillName: string, difficulty: DifficultyLevel, weakTopics: string[]) {
    const random = seededRandom(`${skillName}:${difficulty}:${crypto.randomUUID()}`);
    const easyMedium = difficulty === 1 ? [1, 1, 2] : difficulty === 2 ? [1, 2, 2] : [2, 3, 3];
    const topics = pickTopics(skillName, weakTopics, random);

    const questions: GeneratedQuestion[] = [];
    for (let i = 0; i < MCQ_COUNT; i++) {
      const qDifficulty = easyMedium[i % easyMedium.length] as DifficultyLevel;
      questions.push(makeMcq(skillName, topics[i % topics.length] || 'core concepts', qDifficulty, random));
    }

    for (let i = 0; i < FILL_COUNT; i++) {
      const qDifficulty = easyMedium[i % easyMedium.length] as DifficultyLevel;
      questions.push(makeFill(skillName, topics[(i + 3) % topics.length] || 'quality checks', qDifficulty));
    }

    for (let i = 0; i < CODE_COUNT; i++) {
      const qDifficulty = Math.min(3, difficulty + 1) as DifficultyLevel;
      questions.push(makeCode(skillName, topics[(i + 6) % topics.length] || 'secure implementation', qDifficulty));
    }

    return questions;
  }

  private static async generateRoadmap(userId: string) {
    const db = getDb();
    const context = await this.getSkillContext(userId);
    const progressRows = await db.select().from(skillProgress).where(eq(skillProgress.userId, userId));

    const failedSkills = progressRows
      .filter((row) => row.status === 'LEARNING')
      .map((row) => row.skillName);

    const skillsToCover = uniqueSkills([...failedSkills, ...context.missingSkills]);

    if (!skillsToCover.length) {
      return {
        skillsToCover: [],
        minorProjects: [],
        majorProject: null,
        message: 'No skill gaps detected. Continue interview validation phase.'
      };
    }

    const perSkillPlan = skillsToCover.map((skill) => ({
      skill,
      learningTasks: generateLearningTasks(skill),
      projectUsage: generateProjectUsage(skill)
    }));

    const minorProjects = Array.from({ length: 3 }).map((_, index) => {
      const projectSkills = skillsToCover.filter((_, skillIndex) => skillIndex % 3 === index);
      const usableSkills = projectSkills.length ? projectSkills : [skillsToCover[index % skillsToCover.length]];

      return {
        name: `Minor Project ${index + 1}`,
        durationMonths: 1,
        skills: usableSkills,
        learningTasks: usableSkills.flatMap((skill) => generateLearningTasks(skill).slice(0, 2)),
        outcome: `Deliver a working module that uses ${usableSkills.join(', ')} in production-like conditions.`
      };
    });

    const majorProject = {
      name: 'Major Capstone Project',
      durationMonths: 3,
      skills: skillsToCover,
      learningTasks: skillsToCover.flatMap((skill) => generateLearningTasks(skill).slice(0, 2)),
      outcome: `Build an end-to-end solution demonstrating all required skills: ${skillsToCover.join(', ')}.`
    };

    return {
      skillsToCover,
      perSkillPlan,
      minorProjects,
      majorProject
    };
  }

  private static async computeFinalValidation(userId: string) {
    const db = getDb();
    const exams = await db.select().from(userExams).where(and(
      eq(userExams.userId, userId),
      inArray(userExams.status, ['PASS', 'FAIL'])
    ));

    const context = await this.getSkillContext(userId);
    const requiredSkills = uniqueSkills([...context.extractedSkills, ...context.missingSkills]);
    const progressRows = await db.select().from(skillProgress).where(eq(skillProgress.userId, userId));

    const passedSkills = new Set(
      progressRows
        .filter((row) => row.status === 'PASSED')
        .map((row) => row.skillName.toLowerCase())
    );

    const examAverage = exams.length
      ? Math.round(exams.reduce((sum, row) => sum + row.percentage, 0) / exams.length)
      : 0;

    const projectCompletionScore = requiredSkills.length
      ? Math.round((requiredSkills.filter((skill) => passedSkills.has(skill.toLowerCase())).length / requiredSkills.length) * 100)
      : 100;

    const interviewAiScore = Math.round((examAverage * 0.8) + (projectCompletionScore * 0.2));
    const readinessScore = Math.round((examAverage * 0.5) + (projectCompletionScore * 0.3) + (interviewAiScore * 0.2));

    const jobEligibility = readinessScore >= PASS_PERCENTAGE && requiredSkills.every((skill) => passedSkills.has(skill.toLowerCase()))
      ? 'ELIGIBLE'
      : 'NOT_ELIGIBLE';

    return {
      examAverage,
      projectCompletionScore,
      interviewAiScore,
      readinessScore,
      jobEligibility
    };
  }
}
