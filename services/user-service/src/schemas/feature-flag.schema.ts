import { z } from 'zod';

export const featureFlagKeySchema = z.string().trim().min(1).max(120).regex(/^[a-z0-9][a-z0-9_-]*$/i);

export const featureFlagParamSchema = z.object({
  key: featureFlagKeySchema
});

export const featureFlagIdParamSchema = z.object({
  id: z.string().uuid()
});

export const featureFlagOverrideIdParamSchema = z.object({
  id: z.string().uuid(),
  overrideId: z.string().uuid()
});

export const createFeatureFlagSchema = z.object({
  key: featureFlagKeySchema,
  description: z.string().trim().max(500).optional().default(''),
  isEnabled: z.boolean().optional().default(false),
  rolloutPercentage: z.coerce.number().int().min(0).max(100).optional().default(0),
  scheduledRolloutAt: z.coerce.date().optional().nullable()
});

export const updateFeatureFlagSchema = z.object({
  description: z.string().trim().max(500).optional(),
  isEnabled: z.boolean().optional(),
  rolloutPercentage: z.coerce.number().int().min(0).max(100).optional(),
  scheduledRolloutAt: z.coerce.date().optional().nullable()
});

export const createFeatureFlagOverrideSchema = z.object({
  userId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  isEnabled: z.boolean()
}).superRefine((value, ctx) => {
  const hasUserId = Boolean(value.userId);
  const hasOrganizationId = Boolean(value.organizationId);

  if (hasUserId === hasOrganizationId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Provide exactly one of userId or organizationId'
    });
  }
});

export type FeatureFlagKeyDto = z.infer<typeof featureFlagKeySchema>;
export type CreateFeatureFlagDto = z.infer<typeof createFeatureFlagSchema>;
export type UpdateFeatureFlagDto = z.infer<typeof updateFeatureFlagSchema>;
export type CreateFeatureFlagOverrideDto = z.infer<typeof createFeatureFlagOverrideSchema>;