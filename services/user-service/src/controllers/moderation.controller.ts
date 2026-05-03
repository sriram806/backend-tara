import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ModerationService } from '../services/moderation.service';
import { AdminUserService } from '../services/admin-user.service';

const flagUserSchema = z.object({
  reason: z.string().min(3).max(500),
  category: z.enum(['spam', 'abuse', 'harassment', 'fraud', 'inappropriate_content', 'other']).default('other')
});

const resolveReportSchema = z.object({
  decision: z.enum(['reviewed', 'dismissed']),
  resolutionNote: z.string().max(500).optional()
});

export class ModerationController {
  private modSvc = new ModerationService();
  private adminSvc = new AdminUserService();

  // POST /admin/moderation/flag/:userId
  async flagUser(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = request.params as { userId: string };
    const actorId = request.userContext!.userId;

    const result = flagUserSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: result.error.issues[0]?.message }
      });
    }

    const report = await this.modSvc.flagUser({
      reportedUserId: userId,
      reportedBy: actorId,
      reason: result.data.reason,
      category: result.data.category
    });

    await this.adminSvc.writeAuditLog({
      actorId, actorEmail: null, actorRole: request.userContext?.role ?? null,
      action: 'flag_user', targetUserId: userId,
      metadata: { reason: result.data.reason, category: result.data.category },
      ipAddress: request.ip, userAgent: request.headers['user-agent']
    });

    return reply.code(201).send({ success: true, data: report });
  }

  // GET /admin/moderation/reports
  async listReports(request: FastifyRequest, reply: FastifyReply) {
    const q = request.query as Record<string, string>;
    const data = await this.modSvc.listReports({
      status: q.status as any,
      reportedUserId: q.reportedUserId,
      page: q.page ? parseInt(q.page, 10) : 1,
      limit: q.limit ? parseInt(q.limit, 10) : 20
    });
    return reply.send({ success: true, ...data });
  }

  // PATCH /admin/moderation/reports/:reportId/resolve
  async resolveReport(request: FastifyRequest, reply: FastifyReply) {
    const { reportId } = request.params as { reportId: string };
    const actorId = request.userContext!.userId;

    const result = resolveReportSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: result.error.issues[0]?.message }
      });
    }

    const data = await this.modSvc.resolveReport({
      reportId,
      resolvedBy: actorId,
      decision: result.data.decision,
      resolutionNote: result.data.resolutionNote
    });

    await this.adminSvc.writeAuditLog({
      actorId, actorEmail: null, actorRole: request.userContext?.role ?? null,
      action: 'resolve_report', targetUserId: data?.reportedUserId,
      metadata: { reportId, decision: result.data.decision },
      ipAddress: request.ip, userAgent: request.headers['user-agent']
    });

    return reply.send({ success: true, data });
  }

  // GET /admin/moderation/users/:userId/reports
  async getUserReports(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = request.params as { userId: string };
    const reports = await this.modSvc.getUserReports(userId);
    return reply.send({ success: true, data: reports });
  }
}
