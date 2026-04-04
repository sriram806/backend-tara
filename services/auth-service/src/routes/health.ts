import { FastifyPluginAsync } from 'fastify';
import { ServiceHealthResponse } from '@thinkai/types';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Reply: ServiceHealthResponse }>('/health', async () => {
    return {
      status: 'ok',
      service: 'auth-service'
    };
  });
};
