import { z } from 'zod';

export const commonServiceEnvSchema = z.object({
  HOST: z.string().default('0.0.0.0'),
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
  METRICS_NAMESPACE: z.string().default('ThinkAI/Services'),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000)
});

export type CommonServiceEnv = z.infer<typeof commonServiceEnvSchema>;
