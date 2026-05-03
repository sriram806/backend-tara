import { and, desc, eq, isNull } from 'drizzle-orm';
import {
  getDb,
  resumeAnalysisRuns,
  resumeSkills,
  userResumes,
  userTargetRoles
} from '@thinkai/db';

function normalizeSkillName(skill: string) {
  return skill.trim().replace(/\s+/g, ' ');
}

function uniqueSkills(skills: string[]) {
  const map = new Map<string, string>();
  for (const raw of skills) {
    const clean = normalizeSkillName(raw);
    if (!clean) {
      continue;
    }

    const key = clean.toLowerCase();
    if (!map.has(key)) {
      map.set(key, clean);
    }
  }

  return Array.from(map.values());
}

export class UserSkillService {
  static async getSkillsProgress(userId: string) {
    const context = await this.getSkillContext(userId);

    return {
      skillExtraction: {
        skills: context.extractedSkillDetails,
        total: context.extractedSkillDetails.length
      },
      extractedSkills: context.extractedSkills,
      missingSkills: context.missingSkills,
      targetRole: context.targetRole,
      progress: []
    };
  }

  private static async getSkillContext(userId: string) {
    const db = getDb();

    const [currentResume] = await db.select().from(userResumes).where(and(
      eq(userResumes.userId, userId),
      eq(userResumes.isCurrent, true),
      isNull(userResumes.deletedAt)
    )).orderBy(desc(userResumes.updatedAt)).limit(1);

    const extractedSkillRows = currentResume
      ? await db.select().from(resumeSkills).where(eq(resumeSkills.resumeId, currentResume.id)).orderBy(resumeSkills.sortOrder)
      : [];

    const [analysis] = await db.select().from(resumeAnalysisRuns).where(and(
      eq(resumeAnalysisRuns.userId, userId),
      eq(resumeAnalysisRuns.status, 'completed')
    )).orderBy(desc(resumeAnalysisRuns.createdAt)).limit(1);

    const [targetRole] = await db.select().from(userTargetRoles).where(and(
      eq(userTargetRoles.userId, userId),
      eq(userTargetRoles.isCurrent, true)
    )).orderBy(desc(userTargetRoles.createdAt)).limit(1);

    const missingSkills = Array.isArray(analysis?.missingSkills) ? analysis.missingSkills : [];

    return {
      extractedSkills: uniqueSkills(extractedSkillRows.map((row) => row.name)),
      extractedSkillDetails: extractedSkillRows.map((row) => ({
        name: row.name,
        category: row.category,
        proficiency: row.proficiency
      })),
      missingSkills: uniqueSkills(missingSkills),
      targetRole: targetRole?.title ?? null
    };
  }
}
