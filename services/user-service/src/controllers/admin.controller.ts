import { FastifyReply, FastifyRequest } from 'fastify';
import { AdminUserService, ListUsersFilters, UpdateUserInput } from '../services/admin-user.service';
import { banUserSchema, createUserSchema, muteUserSchema, updateUserSchema } from '../schemas/admin.schema';

export class AdminController {
  constructor(private readonly adminService: AdminUserService) {}

  // ─── User Listing ─────────────────────────────────────────────────────────

  async listUsers(request: FastifyRequest, reply: FastifyReply) {
    const q = request.query as Record<string, string>;
    const filters: ListUsersFilters = {
      page: Number(q.page) || 1,
      limit: Math.min(Number(q.limit) || 25, 100),
      search: q.search,
      role: q.role,
      status: q.status,
      plan: q.plan,
      fromDate: q.fromDate,
      toDate: q.toDate,
      sortBy: (q.sortBy as ListUsersFilters['sortBy']) ?? 'createdAt',
      sortOrder: (q.sortOrder as 'asc' | 'desc') ?? 'desc'
    };
    const result = await this.adminService.listUsers(filters);
    return reply.send({ success: true, data: result });
  }

  // ─── Single User ──────────────────────────────────────────────────────────

  async getUser(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const user = await this.adminService.getUserById(id);
    if (!user) return reply.code(404).send({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
    return reply.send({ success: true, data: user });
  }

  // ─── Update User ──────────────────────────────────────────────────────────

  async updateUser(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const actorId = request.userContext!.userId;
    const patch = request.body as UpdateUserInput;

    const updated = await this.adminService.updateUser(id, patch, actorId);
    if (!updated) return reply.code(404).send({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });

    await this.adminService.writeAuditLog({
      actorId,
      actorEmail: request.userContext?.role ?? null,
      actorRole: request.userContext?.role ?? null,
      action: patch.role ? 'update_role' : 'update_user',
      targetUserId: id,
      metadata: { patch },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent']
    });

    return reply.send({ success: true, data: updated });
  }

  // ─── Lock / Unlock ────────────────────────────────────────────────────────

  async lockUser(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const actorId = request.userContext!.userId;
    await this.adminService.lockUser(id);
    await this.adminService.writeAuditLog({
      actorId, actorEmail: null, actorRole: request.userContext?.role ?? null,
      action: 'suspend_user', targetUserId: id,
      ipAddress: request.ip, userAgent: request.headers['user-agent']
    });
    return reply.send({ success: true, data: { locked: true } });
  }

  async unlockUser(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const actorId = request.userContext!.userId;
    await this.adminService.unlockUser(id);
    await this.adminService.writeAuditLog({
      actorId, actorEmail: null, actorRole: request.userContext?.role ?? null,
      action: 'unlock_user', targetUserId: id,
      ipAddress: request.ip, userAgent: request.headers['user-agent']
    });
    return reply.send({ success: true, data: { unlocked: true } });
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  async deleteUser(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const actorId = request.userContext!.userId;
    await this.adminService.softDeleteUser(id);
    await this.adminService.writeAuditLog({
      actorId, actorEmail: null, actorRole: request.userContext?.role ?? null,
      action: 'delete_user', targetUserId: id,
      ipAddress: request.ip, userAgent: request.headers['user-agent']
    });
    return reply.send({ success: true, data: { deleted: true } });
  }

  // ─── Impersonation ────────────────────────────────────────────────────────

  async impersonateUser(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const actorId = request.userContext!.userId;

    // Only admin can impersonate — extra guard
    if (request.userContext?.role !== 'admin') {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Only admins can impersonate users' } });
    }

    const result = await this.adminService.createImpersonationToken(id, actorId);
    if (!result) return reply.code(404).send({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });

    await this.adminService.writeAuditLog({
      actorId, actorEmail: null, actorRole: 'admin',
      action: 'impersonate_user', targetUserId: id,
      ipAddress: request.ip, userAgent: request.headers['user-agent']
    });

    return reply.send({ success: true, data: result });
  }

  // ─── Sessions ─────────────────────────────────────────────────────────────

  async getUserSessions(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const sessions = await this.adminService.getUserSessions(id);
    return reply.send({ success: true, data: sessions });
  }

  async revokeSession(request: FastifyRequest, reply: FastifyReply) {
    const { id, sessionId } = request.params as { id: string; sessionId: string };
    const actorId = request.userContext!.userId;
    await this.adminService.revokeSession(sessionId);
    await this.adminService.writeAuditLog({
      actorId, actorEmail: null, actorRole: request.userContext?.role ?? null,
      action: 'revoke_session', targetUserId: id,
      resourceType: 'session', resourceId: sessionId,
      ipAddress: request.ip, userAgent: request.headers['user-agent']
    });
    return reply.send({ success: true, data: { revoked: true } });
  }

  async revokeAllSessions(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const actorId = request.userContext!.userId;
    await this.adminService.revokeAllUserSessions(id);
    await this.adminService.writeAuditLog({
      actorId, actorEmail: null, actorRole: request.userContext?.role ?? null,
      action: 'revoke_all_sessions', targetUserId: id,
      ipAddress: request.ip, userAgent: request.headers['user-agent']
    });
    return reply.send({ success: true, data: { revoked: true } });
  }

  // ─── Login History ────────────────────────────────────────────────────────

  async getLoginHistory(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const q = request.query as { page?: string; limit?: string };
    const result = await this.adminService.getLoginHistory(id, Number(q.page) || 1, Number(q.limit) || 20);
    return reply.send({ success: true, data: result });
  }

  // ─── Audit Logs ───────────────────────────────────────────────────────────

  async getAuditLogs(request: FastifyRequest, reply: FastifyReply) {
    const q = request.query as Record<string, string>;
    const result = await this.adminService.getAuditLogs({
      page: Number(q.page) || 1,
      limit: Number(q.limit) || 50,
      action: q.action,
      actorId: q.actorId,
      targetUserId: q.targetUserId,
      fromDate: q.fromDate,
      toDate: q.toDate
    });
    return reply.send({ success: true, data: result });
  }

  async getUserAuditLog(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const q = request.query as { page?: string; limit?: string };
    const result = await this.adminService.getAuditLogs({
      targetUserId: id,
      page: Number(q.page) || 1,
      limit: Number(q.limit) || 25
    });
    return reply.send({ success: true, data: result });
  }

  // ─── GDPR ─────────────────────────────────────────────────────────────────

  async createGdprExport(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const actorId = request.userContext!.userId;
    const req = await this.adminService.createGdprRequest(id, 'export', actorId);
    await this.adminService.writeAuditLog({
      actorId, actorEmail: null, actorRole: request.userContext?.role ?? null,
      action: 'create_gdpr_request', targetUserId: id,
      resourceType: 'gdpr_request', resourceId: req.id,
      metadata: { type: 'export' },
      ipAddress: request.ip, userAgent: request.headers['user-agent']
    });
    return reply.code(201).send({ success: true, data: req });
  }

  async createGdprDelete(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const actorId = request.userContext!.userId;
    const req = await this.adminService.createGdprRequest(id, 'delete', actorId);
    await this.adminService.writeAuditLog({
      actorId, actorEmail: null, actorRole: request.userContext?.role ?? null,
      action: 'create_gdpr_request', targetUserId: id,
      resourceType: 'gdpr_request', resourceId: req.id,
      metadata: { type: 'delete' },
      ipAddress: request.ip, userAgent: request.headers['user-agent']
    });
    return reply.code(201).send({ success: true, data: req });
  }

  async listGdprRequests(request: FastifyRequest, reply: FastifyReply) {
    const q = request.query as { page?: string; limit?: string; status?: string };
    const result = await this.adminService.listGdprRequests(
      Number(q.page) || 1,
      Number(q.limit) || 25,
      q.status
    );
    return reply.send({ success: true, data: result });
  }

  // ─── Export CSV ───────────────────────────────────────────────────────────

  async exportUsers(request: FastifyRequest, reply: FastifyReply) {
    const q = request.query as Record<string, string>;
    const actorId = request.userContext!.userId;
    const csv = await this.adminService.exportUsers({
      search: q.search, role: q.role, status: q.status,
      fromDate: q.fromDate, toDate: q.toDate
    });
    await this.adminService.writeAuditLog({
      actorId, actorEmail: null, actorRole: request.userContext?.role ?? null,
      action: 'bulk_export', metadata: { format: 'csv', filters: q },
      ipAddress: request.ip, userAgent: request.headers['user-agent']
    });
    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', 'attachment; filename="users.csv"');
    return reply.send(csv);
  }

  // ─── Create User ────────────────────────────────────────────────────────────────

  async createUser(request: FastifyRequest, reply: FastifyReply) {
    const actorId = request.userContext!.userId;
    const result = createUserSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: result.error.issues[0]?.message ?? 'Invalid input', issues: result.error.issues }
      });
    }

