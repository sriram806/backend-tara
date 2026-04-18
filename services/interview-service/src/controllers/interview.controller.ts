import { FastifyReply, FastifyRequest } from 'fastify';
import { InterviewService } from '../services/interview.service';
import { createInterviewSessionSchema } from '../schemas/interview.schema';
import { sendError, sendSuccess } from '../utils/response';

export class InterviewController {
  constructor(private readonly interviewService: InterviewService) {}

  createSession = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const dto = createInterviewSessionSchema.parse(request.body);
      const session = await this.interviewService.createSession(dto);
      return sendSuccess(reply, session, 201);
    } catch (error) {
      return sendError(reply, 400, 'INVALID_REQUEST', error instanceof Error ? error.message : 'Invalid request');
    }
  };

  getSession = async (request: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) => {
    try {
      const session = await this.interviewService.getSession(request.params.sessionId);
      if (!session) {
        return sendError(reply, 404, 'SESSION_NOT_FOUND', 'Interview session not found');
      }
      return sendSuccess(reply, session);
    } catch (error) {
      return sendError(reply, 500, 'SESSION_FETCH_FAILED', error instanceof Error ? error.message : 'Failed to fetch session');
    }
  };
}
