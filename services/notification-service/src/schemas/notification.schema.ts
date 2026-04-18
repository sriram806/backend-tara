import { z } from 'zod';

export const emitNotificationSchema = z.object({
  userId: z.string().uuid(),
  type: z.enum(['email', 'in_app']).default('in_app'),
  title: z.string().min(1).max(180),
  message: z.string().min(1).max(3000),
  eventType: z.string().min(1).max(120).optional(),
  metadata: z.record(z.any()).optional()
});

export const markReadSchema = z.object({
  id: z.string().uuid()
});

export type EmitNotificationDto = z.infer<typeof emitNotificationSchema>;
