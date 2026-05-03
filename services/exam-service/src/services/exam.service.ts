import crypto from 'node:crypto';
import axios from 'axios';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  examQuestions,
  getDb,
  resumeSkills,
  skillExams,
  skillProgress,
  skillRequests,
  userExams,
  userResumes,
  issuedCertificates,
  examAssignments,
  organizations,
  organizationMembers,
  users
} from '@thinkai/db';

type QuestionSnapshot = {
  id: string;
  prompt: string;
  skill: string;
  type: 'mcq' | 'fill' | 'coding';
  options?: string[];
  placeholder?: string;
  starterCode?: string;
  language?: string;
  marks: number;
};

type SessionResponse = {
  id: string;
  title: string;
  skillName: string;
  skillType: 'STANDARD' | 'PROGRAMMING_LANGUAGE';
  durationInSeconds: number;
  timeRemainingInSeconds: number;
  startedAt: string;
  endsAt: string;
  passPercentage: number;
  instructions: string[];
  questions: QuestionSnapshot[];
};

type TemplateInput = {
  organizationId?: string | null;
  skillName: string;
  title?: string;
  description?: string;
  skillType?: 'STANDARD' | 'PROGRAMMING_LANGUAGE';
  difficultyLevel?: number;
  passPercentage?: number;
  mcqCount?: number;
  fillBlankCount?: number;
  codingCount?: number;
  isPublished?: boolean;
  securityConfig?: {
    enforceFullscreen: boolean;
    disableCopyPaste: boolean;
    trackTabSwitches: boolean;
    shuffleQuestions: boolean;
    maxTabSwitches?: number;
  };
};

type BulkQuestionsInput = {
  replaceExisting: boolean;
  questions: Array<{
    type: 'MCQ' | 'FILL' | 'CODE';
    question: string;
    options?: string[] | null;
    answer: string;
    placeholder?: string | null;
    starterCode?: string | null;
    language?: string | null;
    explanation?: string | null;
    difficulty?: number;
    marks?: number;
    metadata?: Record<string, unknown>;
  }>;
};

type QuestionUpdateInput = {
  type: 'MCQ' | 'FILL' | 'CODE';
  question: string;
  options?: string[] | null;
  answer: string;
  placeholder?: string | null;
  starterCode?: string | null;
  language?: string | null;
  explanation?: string | null;
  difficulty?: number;
  marks?: number;
  metadata?: Record<string, unknown>;
};

const MAX_ANSWER_LENGTH = 12000;
const SUBMISSION_GRACE_WINDOW_SECONDS = 20;

const PROGRAMMING_LANGUAGE_SKILLS = new Set([
  'c',
  'c#',
  'c++',
  'go',
  'java',
  'javascript',
  'kotlin',
  'php',
  'python',
  'ruby',
  'rust',
  'scala',
  'swift',
  'typescript'
]);

function normalizeSkillName(skill: string) {
  return skill.trim().replace(/\s+/g, ' ');
}

