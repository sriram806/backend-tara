import { FastifyReply, FastifyRequest } from 'fastify';

export async function interviewAuthMiddleware(request: FastifyRequest, _reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader) {
    return;
  }

  const token = authHeader.replace('Bearer', '').trim();
  if (token) {
    request.headers['x-user-id'] = token;
  }
}
