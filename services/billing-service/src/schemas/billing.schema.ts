import { z } from 'zod';
import { PlanName } from '../utils/plans';

export const subscribeSchema = z.object({
  plan: z.enum(['LITE', 'PRO', 'ENTERPRISE']),
  idempotencyKey: z
    .string()
    .trim()
    .min(8)
    .max(128)
    .regex(/^[a-zA-Z0-9._:-]+$/)
    .optional()
});

export const verifySchema = z.object({
  razorpayOrderId: z.string().min(4),
  razorpayPaymentId: z.string().min(4),
  razorpaySignature: z.string().min(8)
});

export const webhookSchema = z.object({
  event: z.string(),
  payload: z.record(z.any())
});

export const quotaConsumeSchema = z.object({
  feature: z.enum(['career', 'resume', 'roadmap', 'jobs', 'interview', 'assessment']),
  units: z.number().int().min(1).default(1)
});

export type SubscribeDto = z.infer<typeof subscribeSchema>;
export type VerifyDto = z.infer<typeof verifySchema>;
export type QuotaConsumeDto = z.infer<typeof quotaConsumeSchema>;
export type BillingPlan = PlanName;
