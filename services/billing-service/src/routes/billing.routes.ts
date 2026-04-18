import { FastifyInstance } from 'fastify';
import { BillingController } from '../controllers/billing.controller';
import { billingAuthMiddleware } from '../middleware/auth.middleware';

export function billingRoutes(controller: BillingController) {
  return async (app: FastifyInstance) => {
    app.post('/webhook', controller.webhook);

    app.post('/orders', { preHandler: billingAuthMiddleware }, controller.createOrder);
    app.post('/subscribe', { preHandler: billingAuthMiddleware }, controller.subscribe);
    app.post('/verify', { preHandler: billingAuthMiddleware }, controller.verify);
    app.get('/subscription', { preHandler: billingAuthMiddleware }, controller.getSubscription);
    app.get('/invoices', { preHandler: billingAuthMiddleware }, controller.getInvoices);
    app.get('/payments/:orderId/status', { preHandler: billingAuthMiddleware }, controller.getPaymentStatus);

    app.post('/quota/consume', { preHandler: billingAuthMiddleware }, controller.consumeQuota);
    app.get('/quota/usage', { preHandler: billingAuthMiddleware }, controller.usageSnapshot);
  };
}
