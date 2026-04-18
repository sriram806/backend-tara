import { FastifyReply, FastifyRequest } from 'fastify';
import { recommendationActionRequestSchema, recommendationQuerySchema } from '../schemas/recommendation.schema';
import { RecommendationService } from '../services/recommendation.service';
import { AnalyticsService } from '../services/analytics.service';
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

export class RecommendationController {
  async list(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.userContext?.userId;
    if (!userId) {
      return sendError(reply, 401, 'UNAUTHORIZED', 'User id is missing');
    }

    try {
      const query = recommendationQuerySchema.parse(request.query);
      const result = await RecommendationService.getRecommendations(userId, {
        limit: query.limit,
        refresh: query.refresh
      });

      return replyOk(reply, result);
    } catch (error) {
      return sendError(reply, 400, 'RECOMMENDATIONS_FETCH_FAILED', error instanceof Error ? error.message : 'Failed to fetch recommendations');
    }
  }

  async action(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.userContext?.userId;
    if (!userId) {
      return sendError(reply, 401, 'UNAUTHORIZED', 'User id is missing');
    }

    try {
      const params = request.params as { id?: string };
      const recommendationId = params.id?.trim();
      if (!recommendationId) {
        return sendError(reply, 400, 'RECOMMENDATION_ID_REQUIRED', 'Recommendation id is required');
      }

      const body = recommendationActionRequestSchema.parse(request.body);
      const result = await RecommendationService.recordAction(userId, recommendationId, body.action);
      if (body.action === 'clicked') {
        await AnalyticsService.logEvent(userId, 'recommendation_clicked', {
          recommendationId,
          type: result.recommendation.type,
          priority: result.recommendation.priority
        });
      }
      return replyOk(reply, result);
    } catch (error) {
      return sendError(reply, 400, 'RECOMMENDATION_ACTION_FAILED', error instanceof Error ? error.message : 'Failed to record recommendation action');
    }
  }
}