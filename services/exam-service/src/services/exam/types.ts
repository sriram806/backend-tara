export type QuestionSnapshot = {
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

export type SessionResponse = {
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

export type TemplateInput = {
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

export type BulkQuestionsInput = {
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

export type QuestionUpdateInput = {
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
