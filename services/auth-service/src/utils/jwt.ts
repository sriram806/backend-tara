import crypto from 'node:crypto';
import jwt, { SignOptions } from 'jsonwebtoken';
import { AppError } from './app-error';

export type TokenType = 'access' | 'refresh';

export type TokenPayload = {
  userId: string;
  role: string;
  jti: string;
  type: TokenType;
};

function signToken(
  payload: Omit<TokenPayload, 'jti' | 'type'>,
  secret: string,
  expiresIn: SignOptions['expiresIn'],
  type: TokenType
) {
  const jti = crypto.randomUUID();

  const token = jwt.sign(
    {
      userId: payload.userId,
      role: payload.role,
      jti,
      type
    },
    secret,
    { expiresIn }
  );

  return { token, jti };
}

export function signAccessToken(payload: Omit<TokenPayload, 'jti' | 'type'>, secret: string, ttl: string) {
  return signToken(payload, secret, ttl as SignOptions['expiresIn'], 'access');
}

export function signRefreshToken(payload: Omit<TokenPayload, 'jti' | 'type'>, secret: string, ttl: string) {
  return signToken(payload, secret, ttl as SignOptions['expiresIn'], 'refresh');
}

export function verifyToken(token: string, secret: string, expectedType: TokenType): TokenPayload {
  try {
    const payload = jwt.verify(token, secret) as TokenPayload;

    if (payload.type !== expectedType) {
      throw new AppError('INVALID_TOKEN_TYPE', 'Invalid token type', 401);
    }

    return payload;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError('INVALID_TOKEN', 'Invalid or expired token', 401);
  }
}
