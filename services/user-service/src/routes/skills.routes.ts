import { FastifyPluginAsync } from 'fastify';
import { userAuthMiddleware } from '../middleware/auth.middleware';
import { UserSkillService } from '../services/user-skill.service';
import { replyOk } from '../utils/response';

export const skillsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/progress', { preHandler: userAuthMiddleware }, async (request, reply) => {
    try {
      const userId = request.userContext?.userId;
      if (!userId) {
        return reply.code(401).send({ success: false, error: 'Unauthorized' });
      }

      const result = await UserSkillService.getSkillsProgress(userId);
      return replyOk(reply, result);
    } catch (error: any) {
      app.log.error(error);
      return reply.code(400).send({ success: false, error: error.message });
    }
  });
};
