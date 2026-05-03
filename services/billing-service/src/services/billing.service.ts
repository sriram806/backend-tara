import crypto from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { getDb, invoices, paymentTransactions, subscriptions, users, webhookEvents } from '@thinkai/db';
import { getPlanConfig, PlanName } from '../utils/plans';
import { QuotaConsumeDto, SubscribeDto, VerifyDto } from '../schemas/billing.schema';
import { RazorpayService } from './razorpay.service';
import { redisClient } from './redis.service';

const GRACE_DAYS = 3;
const MAX_WEBHOOK_RETRIES = 3;

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function providerEventKey(payload: Record<string, any>) {
  const event = String(payload.event ?? 'unknown');
  const entity = payload.payload?.payment?.entity ?? payload.payload?.subscription?.entity ?? {};
  const parts = [
    payload.id,
    event,
    entity.id,
    entity.order_id,
    entity.created_at,
    entity.status
  ].filter(Boolean);

  return parts.length
    ? parts.join(':')
    : crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function normalizeIdempotencyKey(value?: string) {
  if (!value) return undefined;
  const key = value.trim();
  return key.length >= 8 && key.length <= 128 ? key : undefined;
}

export class BillingService {
  constructor(private readonly razorpayService: RazorpayService) { }

  async subscribe(userId: string, dto: SubscribeDto, requestIdempotencyKey?: string) {
    const planConfig = getPlanConfig(dto.plan);
    const idempotencyKey = normalizeIdempotencyKey(requestIdempotencyKey ?? dto.idempotencyKey);

    if (idempotencyKey) {
      const existing = await this.findTransactionByUserAndIdempotency(userId, idempotencyKey);
      if (existing) {
        if (existing.plan !== dto.plan) {
          throw new Error('Idempotency key already used for a different plan');
        }

        if (['created', 'authorized'].includes(existing.status)) {
          return this.buildOrderResponse(existing);
        }

        if (existing.status === 'paid') {
          const active = await this.getSubscription(userId);
          return {
            subscription: active,
            checkout: null,
            idempotent: true
          };
        }
      }
    }

    const receipt = `nova_${userId.slice(0, 8)}_${Date.now()}`;
    const order = await this.razorpayService.createOrder({
      userId,
      plan: dto.plan,
      receipt
    });

    const [transaction] = await getDb().insert(paymentTransactions).values({
      userId,
      plan: dto.plan as any,
      provider: 'razorpay',
      providerOrderId: order.id,
      idempotencyKey,
      receipt,
      amount: planConfig.amountInPaise,
      currency: planConfig.currency,
      status: 'created',
      attempts: 1,
      metadata: {
        source: 'checkout'
      },
      rawOrder: order
    }).returning();

    await getDb().insert(invoices).values({
      userId,
      amount: planConfig.amountInPaise,
      currency: planConfig.currency,
      status: 'pending',
      razorpayOrderId: order.id
    });

    return this.buildOrderResponse(transaction);
  }

  async verify(userId: string, dto: VerifyDto) {
    const ok = this.razorpayService.verifyPaymentSignature(
      dto.razorpayOrderId,
      dto.razorpayPaymentId,
      dto.razorpaySignature
    );

    if (!ok) {
      await this.markTransactionFailed(dto.razorpayOrderId, 'SIGNATURE_INVALID', 'Invalid payment signature');
      throw new Error('Invalid payment signature');
    }

    const transaction = await this.findTransactionByOrderId(dto.razorpayOrderId);
    if (!transaction) {
      throw new Error('Payment order not found');
    }

    if (transaction.userId !== userId) {
      throw new Error('Payment order does not belong to this user');
    }

    if (transaction.status === 'paid') {
      const existingSubscription = await this.getSubscription(userId);
      return {
        verified: true,
        idempotent: true,
        plan: existingSubscription.plan ?? transaction.plan,
        endDate: existingSubscription.currentPeriodEnd
      };
    }

    const payment = await this.razorpayService.fetchPayment(dto.razorpayPaymentId);
    const paymentStatus = String(payment.status ?? '');

    if (String(payment.order_id ?? '') !== dto.razorpayOrderId) {
      throw new Error('Payment does not belong to this order');
    }

    if (!['captured', 'authorized'].includes(paymentStatus)) {
      await this.markTransactionFailed(
        dto.razorpayOrderId,
        String(payment.error_code ?? 'PAYMENT_NOT_COMPLETED'),
        String(payment.error_description ?? `Payment is ${paymentStatus || 'unknown'}`),
        payment
      );
      throw new Error(`Payment is not complete: ${paymentStatus || 'unknown'}`);
    }

    const subscription = await this.completePaidTransaction({
      userId,
      orderId: dto.razorpayOrderId,
      paymentId: dto.razorpayPaymentId,
      signature: dto.razorpaySignature,
      rawPayment: payment,
      status: paymentStatus === 'captured' ? 'paid' : 'authorized'
    });

    return {
      verified: true,
      plan: subscription.plan,
      endDate: subscription.currentPeriodEnd
    };
  }

  async handleWebhook(rawBody: string, signature: string, payload: Record<string, any>) {
    const valid = this.razorpayService.verifyWebhookSignature(rawBody, signature);
    if (!valid) {
      throw new Error('Invalid webhook signature');
    }

    const eventName = String(payload.event ?? '');
    const entity = payload.payload?.payment?.entity ?? payload.payload?.subscription?.entity ?? {};
    const eventKey = providerEventKey(payload);
    const signatureHash = crypto.createHash('sha256').update(signature).digest('hex');

    const existingEvent = await this.findWebhookEvent(eventKey);
    if (existingEvent) {
      if (existingEvent.status === 'processed' || existingEvent.status === 'processing') {
        return { received: true, duplicate: true, event: eventName };
      }

      if ((existingEvent.retryCount ?? 0) >= MAX_WEBHOOK_RETRIES) {
        return { received: true, dropped: true, event: eventName };
      }

      await getDb().update(webhookEvents)
        .set({
          status: 'processing',
          payload,
          errorMessage: null,
          signatureHash,
          retryCount: existingEvent.retryCount + 1,
          updatedAt: new Date()
        })
        .where(eq(webhookEvents.eventKey, eventKey));
    } else {
      await getDb().insert(webhookEvents).values({
        provider: 'razorpay',
        eventKey,
        eventName,
        providerOrderId: entity.order_id ? String(entity.order_id) : undefined,
        providerPaymentId: entity.id ? String(entity.id) : undefined,
        signatureHash,
        status: 'processing',
        payload,
        retryCount: 0
      });
    }

    try {
      if (eventName === 'payment.captured' || eventName === 'payment.authorized') {
        await this.handlePaymentSuccess(entity, eventName === 'payment.captured' ? 'paid' : 'authorized');
      }

      if (eventName === 'payment.failed') {
        await this.markTransactionFailed(
          String(entity.order_id ?? ''),
          String(entity.error_code ?? 'PAYMENT_FAILED'),
          String(entity.error_description ?? entity.error_reason ?? 'Payment failed'),
          entity
        );
      }

      if (eventName === 'subscription.cancelled') {
        const subscriptionId = String(entity.id ?? '');
        const [sub] = await getDb().update(subscriptions)
          .set({ status: 'cancelled', updatedAt: new Date() })
          .where(eq(subscriptions.razorpaySubscriptionId, subscriptionId))
          .returning({ userId: subscriptions.userId });

        if (sub?.userId) {
          await getDb().update(users)
            .set({ plan: null, updatedAt: new Date() })
            .where(eq(users.id, sub.userId));
        }
      }

      await getDb().update(webhookEvents)
        .set({
          status: 'processed',
          processedAt: new Date(),
          eventName,
          providerOrderId: entity.order_id ? String(entity.order_id) : null,
          providerPaymentId: entity.id ? String(entity.id) : null,
          updatedAt: new Date()
        })
        .where(eq(webhookEvents.eventKey, eventKey));
    } catch (error: any) {
      await getDb().update(webhookEvents)
        .set({
          status: 'failed',
          errorMessage: error?.message || 'Webhook processing failed',
          updatedAt: new Date()
        })
        .where(eq(webhookEvents.eventKey, eventKey));
      throw error;
    }

    await redisClient.publish('ws:subscription:updated', JSON.stringify({
      event: eventName,
      userId: entity.notes?.userId
    }));

    return { received: true, event: eventName };
  }

  async getSubscription(userId: string) {
    const now = new Date();
    const rows = await getDb().select().from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .orderBy(desc(subscriptions.updatedAt))
      .limit(1);
    const subscription = rows[0];

    if (!subscription) {
      const [user] = await getDb().select({ plan: users.plan }).from(users).where(eq(users.id, userId)).limit(1);
      if (user && user?.plan) {
        await getDb().update(users)
          .set({ plan: null, updatedAt: new Date() })
          .where(eq(users.id, userId));
      }
      return {
        plan: 'NONE' as PlanName, // Fallback to NONE instead of LITE
        status: 'expired',
        isInGracePeriod: false,
        active: false
      };
    }

    const graceEndDate = addDays(new Date(subscription.endDate), GRACE_DAYS);
    const isExpired = new Date(subscription.endDate) <= now;
    const isInGracePeriod = isExpired && graceEndDate > now;

    const active = subscription.status === 'active' && (!isExpired || isInGracePeriod);

    // Sync users.plan flag if it mismatch with active status
    const [user] = await getDb().select({ plan: users.plan }).from(users).where(eq(users.id, userId)).limit(1);
    if (user) {
      const expectedPlan = active ? (subscription.plan as any) : null;
      if (user.plan !== expectedPlan) {
        await getDb().update(users)
          .set({ plan: expectedPlan, updatedAt: new Date() })
          .where(eq(users.id, userId));
      }
    }

    return {
      id: String(subscription.id),
      plan: subscription.plan as PlanName,
      status: isExpired && !isInGracePeriod ? 'expired' : subscription.status,
      endDate: subscription.endDate,
      currentPeriodStart: subscription.startDate,
      currentPeriodEnd: subscription.endDate,
      isInGracePeriod,
      active
    };
  }

  async getInvoices(userId: string) {
    return getDb().select().from(paymentTransactions)
      .where(eq(paymentTransactions.userId, userId))
      .orderBy(desc(paymentTransactions.createdAt));
  }

  async getPaymentStatus(userId: string, orderId: string) {
    const rows = await getDb().select().from(paymentTransactions)
      .where(and(eq(paymentTransactions.userId, userId), eq(paymentTransactions.providerOrderId, orderId)))
      .limit(1);
    const transaction = rows[0];
    if (!transaction) {
      throw new Error('Payment transaction not found');
    }

    return {
      orderId: transaction.providerOrderId,
      paymentId: transaction.providerPaymentId,
      status: transaction.status,
      plan: transaction.plan,
      amount: transaction.amount,
      currency: transaction.currency,
      attempts: transaction.attempts,
      failureCode: transaction.failureCode,
      failureReason: transaction.failureReason
    };
  }

  async consumeQuota(userId: string, dto: QuotaConsumeDto) {
    const subscription = await this.getSubscription(userId);
    const plan = (subscription.plan ?? 'NONE') as PlanName;
    const config = getPlanConfig(plan);

    if (!subscription.active) {
      return {
        allowed: false,
        reason: 'SUBSCRIPTION_REQUIRED',
        plan
      };
    }

    if (config.restrictedFeatures.includes(dto.feature) && !subscription.isInGracePeriod) {
      return {
        allowed: false,
        reason: 'FEATURE_RESTRICTED',
        plan
      };
    }

    const limit = config.monthlyLimits[dto.feature];
    if (limit === null) {
      return {
        allowed: true,
        plan,
        remaining: null
      };
    }

    const month = new Date().toISOString().slice(0, 7);
    const key = `ai:quota:${userId}:${dto.feature}:${month}`;
    const currentRaw = await redisClient.get(key);
    const current = currentRaw ? Number(currentRaw) : 0;

    if (current + dto.units > limit) {
      return {
        allowed: false,
        reason: 'QUOTA_EXCEEDED',
        plan,
        remaining: Math.max(0, limit - current)
      };
    }

    const updated = await redisClient.incrby(key, dto.units);
    await redisClient.expire(key, 35 * 24 * 60 * 60);

    return {
      allowed: true,
      plan,
      remaining: Math.max(0, limit - updated)
    };
  }

  async getUsageSnapshot(userId: string) {
    const month = new Date().toISOString().slice(0, 7);
    const keys = await redisClient.keys(`ai:quota:${userId}:*:${month}`);
    const usage: Record<string, number> = {};

    for (const key of keys) {
      const parts = key.split(':');
      const feature = parts[3] ?? 'unknown';
      const value = await redisClient.get(key);
      usage[feature] = Number(value ?? 0);
    }

    return usage;
  }

  private buildOrderResponse(transaction: Record<string, any>) {
    const order = transaction.rawOrder ?? {};
    return {
      order: {
        id: String(transaction.providerOrderId),
        amount: Number(order.amount ?? transaction.amount),
        currency: String(order.currency ?? transaction.currency)
      },
      transactionId: String(transaction.id),
      keyId: this.razorpayService.getKeyId(),
      plan: transaction.plan,
      idempotent: true
    };
  }

  private async handlePaymentSuccess(entity: Record<string, any>, status: 'authorized' | 'paid') {
    const orderId = String(entity.order_id ?? '');
    const paymentId = String(entity.id ?? '');
    if (!orderId || !paymentId) {
      return;
    }

    const transaction = await this.findTransactionByOrderId(orderId);
    if (!transaction || transaction.status === 'paid') {
      return;
    }

    await this.completePaidTransaction({
      userId: transaction.userId,
      orderId,
      paymentId,
      rawPayment: entity,
      status
    });
  }

  private async completePaidTransaction(input: {
    userId: string;
    orderId: string;
    paymentId: string;
    signature?: string;
    rawPayment: Record<string, any>;
    status: 'authorized' | 'paid';
  }) {
    const existing = await this.findTransactionByOrderId(input.orderId);
    if (!existing) {
      throw new Error('Payment transaction not found');
    }

    if (existing.userId !== input.userId) {
      throw new Error('Payment transaction mismatch');
    }

    if (existing.providerPaymentId && existing.providerPaymentId !== input.paymentId) {
      throw new Error('Order already linked to a different payment');
    }

    if (existing.status === 'paid') {
      return this.getSubscription(input.userId);
    }

    const [transaction] = await getDb().update(paymentTransactions)
      .set({
        providerPaymentId: input.paymentId,
        providerSignature: input.signature,
        status: input.status === 'paid' ? 'paid' : 'authorized',
        rawPayment: input.rawPayment,
        paidAt: input.status === 'paid' ? new Date() : null,
        attempts: existing.attempts + 1,
        updatedAt: new Date()
      })
      .where(eq(paymentTransactions.providerOrderId, input.orderId))
      .returning();

    if (!transaction) {
      throw new Error('Payment transaction update failed');
    }

    await getDb().update(invoices)
      .set({
        status: input.status === 'paid' ? 'paid' : 'pending',
        razorpayPaymentId: input.paymentId
      })
      .where(and(eq(invoices.userId, input.userId), eq(invoices.razorpayOrderId, input.orderId)));

    if (input.status !== 'paid') {
      return this.getSubscription(input.userId);
    }

    return this.activateSubscription({
      userId: input.userId,
      plan: transaction.plan as PlanName,
      provider: 'razorpay',
      periodStart: new Date(),
      periodEnd: addMonths(new Date(), 3),
      providerPaymentId: input.paymentId
    });
  }

  private async markTransactionFailed(
    orderId: string,
    failureCode?: string,
    failureReason?: string,
    rawPayment?: Record<string, any>
  ) {
    if (!orderId) {
      return;
    }

    const existing = await this.findTransactionByOrderId(orderId);
    if (existing) {
      await getDb().update(paymentTransactions)
        .set({
          status: 'failed',
          failureCode,
          failureReason,
          rawPayment,
          failedAt: new Date(),
          attempts: existing.attempts + 1,
          updatedAt: new Date()
        })
        .where(eq(paymentTransactions.providerOrderId, orderId));
    }

    await getDb().update(invoices)
      .set({ status: 'failed' })
      .where(eq(invoices.razorpayOrderId, orderId));
  }

  private async activateSubscription(input: {
    userId: string;
    plan: PlanName;
    provider: 'razorpay' | 'none';
    periodStart: Date;
    periodEnd: Date;
    providerPaymentId?: string;
  }) {
    const subscription = await this.upsertPostgresSubscription({
      userId: input.userId,
      plan: input.plan,
      startDate: input.periodStart,
      endDate: input.periodEnd,
      razorpaySubscriptionId: input.providerPaymentId
    });

    await getDb().update(users)
      .set({ plan: input.plan as any, updatedAt: new Date() })
      .where(eq(users.id, input.userId));

    return {
      id: subscription.id,
      userId: subscription.userId,
      plan: subscription.plan,
      status: subscription.status,
      currentPeriodStart: subscription.startDate,
      currentPeriodEnd: subscription.endDate,
      endDate: subscription.endDate
    };
  }

  private async upsertPostgresSubscription(input: {
    userId: string;
    plan: PlanName;
    startDate: Date;
    endDate: Date;
    razorpaySubscriptionId?: string;
  }) {
    const db = getDb();
    const existing = await db.select().from(subscriptions)
      .where(and(eq(subscriptions.userId, input.userId), eq(subscriptions.status, 'active')))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);

    if (existing.length > 0) {
      const [updated] = await db.update(subscriptions)
        .set({
          plan: input.plan as any,
          status: 'active',
          startDate: input.startDate,
          endDate: input.endDate,
          razorpaySubscriptionId: input.razorpaySubscriptionId,
          updatedAt: new Date()
        })
        .where(eq(subscriptions.id, existing[0].id))
        .returning();
      return updated;
    }

    const [created] = await db.insert(subscriptions).values({
      userId: input.userId,
      plan: input.plan as any,
      status: 'active',
      startDate: input.startDate,
      endDate: input.endDate,
      razorpaySubscriptionId: input.razorpaySubscriptionId
    }).returning();

    return created;
  }

  private async findTransactionByOrderId(orderId: string) {
    const rows = await getDb().select().from(paymentTransactions)
      .where(eq(paymentTransactions.providerOrderId, orderId))
      .limit(1);
    return rows[0];
  }

  private async findTransactionByUserAndIdempotency(userId: string, idempotencyKey: string) {
    const rows = await getDb().select().from(paymentTransactions)
      .where(and(eq(paymentTransactions.userId, userId), eq(paymentTransactions.idempotencyKey, idempotencyKey)))
      .limit(1);
    return rows[0];
  }

  private async findWebhookEvent(eventKey: string) {
    const rows = await getDb().select().from(webhookEvents)
      .where(eq(webhookEvents.eventKey, eventKey))
      .limit(1);
    return rows[0];
  }
}