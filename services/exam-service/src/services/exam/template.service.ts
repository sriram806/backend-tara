import axios from 'axios';
import { desc, eq } from 'drizzle-orm';
import { getDb, skillExams, examQuestions } from '@thinkai/db';
import { ExamSchemaService } from './schema';
import { TemplateInput, BulkQuestionsInput, QuestionUpdateInput } from './types';
import { 
  normalizeSkillName, 
  buildDefaultBlueprint, 
  normalizeQuestionInput, 
  shuffle 
} from './utils';

export class ExamTemplateService {
  static async upsertTemplate(input: TemplateInput) {
    await ExamSchemaService.ensureSchemaCompatibility();
    const db = getDb();
    const skillName = normalizeSkillName(input.skillName);
    const defaults = buildDefaultBlueprint(skillName);
    const [existing] = await db.select().from(skillExams).where(eq(skillExams.skillName, skillName)).orderBy(desc(skillExams.createdAt)).limit(1);
    
    const values = {
      organizationId: input.organizationId ?? null,
      skillName,
      title: input.title ?? `${skillName} Skill Assessment`,
      description: input.description ?? `Assessment bank for ${skillName}`,
      skillType: input.skillType ?? defaults.skillType,
      difficultyLevel: input.difficultyLevel ?? defaults.difficultyLevel,
      passPercentage: input.passPercentage ?? defaults.passPercentage,
      mcqCount: input.mcqCount ?? defaults.mcqCount,
      fillBlankCount: input.fillBlankCount ?? defaults.fillBlankCount,
      codingCount: input.codingCount ?? defaults.codingCount,
      isPublished: input.isPublished ?? true,
      securityConfig: input.securityConfig ?? {
        enforceFullscreen: false,
        disableCopyPaste: true,
        trackTabSwitches: true,
        shuffleQuestions: true
      }
    } as const;

    if (existing) {
      await db.update(skillExams).set(values).where(eq(skillExams.id, existing.id));
      return {
        id: existing.id,
        ...values
      };
    }

    const [created] = await db.insert(skillExams).values(values).returning();
    return created;
  }

  static async listTemplates() {
    await ExamSchemaService.ensureSchemaCompatibility();
    const db = getDb();
    const rows = await db.select().from(skillExams).orderBy(desc(skillExams.createdAt));
    return Promise.all(rows.map(async (row) => {
      const questions = await db.select().from(examQuestions).where(eq(examQuestions.examId, row.id));
      const counts = questions.reduce((acc, question) => {
        acc.total += 1;
        if (question.type === 'MCQ') acc.mcq += 1;
        else if (question.type === 'FILL') acc.fill += 1;
        else acc.code += 1;

        if (question.difficulty <= 2) acc.easy += 1;
        else if (question.difficulty === 3 || question.difficulty === 4) acc.medium += 1;
        else acc.hard += 1;

        return acc;
      }, { total: 0, mcq: 0, fill: 0, code: 0, easy: 0, medium: 0, hard: 0 });

      return {
        ...row,
        availableQuestions: counts
      };
    }));
  }

  static async listTemplateQuestions(skillName: string) {
    await ExamSchemaService.ensureSchemaCompatibility();
    const template = await this.getTemplateBySkill(normalizeSkillName(skillName), { requirePublished: false });
    const db = getDb();
    return db.select().from(examQuestions).where(eq(examQuestions.examId, template.id));
  }

  static async generateAiQuestions(skillName: string, options: { count: number; difficulty: number; type: string }) {
    await ExamSchemaService.ensureSchemaCompatibility();
    const normalized = normalizeSkillName(skillName);
    const template = await this.getTemplateBySkill(normalized, { requirePublished: false });

    try {
      const response = await axios.post(`${process.env.AI_SERVICE_URL}/ai/exam/generate-questions`, {
        skillName: normalized,
        count: options.count,
        difficulty: options.difficulty,
        type: options.type
      });

      if (!response.data.success) {
        throw new Error(response.data.error || 'AI generation failed');
      }

      const generated = response.data.data.questions as any[];
      const rows = generated.map((q) => ({
        examId: template.id,
        skillName: template.skillName,
        type: q.type,
        question: q.question,
        answer: q.answer,
        explanation: q.explanation,
        difficulty: q.difficulty || options.difficulty,
        marks: q.marks || q.difficulty || options.difficulty,
        options: q.options || null,
        placeholder: q.placeholder || null,
        starterCode: q.starterCode || null,
        language: q.language || null,
        metadata: {}
      }));

      const db = getDb();
      const inserted = await db.insert(examQuestions).values(rows).returning();

      return {
        examId: template.id,
        skillName: template.skillName,
        inserted: inserted.length,
        questions: inserted
      };
    } catch (error) {
      console.error('AI Generation Error:', error);
      throw new Error(`AI Question Generation failed: ${(error as any).message}`);
    }
  }

