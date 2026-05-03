import { FastifyInstance } from 'fastify';
import { AdminController } from '../controllers/admin.controller';
import { AdminUserService } from '../services/admin-user.service';
import { BulkImportController } from '../controllers/bulk-import.controller';
import { userAuthMiddleware } from '../middleware/auth.middleware';
import { adminAuthMiddleware, fullAdminMiddleware, requirePermission } from '../middleware/admin.middleware';

const adminService = new AdminUserService();
const adminController = new AdminController(adminService);
const bulkImportController = new BulkImportController();

export async function adminRoutes(app: FastifyInstance) {
  // All admin routes require authentication + admin/moderator role
  app.addHook('preHandler', userAuthMiddleware);
  app.addHook('preHandler', adminAuthMiddleware);

  // ─── Real-Time Dashboard ─────────────────────────────────────────────────

  app.get('/dashboard/realtime', (req, reply) => adminController.getRealtimeDashboard(req, reply));

  // ─── User Management ─────────────────────────────────────────────────────


  // Create user — full admin only
  app.post('/users', { preHandler: [fullAdminMiddleware, requirePermission('user:create')] }, (req, reply) => adminController.createUser(req, reply));

  app.get('/users', (req, reply) => adminController.listUsers(req, reply));
  app.get('/users/export', (req, reply) => adminController.exportUsers(req, reply));

  // CSV Bulk Import — admin only
  app.post('/users/import', { preHandler: [fullAdminMiddleware, requirePermission('user:create')] },
    (req, reply) => bulkImportController.importCsv(req, reply));
  app.get('/users/import/:jobId/status', { preHandler: [fullAdminMiddleware] },
    (req, reply) => bulkImportController.getImportStatus(req, reply));

  app.get('/users/:id', { preHandler: requirePermission('user:view') }, (req, reply) => adminController.getUser(req, reply));
  app.patch('/users/:id', { preHandler: requirePermission('user:update') }, (req, reply) => adminController.updateUser(req, reply));
  app.delete('/users/:id', { preHandler: [fullAdminMiddleware, requirePermission('user:delete')] }, (req, reply) => adminController.deleteUser(req, reply));

  // Lock / Unlock (account-level, admin only)
  app.post('/users/:id/lock', { preHandler: [fullAdminMiddleware, requirePermission('user:lock')] }, (req, reply) => adminController.lockUser(req, reply));
  app.post('/users/:id/unlock', { preHandler: [fullAdminMiddleware, requirePermission('user:unlock')] }, (req, reply) => adminController.unlockUser(req, reply));

  // Ban / Unban (moderation, moderator+)
  app.post('/users/:id/ban', { preHandler: requirePermission('user:ban') }, (req, reply) => adminController.banUser(req, reply));
  app.post('/users/:id/unban', { preHandler: requirePermission('user:unban') }, (req, reply) => adminController.unbanUser(req, reply));

  // Mute / Unmute (moderation, moderator+)
  app.post('/users/:id/mute', { preHandler: requirePermission('user:mute') }, (req, reply) => adminController.muteUser(req, reply));
  app.post('/users/:id/unmute', { preHandler: requirePermission('user:unmute') }, (req, reply) => adminController.unmuteUser(req, reply));

  // Impersonation — admin only (extra guard in controller)
  app.post('/users/:id/impersonate', { preHandler: [fullAdminMiddleware, requirePermission('user:impersonate')] }, (req, reply) => adminController.impersonateUser(req, reply));

  // ─── Sessions ─────────────────────────────────────────────────────────────

  app.get('/users/:id/sessions', { preHandler: requirePermission('session:view') }, (req, reply) => adminController.getUserSessions(req, reply));
  app.delete('/users/:id/sessions', { preHandler: requirePermission('session:revoke') }, (req, reply) => adminController.revokeAllSessions(req, reply));
  app.delete('/users/:id/sessions/:sessionId', { preHandler: requirePermission('session:revoke') }, (req, reply) => adminController.revokeSession(req, reply));

  // ─── Login History ────────────────────────────────────────────────────────

  app.get('/users/:id/login-history', { preHandler: requirePermission('user:view') }, (req, reply) => adminController.getLoginHistory(req, reply));

  // ─── Per-user Audit Log ───────────────────────────────────────────────────

  app.get('/users/:id/audit-log', { preHandler: requirePermission('audit:view') }, (req, reply) => adminController.getUserAuditLog(req, reply));

  // ─── GDPR ─────────────────────────────────────────────────────────────────

  app.post('/users/:id/gdpr/export', { preHandler: [fullAdminMiddleware, requirePermission('gdpr:manage')] }, (req, reply) => adminController.createGdprExport(req, reply));
  app.post('/users/:id/gdpr/delete', { preHandler: [fullAdminMiddleware, requirePermission('gdpr:manage')] }, (req, reply) => adminController.createGdprDelete(req, reply));
  app.get('/gdpr-requests', { preHandler: [fullAdminMiddleware, requirePermission('gdpr:manage')] }, (req, reply) => adminController.listGdprRequests(req, reply));

  // ─── Global Audit Log ─────────────────────────────────────────────────────

  app.get('/audit-log', { preHandler: requirePermission('audit:view') }, (req, reply) => adminController.getAuditLogs(req, reply));
}
