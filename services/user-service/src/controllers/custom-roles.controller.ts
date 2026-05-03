import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { CustomRolesService } from '../services/custom-roles.service';
import { AdminUserService } from '../services/admin-user.service';

const createRoleSchema = z.object({
  name: z.string().min(2).max(64).regex(/^[a-z0-9_-]+$/, 'Name must be lowercase alphanumeric with _ or -'),
  description: z.string().max(200).optional(),
  permissions: z.array(z.string().regex(/^[a-z0-9_-]+:[a-z0-9_-]+$/, 'Permission must follow resource:action format')).min(1)
});

const updateRoleSchema = z.object({
  name: z.string().min(2).max(64).regex(/^[a-z0-9_-]+$/).optional(),
  description: z.string().max(200).optional(),
  permissions: z.array(z.string()).optional()
});

export class CustomRolesController {
  private svc = new CustomRolesService();
  private adminSvc = new AdminUserService();

  // POST /admin/roles
  async createRole(request: FastifyRequest, reply: FastifyReply) {
    const result = createRoleSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: result.error.issues[0]?.message, issues: result.error.issues }
      });
    }

    const actorId = request.userContext!.userId;
    const role = await this.svc.createRole({ ...result.data, createdBy: actorId });

    await this.adminSvc.writeAuditLog({
      actorId, actorEmail: null, actorRole: request.userContext?.role ?? null,
      action: 'create_role', metadata: { roleName: result.data.name, permissions: result.data.permissions },
      ipAddress: request.ip, userAgent: request.headers['user-agent']
    });

    return reply.code(201).send({ success: true, data: role });
  }

  // GET /admin/roles
  async listRoles(request: FastifyRequest, reply: FastifyReply) {
    const roles = await this.svc.listRoles();
    return reply.send({ success: true, data: roles });
  }

  // GET /admin/roles/:id
  async getRole(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const role = await this.svc.getRoleById(id);
    if (!role) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Role not found' } });
    return reply.send({ success: true, data: role });
  }

  // PATCH /admin/roles/:id
  async updateRole(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const result = updateRoleSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: result.error.issues[0]?.message }
      });
    }

    const actorId = request.userContext!.userId;
    const role = await this.svc.updateRole(id, result.data);
    if (!role) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Role not found' } });

    await this.adminSvc.writeAuditLog({
      actorId, actorEmail: null, actorRole: request.userContext?.role ?? null,
      action: 'update_role_perms', metadata: { roleId: id, changes: result.data },
      ipAddress: request.ip, userAgent: request.headers['user-agent']
    });

    return reply.send({ success: true, data: role });
  }

  // DELETE /admin/roles/:id
  async deleteRole(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const actorId = request.userContext!.userId;

    const existing = await this.svc.getRoleById(id);
    if (!existing) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Role not found' } });

    await this.svc.deleteRole(id);

    await this.adminSvc.writeAuditLog({
      actorId, actorEmail: null, actorRole: request.userContext?.role ?? null,
      action: 'create_role', metadata: { deletedRoleId: id, roleName: existing.name },
      ipAddress: request.ip, userAgent: request.headers['user-agent']
    });

    return reply.send({ success: true, data: { deleted: true } });
  }
}
