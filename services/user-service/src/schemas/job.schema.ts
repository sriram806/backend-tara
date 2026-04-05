import { z } from 'zod';

export const createAnalysisJobSchema = z.object({
  resumeData: z.any().optional(),
  targetRole: z.string().optional(),
});

export type CreateAnalysisJobDto = z.infer<typeof createAnalysisJobSchema>;
