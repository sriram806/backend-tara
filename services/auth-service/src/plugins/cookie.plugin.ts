import cookie from '@fastify/cookie';
import { FastifyInstance } from 'fastify';

export async function registerCookiePlugin(app: FastifyInstance) {
  await app.register(cookie, {
    parseOptions: {
      httpOnly: true,
      sameSite: 'lax',
      path: '/'
    }
  });
}
