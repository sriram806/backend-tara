import { z } from 'zod';

const sanitizeText = (value: string) => value
  .replace(/<[^>]*>/g, ' ')
  .replace(/[<>]/g, '')
  .replace(/javascript:/gi, '')
  .replace(/on\w+=/gi, '')
  .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const cleanString = (min: number, max: number) => z
  .string()
  .transform(sanitizeText)
  .pipe(z.string().min(min).max(max));

const optionalCleanString = (max: number) => z.string().transform(sanitizeText).pipe(z.string().max(max)).optional().or(z.literal('').transform(() => undefined));

export const organizationTypeSchema = z.enum(['college', 'company', 'institute']);
export const organizationRoleSchema = z.enum(['admin', 'mentor', 'student']);
export const organizationAssignmentTypeSchema = z.enum(['skill', 'exam', 'project', 'roadmap']);

export const organizationCreateSchema = z.object({
  name: cleanString(2, 120),
  type: organizationTypeSchema
});

export const organizationInviteSchema = z.object({
  organizationId: z.string().uuid(),
  email: z.string().email(),
  role: organizationRoleSchema.default('student')
});

export const organizationJoinSchema = z.object({
  token: z.string().min(24).max(256)
});

export const organizationDashboardQuerySchema = z.object({
  organizationId: z.string().uuid()
});

export const organizationMemberParamsSchema = z.object({
  memberId: z.string().uuid()
});

export const organizationAssignmentSchema = z.object({
  organizationId: z.string().uuid(),
  type: organizationAssignmentTypeSchema,
  title: cleanString(2, 120),
  description: optionalCleanString(400),
  targetSkillName: optionalCleanString(80),
  targetExamSkill: optionalCleanString(80),
  payload: z.record(z.any()).default({}),
  dueAt: z.string().datetime().optional()
});

export type OrganizationType = z.infer<typeof organizationTypeSchema>;
export type OrganizationRole = z.infer<typeof organizationRoleSchema>;
export type OrganizationAssignmentType = z.infer<typeof organizationAssignmentTypeSchema>;
export type OrganizationCreateDto = z.infer<typeof organizationCreateSchema>;
export type OrganizationInviteDto = z.infer<typeof organizationInviteSchema>;
export type OrganizationJoinDto = z.infer<typeof organizationJoinSchema>;
export type OrganizationDashboardQueryDto = z.infer<typeof organizationDashboardQuerySchema>;
export type OrganizationMemberParamsDto = z.infer<typeof organizationMemberParamsSchema>;
export type OrganizationAssignmentDto = z.infer<typeof organizationAssignmentSchema>;