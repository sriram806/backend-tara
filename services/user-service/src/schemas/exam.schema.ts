import { z } from 'zod';

const safeSkillName = z.string().trim().min(1).max(80);

export const examStartRequestSchema = z.object({
  skillName: safeSkillName.optional(),
  difficultyLevel: z.number().int().min(1).max(3).optional(),
  timeLimitSeconds: z.number().int().min(600).max(7200).optional(),
  organizationId: z.string().uuid().optional()
});

export const examRetestRequestSchema = z.object({
  skillName: safeSkillName,
  timeLimitSeconds: z.number().int().min(600).max(7200).optional(),
  organizationId: z.string().uuid().optional()
});

export const examAnswerSchema = z.object({
  questionId: z.string().uuid(),
  answer: z.string().trim().min(1).max(4000)
});

export const examSubmitRequestSchema = z.object({
  userExamId: z.string().uuid(),
  answers: z.array(examAnswerSchema).max(60)
});

export const examResultQuerySchema = z.object({
  userExamId: z.string().uuid().optional(),
  skillName: safeSkillName.optional(),
  organizationId: z.string().uuid().optional()
});

export type ExamStartRequestDto = z.infer<typeof examStartRequestSchema>;
export type ExamRetestRequestDto = z.infer<typeof examRetestRequestSchema>;
export type ExamSubmitRequestDto = z.infer<typeof examSubmitRequestSchema>;
export type ExamResultQueryDto = z.infer<typeof examResultQuerySchema>;
