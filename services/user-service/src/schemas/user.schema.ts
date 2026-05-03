import { z } from 'zod';

export const patchMeSchema = z.object({
  displayName: z.string().min(2).max(80).optional(),
  bio: z.string().max(280).optional(),
  socialLinks: z.object({
    github: z.string().url().or(z.literal('')).optional(),
    linkedin: z.string().url().or(z.literal('')).optional(),
    twitter: z.string().url().or(z.literal('')).optional(),
    portfolio: z.string().url().or(z.literal('')).optional(),
  }).optional()
});

export type PatchMeInput = z.infer<typeof patchMeSchema>;
