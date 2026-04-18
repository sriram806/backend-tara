import { z } from 'zod';

export const recommendationTypeSchema = z.enum(['skill', 'task', 'exam', 'project']);
export const recommendationStatusSchema = z.enum(['pending', 'completed', 'dismissed']);
export const recommendationActionSchema = z.enum(['clicked', 'completed', 'ignored']);

export const recommendationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).optional().default(10),
  refresh: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((value) => value === 'true')
});

export const recommendationActionRequestSchema = z.object({
  action: recommendationActionSchema
});

export type RecommendationType = z.infer<typeof recommendationTypeSchema>;
export type RecommendationStatus = z.infer<typeof recommendationStatusSchema>;
export type RecommendationAction = z.infer<typeof recommendationActionSchema>;
export type RecommendationQueryDto = z.infer<typeof recommendationQuerySchema>;
export type RecommendationActionRequestDto = z.infer<typeof recommendationActionRequestSchema>;