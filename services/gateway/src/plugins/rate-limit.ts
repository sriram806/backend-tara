import { FastifyPluginAsync } from 'fastify';

// Day 1 placeholder for distributed rate limiting backed by Redis.
export const rateLimitPlugin: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (_request, _reply) => {
    return;
  });
};
