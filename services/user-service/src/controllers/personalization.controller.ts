import { FastifyReply, FastifyRequest } from 'fastify';
import { insightsQuerySchema, userActivitySchema } from '../schemas/personalization.schema';
import { RecommendationService } from '../services/recommendation.service';
import { PersonalizationService } from '../services/personalization.service';
import { replyOk } from '../utils/response';

function sendError(reply: FastifyReply, statusCode: number, code: string, message: string) {
  return reply.code(statusCode).send({
    success: false,
    error: {
      code,
      message
    }
  });
}

export class PersonalizationController {
  async insights(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.userContext?.userId;
    if (!userId) {
      return sendError(reply, 401, 'UNAUTHORIZED', 'User id is missing');
    }

    try {
      const query = insightsQuerySchema.parse(request.query);
      const insights = await PersonalizationService.getInsights(userId);

      return replyOk(reply, query.includePlan ? insights : {
        learningSpeed: insights.learningSpeed,
        weakSkills: insights.weakSkills,
        strongSkills: insights.strongSkills,
        recommendations: insights.recommendations
      });
    } catch (error) {
      return sendError(reply, 400, 'PERSONALIZATION_INSIGHTS_FAILED', error instanceof Error ? error.message : 'Failed to fetch insights');
    }
  }

  async activity(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.userContext?.userId;
    if (!userId) {
      return sendError(reply, 401, 'UNAUTHORIZED', 'User id is missing');
    }

    try {
      const input = userActivitySchema.parse(request.body);
      const result = await PersonalizationService.recordActivity(userId, input);
      await RecommendationService.refreshForUser(userId, 'activity_logged');
      return replyOk(reply, result, 201);
    } catch (error) {
      return sendError(reply, 400, 'PERSONALIZATION_ACTIVITY_FAILED', error instanceof Error ? error.message : 'Failed to log activity');
    }
  }
}
