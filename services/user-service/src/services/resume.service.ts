import crypto from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import {
  getDb,
  resumeEducation,
  resumeExperiences,
  resumeProjects,
  resumeSkills,
  userResumes,
  userTargetRoles
} from '@thinkai/db';
import { StructuredResumeDto } from '../schemas/resume.schema';
import { ResumeCacheService } from './resume-cache.service';
import { RecommendationService } from './recommendation.service';

type ResumeRow = typeof userResumes.$inferSelect;

const ACTION_VERBS = new Set([
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
]);

const ROLE_KEYWORDS: Record<string, string[]> = {
  frontend: ['React', 'Next.js', 'TypeScript', 'Accessibility', 'Performance', 'Design Systems'],
  backend: ['Node.js', 'PostgreSQL', 'Redis', 'API Design', 'Authentication', 'Docker'],
  'full stack': ['React', 'Node.js', 'PostgreSQL', 'TypeScript', 'Testing', 'Cloud'],
  data: ['SQL', 'Python', 'ETL', 'Data Modeling', 'Airflow', 'Warehousing'],
  machine: ['Python', 'PyTorch', 'Model Evaluation', 'MLOps', 'Feature Engineering', 'Inference'],
  devops: ['Docker', 'Kubernetes', 'CI/CD', 'Monitoring', 'Cloud', 'Terraform'],
  security: ['Threat Modeling', 'OAuth', 'Vulnerability Management', 'SIEM', 'Secure Coding', 'IAM']
};

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9+#. ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function countActionBullets(resume: StructuredResumeDto) {
  const bullets = [
    ...resume.experience.flatMap((item) => item.bullets),
    ...resume.projects.flatMap((item) => item.bullets)
  ];

  return bullets.filter((bullet) => ACTION_VERBS.has(normalize(bullet).split(' ')[0] || '')).length;
}

function resolveRoleKeywords(targetRole?: string | null) {
  const normalizedRole = normalize(targetRole || '');
  const matched = Object.entries(ROLE_KEYWORDS).find(([key]) => normalizedRole.includes(key));
  return matched?.[1] ?? ['TypeScript', 'SQL', 'APIs', 'Testing', 'Cloud', 'Communication'];
}

function scoreStructuredResume(resume: StructuredResumeDto, targetRole?: string | null) {
  const sectionScores = {
    summary: Math.min(100, Math.round((resume.summary.length / 180) * 100)),
    skills: Math.min(100, Math.round((resume.skills.length / 10) * 100)),
    experience: Math.min(100, Math.round((resume.experience.length / 2) * 100)),
    projects: Math.min(100, Math.round((resume.projects.length / 2) * 100)),
    education: resume.education.length > 0 ? 100 : 0
  };

  const completenessScore = Math.round(
    (sectionScores.summary + sectionScores.skills + sectionScores.experience + sectionScores.projects + sectionScores.education) / 5
  );

  const expectedKeywords = resolveRoleKeywords(targetRole);
  const searchable = normalize([
    resume.summary,
    ...resume.skills.map((s) => s.name),
    ...resume.experience.flatMap((item) => [item.role, item.company, ...item.bullets, ...item.techStack]),
    ...resume.projects.flatMap((item) => [item.name, ...item.bullets, ...item.techStack]),
    ...resume.education.flatMap((item) => [item.degree, item.college])
  ].join(' '));

  const matchedKeywords = expectedKeywords.filter((keyword) => searchable.includes(normalize(keyword)));
  const missingKeywords = expectedKeywords.filter((keyword) => !matchedKeywords.includes(keyword));
  const keywordScore = Math.round((matchedKeywords.length / Math.max(expectedKeywords.length, 1)) * 35);
  const actionScore = Math.min(20, countActionBullets(resume) * 4);
  const structureScore = Math.round(completenessScore * 0.45);
  const atsScore = Math.max(0, Math.min(100, structureScore + keywordScore + actionScore));

  return {
    atsScore,
    completenessScore,
    sectionScores,
    matchedKeywords,
    missingKeywords,
    keywordSuggestions: missingKeywords.slice(0, 8).map((keyword) => ({
      keyword,
      reason: 'This keyword commonly appears in ATS filters for your target role.',
      section: 'skills' as const
    }))
  };
}

