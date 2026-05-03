import { Queue, Worker } from 'bullmq';
import { connection } from './connection';
import { getDb, refreshTokens, users } from '@thinkai/db';
import { eq, lt, and, ne } from 'drizzle-orm';

const CRON_QUEUE_NAME = 'admin-cron';

// ─── Queue ────────────────────────────────────────────────────────────────────

export const cronQueue = new Queue(CRON_QUEUE_NAME, {
  connection,
  defaultJobOptions: { removeOnComplete: true, removeOnFail: false }
});

// ─── Initialize Repeatable Jobs ──────────────────────────────────────────────

export async function initCronJobs() {
  // 1. Cleanup expired sessions daily at 3 AM
  await cronQueue.add('cleanup_sessions', {}, {
    repeat: { pattern: '0 3 * * *' },
    jobId: 'cron:cleanup_sessions'
  });

  // 2. Disable inactive users daily at 4 AM (inactive for > 90 days)
  await cronQueue.add('disable_inactive_users', {}, {
    repeat: { pattern: '0 4 * * *' },
    jobId: 'cron:disable_inactive_users'
  });
}

// ─── Worker ───────────────────────────────────────────────────────────────────

export function startCronWorker(logger: { info: (...a: unknown[]) => void; error: (...a: unknown[]) => void }) {
  const worker = new Worker(
    CRON_QUEUE_NAME,
    async (job) => {
      const db = getDb();
      
      if (job.name === 'cleanup_sessions') {
        const now = new Date();
        const result = await db.delete(refreshTokens)
          .where(
            // Delete tokens that expired OR were revoked more than 7 days ago
            lt(refreshTokens.expiresAt, now)
          );
        logger.info({ jobName: job.name }, 'Session cleanup complete');
        return result;
      }

      if (job.name === 'disable_inactive_users') {
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        // Suspend users who haven't logged in for 90 days and aren't already suspended/deleted
        const result = await db.update(users)
          .set({ status: 'suspended', updatedAt: new Date() })
          .where(
            and(
              lt(users.lastLogin, ninetyDaysAgo),
              eq(users.status, 'active'),
              eq(users.role as any, 'user') // Prevent locking out admins/moderators/support/guests
            )
          );
        
        logger.info({ jobName: job.name }, 'Inactive users disabled');
        return result;
      }

      throw new Error(`Unknown cron job: ${job.name}`);
    },
    { connection, concurrency: 1 }
  );

  worker.on('error', (err) => logger.error({ err }, 'Cron worker error'));
  worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err }, 'Cron job failed'));

  return worker;
}
