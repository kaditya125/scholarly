import crypto from 'crypto';
import Razorpay from 'razorpay';
import { db } from '../config/firebase';
import { env } from '../config/env';
import { classRepository } from '../repositories/class.repository';
import { enrollmentService } from './enrollment.service';
import { earningsService } from './earnings.service';

type CodedError = Error & { code: string };
const fail = (code: string, message: string): never => {
  throw Object.assign(new Error(message), { code }) as CodedError;
};

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

export interface PlanDef { id: string; name: string; monthlyINR: number; yearlyINR?: number; }

const PLANS: Record<string, PlanDef> = {
  pro: { id: 'pro', name: 'Sadhya Pro (Launch Offer)', monthlyINR: 199, yearlyINR: 1788 },
};

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

  /**
   * Wraps Razorpay order creation so gateway-side failures never masquerade as caller errors.
   *
   * Razorpay SDK rejections carry the gateway's OWN http status on `statusCode`, and the global
   * error handler forwards `err.status || err.statusCode` verbatim. A bad or rotated key pair
   * therefore surfaced to the browser as a 401, which the checkout page read as "the user is
   * signed out" and answered by telling an authenticated user to sign in. A rejected *server*
   * credential is our misconfiguration, not a failure of the caller's session, so it maps to 502.
   */
  private async createRemoteOrder(params: Record<string, any>) {
    try {
      return await this.client().orders.create(params as any);
    } catch (error: any) {
      const status = error?.statusCode ?? error?.status;
      if (status === 401 || status === 403) {
        const detail = error?.error?.description || error?.message || 'Authentication failed';
        console.error(`[payments] Razorpay rejected our API credentials (${status}): ${detail}. Check RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET.`);
        throw Object.assign(
          new Error("The payment gateway rejected this server's credentials. Please try again later."),
          { statusCode: 502, code: 'GATEWAY_AUTH_FAILED' },
        );
      }
      throw error;
    }
  }

  /** Resolves the authoritative price for a plan/billing period. Amount is in paise. */
  private priceFor(planId: string, yearly: boolean): { plan: PlanDef; rupees: number; paise: number } {
    const plan = PLANS[planId];
    if (!plan) throw new Error(`Unknown plan: ${planId}`);
    const rupees = yearly ? (plan.yearlyINR ?? plan.monthlyINR * 12) : plan.monthlyINR;
    return { plan, rupees, paise: rupees * 100 };
  }

  /**
   * Creates a Razorpay order for the given user + plan and records it in Firestore
   * (payments/{orderId}) with the user id, so the webhook can attribute the payment later.
   */
  async createOrder(userId: string, planId: string, yearly: boolean) {
    const { plan, rupees, paise } = this.priceFor(planId, yearly);
    const receipt = `sch_${userId.slice(0, 8)}_${Date.now()}`.slice(0, 40);

    const order = await this.createRemoteOrder({
      amount: paise,
      currency: 'INR',
      receipt,
      notes: { userId, planId: plan.id, billing: yearly ? 'yearly' : 'monthly' },
    });

    await db.collection('payments').doc(order.id).set({
      orderId: order.id,
      orderType: 'subscription',
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
      order_id: order.id,
      orderId: order.id,
      id: order.id,
      amount: paise,
      currency: 'INR',
      keyId: this.publicKeyId,
      planName: plan.name,
      billing: yearly ? 'yearly' : 'monthly',
      amountRupees: rupees,
    };
  }

  /**
   * Creates a generic Razorpay order for any custom amount (min 100 paise).
   */
  async createGenericOrder(userId: string, amountPaise: number, currency = 'INR', receipt?: string, notes?: Record<string, any>) {
    if (amountPaise < 100) throw new Error('Minimum order amount is 100 paise (₹1).');
    const orderReceipt = (receipt || `sch_${userId.slice(0, 8)}_${Date.now()}`).slice(0, 40);

    const order = await this.createRemoteOrder({
      amount: amountPaise,
      currency,
      receipt: orderReceipt,
      notes: { userId, ...(notes || {}) },
    });

    await db.collection('payments').doc(order.id).set({
      orderId: order.id,
      orderType: 'generic',
      userId,
      amountPaise,
      amountRupees: Math.round(amountPaise / 100),
      currency,
      status: 'created',
      createdAt: Date.now(),
    });

    return {
      order_id: order.id,
      orderId: order.id,
      id: order.id,
      amount: amountPaise,
      currency,
      receipt: orderReceipt,
      keyId: this.publicKeyId,
    };
  }

  /**
   * Creates a Razorpay order for one student buying into one paid class. Amount is computed
   * SERVER-SIDE from the class's own `pricing` record — never accepted from the client, same
   * discipline as `createOrder` above. Capacity is checked here so checkout never opens for a
   * full class; it is deliberately NOT re-checked when the payment later clears (see
   * `enrollmentService.activateFromPurchase` for why refusing a seat after money has already
   * moved would be the worse failure).
   */
  async createClassOrder(studentUid: string, classId: string) {
    const record = await classRepository.getById(classId);
    if (!record) return fail('NOT_FOUND', 'Class not found');
    if (record.ownerUid === studentUid) return fail('SELF_ENROL', 'You cannot buy your own class.');
    if (record.pricing.type !== 'paid' || record.pricing.amountINR <= 0) {
      return fail('NOT_PURCHASABLE', 'This class is not for sale.');
    }
    if (!['published', 'active'].includes(record.status)) {
      return fail('CLASS_NOT_OPEN', 'This class is not open to join.');
    }
    const seats = record.capacity;
    const enrolled = record.counts?.enrolled ?? 0;
    if (seats != null && enrolled >= seats) return fail('CLASS_FULL', 'This class is full.');

    const rupees = record.pricing.amountINR;
    const paise = rupees * 100;
    const receipt = `cls_${classId.slice(0, 8)}_${Date.now()}`.slice(0, 40);

    const order = await this.createRemoteOrder({
      amount: paise,
      currency: 'INR',
      receipt,
      notes: { userId: studentUid, classId, teacherUid: record.ownerUid, orderType: 'class_purchase' },
    });

    await db.collection('payments').doc(order.id).set({
      orderId: order.id,
      orderType: 'class_purchase',
      userId: studentUid,
      classId,
      teacherUid: record.ownerUid,
      className: record.title,
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
      classTitle: record.title,
      amountRupees: rupees,
    };
  }

  /**
   * Applies a verified payment, whichever order type it turns out to be. Both `verifyPayment`
   * (client callback) and `handleWebhookEvent` (server-to-server) call this rather than deciding
   * the type themselves, so there is exactly one place that reads `orderType` and dispatches.
   *
   * Dispatch is on KNOWN types only — an unrecognised type grants nothing. It previously read
   * `orderType === 'class_purchase' ? 'class_purchase' : 'subscription'`, so every other value
   * fell into the subscription branch and got the Pro upgrade. `createGenericOrder` stores
   * `orderType: 'generic'` for an amount supplied in the REQUEST BODY (floor: 100 paise), so
   * any signed-in caller could POST `{amount: 100}`, pay ₹1 and be upgraded to a ₹199 plan.
   * A client-priced order can never buy an entitlement; it is recorded as paid and nothing else.
   */
  async applyOrderPayment(orderId: string, paymentId: string, source: 'client' | 'webhook', method?: string): Promise<{ applied: boolean; orderType: 'subscription' | 'class_purchase' | 'generic' | null; userId?: string; classId?: string }> {
    const snap = await db.collection('payments').doc(orderId).get();
    if (!snap.exists) {
      console.warn(`[payments] Order ${orderId} not found in Firestore (source=${source}); ignoring.`);
      return { applied: false, orderType: null };
    }
    const stored = (snap.data() as any).orderType;

    if (stored === 'class_purchase') {
      const result = await this.markClassOrderPaid(orderId, paymentId, source, method);
      return { applied: result.applied, orderType: 'class_purchase', userId: result.userId, classId: result.classId };
    }
    if (stored === 'subscription') {
      const result = await this.markPaidAndUpgrade(orderId, paymentId, source, method);
      return { applied: result.upgraded, orderType: 'subscription', userId: result.userId };
    }

    const result = await this.markOrderPaidOnly(orderId, paymentId, source, method, stored);
    return { applied: result.applied, orderType: 'generic', userId: result.userId };
  }

  /**
   * Records a payment against an order that confers NO entitlement — a generic (client-priced)
   * order, or one whose `orderType` we don't recognise. Idempotent on `status` exactly like
   * `markPaidAndUpgrade`, so a retried webhook is safe. Deliberately touches only the payment
   * doc: it never writes to `users`, which is what keeps a ₹1 order from granting Pro.
   */
  private async markOrderPaidOnly(orderId: string, paymentId: string, source: 'client' | 'webhook', method: string | undefined, storedType: unknown): Promise<{ applied: boolean; userId?: string }> {
    const ref = db.collection('payments').doc(orderId);
    const snap = await ref.get();
    if (!snap.exists) return { applied: false };
    const data = snap.data() as any;

    if (data.status !== 'paid') {
      await ref.set({ status: 'paid', paymentId, paidAt: Date.now(), paidVia: source, ...(method ? { method } : {}) }, { merge: true });
    }
    console.log(`[payments] Order ${orderId} (orderType=${String(storedType)}) recorded paid for ${data.userId}; no entitlement granted.`);
    return { applied: true, userId: data.userId };
  }

  /**
   * Marks a class-purchase order paid, activates the student's enrolment, and accrues the
   * teacher's earnings ledger. Idempotent on the order's own `status` field exactly like
   * `markPaidAndUpgrade`; `enrollmentService.activateFromPurchase` and
   * `earningsService.accrueForClassSale` are each independently idempotent too, so a retried
   * webhook after a partial failure (e.g. order marked paid, ledger write crashed) safely
   * finishes the remaining step instead of double-applying the parts that already succeeded.
   */
  private async markClassOrderPaid(orderId: string, paymentId: string, source: 'client' | 'webhook', method?: string): Promise<{ applied: boolean; userId?: string; classId?: string }> {
    const ref = db.collection('payments').doc(orderId);
    const snap = await ref.get();
    if (!snap.exists) return { applied: false };
    const data = snap.data() as any;

    if (data.status !== 'paid') {
      await ref.set({ status: 'paid', paymentId, paidAt: Date.now(), paidVia: source, ...(method ? { method } : {}) }, { merge: true });
    }

    await enrollmentService.activateFromPurchase(data.classId, data.userId, orderId);
    await earningsService.accrueForClassSale({
      teacherUid: data.teacherUid,
      classId: data.classId,
      orderId,
      grossPaise: data.amountPaise,
    });

    console.log(`[payments] ✅ Activated class purchase ${data.userId} → ${data.classId} (order ${orderId}, via ${source}).`);
    return { applied: true, userId: data.userId, classId: data.classId };
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
        planName: data.planName || 'Sadhya Pro',
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
      // `orderType` distinguishes a class purchase (Phase 3I) from a subscription order — without
      // it, a class-purchase row would fall through to `planName || 'Sadhya Pro'` below and
      // render as a fake subscription line item in Settings' billing history and invoice.
      return rows.map((r) =>
        r.orderType === 'class_purchase'
          ? {
              orderId: r.orderId, orderType: 'class_purchase', planId: null,
              planName: r.className || 'Class purchase', billing: null,
              amountRupees: r.amountRupees ?? null, currency: r.currency || 'INR',
              status: r.status || 'created', method: r.method || null,
              paymentId: r.paymentId || null, createdAt: r.createdAt || null, paidAt: r.paidAt || null,
            }
          : {
              orderId: r.orderId, orderType: 'subscription', planId: r.planId,
              planName: r.planName || 'Sadhya Pro', billing: r.billing || 'monthly',
              amountRupees: r.amountRupees ?? null, currency: r.currency || 'INR',
              status: r.status || 'created', method: r.method || null,
              paymentId: r.paymentId || null, createdAt: r.createdAt || null, paidAt: r.paidAt || null,
            },
      );
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
        await this.applyOrderPayment(orderId, paymentId, 'webhook', payment?.method);
        return { handled: true };
      }
    }
    return { handled: false };
  }
}

export const paymentsService = new PaymentsService();
