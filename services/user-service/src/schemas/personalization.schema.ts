import { z } from 'zod';

const sanitizeText = (value: string) => value
  .replace(/<[^>]*>/g, ' ')
  .replace(/[<>]/g, '')
  .replace(/javascript:/gi, '')
  .replace(/on\w+=/gi, '')
  .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const cleanString = (min: number, max: number) => z
  .string()
  .transform(sanitizeText)
  .pipe(z.string().min(min).max(max));

const optionalCleanString = (max: number) => z
  .string()
  .transform(sanitizeText)
  .pipe(z.string().max(max))
  .optional()
  .or(z.literal('').transform(() => undefined));

export const personalizationActionSchema = z.enum([
  'login',
  'exam',
  'task_complete',
  'task_started',
  'roadmap_generated',
  'resume_saved',
  'insight_view',
  'reminder_opened',
  'profile_view'
]);

export const userActivitySchema = z.object({
  action: personalizationActionSchema,
  durationSeconds: z.number().int().min(0).max(24 * 60 * 60).optional(),
  metadata: z.record(z.any()).default({})
});

export const insightsQuerySchema = z.object({
  includePlan: z.boolean().optional().default(true)
});

export const dailyPlanSchema = z.object({
  userId: z.string().uuid(),
  action: cleanString(2, 80),
  notes: optionalCleanString(400)
});

export type PersonalizationAction = z.infer<typeof personalizationActionSchema>;
export type UserActivityDto = z.infer<typeof userActivitySchema>;
export type InsightsQueryDto = z.infer<typeof insightsQuerySchema>;
export type DailyPlanDto = z.infer<typeof dailyPlanSchema>;
