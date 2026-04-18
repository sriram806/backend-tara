import { z } from 'zod';

export const interviewTypeSchema = z.enum(['technical', 'behavioral', 'hr']);

export const createInterviewSessionSchema = z.object({
  userId: z.string().min(1).max(128),
  role: z.string().min(2).max(120),
  type: interviewTypeSchema
});

export const socketStartSchema = createInterviewSessionSchema.extend({
  sessionId: z.string().min(8).max(128).optional()
});

export const socketMessageSchema = z.object({
  sessionId: z.string().min(8).max(128),
  message: z.string().min(1).max(2000)
});

export type InterviewType = z.infer<typeof interviewTypeSchema>;
export type CreateInterviewSessionDto = z.infer<typeof createInterviewSessionSchema>;
export type SocketStartDto = z.infer<typeof socketStartSchema>;
export type SocketMessageDto = z.infer<typeof socketMessageSchema>;
