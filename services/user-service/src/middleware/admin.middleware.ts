import { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Role hierarchy:
 *   user → guest / lite / pro   (no admin access)
 *   moderator                    → limited admin powers
 *   admin                        → full control
 */
const PRIVILEGED_ROLES = new Set(['moderator', 'admin', 'super_admin', 'owner']);

// ─── Granular Permission Map ───────────────────────────────────────────────────

/**
 * Maps each role to the set of permissions it holds.
 * Permissions follow the <resource>:<action> convention.
 */
const ROLE_PERMISSIONS: Record<string, Set<string>> = {
  admin: new Set([
    'user:create', 'user:view', 'user:update', 'user:delete',
    'user:ban', 'user:unban', 'user:mute', 'user:unmute',
    'user:lock', 'user:unlock', 'user:impersonate',
    'session:view', 'session:revoke',
    'audit:view',
    'gdpr:manage',
    'api-key:manage',
    'feature-flag:manage'
  ]),
  super_admin: new Set([
    'user:create', 'user:view', 'user:update', 'user:delete',
    'user:ban', 'user:unban', 'user:mute', 'user:unmute',
    'user:lock', 'user:unlock', 'user:impersonate',
    'session:view', 'session:revoke',
    'audit:view',
    'gdpr:manage',
    'api-key:manage',
    'feature-flag:manage'
  ]),
  owner: new Set([
    'user:create', 'user:view', 'user:update', 'user:delete',
    'user:ban', 'user:unban', 'user:mute', 'user:unmute',
    'user:lock', 'user:unlock', 'user:impersonate',
    'session:view', 'session:revoke',
    'audit:view',
    'gdpr:manage',
    'api-key:manage',
    'feature-flag:manage'
  ]),
  moderator: new Set([
    'user:view',
    'user:ban', 'user:unban',
    'user:mute', 'user:unmute',
    'session:view', 'session:revoke',
    'audit:view'
  ])
};

// ─── Middleware: Role Check ────────────────────────────────────────────────────

export async function adminAuthMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const role = request.userContext?.role?.toLowerCase();
  if (!role || !PRIVILEGED_ROLES.has(role)) {
    return reply.code(403).send({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Admin or moderator access required'
      }
    });
  }
}

/** Use this where only a full admin (not moderator) is permitted. */
export async function fullAdminMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const role = request.userContext?.role?.toLowerCase();
  if (role !== 'admin' && role !== 'super_admin' && role !== 'owner') {
    return reply.code(403).send({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Full admin access required'
      }
    });
  }
}

// ─── Middleware: Permission Check ─────────────────────────────────────────────

/**
 * Returns a Fastify preHandler that verifies the requesting user's role
 * has the specified granular permission.
 *
 * Usage in routes:
 *   app.delete('/users/:id', { preHandler: requirePermission('user:delete') }, handler)
 */
export function requirePermission(permission: string) {
  return async function permissionMiddleware(request: FastifyRequest, reply: FastifyReply) {
    const role = request.userContext?.role?.toLowerCase();
    if (!role) {
      return reply.code(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
      });
    }

    // Support API keys (which override role-based permissions)
    if (request.apiKeyScopes) {
      if (!request.apiKeyScopes.includes('*') && !request.apiKeyScopes.includes(permission)) {
        return reply.code(403).send({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: `API Key missing required scope: '${permission}'`
          }
        });
      }
      return; // Permitted via API key
    }

    const perms = ROLE_PERMISSIONS[role];
    if (!perms?.has(permission)) {
      return reply.code(403).send({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Permission '${permission}' required`
        }
      });
    }
  };
}
