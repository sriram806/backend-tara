import { FastifyReply, FastifyRequest } from 'fastify';
import { BillingService } from '../services/billing.service';
import { quotaConsumeSchema, subscribeSchema, verifySchema } from '../schemas/billing.schema';
import { sendError, sendSuccess } from '../utils/response';

export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  private getIdempotencyKey(request: FastifyRequest) {
    const fromHeader = request.headers['x-idempotency-key'];
    return typeof fromHeader === 'string' && fromHeader.trim().length > 0
      ? fromHeader.trim()
      : undefined;
  }

  createOrder = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.userContext?.userId;
      if (!userId) return sendError(reply, 401, 'UNAUTHORIZED', 'Missing user context');

      const dto = subscribeSchema.parse(request.body);
      const result = await this.billingService.subscribe(userId, dto, this.getIdempotencyKey(request));
      return sendSuccess(reply, result, 201);
    } catch (error) {
      return sendError(reply, 400, 'BILLING_ORDER_CREATE_FAILED', error instanceof Error ? error.message : 'Create order failed');
    }
  };

  subscribe = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.userContext?.userId;
      if (!userId) return sendError(reply, 401, 'UNAUTHORIZED', 'Missing user context');

      const dto = subscribeSchema.parse(request.body);
      const result = await this.billingService.subscribe(userId, dto, this.getIdempotencyKey(request));
      return sendSuccess(reply, result, 201);
    } catch (error) {
      return sendError(reply, 400, 'BILLING_SUBSCRIBE_FAILED', error instanceof Error ? error.message : 'Subscribe failed');
    }
  };

  verify = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.userContext?.userId;
      if (!userId) return sendError(reply, 401, 'UNAUTHORIZED', 'Missing user context');

      const dto = verifySchema.parse(request.body);
      const result = await this.billingService.verify(userId, dto);
      return sendSuccess(reply, result);
    } catch (error) {
      return sendError(reply, 400, 'BILLING_VERIFY_FAILED', error instanceof Error ? error.message : 'Verify failed');
    }
  };

  webhook = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const signature = String(request.headers['x-razorpay-signature'] ?? '');
      if (!signature || !request.rawBody) {
        return sendError(reply, 400, 'INVALID_WEBHOOK', 'Missing webhook signature or raw body');
      }

      const payload = (request.body ?? {}) as Record<string, any>;
      const result = await this.billingService.handleWebhook(request.rawBody, signature, payload);
      return sendSuccess(reply, result);
    } catch (error) {
      return sendError(reply, 401, 'WEBHOOK_SIGNATURE_INVALID', error instanceof Error ? error.message : 'Webhook validation failed');
    }
  };

  getSubscription = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.userContext?.userId;
      if (!userId) return sendError(reply, 401, 'UNAUTHORIZED', 'Missing user context');

      const result = await this.billingService.getSubscription(userId);
      return sendSuccess(reply, result);
    } catch (error) {
      return sendError(reply, 500, 'SUBSCRIPTION_FETCH_FAILED', error instanceof Error ? error.message : 'Subscription fetch failed');
    }
  };

  getInvoices = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.userContext?.userId;
      if (!userId) return sendError(reply, 401, 'UNAUTHORIZED', 'Missing user context');

      const result = await this.billingService.getInvoices(userId);
      return sendSuccess(reply, result);
    } catch (error) {
      return sendError(reply, 500, 'INVOICES_FETCH_FAILED', error instanceof Error ? error.message : 'Invoice fetch failed');
    }
  };

  getPaymentStatus = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.userContext?.userId;
      if (!userId) return sendError(reply, 401, 'UNAUTHORIZED', 'Missing user context');

      const orderId = String((request.params as { orderId?: unknown }).orderId ?? '');
      if (!orderId) return sendError(reply, 400, 'ORDER_ID_REQUIRED', 'Order ID is required');

      const result = await this.billingService.getPaymentStatus(userId, orderId);
      return sendSuccess(reply, result);
    } catch (error) {
      return sendError(reply, 404, 'PAYMENT_STATUS_FETCH_FAILED', error instanceof Error ? error.message : 'Payment status fetch failed');
    }
  };

  consumeQuota = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.userContext?.userId;
      if (!userId) return sendError(reply, 401, 'UNAUTHORIZED', 'Missing user context');

      const dto = quotaConsumeSchema.parse(request.body);
      const result = await this.billingService.consumeQuota(userId, dto);
      return sendSuccess(reply, result);
    } catch (error) {
      return sendError(reply, 400, 'QUOTA_CONSUME_FAILED', error instanceof Error ? error.message : 'Quota consume failed');
    }
  };

  usageSnapshot = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.userContext?.userId;
      if (!userId) return sendError(reply, 401, 'UNAUTHORIZED', 'Missing user context');

      const result = await this.billingService.getUsageSnapshot(userId);
      return sendSuccess(reply, result);
    } catch (error) {
      return sendError(reply, 500, 'USAGE_FETCH_FAILED', error instanceof Error ? error.message : 'Usage fetch failed');
    }
  };
}
