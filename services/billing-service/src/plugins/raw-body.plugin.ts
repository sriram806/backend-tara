import { FastifyInstance } from 'fastify';

export async function registerRawBodyPlugin(app: FastifyInstance) {
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
    try {
      const raw = typeof body === 'string' ? body : body.toString('utf-8');
      request.rawBody = raw;
      const parsed = raw ? JSON.parse(raw) : {};
      done(null, parsed);
    } catch (error) {
      done(error as Error, undefined);
    }
  });
}
