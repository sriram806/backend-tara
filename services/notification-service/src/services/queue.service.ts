import { Queue, Worker } from 'bullmq';
import { createCloudWatchMetricEvent } from '@thinkai/config';
import { redisClient } from './redis.service';
import { NotificationDispatcherService } from './notification-dispatcher.service';

const queueName = 'notification-queue';

export const notificationQueue = new Queue(queueName, {
  connection: redisClient
});

export async function enqueueNotification(payload: Record<string, unknown>) {
  return notificationQueue.add('notification-send', payload, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000
    },
    removeOnComplete: true,
    removeOnFail: false
  });
}

export function startNotificationWorker(dispatcher: NotificationDispatcherService) {
  const metricsNamespace = process.env.METRICS_NAMESPACE ?? 'ThinkAI/Services';

  return new Worker(
    queueName,
    async (job) => {
      const startedAt = Date.now();
      await dispatcher.dispatch(job.data as Record<string, unknown>);
      const processingTimeMs = Date.now() - startedAt;

      console.info(JSON.stringify(createCloudWatchMetricEvent(
        metricsNamespace,
        'QueueProcessingTimeMs',
        processingTimeMs,
        'Milliseconds',
        {
          service: process.env.SERVICE_NAME ?? 'notification-service',
          queue: queueName,
          jobName: job.name
        }
      )));
    },
    {
      connection: redisClient
    }
  );
}
