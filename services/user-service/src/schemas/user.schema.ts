import { z } from 'zod';

export const patchMeSchema = z.object({
  displayName: z.string().min(2).max(80).optional(),
  bio: z.string().max(280).optional()
});

export type PatchMeInput = z.infer<typeof patchMeSchema>;
