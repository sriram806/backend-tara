import { FastifyPluginAsync } from 'fastify';
import { userAuthMiddleware } from '../middleware/auth.middleware';
import { requireActiveSubscription } from '../middleware/subscription.middleware';
import { targetRoleRequestSchema } from '../schemas/onboarding.schema';
import { resumeSaveRequestSchema } from '../schemas/resume.schema';
import { OnboardingService } from '../services/onboarding.service';
import { replyOk } from '../utils/response';

export const onboardingRoutes: FastifyPluginAsync = async (app) => {
  app.post('/resume', { preHandler: [userAuthMiddleware, requireActiveSubscription('onboarding')] }, async (request, reply) => {
    try {
      const userId = request.userContext?.userId;
      if (!userId) {
        return reply.code(401).send({ success: false, error: 'Unauthorized' });
      }

      const body = resumeSaveRequestSchema.parse(request.body);
      const result = await OnboardingService.saveResume(userId, body.resume, body.mode);
      return replyOk(reply, result, body.mode === 'final' ? 201 : 200);
    } catch (error: any) {
      app.log.error(error);
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  app.post('/target-role', { preHandler: [userAuthMiddleware, requireActiveSubscription('onboarding')] }, async (request, reply) => {
    try {
      const userId = request.userContext?.userId;
      if (!userId) {
        return reply.code(401).send({ success: false, error: 'Unauthorized' });
      }

      const body = targetRoleRequestSchema.parse(request.body);
      const result = await OnboardingService.saveTargetRole(userId, body);
      return replyOk(reply, result, 201);
    } catch (error: any) {
      app.log.error(error);
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  app.get('/status', { preHandler: userAuthMiddleware }, async (request, reply) => {
    try {
      const userId = request.userContext?.userId;
      if (!userId) {
        return reply.code(401).send({ success: false, error: 'Unauthorized' });
      }

      const result = await OnboardingService.getStatus(userId);
      return replyOk(reply, result);
    } catch (error: any) {
      app.log.error(error);
      return reply.code(400).send({ success: false, error: error.message });
    }
  });
};
