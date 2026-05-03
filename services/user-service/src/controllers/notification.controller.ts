import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AdminNotificationService } from '../services/admin-notification.service';
import { replyOk } from '../utils/response';

const sendNotificationSchema = z.object({
  target: z.union([
    z.object({ type: z.literal('user'), userId: z.string().uuid() }),
    z.object({ type: z.literal('many'), userIds: z.array(z.string().uuid()).min(1).max(1000) }),
    z.object({ type: z.literal('broadcast') })
  ]),
  title: z.string().min(1).max(120),
  message: z.string().min(1).max(2000),
  category: z.enum(['info', 'success', 'warning', 'error', 'system', 'promotion']).default('info'),
  actionUrl: z.string().url().optional().or(z.string().length(0)),
  notificationType: z.enum(['in_app', 'email']).default('in_app'),
  emailTemplate: z.enum(['admin_message']).optional()
});

const markReadSchema = z.object({
  notificationIds: z.array(z.string().uuid()).optional()
});

export class NotificationController {
  private svc = new AdminNotificationService();

  // POST /admin/notifications/send
  async send(request: FastifyRequest, reply: FastifyReply) {
    const result = sendNotificationSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: result.error.issues[0]?.message, issues: result.error.issues }
      });
    }

    const { target, title, message, category, actionUrl, notificationType, emailTemplate } = result.data;
    const sentBy = request.userContext!.userId;
    const payload = { 
      title, 
      message, 
      category, 
      actionUrl: actionUrl || undefined, 
      type: notificationType, 
      emailTemplate 
    };

    let data: unknown;

    if (target.type === 'user') {
      data = await this.svc.sendToUser(target.userId, payload, sentBy);
    } else if (target.type === 'many') {
      data = await this.svc.sendToMany(target.userIds, payload, sentBy);
    } else {
      data = await this.svc.broadcast(payload, sentBy);
    }

    return reply.code(201).send({ success: true, data });
  }

  // GET /admin/notifications — list all (admin view), or user-scoped
  async list(request: FastifyRequest, reply: FastifyReply) {
    const q = request.query as Record<string, string>;
    const userId = q.userId ?? request.userContext!.userId;
    const page = parseInt(q.page ?? '1', 10);
    const limit = parseInt(q.limit ?? '20', 10);

    const data = await this.svc.getUserNotifications(userId, page, limit);
    return replyOk(reply, data);
  }

  // PATCH /admin/notifications/read
  async markRead(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.userContext!.userId;
    const result = markReadSchema.safeParse(request.body);

    if (!result.success || result.data.notificationIds) {
      const ids = result.data?.notificationIds;
      if (ids) {
        const data = await this.svc.markRead(userId, ids);
        return replyOk(reply, data);
      }
    }

    const data = await this.svc.markAllRead(userId);
    return replyOk(reply, data);
  }
}
