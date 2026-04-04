import { FastifyPluginAsync } from 'fastify';
import { replyOk } from '../utils/response';

const registerSchema = {
  body: {
    type: 'object',
    required: ['email', 'password'],
    properties: {
      email: { type: 'string', format: 'email' },
      password: { type: 'string', minLength: 8 }
    }
  }
};

const loginSchema = {
  body: {
    type: 'object',
    required: ['email', 'password'],
    properties: {
      email: { type: 'string', format: 'email' },
      password: { type: 'string', minLength: 8 }
    }
  }
};

const refreshSchema = {
  body: {
    type: 'object',
    required: ['refreshToken'],
    properties: {
      refreshToken: { type: 'string', minLength: 1 }
    }
  }
};

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/register', { schema: registerSchema }, async (_request, reply) => {
    return replyOk(reply, {
      message: 'Register endpoint scaffolded',
      next: 'Persist user in Day 2'
    }, 201);
  });

  app.post('/login', { schema: loginSchema }, async (_request, reply) => {
    return replyOk(reply, {
      message: 'Login endpoint scaffolded',
      next: 'Issue access + refresh tokens in Day 2'
    });
  });

  app.post('/refresh', { schema: refreshSchema }, async (_request, reply) => {
    return replyOk(reply, {
      message: 'Refresh endpoint scaffolded',
      next: 'Rotate refresh token in Day 2'
    });
  });

  app.delete('/logout', async (_request, reply) => {
    return replyOk(reply, {
      message: 'Logout endpoint scaffolded',
      next: 'Invalidate refresh token in Day 2'
    });
  });
};
