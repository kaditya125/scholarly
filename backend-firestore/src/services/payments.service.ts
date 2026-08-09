import crypto from 'crypto';
import Razorpay from 'razorpay';
import { db } from '../config/firebase';
import { env } from '../config/env';

/**
 * PaymentsService — Razorpay integration.
 *
 * Flow:
 *  1. Frontend calls POST /payments/order → we create a Razorpay order (amount computed
 *     SERVER-SIDE from the plan, never trusted from the client) and persist it.
 *  2. Frontend opens Razorpay Checkout with the returned orderId + public keyId.
 *  3. On success Razorpay returns { order_id, payment_id, signature } to the client, which
 *     POSTs them to /payments/verify — we verify the HMAC signature and upgrade the user.
 *  4. Independently, Razorpay calls POST /payments/webhook (payment.captured / order.paid);
 *     we verify the webhook signature and upgrade the user. The webhook is the source of
 *     truth (fires even if the browser closes); the client callback just makes it snappy.
 *  Both paths are idempotent.
 */

export interface PlanDef { id: string; name: string; monthlyINR: number; }

const PLANS: Record<string, PlanDef> = {
  pro: { id: 'pro', name: 'Scholarly Pro', monthlyINR: 499 },
};

const YEARLY_DISCOUNT = 0.85; // 15% off when billed yearly (matches the Pricing page)

export class PaymentsService {
  private _client: Razorpay | null = null;

  /** Payments are only available when both Razorpay keys are configured. */
  isEnabled(): boolean {
    return !!(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
  }

  get publicKeyId(): string | undefined {
    return env.RAZORPAY_KEY_ID;
  }

  private client(): Razorpay {
    if (!this.isEnabled()) throw new Error('Razorpay is not configured');
    if (!this._client) {
      this._client = new Razorpay({ key_id: env.RAZORPAY_KEY_ID!, key_secret: env.RAZORPAY_KEY_SECRET! });
    }
    return this._client;
  }

  /** Resolves the authoritative price for a plan/billing period. Amount is in paise. */
  private priceFor(planId: string, yearly: boolean): { plan: PlanDef; rupees: number; paise: number } {
    const plan = PLANS[planId];
    if (!plan) throw new Error(`Unknown plan: ${planId}`);
    const perMonth = yearly ? Math.round(plan.monthlyINR * YEARLY_DISCOUNT) : plan.monthlyINR;
    const rupees = yearly ? perMonth * 12 : perMonth;
    return { plan, rupees, paise: rupees * 100 };
  }

  /**
   * Creates a Razorpay order for the given user + plan and records it in Firestore
   * (payments/{orderId}) with the user id, so the webhook can attribute the payment later.
   */
  async createOrder(userId: string, planId: string, yearly: boolean) {
    const { plan, rupees, paise } = this.priceFor(planId, yearly);
    const receipt = `sch_${userId.slice(0, 8)}_${Date.now()}`.slice(0, 40);

    const order = await this.client().orders.create({
      amount: paise,
      currency: 'INR',
      receipt,
      notes: { userId, planId: plan.id, billing: yearly ? 'yearly' : 'monthly' },
    });

    await db.collection('payments').doc(order.id).set({
      orderId: order.id,
      userId,
      planId: plan.id,
      planName: plan.name,
      billing: yearly ? 'yearly' : 'monthly',
      amountPaise: paise,
      amountRupees: rupees,
      currency: 'INR',
      status: 'created',
      createdAt: Date.now(),
    });

    return {
      orderId: order.id,
      amount: paise,
      currency: 'INR',
      keyId: this.publicKeyId,
      planName: plan.name,
      billing: yearly ? 'yearly' : 'monthly',
      amountRupees: rupees,
    };
  }

  /** Verifies the client-side checkout callback signature: HMAC_SHA256(order_id|payment_id, secret). */
  verifyCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean {
    if (!env.RAZORPAY_KEY_SECRET || !orderId || !paymentId || !signature) return false;
    const expected = crypto
      .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
    return this.safeEqual(expected, signature);
  }

  /** Verifies a webhook payload signature: HMAC_SHA256(rawBody, webhookSecret). */
  verifyWebhookSignature(rawBody: Buffer | string, signature?: string): boolean {
    const secret = env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret || !signature || !rawBody) return false;
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    return this.safeEqual(expected, signature);
  }

