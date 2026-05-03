import crypto from 'node:crypto';
import { examQuestions } from '@thinkai/db';
import { QuestionSnapshot, QuestionUpdateInput } from './types';

export const MAX_ANSWER_LENGTH = 12000;
export const SUBMISSION_GRACE_WINDOW_SECONDS = 20;

export const PROGRAMMING_LANGUAGE_SKILLS = new Set([
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

export function normalizeSkillName(skill: string) {
  return skill.trim().replace(/\s+/g, ' ');
}

export function normalizeAnswer(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function shuffle<T>(items: T[]) {
  const clone = [...items];
  for (let index = clone.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(index + 1);
    const temp = clone[index];
    clone[index] = clone[swapIndex];
    clone[swapIndex] = temp;
  }
  return clone;
}

export function detectSkillType(skillName: string): 'STANDARD' | 'PROGRAMMING_LANGUAGE' {
  return PROGRAMMING_LANGUAGE_SKILLS.has(normalizeSkillName(skillName).toLowerCase())
    ? 'PROGRAMMING_LANGUAGE'
    : 'STANDARD';
}

export function buildDefaultBlueprint(skillName: string) {
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

export function toDisplayLanguage(value: string) {
  const normalized = normalizeSkillName(value).toLowerCase();
  const mapped: Record<string, string> = {
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
  };

  const result = mapped[normalized];
  if (result) {
    return result;
  }

  return normalizeSkillName(value);
}

export function detectPrimaryProgrammingLanguage(skillName: string, questions: QuestionSnapshot[]) {
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

export function buildInstructions(
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

export function toQuestionSnapshot(question: typeof examQuestions.$inferSelect): QuestionSnapshot {
  return {
    id: question.id,
    prompt: question.question,
    skill: question.skillName,
    type: question.type === 'MCQ' ? 'mcq' : question.type === 'FILL' ? 'fill' : 'coding',
    options: question.options ? shuffle(question.options as string[]) : undefined,
    placeholder: question.placeholder ?? undefined,
    starterCode: question.starterCode ?? undefined,
    language: question.language ?? undefined,
    marks: question.marks
  };
}

export function scoreCodeAnswer(question: typeof examQuestions.$inferSelect, submittedAnswer: string) {
  const candidate = normalizeAnswer(submittedAnswer);
  if (!candidate) {
    return false;
  }

  const metadata = (question.metadata as any) ?? {};
  const requiredTokens = Array.isArray(metadata.requiredTokens)
    ? metadata.requiredTokens.map((token: any) => normalizeAnswer(String(token))).filter(Boolean)
    : [];
  if (requiredTokens.length > 0) {
    return requiredTokens.every((token: string) => candidate.includes(token));
  }

  const acceptedAnswers = Array.isArray(metadata.acceptedAnswers)
    ? metadata.acceptedAnswers.map((value: any) => normalizeAnswer(String(value))).filter(Boolean)
    : [];
  if (acceptedAnswers.length > 0) {
    return acceptedAnswers.includes(candidate);
  }

  const expected = normalizeAnswer(question.answer);
  return candidate === expected || candidate.includes(expected) || expected.includes(candidate);
}

export function sanitizeAnswer(value: string) {
  return value.trim().slice(0, MAX_ANSWER_LENGTH);
}

export function normalizeQuestionInput(
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
