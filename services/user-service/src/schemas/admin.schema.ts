import { z } from 'zod';

// ─── Create User ──────────────────────────────────────────────────────────────

export const createUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  fullName: z.string().min(1).max(120).optional(),
  role: z
    .enum(['guest', 'user', 'support', 'moderator', 'admin'])
    .optional()
    .default('user'),
  status: z.enum(['active', 'suspended']).optional().default('active')
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

// ─── Update User ──────────────────────────────────────────────────────────────

export const updateUserSchema = z.object({
  role: z.enum(['guest', 'user', 'support', 'moderator', 'admin']).optional(),
  plan: z.enum(['LITE', 'PRO', 'ENTERPRISE']).nullable().optional(),
  status: z.enum(['active', 'suspended', 'deleted']).optional(),
  customFields: z
    .array(
      z.object({
        key: z.string().min(1).max(64),
        value: z.string().max(512)
      })
    )
    .optional(),
  customRoleId: z.string().uuid().nullable().optional()
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

// ─── Ban User ─────────────────────────────────────────────────────────────────

export const banUserSchema = z.object({
  reason: z.string().max(500).optional()
});

export type BanUserInput = z.infer<typeof banUserSchema>;

// ─── Mute User ────────────────────────────────────────────────────────────────

export const muteUserSchema = z.object({
  /** Duration in hours. Defaults to 24h if omitted. Max 8760h (1 year). */
  durationHours: z.coerce.number().int().min(1).max(8760).default(24),
  reason: z.string().max(500).optional()
});

export type MuteUserInput = z.infer<typeof muteUserSchema>;
