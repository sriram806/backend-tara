import { z } from 'zod';

export const createJobMatchSchema = z.object({
  targetRole: z.string().min(1).optional(),
  resumeText: z.string().optional(),
  jobFeed: z.array(z.any()).optional(),
  location: z.string().optional(),
  experienceYears: z.number().int().min(0).optional(),
  topN: z.number().int().min(1).max(20).optional(),
  forceRefresh: z.boolean().optional(),
});

export type CreateJobMatchDto = z.infer<typeof createJobMatchSchema>;