function normalizeAnswer(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function shuffle<T>(items: T[]) {
  const clone = [...items];
  for (let index = clone.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(index + 1);
    const temp = clone[index];
    clone[index] = clone[swapIndex];
    clone[swapIndex] = temp;
  }
  return clone;
}

function detectSkillType(skillName: string): 'STANDARD' | 'PROGRAMMING_LANGUAGE' {
  return PROGRAMMING_LANGUAGE_SKILLS.has(normalizeSkillName(skillName).toLowerCase())
    ? 'PROGRAMMING_LANGUAGE'
    : 'STANDARD';
}

function buildDefaultBlueprint(skillName: string) {
  const skillType = detectSkillType(skillName);
  return {
    skillType,
    passPercentage: 65,
    mcqCount: skillType === 'PROGRAMMING_LANGUAGE' ? 25 : 15,
    fillBlankCount: skillType === 'PROGRAMMING_LANGUAGE' ? 0 : 10,
    codingCount: skillType === 'PROGRAMMING_LANGUAGE' ? 3 : 0,
    difficultyLevel: 1
  };
}

function toDisplayLanguage(value: string) {
  const normalized = normalizeSkillName(value).toLowerCase();
  const mapped = {
    c: 'C',
    'c#': 'C#',
    'c++': 'C++',
    go: 'Go',
    java: 'Java',
    javascript: 'JavaScript',
    kotlin: 'Kotlin',
    php: 'PHP',
    python: 'Python',
    ruby: 'Ruby',
    rust: 'Rust',
    scala: 'Scala',
    swift: 'Swift',
    typescript: 'TypeScript'
  }[normalized];

  if (mapped) {
    return mapped;
  }

  return normalizeSkillName(value);
}

function detectPrimaryProgrammingLanguage(skillName: string, questions: QuestionSnapshot[]) {
  const fromCodingQuestions = questions
    .filter((question) => question.type === 'coding')
    .map((question) => question.language?.trim() ?? '')
    .filter(Boolean);

  if (fromCodingQuestions.length > 0) {
    return toDisplayLanguage(fromCodingQuestions[0]);
  }

  return detectSkillType(skillName) === 'PROGRAMMING_LANGUAGE'
    ? toDisplayLanguage(skillName)
    : null;
}

function buildInstructions(
  skillType: 'STANDARD' | 'PROGRAMMING_LANGUAGE',
  skillName: string,
  codingLanguage: string | null
) {
  const displaySkill = normalizeSkillName(skillName);
  return [
    'The exam stays in secure full-screen mode and auto-submits on tab switch or blur.',
    'Questions and MCQ options are shuffled uniquely for each session.',
    skillType === 'PROGRAMMING_LANGUAGE'
      ? `This ${displaySkill} assessment uses practical ${codingLanguage ?? displaySkill} coding tasks inside the platform editor.`
      : `This ${displaySkill} assessment mixes concept recall with quick fill-in validation to measure real familiarity.`,
    skillType === 'PROGRAMMING_LANGUAGE'
      ? `Use the platform editor for clean ${codingLanguage ?? displaySkill} solutions and explain intent through readable code.`
      : `Keep ${displaySkill} answers concise and final so evaluation reflects your current platform readiness.`,
    'Submit clear, final answers because the latest submitted attempt updates your visible skill progress.'
  ];
}

function toQuestionSnapshot(question: typeof examQuestions.$inferSelect): QuestionSnapshot {
  return {
    id: question.id,
    prompt: question.question,
    skill: question.skillName,
    type: question.type === 'MCQ' ? 'mcq' : question.type === 'FILL' ? 'fill' : 'coding',
    options: question.options ? shuffle(question.options) : undefined,
    placeholder: question.placeholder ?? undefined,
    starterCode: question.starterCode ?? undefined,
    language: question.language ?? undefined,
    marks: question.marks
  };
}

function scoreCodeAnswer(question: typeof examQuestions.$inferSelect, submittedAnswer: string) {
  const candidate = normalizeAnswer(submittedAnswer);
  if (!candidate) {
    return false;
  }

  const metadata = question.metadata ?? {};
  const requiredTokens = Array.isArray(metadata.requiredTokens)
    ? metadata.requiredTokens.map((token) => normalizeAnswer(String(token))).filter(Boolean)
    : [];
  if (requiredTokens.length > 0) {
    return requiredTokens.every((token) => candidate.includes(token));
  }

  const acceptedAnswers = Array.isArray(metadata.acceptedAnswers)
    ? metadata.acceptedAnswers.map((value) => normalizeAnswer(String(value))).filter(Boolean)
    : [];
  if (acceptedAnswers.length > 0) {
    return acceptedAnswers.includes(candidate);
  }

  const expected = normalizeAnswer(question.answer);
  return candidate === expected || candidate.includes(expected) || expected.includes(candidate);
}

function sanitizeAnswer(value: string) {
  return value.trim().slice(0, MAX_ANSWER_LENGTH);
}

function normalizeQuestionInput(
  input: QuestionUpdateInput,
  fallback: { difficulty: number; marks: number; skillName?: string }
) {
  const options = input.options?.map((value) => value.trim()).filter(Boolean) ?? null;
  const normalizedAnswer = input.answer.trim();

  if (input.type === 'MCQ') {
    if (!options || options.length < 2) {
      throw new Error('MCQ questions must include at least two options.');
    }

    const hasMatchingAnswer = options.some((option) => normalizeAnswer(option) === normalizeAnswer(normalizedAnswer));
    if (!hasMatchingAnswer) {
      throw new Error('MCQ answer must match one of the provided options.');
    }
  }

  return {
    skillName: fallback.skillName,
    type: input.type,
    question: input.question.trim(),
    options,
    answer: normalizedAnswer,
    placeholder: input.placeholder ?? null,
    starterCode: input.starterCode ?? null,
    language: input.language ?? null,
    explanation: input.explanation ?? null,
    difficulty: input.difficulty ?? fallback.difficulty,
    marks: input.marks ?? fallback.marks,
    metadata: input.metadata ?? {}
  };
}

function getSessionDeadline(session: typeof userExams.$inferSelect) {
  return new Date(session.startedAt.getTime() + (session.timeLimitSeconds * 1000));
}

function getRemainingSeconds(session: typeof userExams.$inferSelect, now = new Date()) {
  const remainingMs = getSessionDeadline(session).getTime() - now.getTime();
  return Math.floor(remainingMs / 1000);
}

export class ExamService {
  private static schemaCompatibilityPromise: Promise<void> | null = null;

  private static async ensureSchemaCompatibility() {
    if (!this.schemaCompatibilityPromise) {
      this.schemaCompatibilityPromise = (async () => {
        const db = getDb();

        await db.execute(sql`
          DO $$ BEGIN
            CREATE TYPE exam_skill_type AS ENUM ('STANDARD', 'PROGRAMMING_LANGUAGE');
          EXCEPTION
            WHEN duplicate_object THEN NULL;
          END $$;
        `);

        await db.execute(sql`ALTER TABLE IF EXISTS skill_exams ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT ''`);
        await db.execute(sql`ALTER TABLE IF EXISTS skill_exams ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT ''`);
        await db.execute(sql`ALTER TABLE IF EXISTS skill_exams ADD COLUMN IF NOT EXISTS organization_id UUID`);
        await db.execute(sql`ALTER TABLE IF EXISTS skill_exams ADD COLUMN IF NOT EXISTS skill_name TEXT NOT NULL DEFAULT ''`);
        await db.execute(sql`ALTER TABLE IF EXISTS skill_exams ADD COLUMN IF NOT EXISTS skill_type exam_skill_type NOT NULL DEFAULT 'STANDARD'`);
        await db.execute(sql`ALTER TABLE IF EXISTS skill_exams ADD COLUMN IF NOT EXISTS difficulty_level INTEGER NOT NULL DEFAULT 1`);
        await db.execute(sql`ALTER TABLE IF EXISTS skill_exams ADD COLUMN IF NOT EXISTS pass_percentage INTEGER NOT NULL DEFAULT 65`);
        await db.execute(sql`ALTER TABLE IF EXISTS skill_exams ADD COLUMN IF NOT EXISTS mcq_count INTEGER NOT NULL DEFAULT 15`);
        await db.execute(sql`ALTER TABLE IF EXISTS skill_exams ADD COLUMN IF NOT EXISTS fill_blank_count INTEGER NOT NULL DEFAULT 10`);
        await db.execute(sql`ALTER TABLE IF EXISTS skill_exams ADD COLUMN IF NOT EXISTS coding_count INTEGER NOT NULL DEFAULT 0`);
        await db.execute(sql`ALTER TABLE IF EXISTS skill_exams ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT TRUE`);
        await db.execute(sql`ALTER TABLE IF EXISTS skill_exams ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS skill_exams_org_idx ON skill_exams (organization_id)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS skill_exams_skill_difficulty_idx ON skill_exams (skill_name, difficulty_level)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS skill_exams_skill_type_idx ON skill_exams (skill_name, skill_type)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS skill_exams_created_at_idx ON skill_exams (created_at)`);

        await db.execute(sql`ALTER TABLE IF EXISTS exam_questions ADD COLUMN IF NOT EXISTS exam_id UUID`);
        await db.execute(sql`ALTER TABLE IF EXISTS exam_questions ADD COLUMN IF NOT EXISTS skill_name TEXT NOT NULL DEFAULT ''`);
        await db.execute(sql`ALTER TABLE IF EXISTS exam_questions ADD COLUMN IF NOT EXISTS type exam_question_type`);
        await db.execute(sql`ALTER TABLE IF EXISTS exam_questions ADD COLUMN IF NOT EXISTS question TEXT NOT NULL DEFAULT ''`);
        await db.execute(sql`ALTER TABLE IF EXISTS exam_questions ADD COLUMN IF NOT EXISTS options JSONB DEFAULT NULL`);
        await db.execute(sql`ALTER TABLE IF EXISTS exam_questions ADD COLUMN IF NOT EXISTS answer TEXT NOT NULL DEFAULT ''`);
        await db.execute(sql`ALTER TABLE IF EXISTS exam_questions ADD COLUMN IF NOT EXISTS placeholder TEXT`);
        await db.execute(sql`ALTER TABLE IF EXISTS exam_questions ADD COLUMN IF NOT EXISTS starter_code TEXT`);
        await db.execute(sql`ALTER TABLE IF EXISTS exam_questions ADD COLUMN IF NOT EXISTS language TEXT`);
        await db.execute(sql`ALTER TABLE IF EXISTS exam_questions ADD COLUMN IF NOT EXISTS explanation TEXT`);
        await db.execute(sql`ALTER TABLE IF EXISTS exam_questions ADD COLUMN IF NOT EXISTS difficulty INTEGER NOT NULL DEFAULT 1`);
        await db.execute(sql`ALTER TABLE IF EXISTS exam_questions ADD COLUMN IF NOT EXISTS marks INTEGER NOT NULL DEFAULT 1`);
        await db.execute(sql`ALTER TABLE IF EXISTS exam_questions ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb`);
        await db.execute(sql`ALTER TABLE IF EXISTS exam_questions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS exam_questions_exam_id_idx ON exam_questions (exam_id)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS exam_questions_skill_name_idx ON exam_questions (skill_name)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS exam_questions_type_idx ON exam_questions (type)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS exam_questions_difficulty_idx ON exam_questions (difficulty)`);

        await db.execute(sql`ALTER TABLE IF EXISTS user_exams ADD COLUMN IF NOT EXISTS organization_id UUID`);
        await db.execute(sql`ALTER TABLE IF EXISTS user_exams ADD COLUMN IF NOT EXISTS skill_name TEXT NOT NULL DEFAULT ''`);
        await db.execute(sql`ALTER TABLE IF EXISTS user_exams ADD COLUMN IF NOT EXISTS exam_id UUID`);
        await db.execute(sql`ALTER TABLE IF EXISTS user_exams ADD COLUMN IF NOT EXISTS score INTEGER NOT NULL DEFAULT 0`);
        await db.execute(sql`ALTER TABLE IF EXISTS user_exams ADD COLUMN IF NOT EXISTS total_marks INTEGER NOT NULL DEFAULT 0`);
        await db.execute(sql`ALTER TABLE IF EXISTS user_exams ADD COLUMN IF NOT EXISTS percentage INTEGER NOT NULL DEFAULT 0`);
        await db.execute(sql`ALTER TABLE IF EXISTS user_exams ADD COLUMN IF NOT EXISTS status exam_status NOT NULL DEFAULT 'IN_PROGRESS'`);
        await db.execute(sql`ALTER TABLE IF EXISTS user_exams ADD COLUMN IF NOT EXISTS attempt_number INTEGER NOT NULL DEFAULT 1`);
        await db.execute(sql`ALTER TABLE IF EXISTS user_exams ADD COLUMN IF NOT EXISTS time_limit_seconds INTEGER NOT NULL DEFAULT 2700`);
        await db.execute(sql`ALTER TABLE IF EXISTS user_exams ADD COLUMN IF NOT EXISTS pass_percentage INTEGER NOT NULL DEFAULT 65`);
        await db.execute(sql`ALTER TABLE IF EXISTS user_exams ADD COLUMN IF NOT EXISTS answers_json JSONB NOT NULL DEFAULT '{}'::jsonb`);
        await db.execute(sql`ALTER TABLE IF EXISTS user_exams ADD COLUMN IF NOT EXISTS question_snapshot_json JSONB NOT NULL DEFAULT '[]'::jsonb`);
        await db.execute(sql`ALTER TABLE IF EXISTS user_exams ADD COLUMN IF NOT EXISTS evaluation_json JSONB NOT NULL DEFAULT '{}'::jsonb`);
        await db.execute(sql`ALTER TABLE IF EXISTS user_exams ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
        await db.execute(sql`ALTER TABLE IF EXISTS user_exams ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
        await db.execute(sql`ALTER TABLE IF EXISTS user_exams ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS user_exams_organization_idx ON user_exams (organization_id)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS user_exams_user_skill_idx ON user_exams (user_id, skill_name)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS user_exams_status_idx ON user_exams (status)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS user_exams_created_at_idx ON user_exams (created_at)`);

        await db.execute(sql`ALTER TABLE IF EXISTS skill_progress ADD COLUMN IF NOT EXISTS skill_name TEXT NOT NULL DEFAULT ''`);
        await db.execute(sql`ALTER TABLE IF EXISTS skill_progress ADD COLUMN IF NOT EXISTS status skill_progress_status NOT NULL DEFAULT 'NOT_STARTED'`);
        await db.execute(sql`ALTER TABLE IF EXISTS skill_progress ADD COLUMN IF NOT EXISTS last_score INTEGER NOT NULL DEFAULT 0`);
        await db.execute(sql`ALTER TABLE IF EXISTS skill_progress ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0`);
        await db.execute(sql`ALTER TABLE IF EXISTS skill_progress ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
        await db.execute(sql`ALTER TABLE IF EXISTS skill_progress ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
        await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS skill_progress_user_skill_unique_idx ON skill_progress (user_id, skill_name)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS skill_progress_user_status_idx ON skill_progress (user_id, status)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS skill_progress_updated_at_idx ON skill_progress (updated_at)`);

        await db.execute(sql`
          DO $$ BEGIN
            IF EXISTS (
              SELECT 1
              FROM information_schema.columns
              WHERE table_name = 'skill_exams' AND column_name = 'skill'
            ) THEN
              UPDATE skill_exams
              SET skill_name = skill
              WHERE COALESCE(skill_name, '') = '' AND COALESCE(skill, '') <> '';
            END IF;
          END $$;
        `);

        await db.execute(sql`
          DO $$ BEGIN
            IF EXISTS (
              SELECT 1
              FROM information_schema.columns
              WHERE table_name = 'exam_questions' AND column_name = 'skill'
            ) THEN
              UPDATE exam_questions
              SET skill_name = skill
              WHERE COALESCE(skill_name, '') = '' AND COALESCE(skill, '') <> '';
            END IF;
          END $$;
        `);

        await db.execute(sql`
          DO $$ BEGIN
            IF EXISTS (
              SELECT 1
              FROM information_schema.columns
              WHERE table_name = 'user_exams' AND column_name = 'skill'
            ) THEN
              UPDATE user_exams
              SET skill_name = skill
              WHERE COALESCE(skill_name, '') = '' AND COALESCE(skill, '') <> '';
            END IF;
          END $$;
        `);

        await db.execute(sql`
          DO $$ BEGIN
            IF EXISTS (
              SELECT 1
              FROM information_schema.columns
              WHERE table_name = 'skill_progress' AND column_name = 'skill'
            ) THEN
              UPDATE skill_progress
              SET skill_name = skill
              WHERE COALESCE(skill_name, '') = '' AND COALESCE(skill, '') <> '';
            END IF;
          END $$;
        `);
      })().catch((error) => {
        this.schemaCompatibilityPromise = null;
        throw error;
      });
    }

    return this.schemaCompatibilityPromise;
  }

  static async getUserExamCatalog(userId: string) {
    await this.ensureSchemaCompatibility();
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

  static async getSkillSummaries(userId: string) {
    await this.ensureSchemaCompatibility();
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

  static async scheduleRetake(userId: string, skillName: string) {
    await this.ensureSchemaCompatibility();
    await this.createSessionForSkill(userId, normalizeSkillName(skillName), true);
    return {
      message: 'Retake scheduled successfully.'
    };
  }

  /**
   * Returns skills that have at least one published exam.
   * Used for onboarding recommendations.
   */
  static async getSkillSuggestions(query: string, limit = 10) {
    await this.ensureSchemaCompatibility();
    const db = getDb();

    // Find published exams that match the query
    const results = await db.select({
      skillName: skillExams.skillName,
      title: skillExams.title,
      type: skillExams.skillType
    })
      .from(skillExams)
      .where(and(
        eq(skillExams.isPublished, true),
        sql`LOWER(${skillExams.skillName}) LIKE ${'%' + query.toLowerCase() + '%'}`
      ))
      .limit(limit);

    return results;
  }

  /**
   * Records a user request for a missing skill assessment.
   */
  static async requestSkill(userId: string, skillName: string) {
    await this.ensureSchemaCompatibility();
    const db = getDb();
    const normalized = normalizeSkillName(skillName);

    // Check if it already exists in requests
    const [existing] = await db.select()
      .from(skillRequests)
      .where(eq(skillRequests.skillName, normalized))
      .limit(1);

    if (existing) {
      await db.update(skillRequests)
        .set({
          requestCount: existing.requestCount + 1,
          lastRequestedAt: new Date()
        })
        .where(eq(skillRequests.id, existing.id));

      return { message: 'Skill request updated', id: existing.id };
    }

    const [created] = await db.insert(skillRequests)
      .values({
        userId,
        skillName: normalized,
        status: 'pending'
      })
      .returning();

    return { message: 'Skill request submitted', id: created.id };
  }

  static async getOrCreateSession(userId: string, requestedSkillName?: string) {
    await this.ensureSchemaCompatibility();
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
    await this.ensureSchemaCompatibility();
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

  /**
   * Returns a list of all user-requested skills, prioritized by frequency.
   */
  static async listSkillRequests() {
    await this.ensureSchemaCompatibility();
    const db = getDb();

    const results = await db.select()
      .from(skillRequests)
      .orderBy(desc(skillRequests.requestCount));

    return results;
  }

  /**
   * Updates the status of a skill request.
   */
  static async updateSkillRequestStatus(requestId: string, status: 'pending' | 'approved' | 'rejected' | 'implemented') {
    await this.ensureSchemaCompatibility();
    const db = getDb();

    const [updated] = await db.update(skillRequests)
      .set({ status })
      .where(eq(skillRequests.id, requestId))
      .returning();

    return updated;
  }

  /**
   * Provides detailed analytics for a specific skill exam.
   */
  static async getExamAnalytics(skillName: string) {
    await this.ensureSchemaCompatibility();
    const db = getDb();
    const normalized = normalizeSkillName(skillName);

    // 1. Fetch all attempts for this skill
    const attempts = await db.select()
      .from(userExams)
      .where(eq(userExams.skillName, normalized))
      .orderBy(desc(userExams.createdAt));

    if (attempts.length === 0) {
      return {
        summary: { totalAttempts: 0, passRate: 0, avgScore: 0 },
        distribution: [],
        questionPerformance: []
      };
    }

    // 2. Calculate summary stats
    const totalAttempts = attempts.length;
    const passedAttempts = attempts.filter(a => a.status === 'PASS').length;
    const passRate = Math.round((passedAttempts / totalAttempts) * 100);
    const avgScore = Math.round(attempts.reduce((acc, a) => acc + a.percentage, 0) / totalAttempts);

    // 3. Score distribution (deciles)
    const distribution = Array.from({ length: 10 }, (_, i) => ({
      range: `${i * 10}-${(i + 1) * 10}%`,
      count: attempts.filter(a => a.percentage >= i * 10 && a.percentage < (i + 1) * 10).length
    }));

    // 4. Question performance analysis
    // We analyze the 'evaluation_json' from user_exams
    const questionStats = new Map<string, { total: number; correct: number; prompt: string }>();

    for (const attempt of attempts) {
      const evaluation = (attempt.evaluationJson as any) || {};
      const questions = (attempt.questionSnapshotJson as any[]) || [];

      for (const q of questions) {
        const stats = questionStats.get(q.id) || { total: 0, correct: 0, prompt: q.prompt };
        stats.total += 1;
        if (evaluation[q.id]?.isCorrect) {
          stats.correct += 1;
        }
        questionStats.set(q.id, stats);
      }
    }

    const questionPerformance = Array.from(questionStats.entries()).map(([id, stats]) => ({
      id,
      prompt: stats.prompt,
      successRate: Math.round((stats.correct / stats.total) * 100),
      totalAttempts: stats.total
    })).sort((a, b) => a.successRate - b.successRate); // Worst performing questions first

    // 5. Recent Attempts with User Details
    const recentAttempts = await db.select({
      id: userExams.id,
      userName: (users as any).name,
      status: userExams.status,
      score: userExams.percentage,
      createdAt: userExams.createdAt,
      proctoringLogs: (userExams as any).proctoringLogsJson
    })
      .from(userExams)
      .leftJoin(users, eq(userExams.userId, users.id))
      .where(eq(userExams.skillName, normalized))
      .orderBy(desc(userExams.createdAt))
      .limit(10);

    const mappedAttempts = recentAttempts.map(a => ({
      id: a.id,
      userName: a.userName,
      status: a.status,
      score: a.score,
      createdAt: a.createdAt,
      violationCount: (a.proctoringLogs as any[] || []).filter(l =>
        ['TAB_SWITCH', 'FULLSCREEN_EXIT', 'WINDOW_BLUR'].includes(l.event)
      ).length
    }));

    return {
      summary: {
        totalAttempts,
        passRate,
        avgScore,
        trend: attempts.slice(0, 10).map(a => ({ date: a.createdAt.toISOString(), score: a.percentage }))
      },
      distribution,
      questionPerformance,
      recentAttempts: mappedAttempts
    };
  }

  /**
   * Returns high-level stats for the Admin Moderation Dashboard.
   */
  static async getModerationOverview() {
    await this.ensureSchemaCompatibility();
    const db = getDb();

    const [totalRequests] = await db.select({ count: sql<number>`count(*)` }).from(skillRequests);
    const [pendingRequests] = await db.select({ count: sql<number>`count(*)` }).from(skillRequests).where(eq(skillRequests.status, 'pending'));

    const templates = await db.select().from(skillExams);
    const draftTemplates = templates.filter(t => !t.isPublished).length;
    const publishedTemplates = templates.filter(t => t.isPublished).length;

    return {
      requests: {
        total: Number(totalRequests?.count ?? 0),
        pending: Number(pendingRequests?.count ?? 0)
      },
      content: {
        totalExams: templates.length,
        draft: draftTemplates,
        published: publishedTemplates
      }
    };
  }

  static async upsertTemplate(input: TemplateInput) {
    await this.ensureSchemaCompatibility();
    const db = getDb();
    const skillName = normalizeSkillName(input.skillName);
    const defaults = buildDefaultBlueprint(skillName);
    const [existing] = await db.select().from(skillExams).where(eq(skillExams.skillName, skillName)).orderBy(desc(skillExams.createdAt)).limit(1);
    const values = {
      organizationId: input.organizationId ?? null,
      skillName,
      title: input.title ?? `${skillName} Skill Assessment`,
      description: input.description ?? `Assessment bank for ${skillName}`,
      skillType: input.skillType ?? defaults.skillType,
      difficultyLevel: input.difficultyLevel ?? defaults.difficultyLevel,
      passPercentage: input.passPercentage ?? defaults.passPercentage,
      mcqCount: input.mcqCount ?? defaults.mcqCount,
      fillBlankCount: input.fillBlankCount ?? defaults.fillBlankCount,
      codingCount: input.codingCount ?? defaults.codingCount,
      isPublished: input.isPublished ?? true,
      securityConfig: input.securityConfig ?? {
        enforceFullscreen: false,
        disableCopyPaste: true,
        trackTabSwitches: true,
        shuffleQuestions: true
      }
    } as const;

    if (existing) {
      await db.update(skillExams).set(values).where(eq(skillExams.id, existing.id));
      return {
        id: existing.id,
        ...values
      };
    }

    const [created] = await db.insert(skillExams).values(values).returning();
    return created;
  }

  static async listTemplates() {
    await this.ensureSchemaCompatibility();
    const db = getDb();
    const rows = await db.select().from(skillExams).orderBy(desc(skillExams.createdAt));
    return Promise.all(rows.map(async (row) => {
      const questions = await db.select().from(examQuestions).where(eq(examQuestions.examId, row.id));
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

      return {
        ...row,
        availableQuestions: counts
      };
    }));
  }

  static async listTemplateQuestions(skillName: string) {
    await this.ensureSchemaCompatibility();
    const template = await this.getTemplateBySkill(normalizeSkillName(skillName), { requirePublished: false });
    const db = getDb();
    return db.select().from(examQuestions).where(eq(examQuestions.examId, template.id));
  }

  static async generateAiQuestions(skillName: string, options: { count: number; difficulty: number; type: string }) {
    await this.ensureSchemaCompatibility();
    const normalized = normalizeSkillName(skillName);
    const template = await this.getTemplateBySkill(normalized, { requirePublished: false });

    try {
      const response = await axios.post(`${process.env.AI_SERVICE_URL}/ai/exam/generate-questions`, {
        skillName: normalized,
        count: options.count,
        difficulty: options.difficulty,
        type: options.type
      });

      if (!response.data.success) {
        throw new Error(response.data.error || 'AI generation failed');
      }

      const generated = response.data.data.questions as any[];
      const rows = generated.map((q) => ({
        examId: template.id,
        skillName: template.skillName,
        type: q.type,
        question: q.question,
        answer: q.answer,
        explanation: q.explanation,
        difficulty: q.difficulty || options.difficulty,
        marks: q.marks || q.difficulty || options.difficulty,
        options: q.options || null,
        placeholder: q.placeholder || null,
        starterCode: q.starterCode || null,
        language: q.language || null,
        metadata: {}
      }));

      const db = getDb();
      const inserted = await db.insert(examQuestions).values(rows).returning();

      return {
        examId: template.id,
        skillName: template.skillName,
        inserted: inserted.length,
        questions: inserted
      };
    } catch (error) {
      console.error('AI Generation Error:', error);
      throw new Error(`AI Question Generation failed: ${(error as any).message}`);
    }
  }

  static async bulkUpsertQuestions(skillName: string, input: BulkQuestionsInput) {
    await this.ensureSchemaCompatibility();
    const db = getDb();
    const template = await this.getTemplateBySkill(normalizeSkillName(skillName), { requirePublished: false });

    if (input.replaceExisting) {
      await db.delete(examQuestions).where(eq(examQuestions.examId, template.id));
    }

    const rows = input.questions.map((question, index) => {
      try {
        return {
          examId: template.id,
          ...normalizeQuestionInput(question, {
            difficulty: template.difficultyLevel,
            marks: 1,
            skillName: template.skillName
          })
        };
      } catch (error) {
        throw new Error(`Question ${index + 1}: ${(error as Error).message}`);
      }
    });

    const inserted = rows.length ? await db.insert(examQuestions).values(rows).returning() : [];
    return {
      examId: template.id,
      skillName: template.skillName,
      inserted: inserted.length
    };
  }

  static async updateQuestion(questionId: string, input: QuestionUpdateInput) {
    await this.ensureSchemaCompatibility();
    const db = getDb();
    const [existing] = await db.select().from(examQuestions).where(eq(examQuestions.id, questionId)).limit(1);

    if (!existing) {
      throw new Error('Question not found');
    }

    const values = normalizeQuestionInput(input, {
      difficulty: existing.difficulty,
      marks: existing.marks,
      skillName: existing.skillName
    });

    const [updated] = await db.update(examQuestions)
      .set(values)
      .where(eq(examQuestions.id, questionId))
      .returning();

    return updated;
  }

  static async deleteQuestion(questionId: string) {
    await this.ensureSchemaCompatibility();
    const db = getDb();
    const [existing] = await db.select().from(examQuestions).where(eq(examQuestions.id, questionId)).limit(1);

    if (!existing) {
      throw new Error('Question not found');
    }

    await db.delete(examQuestions).where(eq(examQuestions.id, questionId));

    return {
      id: existing.id,
      examId: existing.examId,
      skillName: existing.skillName,
      deleted: true
    };
  }

  private static async createSessionForSkill(userId: string, skillName: string, forceRetake: boolean) {
    const db = getDb();
    const template = await this.getTemplateBySkill(skillName);
    const questionRows = await db.select().from(examQuestions).where(eq(examQuestions.examId, template.id));
    const selectedQuestions = this.selectQuestions(template, questionRows);

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
        await this.issueCertificate(session.userId, session.id);
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

  private static selectQuestions(template: typeof skillExams.$inferSelect, questions: Array<typeof examQuestions.$inferSelect>) {
    const pickByDifficulty = (pool: typeof questions, targetCount: number) => {
      if (targetCount === 0) return [];

      const easy = pool.filter(q => q.difficulty <= 2);
      const medium = pool.filter(q => q.difficulty === 3 || q.difficulty === 4);
      const hard = pool.filter(q => q.difficulty >= 5);

      const easyTarget = Math.round(targetCount * 0.5);
      const mediumTarget = Math.round(targetCount * 0.4);
      const hardTarget = targetCount - easyTarget - mediumTarget;

      const selectedEasy = shuffle(easy).slice(0, easyTarget);
      const selectedMedium = shuffle(medium).slice(0, mediumTarget);
      const selectedHard = shuffle(hard).slice(0, hardTarget);

      const result = [...selectedEasy, ...selectedMedium, ...selectedHard];

      // Fallback: If we don't have enough questions of a specific difficulty, fill with others
      if (result.length < targetCount) {
        const remaining = pool.filter(q => !result.find(r => r.id === q.id));
        result.push(...shuffle(remaining).slice(0, targetCount - result.length));
      }

      return result;
    };

    const mcqPool = questions.filter((question) => question.type === 'MCQ');
    const fillPool = questions.filter((question) => question.type === 'FILL');
    const codePool = questions.filter((question) => question.type === 'CODE');

    const mcq = pickByDifficulty(mcqPool, template.mcqCount);
    const fill = pickByDifficulty(fillPool, template.fillBlankCount);
    const code = pickByDifficulty(codePool, template.codingCount);

    if (mcq.length < template.mcqCount || fill.length < template.fillBlankCount || code.length < template.codingCount) {
      throw new Error(`Question bank for ${template.skillName} does not satisfy the configured blueprint (MCQ: ${mcq.length}/${template.mcqCount}, Fill: ${fill.length}/${template.fillBlankCount}, Code: ${code.length}/${template.codingCount})`);
    }

    return shuffle([...mcq, ...fill, ...code]);
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

  private static async issueCertificate(userId: string, attemptId: string) {
    const db = getDb();
    const [attempt] = await db.select().from(userExams).where(eq(userExams.id, attemptId)).limit(1);
    if (!attempt || attempt.status !== 'PASS') {
      throw new Error('Valid passed attempt required for certificate issuance');
    }

    const [existing] = await db.select().from(issuedCertificates).where(eq(issuedCertificates.examAttemptId, attemptId)).limit(1);
    if (existing) {
      return existing;
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const certificateHash = crypto.createHash('sha256').update(`${userId}-${attemptId}-${Date.now()}`).digest('hex');

    const [issued] = await db.insert(issuedCertificates).values({
      userId,
      examAttemptId: attemptId,
      skillName: attempt.skillName,
      certificateHash,
      score: attempt.score,
      percentage: attempt.percentage,
      issuedAt: new Date(),
      metadata: {
        userName: (user as any)?.name || 'Candidate',
        userEmail: user?.email,
        attemptNumber: attempt.attemptNumber,
        skillType: (attempt.evaluationJson as any)?.skillType
      }
    }).returning();

    return issued;
  }

  static async getCertificate(attemptId: string, userId: string) {
    await this.ensureSchemaCompatibility();
    const db = getDb();
    const [cert] = await db.select().from(issuedCertificates).where(and(
      eq(issuedCertificates.examAttemptId, attemptId),
      eq(issuedCertificates.userId, userId)
    )).limit(1);

    if (!cert) {
      throw new Error('Certificate not found');
    }

    return cert;
  }

  static async verifyCertificate(hash: string) {
    await this.ensureSchemaCompatibility();
    const db = getDb();
    const [cert] = await db.select().from(issuedCertificates).where(eq(issuedCertificates.certificateHash, hash)).limit(1);
    if (!cert) {
      throw new Error('Invalid or expired certificate');
    }

    return {
      isValid: true,
      issuedTo: (cert.metadata as any)?.userName,
      skill: cert.skillName,
      issuedAt: cert.issuedAt,
      percentage: cert.percentage
    };
  }

  static async logProctoringEvent(userId: string, sessionId: string, event: string, metadata?: Record<string, unknown>) {
    await this.ensureSchemaCompatibility();
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
    await this.ensureSchemaCompatibility();
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
        tabSwitches: ((attempt as any).proctoringLogsJson as any[]).filter(l => l.event === 'TAB_SWITCH').length,
        fullscreenViolations: ((attempt as any).proctoringLogsJson as any[]).filter(l => l.event === 'FULLSCREEN_EXIT').length
      }
    };
  }
  static async assignExam(adminId: string, payload: { examId: string; userId?: string; teamId?: string; organizationId?: string; deadlineAt?: string; priority?: string }) {
    await this.ensureSchemaCompatibility();
    const db = getDb();

    // Validate target
    if (!payload.userId && !payload.teamId && !payload.organizationId) {
      throw new Error('At least one assignment target (user, team, or organization) is required');
    }

    const [assignment] = await db.insert(examAssignments).values({
      examId: payload.examId,
      userId: payload.userId || null,
      teamId: payload.teamId || null,
      organizationId: payload.organizationId || null,
      assignedBy: adminId,
      deadlineAt: payload.deadlineAt ? new Date(payload.deadlineAt) : null,
      priority: payload.priority || 'MEDIUM'
    }).returning();

    return assignment;
  }

  static async listUserAssignments(userId: string) {
    await this.ensureSchemaCompatibility();
    const db = getDb();

    // Fetch assignments for this user specifically, or their teams, or their organizations
    // Note: This logic assumes we can join with teams and organization members
    // For now, let's just fetch direct user assignments and organization assignments
    const assignments = await db.select({
      id: examAssignments.id,
      examId: examAssignments.examId,
      status: examAssignments.status,
      priority: examAssignments.priority,
      deadlineAt: examAssignments.deadlineAt,
      skillName: skillExams.skillName,
      description: skillExams.description
    })
      .from(examAssignments)
      .innerJoin(skillExams, eq(examAssignments.examId, skillExams.id))
      .where(and(
        eq(examAssignments.userId, userId),
        eq(examAssignments.status, 'PENDING')
      ))
      .orderBy(desc(examAssignments.createdAt));

    return assignments;
  }

  static async getOrganizationOverview(orgId: string) {
    await this.ensureSchemaCompatibility();
    const db = getDb();

    // 1. Total team members
    const members = await db.select().from(organizationMembers).where(eq(organizationMembers.organizationId, orgId));

    // 2. Total exams taken by these members
    const attempts = await db.select({
      id: userExams.id,
      userId: userExams.userId,
      skillName: userExams.skillName,
      score: userExams.percentage,
      status: userExams.status,
      createdAt: userExams.createdAt
    })
      .from(userExams)
      .where(eq(userExams.organizationId, orgId))
      .orderBy(desc(userExams.createdAt));

    // 3. Aggregate performance
    const totalAttempts = attempts.length;
    const passedAttempts = attempts.filter(a => a.status === 'PASS').length;
    const avgScore = totalAttempts > 0
      ? Math.round(attempts.reduce((acc, a) => acc + a.score, 0) / totalAttempts)
      : 0;

    // 4. Skills distribution
    const skillMap = new Map<string, { count: number; avg: number; passRate: number }>();
    attempts.forEach(a => {
      const stats = skillMap.get(a.skillName) || { count: 0, avg: 0, passRate: 0 };
      stats.count += 1;
      stats.avg += a.score;
      if (a.status === 'PASS') stats.passRate += 1;
      skillMap.set(a.skillName, stats);
    });

    const skillStats = Array.from(skillMap.entries()).map(([name, stats]) => ({
      name,
      count: stats.count,
      avgScore: Math.round(stats.avg / stats.count),
      passRate: Math.round((stats.passRate / stats.count) * 100)
    }));

    return {
      summary: {
        totalMembers: members.length,
        totalAttempts,
        passRate: totalAttempts > 0 ? Math.round((passedAttempts / totalAttempts) * 100) : 0,
        avgScore
      },
      skillStats,
      recentAttempts: attempts.slice(0, 10)
    };
  }

  private static async getTemplateBySkill(skillName: string, options?: { requirePublished?: boolean }) {
    const db = getDb();
    const [template] = await db.select().from(skillExams).where(eq(skillExams.skillName, skillName)).orderBy(desc(skillExams.createdAt)).limit(1);
    if (!template) {
      throw new Error(`No exam template found for ${skillName}`);
    }

    if (options?.requirePublished !== false && !template.isPublished) {
      throw new Error(`No published exam template found for ${skillName}`);
    }

    return template;
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
}
