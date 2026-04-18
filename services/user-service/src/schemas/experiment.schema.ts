import { z } from 'zod';

export const experimentTypeSchema = z.enum(['roadmap', 'exam', 'recommendation']);
export const experimentStatusSchema = z.enum(['active', 'paused', 'completed']);

export const createExperimentSchema = z.object({
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().min(1).max(500).optional().default(''),
  type: experimentTypeSchema,
  status: experimentStatusSchema.optional().default('active'),
  variants: z.array(z.object({
    variantName: z.string().trim().min(1).max(20),
    config: z.record(z.unknown()).optional().default({})
  })).min(2).max(5)
});

export const updateExperimentStatusSchema = z.object({
  status: experimentStatusSchema
});

export const getVariantQuerySchema = z.object({
  type: experimentTypeSchema.optional()
});

export const trackExperimentSchema = z.object({
  experimentId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  action: z.string().trim().min(1).max(120),
  metadata: z.record(z.unknown()).optional().default({})
});

export const experimentResultsQuerySchema = z.object({
  experimentId: z.string().uuid().optional()
});

export type ExperimentType = z.infer<typeof experimentTypeSchema>;
export type ExperimentStatus = z.infer<typeof experimentStatusSchema>;
export type CreateExperimentDto = z.infer<typeof createExperimentSchema>;
export type UpdateExperimentStatusDto = z.infer<typeof updateExperimentStatusSchema>;
export type GetVariantQueryDto = z.infer<typeof getVariantQuerySchema>;
export type TrackExperimentDto = z.infer<typeof trackExperimentSchema>;
export type ExperimentResultsQueryDto = z.infer<typeof experimentResultsQuerySchema>;
