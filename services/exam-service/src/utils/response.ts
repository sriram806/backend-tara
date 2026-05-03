import { FastifyReply } from 'fastify';
import { ApiEnvelope } from '@thinkai/types';

export function replyOk<T>(reply: FastifyReply, data: T, statusCode = 200) {
  const payload: ApiEnvelope<T> = {
    success: true,
    data
  };

  return reply.code(statusCode).send(payload);
}
