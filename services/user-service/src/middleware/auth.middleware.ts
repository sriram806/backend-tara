import { FastifyReply, FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';
import { ApiKeyService } from '../services/api-key.service';

declare module 'fastify' {
  interface FastifyRequest {
    userContext?: {
      userId: string;
      role?: string;
    };
    apiKeyScopes?: string[];
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

export async function jwtAuthMiddleware(request: FastifyRequest, reply: FastifyReply) {
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

export async function apiKeyAuthMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const apiKey = request.headers['x-api-key'] as string;
  if (!apiKey) {
    return reply.code(401).send({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'x-api-key header is required' }
    });
  }

  const svc = new ApiKeyService();
  const scopes = await svc.validateApiKey(apiKey);
  if (!scopes) {
    return reply.code(401).send({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid or expired API key' }
    });
  }

  request.apiKeyScopes = scopes;
  
  // Create a dummy userContext so downstream userAuth requirements don't break
  // but mark the role as 'api_client'
  request.userContext = {
    userId: 'api-key-client',
    role: 'admin' // Grants admin access downstream, but granular scopes apply later
  };
}

/**
 * Universal Auth: Accepts EITHER a valid User JWT OR a valid API Key.
 * Renamed to userAuthMiddleware so all existing routes automatically support API keys.
 */
export async function userAuthMiddleware(request: FastifyRequest, reply: FastifyReply) {
  if (request.headers['x-api-key']) {
    return apiKeyAuthMiddleware(request, reply);
  }
  return jwtAuthMiddleware(request, reply);
}
