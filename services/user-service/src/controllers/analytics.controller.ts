import { FastifyReply, FastifyRequest } from 'fastify';
import { analyticsEventRequestSchema } from '../schemas/analytics.schema';
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

export class AnalyticsController {
  async event(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.userContext?.userId;
    if (!userId) {
      return sendError(reply, 401, 'UNAUTHORIZED', 'User id is missing');
    }

    try {
      const body = analyticsEventRequestSchema.parse(request.body);
      await AnalyticsService.logEvent(userId, body.eventType, body.metadata);
      return replyOk(reply, { enqueued: true }, 202);
    } catch (error) {
      return sendError(reply, 400, 'ANALYTICS_EVENT_INVALID', error instanceof Error ? error.message : 'Invalid event payload');
    }
  }

  async userInsights(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.userContext?.userId;
    if (!userId) {
      return sendError(reply, 401, 'UNAUTHORIZED', 'User id is missing');
    }

    try {
      const data = await AnalyticsService.getUserInsights(userId);
      return replyOk(reply, data);
    } catch (error) {
      return sendError(reply, 500, 'ANALYTICS_USER_FAILED', error instanceof Error ? error.message : 'Failed to compute user analytics');
    }
  }

  async adminInsights(_request: FastifyRequest, reply: FastifyReply) {
    try {
      const data = await AnalyticsService.getAdminMetrics();
      return replyOk(reply, data);
    } catch (error) {
      return sendError(reply, 500, 'ANALYTICS_ADMIN_FAILED', error instanceof Error ? error.message : 'Failed to compute admin analytics');
    }
  }
}
