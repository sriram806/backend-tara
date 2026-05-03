import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { adminAuthMiddleware, userAuthMiddleware } from '../middleware/auth.middleware';
import { ExamService } from '../services/exam.service';
import { replyOk } from '../utils/response';

const submitExamSchema = z.object({
  sessionId: z.string().uuid(),
  answers: z.record(z.string().uuid(), z.string().max(12000)).default({})
});

const upsertTemplateSchema = z.object({
  organizationId: z.string().uuid().optional().nullable(),
  skillName: z.string().min(1),
  title: z.string().optional(),
  description: z.string().optional(),
  skillType: z.enum(['STANDARD', 'PROGRAMMING_LANGUAGE']).optional(),
  difficultyLevel: z.coerce.number().int().min(1).max(5).optional(),
  passPercentage: z.coerce.number().int().min(1).max(100).optional(),
  mcqCount: z.coerce.number().int().min(0).optional(),
  fillBlankCount: z.coerce.number().int().min(0).optional(),
  codingCount: z.coerce.number().int().min(0).optional(),
  isPublished: z.boolean().optional()
});

const bulkQuestionSchema = z.object({
  replaceExisting: z.boolean().default(false),
  questions: z.array(z.object({
    type: z.enum(['MCQ', 'FILL', 'CODE']),
    question: z.string().min(1),
    options: z.array(z.string()).nullable().optional(),
    answer: z.string().min(1),
    placeholder: z.string().nullable().optional(),
    starterCode: z.string().nullable().optional(),
    language: z.string().nullable().optional(),
    explanation: z.string().nullable().optional(),
    difficulty: z.coerce.number().int().min(1).max(5).optional(),
    marks: z.coerce.number().int().min(1).optional(),
    metadata: z.record(z.string(), z.unknown()).optional()
  })).min(1)
});

const updateQuestionSchema = z.object({
  type: z.enum(['MCQ', 'FILL', 'CODE']),
  question: z.string().min(1),
  options: z.array(z.string()).nullable().optional(),
  answer: z.string().min(1),
  placeholder: z.string().nullable().optional(),
  starterCode: z.string().nullable().optional(),
  language: z.string().nullable().optional(),
  explanation: z.string().nullable().optional(),
  difficulty: z.coerce.number().int().min(1).max(5).optional(),
  marks: z.coerce.number().int().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export const examRoutes: FastifyPluginAsync = async (app) => {
  app.get('/session', { preHandler: userAuthMiddleware }, async (request, reply) => {
    const userId = request.userContext?.userId;
    if (!userId) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' });
    }

    const query = z.object({
      skill: z.string().min(1).optional()
    }).parse(request.query ?? {});
    const session = await ExamService.getOrCreateSession(userId, query.skill);
    return replyOk(reply, session);
  });

  app.get('/catalog', { preHandler: userAuthMiddleware }, async (request, reply) => {
    const userId = request.userContext?.userId;
    if (!userId) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' });
    }

    const result = await ExamService.getUserExamCatalog(userId);
    return replyOk(reply, result);
  });

  app.post('/submit', { preHandler: userAuthMiddleware }, async (request, reply) => {
    const userId = request.userContext?.userId;
    if (!userId) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' });
    }

    const payload = submitExamSchema.parse(request.body ?? {});
    const result = await ExamService.submitSession(userId, payload.sessionId, payload.answers);
    return replyOk(reply, result);
  });

  app.post('/admin/templates', { preHandler: adminAuthMiddleware }, async (request, reply) => {
    const payload = upsertTemplateSchema.parse(request.body ?? {});
    const result = await ExamService.upsertTemplate(payload);
    return replyOk(reply, result, 201);
  });

  app.get('/admin/templates', { preHandler: adminAuthMiddleware }, async (_request, reply) => {
    const result = await ExamService.listTemplates();
    return replyOk(reply, result);
  });

  app.get('/admin/templates/:skillName/questions', { preHandler: adminAuthMiddleware }, async (request, reply) => {
    const skillName = z.string().min(1).parse((request.params as { skillName?: string }).skillName);
    const result = await ExamService.listTemplateQuestions(skillName);
    return replyOk(reply, result);
  });

  app.post('/admin/templates/:skillName/questions', { preHandler: adminAuthMiddleware }, async (request, reply) => {
    const skillName = z.string().min(1).parse((request.params as { skillName?: string }).skillName);
    const payload = bulkQuestionSchema.parse(request.body ?? {});
    const result = await ExamService.bulkUpsertQuestions(skillName, payload);
    return replyOk(reply, result, 201);
  });

  app.patch('/admin/questions/:questionId', { preHandler: adminAuthMiddleware }, async (request, reply) => {
    const questionId = z.string().uuid().parse((request.params as { questionId?: string }).questionId);
    const payload = updateQuestionSchema.parse(request.body ?? {});
    const result = await ExamService.updateQuestion(questionId, payload);
    return replyOk(reply, result);
  });

  app.delete('/admin/questions/:questionId', { preHandler: adminAuthMiddleware }, async (request, reply) => {
    const questionId = z.string().uuid().parse((request.params as { questionId?: string }).questionId);
    const result = await ExamService.deleteQuestion(questionId);
    return replyOk(reply, result);
  });
};
