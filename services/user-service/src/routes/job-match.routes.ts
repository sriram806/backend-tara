import { JobMatchService } from '../services/job-match.service';
import { createJobMatchSchema } from '../schemas/job-match.schema';
import { requireSubscription } from '../middleware/subscription.middleware';
import { userAuthMiddleware } from '../middleware/auth.middleware';

export const jobMatchRoutes = async (app: any) => {
  app.post('/match', { preHandler: [userAuthMiddleware, requireSubscription('jobs')] }, async (request: any, reply: any) => {
    const userId = request.userContext?.userId;
    if (!userId) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' });
    }

    try {
      const data = createJobMatchSchema.parse(request.body);
      const result = await JobMatchService.submitJob(userId, data);

      return reply.status(201).send({ success: true, data: result });
    } catch (error: any) {
      app.log.error(error);
      return reply.status(400).send({ success: false, error: error.message });
    }
  });

  app.get('/match/:jobId', async (request: any, reply: any) => {
    const userId = request.user?.id || 'test-user-id';
    const { jobId } = request.params;

    try {
      const result = await JobMatchService.getJobStatus(jobId, userId);
      return reply.send({ success: true, data: result });
    } catch (error: any) {
      return reply.status(404).send({ success: false, error: error.message });
    }
  });
};
