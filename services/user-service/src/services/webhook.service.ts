import { eq } from 'drizzle-orm';
import { getDb, webhookEndpoints, webhookEvents } from '@thinkai/db';
import crypto from 'node:crypto';
import { enqueueWebhook } from '../queues/webhook.queue';

export type CreateWebhookEndpointInput = {
  url: string;
  eventTypes: string[];
  createdBy: string;
};

export type UpdateWebhookEndpointInput = {
  url?: string;
  eventTypes?: string[];
  isActive?: boolean;
};

export class WebhookService {
  private get db() { return getDb(); }

  // ─── Manage Endpoints ─────────────────────────────────────────────────────

  async createEndpoint(input: CreateWebhookEndpointInput) {
    const secret = crypto.randomBytes(24).toString('hex');
    const [endpoint] = await this.db
      .insert(webhookEndpoints)
      .values({
        url: input.url,
        secret,
        eventTypes: input.eventTypes,
        createdBy: input.createdBy
      })
      .returning();
    return endpoint;
  }

  async listEndpoints() {
    return this.db.select().from(webhookEndpoints).orderBy(webhookEndpoints.createdAt);
  }

  async getEndpoint(id: string) {
    const [endpoint] = await this.db.select().from(webhookEndpoints).where(eq(webhookEndpoints.id, id)).limit(1);
    return endpoint ?? null;
  }

  async updateEndpoint(id: string, input: UpdateWebhookEndpointInput) {
    const updateFields: Partial<typeof webhookEndpoints.$inferInsert> = {};
    if (input.url !== undefined) updateFields.url = input.url;
    if (input.eventTypes !== undefined) updateFields.eventTypes = input.eventTypes;
    if (input.isActive !== undefined) updateFields.isActive = input.isActive;

    if (Object.keys(updateFields).length === 0) return this.getEndpoint(id);

    updateFields.updatedAt = new Date();
    const [updated] = await this.db
      .update(webhookEndpoints)
      .set(updateFields)
      .where(eq(webhookEndpoints.id, id))
      .returning();
    return updated ?? null;
  }

  async deleteEndpoint(id: string) {
    await this.db.delete(webhookEndpoints).where(eq(webhookEndpoints.id, id));
    return { deleted: true };
  }

  // ─── Dispatch Webhooks ────────────────────────────────────────────────────

  /**
   * Dispatches an event to all interested active endpoints.
   * Creates a webhookEvent log per endpoint and enqueues the delivery job.
   */
  async dispatchEvent(eventName: string, payload: Record<string, unknown>) {
    // Note: eventTypes typically match AnalyticsEventType but can be anything
    const endpoints = await this.db.select().from(webhookEndpoints).where(eq(webhookEndpoints.isActive, true));

    // Filter endpoints that subscribe to this event (or '*' for all events)
    const activeTargets = endpoints.filter(ep => 
      ep.eventTypes.includes('*') || ep.eventTypes.includes(eventName)
    );

    if (activeTargets.length === 0) return;

    for (const endpoint of activeTargets) {
      // 1. Create the trace log in webhookEvents
      // Re-using the webhookEvents table (which has provider='razorpay' default, so we override)
      const [log] = await this.db.insert(webhookEvents).values({
        provider: 'system',
        eventKey: `${endpoint.id}:${Date.now()}`,
        eventName,
        signatureHash: 'pending', // Signature generated at delivery time
        status: 'processing',
        payload
      }).returning();

      // 2. Enqueue the delivery
      if (log) {
        await enqueueWebhook({
          endpointId: endpoint.id,
          url: endpoint.url,
          secret: endpoint.secret,
          eventType: eventName,
          payload,
          eventId: log.id
        });
      }
    }
  }
}
