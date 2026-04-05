import { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { isAppError } from '../utils/app-error';
import { sendError } from '../utils/response';

function isDatabaseConnectivityError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as {
    name?: string;
    message?: string;
    code?: string;
    aggregateErrors?: unknown[];
    errors?: unknown[];
  };

  const serialized = JSON.stringify(candidate).toUpperCase();
  const text = `${candidate.name ?? ''} ${candidate.message ?? ''} ${candidate.code ?? ''} ${serialized}`.toUpperCase();

  return (
    text.includes('ETIMEDOUT') ||
    text.includes('ENETUNREACH') ||
    text.includes('ECONNREFUSED') ||
    text.includes('EHOSTUNREACH') ||
    text.includes('AGGREGATEERROR') ||
    text.includes('DATABASE') ||
    Array.isArray(candidate.aggregateErrors) ||
    Array.isArray(candidate.errors)
  );
}

export function registerErrorMiddleware(app: FastifyInstance) {
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return sendError(reply, 400, 'VALIDATION_ERROR', error.issues[0]?.message ?? 'Invalid request body');
    }

    if (isAppError(error)) {
      return sendError(reply, error.statusCode, error.code, error.message);
    }

    if (isDatabaseConnectivityError(error)) {
      app.log.error({ err: error }, 'Database-related error in auth-service');
      return sendError(
        reply,
        503,
        'DATABASE_UNAVAILABLE',
        'Database is currently unreachable. Please check database connectivity and try again.'
      );
    }

    app.log.error({ err: error }, 'Unhandled auth-service error');
    return sendError(reply, 500, 'INTERNAL_SERVER_ERROR', 'Something went wrong');
  });
}
