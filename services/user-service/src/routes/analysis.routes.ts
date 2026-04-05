import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { AnalysisService } from '../services/analysis.service';
import { createAnalysisJobSchema } from '../schemas/job.schema';

export const analysisRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.post('/jobs', async (request, reply) => {
    // In a real app, this should come from a verified JWT token in the request
    const userId = (request as any).user?.id || 'test-user-id';
    
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

  app.get('/jobs/:jobId', async (request: any, reply) => {
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
