import { Queue, Worker } from 'bullmq';
import crypto from 'node:crypto';
import { connection } from './connection';
import { getDb, webhookEvents, webhookEndpoints } from '@thinkai/db';
import { eq } from 'drizzle-orm';

const WEBHOOK_QUEUE_NAME = 'webhook-delivery';

export type WebhookJobPayload = {
  endpointId: string;
  url: string;
  secret: string;
  eventType: string;
  payload: Record<string, unknown>;
  eventId: string;
};

// ─── Queue ────────────────────────────────────────────────────────────────────

export const webhookQueue = new Queue(WEBHOOK_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: true,
    removeOnFail: false
  }
});

export async function enqueueWebhook(payload: WebhookJobPayload) {
  return webhookQueue.add('webhook:send', payload, {
    jobId: `webhook:${payload.endpointId}:${payload.eventId}:${Date.now()}`
  });
}

// ─── Worker ───────────────────────────────────────────────────────────────────

export function startWebhookWorker(logger: { info: (...a: unknown[]) => void; error: (...a: unknown[]) => void }) {
  const worker = new Worker(
    WEBHOOK_QUEUE_NAME,
    async (job) => {
      const data = job.data as WebhookJobPayload;
      const db = getDb();

      // Ensure the endpoint is still active
      const [endpoint] = await db.select().from(webhookEndpoints).where(eq(webhookEndpoints.id, data.endpointId)).limit(1);
      if (!endpoint || !endpoint.isActive) {
        logger.info({ endpointId: data.endpointId }, 'Webhook endpoint inactive or deleted, skipping delivery');
        return;
      }

      // Prepare signature
      const timestamp = Date.now().toString();
      const payloadString = JSON.stringify(data.payload);
      const signaturePayload = `${timestamp}.${payloadString}`;
      const signature = crypto.createHmac('sha256', data.secret).update(signaturePayload).digest('hex');

      try {
        const response = await fetch(data.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'ThinkAI-Signature': `t=${timestamp},v1=${signature}`,
            'ThinkAI-Event': data.eventType,
            'ThinkAI-Delivery': job.id ?? data.eventId
          },
          body: payloadString,
          // Timeout after 10s
          signal: AbortSignal.timeout(10000)
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Log success delivery
        await db.update(webhookEvents).set({
          status: 'processed',
          processedAt: new Date(),
          updatedAt: new Date()
        }).where(eq(webhookEvents.id, data.eventId));

        logger.info({ endpointId: data.endpointId, eventId: data.eventId }, 'Webhook delivered successfully');
      } catch (err: any) {
        // Log failure
        const isFinalAttempt = job.attemptsMade >= (job.opts.attempts ?? 1) - 1;
        const status = isFinalAttempt ? 'failed' : 'processing';
        
        await db.update(webhookEvents).set({
          status,
          errorMessage: err.message ?? 'Unknown error',
          retryCount: job.attemptsMade + 1,
          updatedAt: new Date()
        }).where(eq(webhookEvents.id, data.eventId));

        throw err; // Re-throw to trigger BullMQ backoff/retry
      }
    },
    { connection, concurrency: 5 }
  );

  worker.on('error', (err) => logger.error({ err }, 'Webhook worker error'));
  worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err }, 'Webhook delivery failed'));

  return worker;
}
