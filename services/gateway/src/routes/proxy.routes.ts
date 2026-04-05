import { FastifyPluginAsync } from 'fastify';
import { GatewayController } from '../controllers/gateway.controller';
import { proxyParamsSchema } from '../schemas/proxy.schema';

export const proxyRoutes = (controller: GatewayController): FastifyPluginAsync => {
  return async (app) => {
    app.all('/api/*', {
      schema: {
        tags: ['proxy'],
        summary: 'Gateway routing placeholder',
        params: proxyParamsSchema
      }
    }, (request, reply) => controller.proxy(request, reply));
  };
};
