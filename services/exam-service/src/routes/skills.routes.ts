import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { userAuthMiddleware } from '../middleware/auth.middleware';
import { ExamService } from '../services/exam.service';
import { replyOk } from '../utils/response';

const retakeSchema = z.object({
  skill: z.string().min(1)
});

export const skillsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: userAuthMiddleware }, async (request, reply) => {
    const userId = request.userContext?.userId;
    if (!userId) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' });
    }

    const result = await ExamService.getSkillSummaries(userId);
    return replyOk(reply, result);
  });

  app.post('/retake', { preHandler: userAuthMiddleware }, async (request, reply) => {
    const userId = request.userContext?.userId;
    if (!userId) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' });
    }

    const payload = retakeSchema.parse(request.body ?? {});
    const result = await ExamService.scheduleRetake(userId, payload.skill);
    return replyOk(reply, result);
  });

  app.get('/suggestions', async (request, reply) => {
    const { q } = request.query as { q?: string };
    const result = await ExamService.getSkillSuggestions(q ?? '');
    return replyOk(reply, result);
  });

  app.post('/request', { preHandler: userAuthMiddleware }, async (request, reply) => {
    const userId = request.userContext?.userId;
    if (!userId) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' });
    }

    const { skillName } = request.body as { skillName: string };
    if (!skillName) {
      return reply.code(400).send({ success: false, error: 'Skill name is required' });
    }

    const result = await ExamService.requestSkill(userId, skillName);
    return replyOk(reply, result);
  });
};