  private safeEqual(a: string, b: string): boolean {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
  }

  /**
   * Marks an order paid and upgrades the user to Pro. Idempotent — if the order is already
   * marked paid, it returns without re-applying. `orderId` must belong to a payment doc we
   * created (so we can trust the userId/plan rather than anything client-supplied).
   */
  async markPaidAndUpgrade(orderId: string, paymentId: string, source: 'client' | 'webhook', method?: string): Promise<{ upgraded: boolean; userId?: string }> {
    const ref = db.collection('payments').doc(orderId);
    const snap = await ref.get();
    if (!snap.exists) {
      console.warn(`[payments] Order ${orderId} not found in Firestore (source=${source}); ignoring.`);
      return { upgraded: false };
    }
    const data = snap.data() as any;
    if (data.status === 'paid') {
      return { upgraded: true, userId: data.userId }; // already applied
    }

    const now = Date.now();
    await ref.set({ status: 'paid', paymentId, paidAt: now, paidVia: source, ...(method ? { method } : {}) }, { merge: true });

    const billing = data.billing || 'monthly';
    const periodMs = billing === 'yearly' ? 365 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;

    await db.collection('users').doc(data.userId).set({
      plan: 'pro',
      proSince: now,
      subscription: {
        status: 'active',
        plan: data.planId || 'pro',
        planName: data.planName || 'Scholarly Pro',
        billing,
        orderId,
        paymentId,
        method: method || null,
        amountRupees: data.amountRupees,
        activatedAt: now,
        currentPeriodEnd: now + periodMs,
        provider: 'razorpay',
        source,
      },
    }, { merge: true });

    console.log(`[payments] ✅ Upgraded ${data.userId} to Pro (order ${orderId}, via ${source}).`);
    return { upgraded: true, userId: data.userId };
  }

  /** Returns the user's payment/invoice history (most recent first). */
  async getHistory(userId: string): Promise<any[]> {
    try {
      // No orderBy (avoids a composite-index requirement); sort in memory.
      const snap = await db.collection('payments').where('userId', '==', userId).get();
      const rows = snap.docs.map((d) => d.data() as any);
      rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      return rows.map((r) => ({
        orderId: r.orderId,
        planId: r.planId,
        planName: r.planName || 'Scholarly Pro',
        billing: r.billing || 'monthly',
        amountRupees: r.amountRupees ?? null,
        currency: r.currency || 'INR',
        status: r.status || 'created',
        method: r.method || null,
        paymentId: r.paymentId || null,
        createdAt: r.createdAt || null,
        paidAt: r.paidAt || null,
      }));
    } catch (e) {
      console.error('[payments] getHistory failed:', (e as Error).message);
      return [];
    }
  }

  /** Returns the user's current plan + subscription snapshot (for the UI Pro badge). */
  async getUserPlan(userId: string): Promise<{ plan: string; subscription: any | null }> {
    try {
      const snap = await db.collection('users').doc(userId).get();
      const data = (snap.exists ? snap.data() : null) as any;
      return { plan: data?.plan || 'free', subscription: data?.subscription || null };
    } catch (e) {
      console.error('[payments] getUserPlan failed:', (e as Error).message);
      return { plan: 'free', subscription: null };
    }
  }

  /** Handles a verified webhook event. Returns whether an upgrade was applied. */
  async handleWebhookEvent(event: any): Promise<{ handled: boolean }> {
    const type = event?.event;
    // Both events carry the order id; payment.captured is the primary success signal.
    if (type === 'payment.captured' || type === 'order.paid') {
      const payment = event?.payload?.payment?.entity;
      const orderEntity = event?.payload?.order?.entity;
      const orderId = payment?.order_id || orderEntity?.id;
      const paymentId = payment?.id || 'webhook';
      if (orderId) {
        await this.markPaidAndUpgrade(orderId, paymentId, 'webhook', payment?.method);
        return { handled: true };
      }
    }
    return { handled: false };
  }
}

export const paymentsService = new PaymentsService();
