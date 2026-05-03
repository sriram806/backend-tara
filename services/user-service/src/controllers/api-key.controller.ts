import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ApiKeyService } from '../services/api-key.service';
import { AdminUserService } from '../services/admin-user.service';

const createApiKeySchema = z.object({
  name: z.string().min(3).max(100),
  scopes: z.array(z.string()).min(1),
  expiresInDays: z.number().int().positive().optional()
});

export class ApiKeyController {
  private svc = new ApiKeyService();
  private adminSvc = new AdminUserService();

  // POST /admin/api-keys
  async createApiKey(request: FastifyRequest, reply: FastifyReply) {
    const result = createApiKeySchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: result.error.issues[0]?.message }
      });
    }

    const { name, scopes, expiresInDays } = result.data;
    let expiresAt: Date | undefined;
    if (expiresInDays) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    }

    const actorId = request.userContext!.userId;
    const { apiKey, rawKey } = await this.svc.createApiKey({
      name, scopes, expiresAt, createdBy: actorId
    });

    await this.adminSvc.writeAuditLog({
      actorId, actorEmail: null, actorRole: request.userContext?.role ?? null,
      action: 'manage_api_key',
      metadata: { action: 'create', apiKeyId: apiKey.id, name: apiKey.name },
      ipAddress: request.ip, userAgent: request.headers['user-agent']
    });

    return reply.code(201).send({
      success: true,
      data: {
        id: apiKey.id,
        name: apiKey.name,
        keyPrefix: apiKey.keyPrefix,
        scopes: apiKey.scopes,
        expiresAt: apiKey.expiresAt,
        rawKey // only returned once
      }
    });
  }

  // GET /admin/api-keys
  async listApiKeys(_request: FastifyRequest, reply: FastifyReply) {
    const keys = await this.svc.listApiKeys();
    return reply.send({ success: true, data: keys });
  }

  // DELETE /admin/api-keys/:id
  async revokeApiKey(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const actorId = request.userContext!.userId;

    await this.svc.revokeApiKey(id);

    await this.adminSvc.writeAuditLog({
      actorId, actorEmail: null, actorRole: request.userContext?.role ?? null,
      action: 'manage_api_key',
      metadata: { action: 'revoke', apiKeyId: id },
      ipAddress: request.ip, userAgent: request.headers['user-agent']
    });

    return reply.send({ success: true, data: { revoked: true } });
  }
}
