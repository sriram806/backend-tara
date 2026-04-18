import crypto from 'node:crypto';
import { getPlanConfig, PlanName } from '../utils/plans';

type RazorpayOrder = {
  id: string;
  amount: number;
  currency: 'INR';
  receipt: string;
  status?: string;
  notes?: Record<string, string>;
};

export class RazorpayService {
  constructor(
    private readonly keyId: string,
    private readonly keySecret: string,
    private readonly webhookSecret: string
  ) {}

  async createOrder(input: { userId: string; plan: PlanName; receipt: string }) {
    const planConfig = getPlanConfig(input.plan);
    if (planConfig.amountInPaise <= 0) {
      throw new Error('Razorpay orders require a paid plan');
    }

    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        authorization: this.basicAuthHeader(),
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        amount: planConfig.amountInPaise,
        currency: planConfig.currency,
        receipt: input.receipt,
        payment_capture: 1,
        notes: {
          userId: input.userId,
          plan: input.plan
        }
      })
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Failed to create Razorpay order: ${message}`);
    }

    return (await response.json()) as RazorpayOrder;
  }

  async fetchPayment(paymentId: string) {
    const response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      method: 'GET',
      headers: {
        authorization: this.basicAuthHeader()
      }
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Failed to fetch Razorpay payment: ${message}`);
    }

    return (await response.json()) as Record<string, any>;
  }

  verifyPaymentSignature(orderId: string, paymentId: string, signature: string) {
    const expected = crypto
      .createHmac('sha256', this.keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    return this.safeEqual(expected, signature);
  }

  verifyWebhookSignature(rawBody: string, signature: string) {
    const expected = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(rawBody)
      .digest('hex');

    return this.safeEqual(expected, signature);
  }

  private safeEqual(expected: string, received: string) {
    const expectedBuffer = Buffer.from(expected);
    const receivedBuffer = Buffer.from(received);

    if (expectedBuffer.length !== receivedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
  }

  private basicAuthHeader() {
    const token = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');
    return `Basic ${token}`;
  }
}
