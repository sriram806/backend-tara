import { RoadmapService } from '../services/roadmap.service';
import { createRoadmapJobSchema } from '../schemas/roadmap.schema';
import { requireSubscription } from '../middleware/subscription.middleware';
import { userAuthMiddleware } from '../middleware/auth.middleware';
import { roadmapGenerateRequestSchema, runIdParamSchema } from '../schemas/ai-pipeline.schema';
import { RoadmapRunService } from '../services/roadmap-run.service';
import { RecommendationService } from '../services/recommendation.service';
import { replyOk } from '../utils/response';

export const roadmapRoutes = async (app: any) => {
  app.post('/generate', { preHandler: [userAuthMiddleware, requireSubscription('roadmap')] }, async (request: any, reply: any) => {
    try {
      const userId = request.userContext?.userId;
      if (!userId) {
        return reply.code(401).send({ success: false, error: 'Unauthorized' });
      }

      const body = roadmapGenerateRequestSchema.parse(request.body);
      const result = await RoadmapRunService.createAndQueue(
        userId,
        body.analysisRunId,
        body.targetRole,
        body.durationDays
      );

      return replyOk(reply, result, 202);
    } catch (error: any) {
      app.log.error(error);
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  app.get('/:runId', { preHandler: userAuthMiddleware }, async (request: any, reply: any) => {
    try {
      const userId = request.userContext?.userId;
      if (!userId) {
        return reply.code(401).send({ success: false, error: 'Unauthorized' });
      }

      const params = runIdParamSchema.parse(request.params);
      const result = await RoadmapRunService.getRun(userId, params.runId);
      if (result.status === 'completed') {
        await RecommendationService.refreshForUser(userId, 'roadmap_updated');
      }
      return replyOk(reply, result);
    } catch (error: any) {
      const code = error.message === 'Roadmap run not found' ? 404 : 400;
      return reply.code(code).send({ success: false, error: error.message });
    }
  });

  app.post('/jobs', { preHandler: [userAuthMiddleware, requireSubscription('roadmap')] }, async (request: any, reply: any) => {
    const userId = request.userContext?.userId;
    if (!userId) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' });
    }

    try {
      const data = createRoadmapJobSchema.parse(request.body);
      const result = await RoadmapService.submitJob(userId, data);

      return reply.status(201).send({ success: true, data: result });
    } catch (error: any) {
      app.log.error(error);
      return reply.status(400).send({ success: false, error: error.message });
    }
  });

  app.get('/jobs/:jobId', async (request: any, reply: any) => {
    const userId = request.user?.id || 'test-user-id';
    const { jobId } = request.params;

    try {
      const result = await RoadmapService.getJobStatus(jobId, userId);
      return reply.send({ success: true, data: result });
    } catch (error: any) {
      return reply.status(404).send({ success: false, error: error.message });
    }
  });
};
