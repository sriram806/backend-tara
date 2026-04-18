import { z } from 'zod';

const ACTION_VERBS = [
  'achieved',
  'architected',
  'automated',
  'built',
  'created',
  'delivered',
  'designed',
  'developed',
  'drove',
  'improved',
  'implemented',
  'launched',
  'led',
  'managed',
  'optimized',
  'owned',
  'reduced',
  'shipped',
  'scaled',
  'streamlined'
];

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

const bulletSchema = cleanString(20, 220).refine((value) => {
  const firstWord = value.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '');
  return ACTION_VERBS.includes(firstWord);
}, {
  message: `Bullet must start with an action verb such as ${ACTION_VERBS.slice(0, 6).join(', ')}`
});

export const resumeSkillSchema = z.object({
  name: cleanString(1, 60),
  category: z.enum(['technical', 'tool', 'domain', 'soft']).default('technical'),
  proficiency: z.enum(['beginner', 'intermediate', 'advanced', 'expert']).default('intermediate')
});

export const resumeExperienceSchema = z.object({
  company: cleanString(2, 100),
  role: cleanString(2, 100),
  location: optionalCleanString(80),
  startDate: cleanString(4, 20),
  endDate: optionalCleanString(20),
  isCurrent: z.boolean().default(false),
  bullets: z.array(bulletSchema).min(2).max(6),
  technologies: z.array(cleanString(1, 40)).min(1).max(12)
});

export const resumeProjectSchema = z.object({
  name: cleanString(2, 100),
  role: optionalCleanString(100),
  url: optionalCleanString(200),
  bullets: z.array(bulletSchema).min(1).max(5),
  technologies: z.array(cleanString(1, 40)).min(1).max(12)
});

export const resumeEducationSchema = z.object({
  institution: cleanString(2, 120),
  degree: cleanString(2, 120),
  field: optionalCleanString(100),
  startYear: optionalCleanString(10),
  endYear: optionalCleanString(10),
  grade: optionalCleanString(40),
  highlights: z.array(cleanString(2, 140)).max(5).default([])
});

export const structuredResumeSchema = z.object({
  title: cleanString(2, 80).default('Primary resume'),
  summary: cleanString(80, 600),
  skills: z.array(resumeSkillSchema).min(5).max(40),
  experience: z.array(resumeExperienceSchema).min(1).max(8),
  projects: z.array(resumeProjectSchema).min(1).max(8),
  education: z.array(resumeEducationSchema).min(1).max(5)
});

export const resumeSaveRequestSchema = z.object({
  mode: z.enum(['draft', 'final']).default('draft'),
  resume: structuredResumeSchema
});

export const resumeDeleteQuerySchema = z.object({
  archive: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((value) => value !== 'false')
});

export type StructuredResumeDto = z.infer<typeof structuredResumeSchema>;
export type ResumeSaveRequestDto = z.infer<typeof resumeSaveRequestSchema>;