function toStructuredText(resume: StructuredResumeDto) {
  return {
    Summary: resume.summary,
    Skills: resume.skills.join(', '),
    Experience: resume.experience
      .map((item) => `${item.role}, ${item.company} (${item.duration})\n${item.bullets.map((bullet) => `- ${bullet}`).join('\n')}`)
      .join('\n\n'),
    Projects: resume.projects
      .map((item) => `${item.name}\n${item.bullets.map((bullet) => `- ${bullet}`).join('\n')}`)
      .join('\n\n'),
    Education: resume.education
      .map((item) => `${item.degree}, ${item.college} (CGPA: ${item.cgpa}, Year: ${item.year})`)
      .join('\n')
  };
}

function flattenResumeText(resume: StructuredResumeDto) {
  const sections = toStructuredText(resume);
  return Object.entries(sections)
    .map(([section, text]) => `${section}\n${text}`)
    .join('\n\n');
}

export class ResumeService {
  static async saveStructuredResume(userId: string, resume: StructuredResumeDto, mode: 'draft' | 'final' = 'draft') {
    const db = getDb();
    const targetRole = await this.getCurrentTargetRole(userId);
    const metrics = scoreStructuredResume(resume, targetRole?.title);
    const current = await this.getCurrentResumeRow(userId);
    const now = new Date();
    const resumeId = current?.id ?? crypto.randomUUID();
    const nextVersion = current ? current.version : 1;
    const status = mode === 'final' ? 'active' : 'draft';

    await db.transaction(async (tx) => {
      if (!current) {
        await tx.insert(userResumes).values({
          id: resumeId,
          userId,
          title: resume.title,
          summary: resume.summary,
          status,
          version: nextVersion,
          completenessScore: metrics.completenessScore,
          atsScore: metrics.atsScore,
          sectionScores: metrics.sectionScores,
          keywordSuggestions: metrics.keywordSuggestions,
          draftData: resume,
          isCurrent: true,
          submittedAt: mode === 'final' ? now : null,
          updatedAt: now
        });
      } else {
        await tx.update(userResumes)
          .set({
            title: resume.title,
            summary: resume.summary,
            status,
            completenessScore: metrics.completenessScore,
            atsScore: metrics.atsScore,
            sectionScores: metrics.sectionScores,
            keywordSuggestions: metrics.keywordSuggestions,
            draftData: resume,
            submittedAt: mode === 'final' ? now : current.submittedAt,
            updatedAt: now
          })
          .where(eq(userResumes.id, resumeId));

        await tx.delete(resumeSkills).where(eq(resumeSkills.resumeId, resumeId));
        await tx.delete(resumeExperiences).where(eq(resumeExperiences.resumeId, resumeId));
        await tx.delete(resumeProjects).where(eq(resumeProjects.resumeId, resumeId));
        await tx.delete(resumeEducation).where(eq(resumeEducation.resumeId, resumeId));
      }

      if (resume.skills.length) {
        await tx.insert(resumeSkills).values(resume.skills.map((skill, index) => ({
          resumeId,
          userId,
          name: skill.name,
          category: 'technical',
          proficiency: skill.proficiency,
          sortOrder: index
        })));
      }

      if (resume.experience.length) {
        await tx.insert(resumeExperiences).values(resume.experience.map((item, index) => ({
          resumeId,
          userId,
          company: item.company,
          role: item.role,
          location: '',
          startDate: item.duration,
          endDate: '',
          isCurrent: false,
          bullets: item.bullets,
          technologies: unique(item.techStack),
          sortOrder: index,
          updatedAt: now
        })));
      }

      if (resume.projects.length) {
        await tx.insert(resumeProjects).values(resume.projects.map((item, index) => ({
          resumeId,
          userId,
          name: item.name,
          role: 'Contributor',
          url: item.link,
          bullets: item.bullets,
          technologies: unique(item.techStack),
          sortOrder: index,
          updatedAt: now
        })));
      }

      if (resume.education.length) {
        await tx.insert(resumeEducation).values(resume.education.map((item, index) => ({
          resumeId,
          userId,
          institution: item.college,
          degree: item.degree,
          field: '',
          startYear: '',
          endYear: item.year,
          grade: item.cgpa,
          highlights: [],
          sortOrder: index,
          updatedAt: now
        })));
      }
    });

    await ResumeCacheService.delete(userId);
    const saved = await this.getResume(userId, false);
    await RecommendationService.refreshForUser(userId, 'resume_updated');

    return {
      ...saved,
      message: mode === 'final' ? 'Structured resume saved' : 'Resume draft saved',
      autosaved: mode === 'draft'
    };
  }

  static async getResume(userId: string, includeHistory = false) {
    if (!includeHistory) {
      const cached = await ResumeCacheService.get(userId);
      if (cached) {
        return cached;
      }
    }

    const current = await this.getCurrentResumeRow(userId);
    if (!current) {
      throw new Error('Resume not found');
    }

    const payload = await this.toResponse(current);
    if (includeHistory) {
      const history = await this.getResumeHistoryRows(userId);
      return {
        ...payload,
        history: await Promise.all(history.map((row) => this.toResponse(row)))
      };
    }

    await ResumeCacheService.set(userId, payload);
    return payload;
  }

