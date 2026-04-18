import { Queue, Worker } from 'bullmq';
import { createCloudWatchMetricEvent } from '@thinkai/config';
import { connection } from './connection';
import { AnalyticsEventType } from '../schemas/analytics.schema';
import { UserEventModel } from '../models/user-event.model';

const ANALYTICS_QUEUE_NAME = 'analytics-queue';

export type AnalyticsEventPayload = {
  userId: string;
  eventType: AnalyticsEventType;
  metadata: Record<string, unknown>;
  createdAt?: string;
};

export const analyticsQueue = new Queue(ANALYTICS_QUEUE_NAME, { connection });

export async function enqueueAnalyticsEvent(payload: AnalyticsEventPayload) {
  return analyticsQueue.add('analytics:event', payload, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 500
    },
    removeOnComplete: true,
    removeOnFail: false
  });
}

export function startAnalyticsWorker(logger: { info: (...args: unknown[]) => void; error: (...args: unknown[]) => void }) {
  const metricsNamespace = process.env.METRICS_NAMESPACE ?? 'ThinkAI/Services';
  const serviceName = process.env.SERVICE_NAME ?? 'user-service';

  const worker = new Worker(
    ANALYTICS_QUEUE_NAME,
    async (job) => {
      const data = job.data as AnalyticsEventPayload;
      const startedAt = Date.now();

      await UserEventModel.create({
        userId: data.userId,
        eventType: data.eventType,
        metadata: data.metadata,
        createdAt: data.createdAt ? new Date(data.createdAt) : new Date()
      });

      logger.info(createCloudWatchMetricEvent(
        metricsNamespace,
        'AnalyticsEventIngestMs',
        Date.now() - startedAt,
        'Milliseconds',
        {
          service: serviceName,
          queue: ANALYTICS_QUEUE_NAME,
          eventType: data.eventType
        }
      ));
    },
    { connection }
  );

  worker.on('error', (error) => {
    logger.error({ err: error }, 'Analytics worker failed');
  });

  return worker;
}
