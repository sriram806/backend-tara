import { FastifyPluginAsync } from 'fastify';
import { replyOk } from '../utils/response';

const patchMeSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      displayName: { type: 'string', minLength: 2, maxLength: 80 },
      bio: { type: 'string', maxLength: 280 }
    }
  }
};

export const meRoutes: FastifyPluginAsync = async (app) => {
  app.get('/me', async (_request, reply) => {
    return replyOk(reply, {
      id: 'user-placeholder-001',
      email: 'demo@thinkai.dev',
      displayName: 'Think AI User',
      bio: 'Day 1 scaffold response'
    });
  });

  app.patch('/me', { schema: patchMeSchema }, async (_request, reply) => {
    return replyOk(reply, {
      message: 'Profile update endpoint scaffolded',
      next: 'Persist profile updates in Day 2'
    });
  });
};
