import { FastifyPluginAsync } from 'fastify';
import { userAuthMiddleware } from '../middleware/auth.middleware';
import { organizationIdFromBody, requireOptionalOrganizationMembership } from '../middleware/organization.middleware';
import { requireActiveSubscription } from '../middleware/subscription.middleware';
import {
  examResultQuerySchema,
  examRetestRequestSchema,
  examStartRequestSchema,
  examSubmitRequestSchema
} from '../schemas/exam.schema';
import { SkillAssessmentService } from '../services/skill-assessment.service';
import { PersonalizationService } from '../services/personalization.service';
import { AnalyticsService } from '../services/analytics.service';
import { replyOk } from '../utils/response';

export const examRoutes: FastifyPluginAsync = async (app) => {
  app.post('/start', {
    preHandler: [
      userAuthMiddleware,
      requireActiveSubscription('onboarding'),
      requireOptionalOrganizationMembership(organizationIdFromBody('organizationId'))
    ]
  }, async (request, reply) => {
    try {
      const userId = request.userContext?.userId;
      if (!userId) {
        return reply.code(401).send({ success: false, error: 'Unauthorized' });
      }

      const body = examStartRequestSchema.parse(request.body);
      const result = await SkillAssessmentService.startExam(userId, body);
      await AnalyticsService.logEvent(userId, 'exam_started', {
        userExamId: result.userExamId,
        examId: result.examId,
        skillName: body.skillName ?? result.skillName,
        difficultyLevel: result.difficultyLevel,
        organizationId: body.organizationId ?? null,
        experimentId: result.experiment?.experimentId ?? null,
        variantId: result.experiment?.variantId ?? null,
        variantName: result.experiment?.variantName ?? null,
        featureFlags: result.featureFlags ?? null
      });
      await PersonalizationService.recordTaskCompletion(userId, 'task_started', {
        area: 'exam',
        skillName: body.skillName ?? result.skillName,
        difficultyLevel: result.difficultyLevel,
        organizationId: body.organizationId ?? null
      });
      return replyOk(reply, result, 201);
    } catch (error: any) {
      app.log.error(error);
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  app.post('/submit', { preHandler: [userAuthMiddleware, requireActiveSubscription('onboarding')] }, async (request, reply) => {
    try {
      const userId = request.userContext?.userId;
      if (!userId) {
        return reply.code(401).send({ success: false, error: 'Unauthorized' });
      }

      const body = examSubmitRequestSchema.parse(request.body);
      const result = await SkillAssessmentService.submitExam(userId, body);
      return replyOk(reply, result);
    } catch (error: any) {
      app.log.error(error);
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  app.get('/result', { preHandler: userAuthMiddleware }, async (request, reply) => {
    try {
      const userId = request.userContext?.userId;
      if (!userId) {
        return reply.code(401).send({ success: false, error: 'Unauthorized' });
      }

      const query = examResultQuerySchema.parse(request.query);
      const result = await SkillAssessmentService.getExamResult(userId, query.userExamId, query.skillName, query.organizationId);
      return replyOk(reply, result);
    } catch (error: any) {
      app.log.error(error);
      const code = error.message === 'Exam result not found' ? 404 : 400;
      return reply.code(code).send({ success: false, error: error.message });
    }
  });

  app.post('/retest', {
    preHandler: [
      userAuthMiddleware,
      requireActiveSubscription('onboarding'),
      requireOptionalOrganizationMembership(organizationIdFromBody('organizationId'))
    ]
  }, async (request, reply) => {
    try {
      const userId = request.userContext?.userId;
      if (!userId) {
        return reply.code(401).send({ success: false, error: 'Unauthorized' });
      }

      const body = examRetestRequestSchema.parse(request.body);
      const result = await SkillAssessmentService.retestSkill(userId, body.skillName, body.timeLimitSeconds, body.organizationId);
      return replyOk(reply, result, 201);
    } catch (error: any) {
      app.log.error(error);
      return reply.code(400).send({ success: false, error: error.message });
    }
  });
};
