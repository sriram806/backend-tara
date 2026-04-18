import { FastifyReply, FastifyRequest } from 'fastify';
import {
  organizationAssignmentSchema,
  organizationCreateSchema,
  organizationDashboardQuerySchema,
  organizationInviteSchema,
  organizationJoinSchema,
  organizationMemberParamsSchema
} from '../schemas/organization.schema';
import { OrganizationService } from '../services/organization.service';
import { replyOk } from '../utils/response';

function sendError(reply: FastifyReply, statusCode: number, code: string, message: string) {
  return reply.code(statusCode).send({
    success: false,
    error: {
      code,
      message
    }
  });
}

export class OrganizationController {
  async create(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.userContext?.userId;
    if (!userId) {
      return sendError(reply, 401, 'UNAUTHORIZED', 'User id is missing');
    }

    try {
      const input = organizationCreateSchema.parse(request.body);
      const result = await OrganizationService.createOrganization(userId, input);
      return replyOk(reply, result, 201);
    } catch (error) {
      return sendError(reply, 400, 'ORGANIZATION_CREATE_FAILED', error instanceof Error ? error.message : 'Failed to create organization');
    }
  }

  async invite(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.userContext?.userId;
    if (!userId) {
      return sendError(reply, 401, 'UNAUTHORIZED', 'User id is missing');
    }

    try {
      const input = organizationInviteSchema.parse(request.body);
      const result = await OrganizationService.createInvite(userId, input);
      return replyOk(reply, result, 201);
    } catch (error) {
      return sendError(reply, 400, 'ORGANIZATION_INVITE_FAILED', error instanceof Error ? error.message : 'Failed to create invite');
    }
  }

  async join(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.userContext?.userId;
    if (!userId) {
      return sendError(reply, 401, 'UNAUTHORIZED', 'User id is missing');
    }

    try {
      const input = organizationJoinSchema.parse(request.body);
      const result = await OrganizationService.joinOrganization(userId, input);
      return replyOk(reply, result);
    } catch (error) {
      return sendError(reply, 400, 'ORGANIZATION_JOIN_FAILED', error instanceof Error ? error.message : 'Failed to join organization');
    }
  }

  async dashboard(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.userContext?.userId;
    if (!userId) {
      return sendError(reply, 401, 'UNAUTHORIZED', 'User id is missing');
    }

    try {
      const query = organizationDashboardQuerySchema.parse(request.query);
      const result = await OrganizationService.getDashboard(userId, query.organizationId);
      return replyOk(reply, result);
    } catch (error) {
      return sendError(reply, 400, 'ORGANIZATION_DASHBOARD_FAILED', error instanceof Error ? error.message : 'Failed to fetch organization dashboard');
    }
  }

  async members(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.userContext?.userId;
    if (!userId) {
      return sendError(reply, 401, 'UNAUTHORIZED', 'User id is missing');
    }

    try {
      const query = organizationDashboardQuerySchema.parse(request.query);
      const result = await OrganizationService.listMembers(userId, query.organizationId);
      return replyOk(reply, result);
    } catch (error) {
      return sendError(reply, 400, 'ORGANIZATION_MEMBERS_FAILED', error instanceof Error ? error.message : 'Failed to fetch organization members');
    }
  }

  async member(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.userContext?.userId;
    if (!userId) {
      return sendError(reply, 401, 'UNAUTHORIZED', 'User id is missing');
    }

    try {
      const query = organizationDashboardQuerySchema.parse(request.query);
      const params = organizationMemberParamsSchema.parse(request.params);
      const result = await OrganizationService.getMember(userId, query.organizationId, params.memberId);
      return replyOk(reply, result);
    } catch (error) {
      return sendError(reply, 400, 'ORGANIZATION_MEMBER_FAILED', error instanceof Error ? error.message : 'Failed to fetch member');
    }
  }

  async createAssignment(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.userContext?.userId;
    if (!userId) {
      return sendError(reply, 401, 'UNAUTHORIZED', 'User id is missing');
    }

    try {
      const input = organizationAssignmentSchema.parse(request.body);
      const result = await OrganizationService.createAssignment(userId, input);
      return replyOk(reply, result, 201);
    } catch (error) {
      return sendError(reply, 400, 'ORGANIZATION_ASSIGNMENT_FAILED', error instanceof Error ? error.message : 'Failed to create assignment');
    }
  }

  async assignments(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.userContext?.userId;
    if (!userId) {
      return sendError(reply, 401, 'UNAUTHORIZED', 'User id is missing');
    }

    try {
      const query = organizationDashboardQuerySchema.parse(request.query);
      const result = await OrganizationService.listAssignments(userId, query.organizationId);
      return replyOk(reply, result);
    } catch (error) {
      return sendError(reply, 400, 'ORGANIZATION_ASSIGNMENTS_FAILED', error instanceof Error ? error.message : 'Failed to fetch assignments');
    }
  }
}