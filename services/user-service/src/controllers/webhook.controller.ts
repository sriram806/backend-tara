import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { WebhookService } from '../services/webhook.service';
import { AdminUserService } from '../services/admin-user.service';

const createWebhookSchema = z.object({
  url: z.string().url('Must be a valid URL'),
  eventTypes: z.array(z.string().min(1)).min(1)
});

const updateWebhookSchema = z.object({
  url: z.string().url().optional(),
  eventTypes: z.array(z.string().min(1)).min(1).optional(),
  isActive: z.boolean().optional()
});

export class WebhookController {
  private svc = new WebhookService();
  private adminSvc = new AdminUserService();

  // POST /admin/webhooks
  async createEndpoint(request: FastifyRequest, reply: FastifyReply) {
    const result = createWebhookSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: result.error.issues[0]?.message }
      });
    }

    const actorId = request.userContext!.userId;
    const endpoint = await this.svc.createEndpoint({ ...result.data, createdBy: actorId });

    await this.adminSvc.writeAuditLog({
      actorId, actorEmail: null, actorRole: request.userContext?.role ?? null,
      action: 'manage_webhook',
      metadata: { action: 'create', url: endpoint.url },
      ipAddress: request.ip, userAgent: request.headers['user-agent']
    });

    return reply.code(201).send({ success: true, data: endpoint });
  }

  // GET /admin/webhooks
  async listEndpoints(_request: FastifyRequest, reply: FastifyReply) {
    const endpoints = await this.svc.listEndpoints();
    // Mask secrets before returning
    const safeData = endpoints.map(({ secret, ...rest }) => ({
      ...rest,
      secretPrefix: secret.slice(0, 4) + '...' + secret.slice(-4)
    }));
    return reply.send({ success: true, data: safeData });
  }

  // PATCH /admin/webhooks/:id
  async updateEndpoint(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const result = updateWebhookSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: result.error.issues[0]?.message }
      });
    }

    const actorId = request.userContext!.userId;
    const updated = await this.svc.updateEndpoint(id, result.data);
    if (!updated) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Webhook endpoint not found' } });
    }

    await this.adminSvc.writeAuditLog({
      actorId, actorEmail: null, actorRole: request.userContext?.role ?? null,
      action: 'manage_webhook',
      metadata: { action: 'update', endpointId: id, changes: result.data },
      ipAddress: request.ip, userAgent: request.headers['user-agent']
    });

    const { secret, ...safeData } = updated;
    return reply.send({ success: true, data: safeData });
  }

  // DELETE /admin/webhooks/:id
  async deleteEndpoint(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const actorId = request.userContext!.userId;

    const existing = await this.svc.getEndpoint(id);
    if (!existing) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Webhook endpoint not found' } });
    }

    await this.svc.deleteEndpoint(id);

    await this.adminSvc.writeAuditLog({
      actorId, actorEmail: null, actorRole: request.userContext?.role ?? null,
      action: 'manage_webhook',
      metadata: { action: 'delete', endpointId: id, url: existing.url },
      ipAddress: request.ip, userAgent: request.headers['user-agent']
    });

    return reply.send({ success: true, data: { deleted: true } });
  }
}
