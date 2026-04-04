import { FastifyPluginAsync } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    authContext?: {
      userId: string;
      roles: string[];
    };
  }
}

// Day 1 placeholder for JWT verification integration.
export const authPlugin: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', async (request) => {
    const hasBearer = request.headers.authorization?.startsWith('Bearer ');

    if (hasBearer) {
      request.authContext = {
        userId: 'placeholder-user',
        roles: ['user']
      };
    }
  });
};
