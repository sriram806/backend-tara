import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SERVICE_NAME: z.string().min(1),
  PORT: z.coerce.number().int().min(1).max(65535),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info')
});

type BaseEnv = z.infer<typeof baseEnvSchema>;

type LoadEnvOptions = {
  envFilePath?: string;
};

export function loadEnv<TSchema extends z.ZodRawShape>(
  schema?: z.ZodObject<TSchema>,
  options?: LoadEnvOptions
): BaseEnv & (TSchema extends z.ZodRawShape ? z.infer<z.ZodObject<TSchema>> : Record<string, never>) {
  loadDotenv({ path: options?.envFilePath });

  const mergedSchema = schema ? baseEnvSchema.merge(schema) : baseEnvSchema;
  const result = mergedSchema.safeParse(process.env);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Environment validation failed: ${details}`);
  }

  return result.data as BaseEnv &
    (TSchema extends z.ZodRawShape ? z.infer<z.ZodObject<TSchema>> : Record<string, never>);
}
