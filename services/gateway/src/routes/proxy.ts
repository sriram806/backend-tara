import { FastifyPluginAsync } from 'fastify';

export const proxyRoutes: FastifyPluginAsync = async (app) => {
  app.all('/api/*', {
    schema: {
      tags: ['proxy'],
      summary: 'Gateway routing placeholder',
      params: {
        type: 'object',
        properties: {
          '*': { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    return reply.code(501).send({
      success: false,
      message: 'Proxy routing will be wired in Day 2',
      path: request.url
    });
  });
};
