import { AnalysisService } from '../services/analysis.service';
import { createAnalysisJobSchema } from '../schemas/job.schema';
import { requireSubscription } from '../middleware/subscription.middleware';
import { userAuthMiddleware } from '../middleware/auth.middleware';

export const analysisRoutes = async (app: any) => {
  app.post('/jobs', { preHandler: [userAuthMiddleware, requireSubscription('career')] }, async (request: any, reply: any) => {
    const userId = request.userContext?.userId;
    if (!userId) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' });
    }
    
    try {
      const data = createAnalysisJobSchema.parse(request.body);
      const result = await AnalysisService.submitJob(userId, data);
      
      return reply.status(201).send({
        success: true,
        data: result
      });
    } catch (error: any) {
      app.log.error(error);
      return reply.status(400).send({ success: false, error: error.message });
    }
  });

  app.get('/jobs/:jobId', async (request: any, reply: any) => {
    const userId = request.user?.id || 'test-user-id';
    const { jobId } = request.params;
    
    try {
      const result = await AnalysisService.getJobStatus(jobId, userId);
      return reply.send({ success: true, data: result });
    } catch (error: any) {
      return reply.status(404).send({ success: false, error: error.message });
    }
  });
};
