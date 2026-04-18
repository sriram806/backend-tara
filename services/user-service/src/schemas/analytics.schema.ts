import { z } from 'zod';

export const analyticsEventTypeSchema = z.enum([
  'login',
  'resume_updated',
  'exam_started',
  'exam_completed',
  'skill_passed',
  'skill_failed',
  'task_completed',
  'project_completed',
  'recommendation_clicked'
]);

export const analyticsEventRequestSchema = z.object({
  eventType: analyticsEventTypeSchema,
  metadata: z.record(z.unknown()).optional().default({})
});

export type AnalyticsEventType = z.infer<typeof analyticsEventTypeSchema>;
export type AnalyticsEventRequestDto = z.infer<typeof analyticsEventRequestSchema>;
