import { FastifyInstance } from 'fastify';
import { InterviewController } from '../controllers/interview.controller';

export function interviewRoutes(controller: InterviewController) {
  return async (app: FastifyInstance) => {
    app.post('/sessions', controller.createSession);
    app.get('/sessions/:sessionId', controller.getSession);
  };
}
