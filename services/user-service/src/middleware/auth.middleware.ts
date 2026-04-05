import { FastifyReply, FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    userContext?: {
      userId: string;
      role?: string;
    };
  }
}

type AccessTokenPayload = {
  userId?: string;
  role?: string;
  type?: string;
};

function decodeAccessToken(token: string): AccessTokenPayload | null {
  const parts = token.split('.');
  if (parts.length < 2) {
    return null;
  }

  try {
    const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payloadJson = Buffer.from(payloadBase64, 'base64').toString('utf-8');
    return JSON.parse(payloadJson) as AccessTokenPayload;
  } catch {
    return null;
  }
}

export async function userAuthMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) {
    return reply.code(401).send({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authorization token is required'
      }
    });
  }

  const token = authorization.slice('Bearer '.length).trim();
  const payload = decodeAccessToken(token);

  if (!payload?.userId || payload.type !== 'access') {
    return reply.code(401).send({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid access token'
      }
    });
  }

  request.userContext = {
    userId: payload.userId,
    role: payload.role
  };
}
