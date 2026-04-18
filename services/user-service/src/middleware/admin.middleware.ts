import { FastifyReply, FastifyRequest } from 'fastify';

const ADMIN_ROLES = new Set(['admin', 'super_admin', 'owner']);

export async function adminAuthMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const role = request.userContext?.role?.toLowerCase();
  if (!role || !ADMIN_ROLES.has(role)) {
    return reply.code(403).send({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Admin access required'
      }
    });
  }
}
