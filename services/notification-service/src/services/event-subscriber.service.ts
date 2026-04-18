import { enqueueNotification } from './queue.service';
import { redisClient } from './redis.service';

const EVENT_CHANNELS = [
  'ws:job:completed',
  'ws:resume:completed',
  'ws:roadmap:completed',
  'ws:jobs:completed',
  'ws:github:completed',
  'ws:subscription:updated'
] as const;

export async function startEventSubscriber() {
  const subscriber = redisClient.duplicate();

  await subscriber.subscribe(...EVENT_CHANNELS);
  subscriber.on('message', async (channel, message) => {
    try {
      const payload = JSON.parse(message) as {
        userId?: string;
      };
      if (!payload.userId) return;

      if (channel === 'ws:job:completed') {
        await enqueueNotification({
          userId: payload.userId,
          type: 'in_app',
          title: 'Career analysis completed',
          message: 'Your AI career analysis is ready.',
          eventType: 'analysis_completed'
        });
      }

      if (channel === 'ws:resume:completed') {
        await enqueueNotification({
          userId: payload.userId,
          type: 'in_app',
          title: 'Resume analysis ready',
          message: 'Your resume insights are now available.',
          eventType: 'resume_ready'
        });
      }

      if (channel === 'ws:roadmap:completed') {
        await enqueueNotification({
          userId: payload.userId,
          type: 'in_app',
          title: 'Roadmap generated',
          message: 'Your roadmap is ready to explore.',
          eventType: 'roadmap_completed'
        });
      }

      if (channel === 'ws:jobs:completed') {
        await enqueueNotification({
          userId: payload.userId,
          type: 'in_app',
          title: 'Job matches available',
          message: 'Fresh role matches have been generated for you.'
        });
      }

      if (channel === 'ws:github:completed') {
        await enqueueNotification({
          userId: payload.userId,
          type: 'in_app',
          title: 'GitHub analysis completed',
          message: 'Your developer intelligence report is ready.'
        });
      }

      if (channel === 'ws:subscription:updated') {
        await enqueueNotification({
          userId: payload.userId,
          type: 'email',
          title: 'Subscription updated',
          message: 'Your subscription status has been updated successfully.',
          eventType: 'subscription_updated',
          metadata: payload as unknown as Record<string, unknown>
        });
      }
    } catch {
      // Ignore malformed events and keep listener running.
    }
  });

  return subscriber;
}
