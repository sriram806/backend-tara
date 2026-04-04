import { z } from 'zod';

export const commonServiceEnvSchema = z.object({
  HOST: z.string().default('0.0.0.0')
});

export type CommonServiceEnv = z.infer<typeof commonServiceEnvSchema>;