  static async bulkUpsertQuestions(skillName: string, input: BulkQuestionsInput) {
    await ExamSchemaService.ensureSchemaCompatibility();
    const db = getDb();
    const template = await this.getTemplateBySkill(normalizeSkillName(skillName), { requirePublished: false });

    if (input.replaceExisting) {
      await db.delete(examQuestions).where(eq(examQuestions.examId, template.id));
    }

    const rows = input.questions.map((question, index) => {
      try {
        return {
          examId: template.id,
          ...normalizeQuestionInput(question, {
            difficulty: template.difficultyLevel,
            marks: 1,
            skillName: template.skillName
          })
        };
      } catch (error) {
        throw new Error(`Question ${index + 1}: ${(error as Error).message}`);
      }
    });

    const inserted = rows.length ? await db.insert(examQuestions).values(rows).returning() : [];
    return {
      examId: template.id,
      skillName: template.skillName,
      inserted: inserted.length
    };
  }

  static async updateQuestion(questionId: string, input: QuestionUpdateInput) {
    await ExamSchemaService.ensureSchemaCompatibility();
    const db = getDb();
    const [existing] = await db.select().from(examQuestions).where(eq(examQuestions.id, questionId)).limit(1);

    if (!existing) {
      throw new Error('Question not found');
    }

    const values = normalizeQuestionInput(input, {
      difficulty: existing.difficulty,
      marks: existing.marks,
      skillName: existing.skillName
    });

    const [updated] = await db.update(examQuestions)
      .set(values)
      .where(eq(examQuestions.id, questionId))
      .returning();

    return updated;
  }

  static async deleteQuestion(questionId: string) {
    await ExamSchemaService.ensureSchemaCompatibility();
    const db = getDb();
    const [existing] = await db.select().from(examQuestions).where(eq(examQuestions.id, questionId)).limit(1);

    if (!existing) {
      throw new Error('Question not found');
    }

    await db.delete(examQuestions).where(eq(examQuestions.id, questionId));

    return {
      id: existing.id,
      examId: existing.examId,
      skillName: existing.skillName,
      deleted: true
    };
  }

  static selectQuestions(template: typeof skillExams.$inferSelect, questions: Array<typeof examQuestions.$inferSelect>) {
    const pickByDifficulty = (pool: typeof questions, targetCount: number) => {
      if (targetCount === 0) return [];

      const easy = pool.filter(q => q.difficulty <= 2);
      const medium = pool.filter(q => q.difficulty === 3 || q.difficulty === 4);
      const hard = pool.filter(q => q.difficulty >= 5);

      const easyTarget = Math.round(targetCount * 0.5);
      const mediumTarget = Math.round(targetCount * 0.4);
      const hardTarget = targetCount - easyTarget - mediumTarget;

      const selectedEasy = shuffle(easy).slice(0, easyTarget);
      const selectedMedium = shuffle(medium).slice(0, mediumTarget);
      const selectedHard = shuffle(hard).slice(0, hardTarget);

      const result = [...selectedEasy, ...selectedMedium, ...selectedHard];

      if (result.length < targetCount) {
        const remaining = pool.filter(q => !result.find(r => r.id === q.id));
        result.push(...shuffle(remaining).slice(0, targetCount - result.length));
      }

      return result;
    };

    const mcqPool = questions.filter((question) => question.type === 'MCQ');
    const fillPool = questions.filter((question) => question.type === 'FILL');
    const codePool = questions.filter((question) => question.type === 'CODE');

    const mcq = pickByDifficulty(mcqPool, template.mcqCount);
    const fill = pickByDifficulty(fillPool, template.fillBlankCount);
    const code = pickByDifficulty(codePool, template.codingCount);

    if (mcq.length < template.mcqCount || fill.length < template.fillBlankCount || code.length < template.codingCount) {
      throw new Error(`Question bank for ${template.skillName} does not satisfy the configured blueprint (MCQ: ${mcq.length}/${template.mcqCount}, Fill: ${fill.length}/${template.fillBlankCount}, Code: ${code.length}/${template.codingCount})`);
    }

    return shuffle([...mcq, ...fill, ...code]);
  }

  static async getTemplateBySkill(skillName: string, options?: { requirePublished?: boolean }) {
    const db = getDb();
    const [template] = await db.select().from(skillExams).where(eq(skillExams.skillName, skillName)).orderBy(desc(skillExams.createdAt)).limit(1);
    if (!template) {
      throw new Error(`No exam template found for ${skillName}`);
    }

    if (options?.requirePublished !== false && !template.isPublished) {
      throw new Error(`No published exam template found for ${skillName}`);
    }

    return template;
  }
}
