import { FastifyReply, FastifyRequest } from 'fastify';

export async function gatewayAuthMiddleware(request: FastifyRequest, _reply: FastifyReply) {
  const hasBearer = request.headers.authorization?.startsWith('Bearer ');
  if (!hasBearer) {
    return;
  }
}
