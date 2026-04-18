import { FastifyPluginAsync } from 'fastify';
import { userAuthMiddleware } from '../middleware/auth.middleware';
import { requireActiveSubscription } from '../middleware/subscription.middleware';
import { resumeDeleteQuerySchema, resumeSaveRequestSchema } from '../schemas/resume.schema';
import { ResumeService } from '../services/resume.service';
import { PersonalizationService } from '../services/personalization.service';
import { AnalyticsService } from '../services/analytics.service';
import { replyOk } from '../utils/response';

export const resumeRoutes: FastifyPluginAsync = async (app) => {
  app.post('', { preHandler: [userAuthMiddleware, requireActiveSubscription('resume')] }, async (request, reply) => {
    try {
      const userId = request.userContext?.userId;
      if (!userId) {
        return reply.code(401).send({ success: false, error: 'Unauthorized' });
      }

      const body = resumeSaveRequestSchema.parse(request.body);
      const result = await ResumeService.saveStructuredResume(userId, body.resume, body.mode);
      await AnalyticsService.logEvent(userId, 'resume_updated', {
        mode: body.mode,
        resumeId: result.id,
        isFinal: body.mode === 'final'
      });
      await PersonalizationService.recordTaskCompletion(userId, 'resume_saved', {
        mode: body.mode,
        resumeId: result.id
      });
      return replyOk(reply, result, body.mode === 'final' ? 201 : 200);
    } catch (error: any) {
      app.log.error(error);
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  app.get('', { preHandler: userAuthMiddleware }, async (request, reply) => {
    try {
      const userId = request.userContext?.userId;
      if (!userId) {
        return reply.code(401).send({ success: false, error: 'Unauthorized' });
      }

      const includeHistory = String((request.query as Record<string, unknown> | undefined)?.includeHistory ?? 'false') === 'true';
      const result = await ResumeService.getResume(userId, includeHistory);
      return replyOk(reply, result);
    } catch (error: any) {
      const statusCode = error.message === 'Resume not found' ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  app.delete('', { preHandler: [userAuthMiddleware, requireActiveSubscription('resume')] }, async (request, reply) => {
    try {
      const userId = request.userContext?.userId;
      if (!userId) {
        return reply.code(401).send({ success: false, error: 'Unauthorized' });
      }

      const query = resumeDeleteQuerySchema.parse(request.query);
      const result = await ResumeService.deleteResume(userId, query.archive ?? true);
      return replyOk(reply, result);
    } catch (error: any) {
      const statusCode = error.message === 'Resume not found' ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });
};
