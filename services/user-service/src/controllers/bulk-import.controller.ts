import { FastifyReply, FastifyRequest } from 'fastify';
import { AdminUserService } from '../services/admin-user.service';
import { enqueueBulkImport, bulkImportQueue } from '../queues/bulk-import.queue';
import { parseCsvBuffer } from '../utils/csv.utils';

export class BulkImportController {
  private adminSvc = new AdminUserService();

  /**
   * POST /admin/users/import
   * Accepts a multipart form with a single CSV file field named "file".
   * Enqueues a BullMQ job and returns the jobId immediately.
   * The client can poll GET /admin/users/import/:jobId/status.
   */
  async importCsv(request: FastifyRequest, reply: FastifyReply) {
    const actorId = request.userContext!.userId;

    // Use fastify-multipart to read the file
    const data = await request.file();
    if (!data || data.fieldname !== 'file') {
      return reply.code(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'CSV file is required in field "file"' }
      });
    }

    const buffer = await data.toBuffer();

    if (!buffer.length) {
      return reply.code(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'CSV file is empty' }
      });
    }

    // Quick header validation — first 10 rows
    const preview = await parseCsvBuffer(buffer.slice(0, 4096));
    if (!preview[0] || !('email' in preview[0])) {
      return reply.code(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'CSV must have an "email" column header' }
      });
    }

    // Enqueue job
    const job = await enqueueBulkImport({
      csvBuffer: Array.from(buffer),
      defaultRole: 'free',
      actorId
    });

    await this.adminSvc.writeAuditLog({
      actorId, actorEmail: null, actorRole: request.userContext?.role ?? null,
      action: 'bulk_import',
      metadata: { jobId: job.id, byteSize: buffer.length, previewRows: preview.length },
      ipAddress: request.ip, userAgent: request.headers['user-agent']
    });

    return reply.code(202).send({
      success: true,
      data: {
        jobId: job.id,
        message: 'Bulk import enqueued. Poll /admin/users/import/:jobId/status for progress.'
      }
    });
  }

  /**
   * GET /admin/users/import/:jobId/status
   * Returns the job status, progress, and result (once complete).
   */
  async getImportStatus(request: FastifyRequest, reply: FastifyReply) {
    const { jobId } = request.params as { jobId: string };
    const job = await bulkImportQueue.getJob(jobId);

    if (!job) {
      return reply.code(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: `Import job ${jobId} not found` }
      });
    }

    const state = await job.getState();
    const progress = job.progress;
    const result = state === 'completed' ? job.returnvalue : null;
    const failedReason = state === 'failed' ? job.failedReason : null;

    return reply.send({
      success: true,
      data: { jobId, state, progress, result, failedReason }
    });
  }
}