    const input = result.data;
    const user = await this.adminService.createUser({
      email: input.email,
      password: input.password,
      fullName: input.fullName,
      role: input.role as any,
      status: input.status as any,
      createdByAdminId: actorId
    });

    await this.adminService.writeAuditLog({
      actorId, actorEmail: null, actorRole: request.userContext?.role ?? null,
      action: 'create_user', targetUserId: user?.id,
      metadata: { email: input.email, role: input.role },
      ipAddress: request.ip, userAgent: request.headers['user-agent']
    });

    return reply.code(201).send({ success: true, data: user });
  }

  // ─── Ban / Unban ─────────────────────────────────────────────────────────────────

  async banUser(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const actorId = request.userContext!.userId;
    const result = banUserSchema.safeParse(request.body);
    const reason = result.success ? result.data.reason : undefined;

    const data = await this.adminService.banUser(id, reason, actorId);
    await this.adminService.writeAuditLog({
      actorId, actorEmail: null, actorRole: request.userContext?.role ?? null,
      action: 'suspend_user', targetUserId: id,
      metadata: { reason },
      ipAddress: request.ip, userAgent: request.headers['user-agent']
    });
    return reply.send({ success: true, data });
  }

  async unbanUser(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const actorId = request.userContext!.userId;

    const data = await this.adminService.unbanUser(id);
    await this.adminService.writeAuditLog({
      actorId, actorEmail: null, actorRole: request.userContext?.role ?? null,
      action: 'unlock_user', targetUserId: id,
      ipAddress: request.ip, userAgent: request.headers['user-agent']
    });
    return reply.send({ success: true, data });
  }

  // ─── Mute / Unmute ─────────────────────────────────────────────────────────────────

  async muteUser(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const actorId = request.userContext!.userId;
    const result = muteUserSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: result.error.issues[0]?.message ?? 'Invalid input' }
      });
    }

    const { durationHours, reason } = result.data;
    const data = await this.adminService.muteUser(id, durationHours);
    await this.adminService.writeAuditLog({
      actorId, actorEmail: null, actorRole: request.userContext?.role ?? null,
      action: 'update_user', targetUserId: id,
      metadata: { action: 'mute', durationHours, reason, mutedUntil: data.mutedUntil },
      ipAddress: request.ip, userAgent: request.headers['user-agent']
    });
    return reply.send({ success: true, data });
  }

  async unmuteUser(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const actorId = request.userContext!.userId;

    const data = await this.adminService.unmuteUser(id);
    await this.adminService.writeAuditLog({
      actorId, actorEmail: null, actorRole: request.userContext?.role ?? null,
      action: 'update_user', targetUserId: id,
      metadata: { action: 'unmute' },
      ipAddress: request.ip, userAgent: request.headers['user-agent']
    });
    return reply.send({ success: true, data });
  }

  // ─── Real-Time Dashboard ──────────────────────────────────────────────────

  async getRealtimeDashboard(_request: FastifyRequest, reply: FastifyReply) {
    const data = await this.adminService.getRealtimeDashboard();
    return reply.send({ success: true, data });
  }
}
