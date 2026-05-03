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
  isPublished: z.boolean().optional(),
  securityConfig: z.object({
    enforceFullscreen: z.boolean(),
    disableCopyPaste: z.boolean(),
    trackTabSwitches: z.boolean(),
    shuffleQuestions: z.boolean(),
    maxTabSwitches: z.number().optional()
  }).optional()
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

  app.post('/admin/templates/:skillName/generate-questions', { preHandler: adminAuthMiddleware }, async (request, reply) => {
    const skillName = z.string().min(1).parse((request.params as { skillName?: string }).skillName);
    const schema = z.object({
      count: z.coerce.number().int().min(1).max(20).default(5),
      difficulty: z.coerce.number().int().min(1).max(5).default(3),
      type: z.enum(['MCQ', 'FILL', 'CODE']).default('MCQ')
    });
    const payload = schema.parse(request.body ?? {});
    const result = await ExamService.generateAiQuestions(skillName, payload);
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

  app.get('/admin/requests', { preHandler: adminAuthMiddleware }, async (_request, reply) => {
    const result = await ExamService.listSkillRequests();
    return replyOk(reply, result);
  });

  app.patch('/admin/requests/:requestId', { preHandler: adminAuthMiddleware }, async (request, reply) => {
    const requestId = z.string().uuid().parse((request.params as { requestId?: string }).requestId);
    const { status } = z.object({ status: z.enum(['pending', 'approved', 'rejected', 'implemented']) }).parse(request.body ?? {});
    const result = await ExamService.updateSkillRequestStatus(requestId, status);
    return replyOk(reply, result);
  });

  app.get('/admin/moderation/overview', { preHandler: adminAuthMiddleware }, async (_request, reply) => {
    const result = await ExamService.getModerationOverview();
    return replyOk(reply, result);
  });

  app.get('/admin/analytics/:skillName', { preHandler: adminAuthMiddleware }, async (request, reply) => {
    const skillName = z.string().min(1).parse((request.params as { skillName?: string }).skillName);
    const result = await ExamService.getExamAnalytics(skillName);
    return replyOk(reply, result);
  });

  app.get('/certificate/:attemptId', { preHandler: userAuthMiddleware }, async (request, reply) => {
    const userId = request.userContext?.userId;
    if (!userId) return reply.code(401).send({ success: false, error: 'Unauthorized' });
    
    const attemptId = z.string().uuid().parse((request.params as { attemptId?: string }).attemptId);
    const result = await ExamService.getCertificate(attemptId, userId);
    return replyOk(reply, result);
  });

  app.get('/certificate/verify/:hash', async (request, reply) => {
    const hash = z.string().min(10).parse((request.params as { hash?: string }).hash);
    const result = await ExamService.verifyCertificate(hash);
    return replyOk(reply, result);
  });

  app.post('/session/:sessionId/log', { preHandler: userAuthMiddleware }, async (request, reply) => {
    const userId = request.userContext?.userId;
    if (!userId) return reply.code(401).send({ success: false, error: 'Unauthorized' });

    const sessionId = z.string().uuid().parse((request.params as { sessionId?: string }).sessionId);
    const schema = z.object({
      event: z.string().min(1),
      metadata: z.record(z.string(), z.unknown()).optional()
    });
    const payload = schema.parse(request.body ?? {});
    
    const result = await ExamService.logProctoringEvent(userId, sessionId, payload.event, payload.metadata);
    return replyOk(reply, result);
  });

  app.get('/admin/attempts/:attemptId/audit', { preHandler: adminAuthMiddleware }, async (request, reply) => {
    const attemptId = z.string().uuid().parse((request.params as { attemptId?: string }).attemptId);
    const result = await ExamService.getAuditTrail(attemptId);
    return replyOk(reply, result);
  });

  app.post('/admin/assign', { preHandler: adminAuthMiddleware }, async (request, reply) => {
    const adminId = request.userContext?.userId;
    if (!adminId) return reply.code(401).send({ success: false, error: 'Unauthorized' });

    const schema = z.object({
      examId: z.string().uuid(),
      userId: z.string().uuid().optional(),
      teamId: z.string().uuid().optional(),
      organizationId: z.string().uuid().optional(),
      deadlineAt: z.string().optional(),
      priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional()
    });
    const payload = schema.parse(request.body ?? {});
    const result = await ExamService.assignExam(adminId, payload);
    return replyOk(reply, result);
  });

  app.get('/assignments', { preHandler: userAuthMiddleware }, async (request, reply) => {
    const userId = request.userContext?.userId;
    if (!userId) return reply.code(401).send({ success: false, error: 'Unauthorized' });
    const result = await ExamService.listUserAssignments(userId);
    return replyOk(reply, result);
  });

  app.get('/admin/org/:orgId/overview', { preHandler: adminAuthMiddleware }, async (request, reply) => {
    const orgId = z.string().uuid().parse((request.params as { orgId?: string }).orgId);
    const result = await ExamService.getOrganizationOverview(orgId);
    return replyOk(reply, result);
  });
};
