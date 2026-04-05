import { FastifyPluginAsync } from 'fastify';
import { GatewayController } from '../controllers/gateway.controller';

export const healthRoutes = (controller: GatewayController): FastifyPluginAsync => {
  return async (app) => {
    app.get('/health', async () => controller.health());
  };
};
