import { and, eq } from 'drizzle-orm';
import { FastifyReply, FastifyRequest } from 'fastify';
import { getDb, organizationMembers } from '@thinkai/db';
import { OrganizationRole } from '../schemas/organization.schema';

declare module 'fastify' {
  interface FastifyRequest {
    organizationContext?: {
      organizationId: string;
      memberId: string;
      role: OrganizationRole;
    };
  }
}

type OrganizationIdResolver = (request: FastifyRequest) => string | undefined;

function sendError(reply: FastifyReply, statusCode: number, code: string, message: string) {
  return reply.code(statusCode).send({
    success: false,
    error: {
      code,
      message
    }
  });
}

async function resolveMembership(userId: string, organizationId: string) {
  const db = getDb();
  const [membership] = await db.select().from(organizationMembers).where(and(
    eq(organizationMembers.userId, userId),
    eq(organizationMembers.organizationId, organizationId)
  )).limit(1);

  return membership ?? null;
}

export function organizationIdFromBody(key = 'organizationId'): OrganizationIdResolver {
  return (request) => {
    const body = request.body as Record<string, unknown> | undefined;
    const value = body?.[key];
    return typeof value === 'string' ? value : undefined;
  };
}

export function organizationIdFromQuery(key = 'organizationId'): OrganizationIdResolver {
  return (request) => {
    const query = request.query as Record<string, unknown> | undefined;
    const value = query?.[key];
    return typeof value === 'string' ? value : undefined;
  };
}

export function organizationIdFromParams(key = 'organizationId'): OrganizationIdResolver {
  return (request) => {
    const params = request.params as Record<string, unknown> | undefined;
    const value = params?.[key];
    return typeof value === 'string' ? value : undefined;
  };
}

export function requireOrganizationMembership(
  resolveOrganizationId: OrganizationIdResolver,
  allowedRoles?: OrganizationRole[]
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.userContext?.userId;
    if (!userId) {
      return sendError(reply, 401, 'UNAUTHORIZED', 'Missing user context');
    }

    const organizationId = resolveOrganizationId(request);
    if (!organizationId) {
      return sendError(reply, 400, 'ORGANIZATION_ID_REQUIRED', 'organizationId is required');
    }

    const membership = await resolveMembership(userId, organizationId);
    if (!membership) {
      return sendError(reply, 403, 'ORGANIZATION_FORBIDDEN', 'You are not a member of this organization');
    }

    if (allowedRoles && !allowedRoles.includes(membership.role as OrganizationRole)) {
      return sendError(reply, 403, 'ORGANIZATION_ROLE_FORBIDDEN', 'You do not have permission to access this resource');
    }

    request.organizationContext = {
      organizationId,
      memberId: membership.id,
      role: membership.role as OrganizationRole
    };
  };
}

export function requireOrganizationRole(resolveOrganizationId: OrganizationIdResolver, allowedRoles: OrganizationRole[]) {
  return requireOrganizationMembership(resolveOrganizationId, allowedRoles);
}

export function requireOptionalOrganizationMembership(
  resolveOrganizationId: OrganizationIdResolver,
  allowedRoles?: OrganizationRole[]
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const organizationId = resolveOrganizationId(request);
    if (!organizationId) {
      return;
    }

    return requireOrganizationMembership(() => organizationId, allowedRoles)(request, reply);
  };
}