  static async deleteResume(userId: string, archive = true) {
    const current = await this.getCurrentResumeRow(userId);
    if (!current) {
      throw new Error('Resume not found');
    }

    const db = getDb();
    await db
      .update(userResumes)
      .set({
        status: archive ? 'archived' : current.status,
        isCurrent: false,
        deletedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(userResumes.id, current.id));

    await ResumeCacheService.delete(userId);
    await RecommendationService.refreshForUser(userId, 'resume_updated');

    return {
      id: current.id,
      archived: archive
    };
  }

  static async getCurrentStructuredResumeForAi(userId: string) {
    const resume = await this.getResume(userId, false) as any;
    const structured = resume.resume as StructuredResumeDto;
    return {
      resumeId: resume.id,
      version: resume.version,
      structuredResume: structured,
      structuredText: toStructuredText(structured),
      resumeText: flattenResumeText(structured),
      scores: {
        atsScore: resume.atsScore,
        completenessScore: resume.completenessScore,
        sectionScores: resume.sectionScores
      }
    };
  }

  private static async getCurrentTargetRole(userId: string) {
    const db = getDb();
    const rows = await db
      .select()
      .from(userTargetRoles)
      .where(and(eq(userTargetRoles.userId, userId), eq(userTargetRoles.isCurrent, true)))
      .orderBy(desc(userTargetRoles.createdAt))
      .limit(1);

    return rows[0] ?? null;
  }

  private static async getCurrentResumeRow(userId: string) {
    const db = getDb();
    const rows = await db
      .select()
      .from(userResumes)
      .where(and(
        eq(userResumes.userId, userId),
        eq(userResumes.isCurrent, true),
        isNull(userResumes.deletedAt)
      ))
      .orderBy(desc(userResumes.version))
      .limit(1);

    return rows[0] ?? null;
  }

  private static async getResumeHistoryRows(userId: string) {
    const db = getDb();
    return db
      .select()
      .from(userResumes)
      .where(eq(userResumes.userId, userId))
      .orderBy(desc(userResumes.version));
  }

  private static async toResponse(row: ResumeRow) {
    const db = getDb();
    const [skills, experiences, projects, education] = await Promise.all([
      db.select().from(resumeSkills).where(eq(resumeSkills.resumeId, row.id)).orderBy(resumeSkills.sortOrder),
      db.select().from(resumeExperiences).where(eq(resumeExperiences.resumeId, row.id)).orderBy(resumeExperiences.sortOrder),
      db.select().from(resumeProjects).where(eq(resumeProjects.resumeId, row.id)).orderBy(resumeProjects.sortOrder),
      db.select().from(resumeEducation).where(eq(resumeEducation.resumeId, row.id)).orderBy(resumeEducation.sortOrder)
    ]);

    const draft = row.draftData as any;
    const resume: any = {
      profile: draft?.profile || {
        name: '',
        email: '',
        phone: '',
        address: ''
      },
      links: draft?.links || {
        linkedUrl: '',
        githubUrl: '',
        portfolioUrl: '',
        resumePdfUrl: ''
      },
      summary: row.summary,
      skills: skills.map((skill) => ({
        name: skill.name,
        proficiency: skill.proficiency as 'beginner' | 'intermediate' | 'advanced' | 'expert'
      })),
      experience: experiences.map((item) => ({
        company: item.company,
        role: item.role,
        duration: item.startDate,
        techStack: item.technologies,
        bullets: item.bullets
      })),
      projects: projects.map((item) => ({
        name: item.name,
        techStack: item.technologies,
        link: item.url ?? '',
        bullets: item.bullets
      })),
      achievements: row.draftData?.achievements || [],
      education: education.map((item) => ({
        degree: item.degree,
        college: item.institution,
        cgpa: item.grade ?? '',
        year: item.endYear ?? ''
      }))
    };

    return {
      id: row.id,
      userId: row.userId,
      title: row.title,
      status: row.status,
      version: row.version,
      resume,
      resumeText: flattenResumeText(resume),
      structuredText: toStructuredText(resume),
      completenessScore: row.completenessScore,
      atsScore: row.atsScore,
      sectionScores: row.sectionScores,
      keywordSuggestions: row.keywordSuggestions,
      isCurrent: row.isCurrent,
      submittedAt: row.submittedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt
    };
  }
}
