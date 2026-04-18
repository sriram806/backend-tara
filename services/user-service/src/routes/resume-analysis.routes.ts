import { FastifyPluginAsync } from 'fastify';
import { userAuthMiddleware } from '../middleware/auth.middleware';
import { requireSubscription } from '../middleware/subscription.middleware';
import { runIdParamSchema, resumeAnalyzeRequestSchema } from '../schemas/ai-pipeline.schema';
import { ResumeAnalysisRunService } from '../services/resume-analysis-run.service';
import { replyOk } from '../utils/response';

export const resumeAnalysisRoutes: FastifyPluginAsync = async (app) => {
  app.post('/analyze', { preHandler: [userAuthMiddleware, requireSubscription('resume')] }, async (request, reply) => {
    try {
      const userId = request.userContext?.userId;
      if (!userId) {
        return reply.code(401).send({ success: false, error: 'Unauthorized' });
      }

      const body = resumeAnalyzeRequestSchema.parse(request.body);
      const result = await ResumeAnalysisRunService.createAndQueue(userId, body.resumeId);
      return replyOk(reply, result, 202);
    } catch (error: any) {
      app.log.error(error);
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  app.get('/analyze/:runId', { preHandler: userAuthMiddleware }, async (request, reply) => {
    try {
      const userId = request.userContext?.userId;
      if (!userId) {
        return reply.code(401).send({ success: false, error: 'Unauthorized' });
      }

      const params = runIdParamSchema.parse(request.params);
      const result = await ResumeAnalysisRunService.getRun(userId, params.runId);
      return replyOk(reply, result);
    } catch (error: any) {
      const code = error.message === 'Analysis run not found' ? 404 : 400;
      return reply.code(code).send({ success: false, error: error.message });
    }
  });
};
