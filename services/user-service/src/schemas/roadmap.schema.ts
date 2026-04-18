import { z } from 'zod';

export const createRoadmapJobSchema = z.object({
  targetRole: z.string().min(1).optional(),
  skillGaps: z.array(z.string()).optional(),
  durationDays: z.number().int().min(30).max(90).optional(),
  adaptiveContext: z.any().optional(),
  forceRefresh: z.boolean().optional(),
});

export type CreateRoadmapJobDto = z.infer<typeof createRoadmapJobSchema>;
