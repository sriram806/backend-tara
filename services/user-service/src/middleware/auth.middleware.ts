import { FastifyReply, FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';

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
  iat?: number;
  exp?: number;
};

function verifyAccessToken(token: string, secret: string): AccessTokenPayload | null {
  try {
    const decoded = jwt.verify(token, secret);
    if (!decoded || typeof decoded === 'string') {
      return null;
    }

    return decoded as AccessTokenPayload;
  } catch {
    return null;
  }
}

export async function userAuthMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const accessSecret = process.env.JWT_ACCESS_SECRET;
  if (!accessSecret) {
    return reply.code(500).send({
      success: false,
      error: {
        code: 'AUTH_CONFIG_MISSING',
        message: 'JWT access secret is not configured'
      }
    });
  }

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
  const payload = verifyAccessToken(token, accessSecret);

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
