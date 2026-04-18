import { FastifyReply, FastifyRequest } from 'fastify';
import {
  createFeatureFlagOverrideSchema,
  createFeatureFlagSchema,
  featureFlagIdParamSchema,
  featureFlagOverrideIdParamSchema,
  featureFlagParamSchema,
  updateFeatureFlagSchema
} from '../schemas/feature-flag.schema';
import { FeatureFlagService } from '../services/feature-flag.service';
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

export class FeatureFlagController {
  async evaluate(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.userContext?.userId;
    if (!userId) {
      return sendError(reply, 401, 'UNAUTHORIZED', 'User id is missing');
    }

    try {
      const params = featureFlagParamSchema.parse(request.params);
      const decision = await FeatureFlagService.getFeatureDecision(userId, params.key);
      return replyOk(reply, {
        enabled: decision.enabled
      });
    } catch (error) {
      return sendError(reply, 400, 'FEATURE_FLAG_EVALUATION_FAILED', error instanceof Error ? error.message : 'Failed to evaluate feature flag');
    }
  }

  async list(_request: FastifyRequest, reply: FastifyReply) {
    try {
      const result = await FeatureFlagService.listFlags();
      return replyOk(reply, result);
    } catch (error) {
      return sendError(reply, 500, 'FEATURE_FLAG_LIST_FAILED', error instanceof Error ? error.message : 'Failed to list feature flags');
    }
  }

  async create(request: FastifyRequest, reply: FastifyReply) {
    try {
      const body = createFeatureFlagSchema.parse(request.body);
      const result = await FeatureFlagService.createFlag(body);
      return replyOk(reply, result, 201);
    } catch (error) {
      return sendError(reply, 400, 'FEATURE_FLAG_CREATE_FAILED', error instanceof Error ? error.message : 'Failed to create feature flag');
    }
  }

  async update(request: FastifyRequest, reply: FastifyReply) {
    try {
      const params = featureFlagIdParamSchema.parse(request.params);
      const body = updateFeatureFlagSchema.parse(request.body);
      const result = await FeatureFlagService.updateFlag(params.id, body);
      return replyOk(reply, result);
    } catch (error) {
      const statusCode = error instanceof Error && error.message === 'Feature flag not found' ? 404 : 400;
      return sendError(reply, statusCode, 'FEATURE_FLAG_UPDATE_FAILED', error instanceof Error ? error.message : 'Failed to update feature flag');
    }
  }

  async createOverride(request: FastifyRequest, reply: FastifyReply) {
    try {
      const params = featureFlagIdParamSchema.parse(request.params);
      const body = createFeatureFlagOverrideSchema.parse(request.body);
      const result = await FeatureFlagService.createOverride(params.id, body);
      return replyOk(reply, result, 201);
    } catch (error) {
      const statusCode = error instanceof Error && error.message === 'Feature flag not found' ? 404 : 400;
      return sendError(reply, statusCode, 'FEATURE_FLAG_OVERRIDE_CREATE_FAILED', error instanceof Error ? error.message : 'Failed to create feature flag override');
    }
  }

  async deleteOverride(request: FastifyRequest, reply: FastifyReply) {
    try {
      const params = featureFlagOverrideIdParamSchema.parse(request.params);
      const result = await FeatureFlagService.deleteOverride(params.id, params.overrideId);
      return replyOk(reply, result);
    } catch (error) {
      const statusCode = error instanceof Error && error.message.includes('not found') ? 404 : 400;
      return sendError(reply, statusCode, 'FEATURE_FLAG_OVERRIDE_DELETE_FAILED', error instanceof Error ? error.message : 'Failed to delete feature flag override');
    }
  }
}