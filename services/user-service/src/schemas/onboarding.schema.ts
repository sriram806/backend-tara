import { z } from 'zod';

function sanitizeText(value: string) {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const cleanString = (min: number, max: number) => z
  .string()
  .transform(sanitizeText)
  .pipe(z.string().min(min).max(max));

const optionalCleanString = (max: number) => z
  .string()
  .transform(sanitizeText)
  .pipe(z.string().max(max))
  .optional()
  .or(z.literal('').transform(() => undefined));

export const targetRoleRequestSchema = z.object({
  title: cleanString(2, 120),
  level: z.enum(['intern', 'junior', 'mid', 'senior', 'lead']).default('junior'),
  industry: optionalCleanString(100),
  locationPreference: optionalCleanString(120),
  keywords: z.array(cleanString(1, 40)).min(3).max(20)
});

export type TargetRoleRequestDto = z.infer<typeof targetRoleRequestSchema>;
