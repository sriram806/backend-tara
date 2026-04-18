import { FastifyReply, FastifyRequest } from 'fastify';
import {
  createExperimentSchema,
  experimentResultsQuerySchema,
  getVariantQuerySchema,
  trackExperimentSchema,
  updateExperimentStatusSchema
} from '../schemas/experiment.schema';
import { ExperimentService } from '../services/experiment.service';
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

export class ExperimentController {
  async variant(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.userContext?.userId;
    if (!userId) {
      return sendError(reply, 401, 'UNAUTHORIZED', 'User id is missing');
    }

    try {
      const query = getVariantQuerySchema.parse(request.query);
      const result = await ExperimentService.getAssignedVariant(userId, query.type);
      return replyOk(reply, result);
    } catch (error) {
      return sendError(reply, 400, 'EXPERIMENT_VARIANT_FAILED', error instanceof Error ? error.message : 'Failed to resolve variant');
    }
  }

  async track(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.userContext?.userId;
    if (!userId) {
      return sendError(reply, 401, 'UNAUTHORIZED', 'User id is missing');
    }

    try {
      const body = trackExperimentSchema.parse(request.body);
      const result = await ExperimentService.trackInteraction(userId, body);
      return replyOk(reply, result, 202);
    } catch (error) {
      return sendError(reply, 400, 'EXPERIMENT_TRACK_FAILED', error instanceof Error ? error.message : 'Failed to track experiment interaction');
    }
  }

  async create(request: FastifyRequest, reply: FastifyReply) {
    try {
      const body = createExperimentSchema.parse(request.body);
      const createdBy = request.userContext?.userId ?? null;
      const result = await ExperimentService.createExperiment(body, createdBy);
      return replyOk(reply, result, 201);
    } catch (error) {
      return sendError(reply, 400, 'EXPERIMENT_CREATE_FAILED', error instanceof Error ? error.message : 'Failed to create experiment');
    }
  }

  async updateStatus(request: FastifyRequest, reply: FastifyReply) {
    try {
      const params = request.params as { experimentId?: string };
      const experimentId = params.experimentId?.trim();
      if (!experimentId) {
        return sendError(reply, 400, 'EXPERIMENT_ID_REQUIRED', 'Experiment id is required');
      }

      const body = updateExperimentStatusSchema.parse(request.body);
      const result = await ExperimentService.updateStatus(experimentId, body.status);
      return replyOk(reply, result);
    } catch (error) {
      const statusCode = error instanceof Error && error.message === 'Experiment not found' ? 404 : 400;
      return sendError(reply, statusCode, 'EXPERIMENT_STATUS_UPDATE_FAILED', error instanceof Error ? error.message : 'Failed to update experiment status');
    }
  }

  async list(_request: FastifyRequest, reply: FastifyReply) {
    try {
      const result = await ExperimentService.listExperiments();
      return replyOk(reply, result);
    } catch (error) {
      return sendError(reply, 500, 'EXPERIMENT_LIST_FAILED', error instanceof Error ? error.message : 'Failed to list experiments');
    }
  }

  async results(request: FastifyRequest, reply: FastifyReply) {
    try {
      const query = experimentResultsQuerySchema.parse(request.query);
      const result = await ExperimentService.getExperimentResults(query.experimentId);
      return replyOk(reply, result);
    } catch (error) {
      const statusCode = error instanceof Error && error.message === 'Experiment not found' ? 404 : 400;
      return sendError(reply, statusCode, 'EXPERIMENT_RESULTS_FAILED', error instanceof Error ? error.message : 'Failed to compute experiment results');
    }
  }
}
