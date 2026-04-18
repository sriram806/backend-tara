import { z } from 'zod';

export const resumeAnalyzeRequestSchema = z.object({
  resumeId: z.string().uuid()
});

export const runIdParamSchema = z.object({
  runId: z.string().uuid()
});

export const roadmapGenerateRequestSchema = z.object({
  analysisRunId: z.string().uuid(),
  targetRole: z.string().min(1),
  durationDays: z.number().int().min(7).max(365)
});

export type ResumeAnalyzeRequestDto = z.infer<typeof resumeAnalyzeRequestSchema>;
export type RoadmapGenerateRequestDto = z.infer<typeof roadmapGenerateRequestSchema>;
