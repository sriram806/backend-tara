import { FastifyReply } from 'fastify';

export function sendProxyError(reply: FastifyReply, statusCode: number, message: string) {
  return reply.code(statusCode).send({
    success: false,
    error: {
      code: 'PROXY_ERROR',
      message
    }
  });
}
