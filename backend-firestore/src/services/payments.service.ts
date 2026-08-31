import crypto from 'crypto';
import Razorpay from 'razorpay';
import { db } from '../config/firebase';
import { env } from '../config/env';
import { classRepository } from '../repositories/class.repository';
import { enrollmentService } from './enrollment.service';
import { earningsService } from './earnings.service';
import { zeptoMailService } from './email/zeptoMail.service';

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

  /**
   * Serialises order creation per user.
   *
   * `findReusableOrder` is a read followed by a create, which is not atomic: two clicks landing
   * together both saw "no open order" and each minted one. A Firestore transaction cannot help,
   * because creating the Razorpay order is an external side effect that cannot participate in
   * one. This queue makes the read-then-create sequence run one-at-a-time per user, which is
   * sufficient because PM2 runs this API as a SINGLE fork instance (ecosystem.config.js pins
   * instances: 1). If that ever becomes multi-instance, this must be replaced by a distributed
   * lock — an in-process queue would no longer span the workers.
   */
  private orderLocks = new Map<string, Promise<unknown>>();

  private withUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.orderLocks.get(userId) ?? Promise.resolve();
    const run = prev.catch(() => undefined).then(fn);
    this.orderLocks.set(userId, run.catch(() => undefined));
    void run.finally(() => {
      if (this.orderLocks.get(userId) === undefined) this.orderLocks.delete(userId);
    });
    return run;
  }

  /** Payments are only available when both Razorpay keys are configured. */
  isEnabled(): boolean {
    return !!(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
  }

  get publicKeyId(): string | undefined {
    return env.RAZORPAY_KEY_ID;
  }

  /**
   * Which Razorpay environment this process is wired to, derived from the key prefix so it can
   * never drift from the credentials actually in use.
   *
   * Every order doc records this. Before an order can grant an entitlement, its recorded
   * environment must match the running one — otherwise a payment made in test mode would grant
   * production access, which is exactly how the first Pro entitlement on this system was created
   * (a `rzp_test_` payment wrote `plan: 'pro'` because payment docs carried no environment at all).
   */
  get environment(): 'live' | 'test' {
    return (env.RAZORPAY_KEY_ID || '').startsWith('rzp_live_') ? 'live' : 'test';
  }

  /**
   * The authoritative entitlement check. Reads the SERVER's copy of the user record — never a
   * claim, never anything the caller supplied — and treats Pro as active only while it is both
   * marked active and unexpired, so a lapsed subscription correctly allows re-purchase.
   */
  async hasActivePro(userId: string): Promise<{ active: boolean; currentPeriodEnd?: number }> {
    const { plan, subscription } = await this.getUserPlan(userId);
    return this.evaluateEntitlement(plan, subscription);
  }

  /**
   * The single definition of "is this user Pro right now". Pure, so the order endpoint and the
   * subscription endpoint cannot drift apart.
   *
   * They previously did: `getSubscription` returned `isPro: plan === 'pro'`, ignoring both
   * `status` and `currentPeriodEnd`. A subscriber whose 30-day period had lapsed was therefore
   * shown as Pro by the UI — which hid the upgrade CTA and made Checkout refuse to sell to them —
   * while this method correctly reported them inactive and the server would have accepted the
   * payment. The result was an expired subscriber who could not renew.
   */
  evaluateEntitlement(plan: string, subscription: any): { active: boolean; currentPeriodEnd?: number } {
    if (plan !== 'pro') return { active: false };
    const status = subscription?.status;
    const end = Number(subscription?.currentPeriodEnd ?? 0);
    if (status && status !== 'active') return { active: false, currentPeriodEnd: end || undefined };
    if (end && end <= Date.now()) return { active: false, currentPeriodEnd: end };
    return { active: true, currentPeriodEnd: end || undefined };
  }

  /**
   * Returns a still-usable unpaid order for the same user/plan/billing so a double-click, a
   * refresh or a retry reuses the open Razorpay order instead of minting another one. Razorpay
   * orders stay payable indefinitely, but a stale one confuses reconciliation, so reuse is capped
   * to REUSE_WINDOW_MS. Bounded by `limit` + an in-memory sort to avoid needing a composite index.
   */
  private async findReusableOrder(userId: string, planId: string, billing: string): Promise<any | null> {
    const REUSE_WINDOW_MS = 30 * 60 * 1000;
    const cutoff = Date.now() - REUSE_WINDOW_MS;
    const snap = await db.collection('payments')
      .where('userId', '==', userId)
      .where('status', '==', 'created')
      .limit(25)
      .get();
    const candidates = snap.docs
      .map(d => d.data() as any)
      .filter(d => d.orderType === 'subscription'
        && d.planId === planId
        && d.billing === billing
        && d.environment === this.environment
        && Number(d.createdAt ?? 0) >= cutoff)
      .sort((a, b) => Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0));
    return candidates[0] ?? null;
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
    return this.withUserLock(userId, () => this.createOrderInner(userId, planId, yearly));
  }

  private async createOrderInner(userId: string, planId: string, yearly: boolean) {
    const { plan, rupees, paise } = this.priceFor(planId, yearly);
    const billing = yearly ? 'yearly' : 'monthly';

    // Idempotency: a double-click, a refresh or a retry after an ambiguous response must not
    // mint a second Razorpay order. Reuse the caller's own still-open order for the same
    // plan/billing instead. (Before this, every click created a new order — four orders for
    // one user in a single afternoon, three of them abandoned in `created` forever.)
    const existing = await this.findReusableOrder(userId, plan.id, billing);
    if (existing) {
      console.log(`[payments] PAYMENT_ORDER_REUSED order=${existing.orderId} user=${userId} plan=${plan.id}`);
      return {
        order_id: existing.orderId,
        orderId: existing.orderId,
        id: existing.orderId,
        amount: existing.amountPaise,
        currency: existing.currency || 'INR',
        keyId: this.publicKeyId,
        planName: existing.planName,
        billing: existing.billing,
        amountRupees: existing.amountRupees,
        reused: true,
      };
    }

    const receipt = `sch_${userId.slice(0, 8)}_${Date.now()}`.slice(0, 40);

    const order = await this.createRemoteOrder({
      amount: paise,
      currency: 'INR',
      receipt,
      notes: { userId, planId: plan.id, billing },
    });

    await db.collection('payments').doc(order.id).set({
      orderId: order.id,
      orderType: 'subscription',
      userId,
      planId: plan.id,
      planName: plan.name,
      billing,
      amountPaise: paise,
      amountRupees: rupees,
      currency: 'INR',
      status: 'created',
      environment: this.environment,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    console.log(`[payments] PAYMENT_ORDER_CREATED order=${order.id} user=${userId} plan=${plan.id} env=${this.environment}`);

    return {
      order_id: order.id,
      orderId: order.id,
      id: order.id,
      amount: paise,
      currency: 'INR',
      keyId: this.publicKeyId,
      planName: plan.name,
      billing,
      amountRupees: rupees,
      reused: false,
    };
  }

  /**
   * Marks an unpaid order as cancelled when the user dismisses Razorpay checkout. Only ever
   * moves `created` → `cancelled`, so a dismissal that races a real payment can never undo it —
   * the webhook's `paid` write wins regardless of arrival order.
   */
  async markOrderCancelled(orderId: string, userId: string): Promise<{ cancelled: boolean }> {
    const ref = db.collection('payments').doc(orderId);
    const snap = await ref.get();
    if (!snap.exists) return { cancelled: false };
    const data = snap.data() as any;
    if (data.userId !== userId) return { cancelled: false };
    if (data.status !== 'created') return { cancelled: false };
    await ref.set({ status: 'cancelled', cancelledAt: Date.now(), updatedAt: Date.now() }, { merge: true });
    console.log(`[payments] PAYMENT_CANCELLED order=${orderId} user=${userId}`);
    return { cancelled: true };
  }

  /**
   * Confirms a settled payment matches the order the SERVER priced. The order amount is already
   * server-derived, and the signature binds order+payment, so this is defence in depth — but it
   * is the check that makes "never trust a browser-supplied amount" true end to end rather than
   * merely true by construction. Unknown/absent amounts are treated as a mismatch, not waved
   * through, so a missing field can never become an accidental bypass.
   */
  async paymentMatchesOrder(orderId: string, paidAmount: unknown, paidCurrency: unknown): Promise<{ ok: boolean; reason?: string }> {
    const snap = await db.collection('payments').doc(orderId).get();
    if (!snap.exists) return { ok: false, reason: 'order-not-found' };
    const o = snap.data() as any;
    if (paidAmount == null) return { ok: false, reason: 'no-amount-on-event' };
    if (Number(paidAmount) !== Number(o.amountPaise)) {
      return { ok: false, reason: `amount-mismatch expected=${o.amountPaise} got=${paidAmount}` };
    }
    const expectedCurrency = o.currency || 'INR';
    if (paidCurrency && String(paidCurrency) !== expectedCurrency) {
      return { ok: false, reason: `currency-mismatch expected=${expectedCurrency} got=${paidCurrency}` };
    }
    return { ok: true };
  }

  /** Fetches a payment straight from Razorpay so the client path can be checked the same way. */
  async fetchRemotePayment(paymentId: string): Promise<{ amount?: number; currency?: string; status?: string } | null> {
    try {
      const p: any = await (this.client() as any).payments.fetch(paymentId);
      return { amount: p?.amount, currency: p?.currency, status: p?.status };
    } catch (e: any) {
      console.warn(`[payments] fetchRemotePayment failed for ${paymentId}: ${e?.error?.description || e?.message}`);
      return null;
    }
  }

  /** Order status for reconciliation — lets a browser that lost the callback learn the truth. */
  async getOrderStatus(orderId: string, userId: string): Promise<{ found: boolean; status?: string; orderType?: string; environment?: string; amountRupees?: number }> {
    const snap = await db.collection('payments').doc(orderId).get();
    if (!snap.exists) return { found: false };
    const d = snap.data() as any;
    if (d.userId !== userId) return { found: false };
    return { found: true, status: d.status, orderType: d.orderType, environment: d.environment, amountRupees: d.amountRupees };
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
      environment: this.environment,
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
      environment: this.environment,
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
    const data = snap.data() as any;

    // An order may only be applied by the environment that created it. Without this, a payment
    // made against `rzp_test_` keys grants real production access — which is precisely how the
    // first Pro entitlement on this system came to exist. Orders written before `environment`
    // was recorded carry no value; those are grandfathered through rather than retroactively
    // invalidated, since revoking an existing entitlement is not this function's decision.
    if (data.environment && data.environment !== this.environment) {
      console.warn(`[payments] PAYMENT_WEBHOOK_REJECTED_ENVIRONMENT order=${orderId} orderEnv=${data.environment} processEnv=${this.environment} source=${source}`);
      return { applied: false, orderType: null };
    }

    const stored = data.orderType;

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

    // Asynchronously dispatch payment receipt email
    void this.dispatchPaymentReceipt({
      userId: data.userId,
      orderId,
      paymentId,
      planName: data.className || 'Class Enrollment',
      amountRupees: data.amountRupees || Math.round((data.amountPaise || 0) / 100),
      billing: 'one-time',
      method,
      orderType: 'class_purchase',
      classTitle: data.className,
    });

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
    const userRef = db.collection('users').doc(data.userId);
    const now = Date.now();
    const billing = data.billing || 'monthly';
    const periodMs = billing === 'yearly' ? 365 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;

    // Both writes happen in ONE transaction. Previously they were sequential: if the order was
    // marked paid and the user write then failed, the caller was charged, held no Pro, and every
    // retry short-circuited on `status === 'paid'` and reported success — an unrecoverable
    // charged-but-free state. The transaction also re-reads inside the lock, so two racing
    // callers (webhook + client verify on the same order) collapse to a single activation.
    const outcome = await db.runTransaction(async (tx) => {
      const [orderSnap, userSnap] = await Promise.all([tx.get(ref), tx.get(userRef)]);
      if (!orderSnap.exists) return { upgraded: false, repaired: false, noop: false };

      const o = orderSnap.data() as any;
      const u = (userSnap.exists ? userSnap.data() : {}) as any;
      const alreadyEntitled = u?.plan === 'pro' && u?.subscription?.orderId === orderId;

      // Already fully applied — nothing to do. This is the only genuine no-op path.
      if (o.status === 'paid' && alreadyEntitled) {
        return { upgraded: true, repaired: false, noop: true };
      }

      if (o.status !== 'paid') {
        tx.set(ref, { status: 'paid', paymentId, paidAt: now, paidVia: source, updatedAt: now, ...(method ? { method } : {}) }, { merge: true });
      }

      tx.set(userRef, {
        plan: 'pro',
        proSince: u?.proSince ?? now,
        subscription: {
          status: 'active',
          plan: o.planId || 'pro',
          planName: o.planName || 'Sadhya Pro',
          billing,
          orderId,
          paymentId,
          method: method || null,
          amountRupees: o.amountRupees,
          activatedAt: now,
          currentPeriodEnd: now + periodMs,
          provider: 'razorpay',
          source,
        },
      }, { merge: true });

      // `repaired` = the order was already paid but the entitlement was missing, i.e. we just
      // healed a previously stranded charged-but-free user.
      return { upgraded: true, repaired: o.status === 'paid', noop: false };
    });

    if (outcome.noop) return { upgraded: true, userId: data.userId };
    if (!outcome.upgraded) return { upgraded: false };
    if (outcome.repaired) {
      console.warn(`[payments] PRO_ENTITLEMENT_REPAIRED user=${data.userId} order=${orderId} (order was paid but entitlement was missing)`);
    }
    console.log(`[payments] PRO_ENTITLEMENT_ACTIVATED user=${data.userId} order=${orderId} via=${source}`);

    // Asynchronously dispatch payment receipt and welcome email
    void this.dispatchPaymentReceipt({
      userId: data.userId,
      orderId,
      paymentId,
      planName: data.planName || 'Sadhya Pro (Launch Offer)',
      amountRupees: data.amountRupees || 199,
      billing,
      method,
      currentPeriodEnd: now + periodMs,
      orderType: 'subscription',
    });

    return { upgraded: true, userId: data.userId };
  }

  /**
   * Asynchronously dispatches a branded Tax Invoice & Payment Receipt email to the user.
   * Catches errors so payment activation is never blocked if mail delivery fails.
   */
  async dispatchPaymentReceipt(params: {
    userId: string;
    orderId: string;
    paymentId?: string;
    planName: string;
    amountRupees: number;
    billing?: string;
    method?: string;
    currentPeriodEnd?: number;
    orderType?: 'subscription' | 'class_purchase';
    classTitle?: string;
  }): Promise<boolean> {
    try {
      const userSnap = await db.collection('users').doc(params.userId).get();
      if (!userSnap.exists) {
        console.warn(`[payments] User ${params.userId} not found for receipt dispatch.`);
        return false;
      }
      const userData = userSnap.data() as any;
      const email = userData?.email;
      if (!email) {
        console.warn(`[payments] User ${params.userId} has no email on file; skipping receipt dispatch.`);
        return false;
      }

      const displayName = userData?.displayName || userData?.name || email.split('@')[0];
      const sent = await zeptoMailService.sendPaymentReceiptEmail({
        email,
        displayName,
        planName: params.planName,
        amountRupees: params.amountRupees,
        billing: params.billing,
        orderId: params.orderId,
        paymentId: params.paymentId,
        method: params.method,
        currentPeriodEnd: params.currentPeriodEnd,
        orderType: params.orderType,
        classTitle: params.classTitle,
      });

      if (sent) {
        console.log(`[payments] ✉️ Payment receipt email successfully sent to ${email} (order=${params.orderId})`);
      } else {
        console.warn(`[payments] ⚠️ Payment receipt dispatch returned false for ${email} (order=${params.orderId})`);
      }
      return sent;
    } catch (err: any) {
      console.error(`[payments] Failed to dispatch payment receipt email for user ${params.userId}:`, err?.message || err);
      return false;
    }
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

  /**
   * Handles a verified webhook event. Returns whether an upgrade was applied.
   *
   * Razorpay retries delivery and can send the same event more than once — a single ₹1 test
   * produced two deliveries in seconds. Applying an order is already idempotent (both
   * `markPaidAndUpgrade` and `markOrderPaidOnly` no-op once `status === 'paid'`), so the guard
   * here is a second layer: it stops repeat *side effects* hanging off this path, and gives a
   * clean PAYMENT_WEBHOOK_DUPLICATE signal instead of silent rework. `create()` fails when the
   * doc already exists, which makes the claim atomic without needing a transaction.
   */
  async handleWebhookEvent(event: any, eventId?: string): Promise<{ handled: boolean; duplicate?: boolean }> {
    const type = event?.event;

    if (eventId) {
      try {
        await db.collection('webhookEvents').doc(eventId).create({
          eventId, type: type ?? null, provider: 'razorpay', receivedAt: Date.now(),
        });
      } catch {
        console.log(`[payments] PAYMENT_WEBHOOK_DUPLICATE event=${eventId} type=${type}`);
        return { handled: true, duplicate: true };
      }
    }

    // Both events carry the order id; payment.captured is the primary success signal.
    if (type === 'payment.captured' || type === 'order.paid') {
      const payment = event?.payload?.payment?.entity;
      const orderEntity = event?.payload?.order?.entity;
      const orderId = payment?.order_id || orderEntity?.id;
      const paymentId = payment?.id || 'webhook';
      if (orderId) {
        // Report what actually happened. Logging PROCESSED for an event the environment guard
        // refused would make a rejected cross-environment payment look like a successful one.
        // Amount/currency are checked against the order the SERVER priced, using the values
        // Razorpay itself signed into the event — so a payment that does not match the order it
        // claims to settle cannot activate anything.
        // `order.paid` can carry the settled amount on the ORDER entity rather than the payment
        // one. Reading only `payment.amount` would refuse a legitimate activation as
        // "no-amount-on-event", so fall back across both entities before deciding.
        const settledAmount = payment?.amount ?? orderEntity?.amount_paid ?? orderEntity?.amount;
        const settledCurrency = payment?.currency ?? orderEntity?.currency;
        const amountOk = await this.paymentMatchesOrder(orderId, settledAmount, settledCurrency);
        if (!amountOk.ok) {
          console.warn(`[payments] PAYMENT_WEBHOOK_REJECTED_AMOUNT order=${orderId} reason=${amountOk.reason}`);
          return { handled: true };
        }

        const outcome = await this.applyOrderPayment(orderId, paymentId, 'webhook', payment?.method);
        if (outcome.applied) {
          console.log(`[payments] PAYMENT_WEBHOOK_PROCESSED event=${eventId ?? 'n/a'} type=${type} order=${orderId} orderType=${outcome.orderType}`);
        } else {
          console.warn(`[payments] PAYMENT_WEBHOOK_NOT_APPLIED event=${eventId ?? 'n/a'} type=${type} order=${orderId}`);
        }
        return { handled: true };
      }
    }

    // A genuine payment failure reported by Razorpay — record it so the order reaches a terminal
    // state instead of sitting in `created` and looking like an abandoned checkout forever.
    if (type === 'payment.failed') {
      const orderId = event?.payload?.payment?.entity?.order_id;
      if (orderId) {
        const ref = db.collection('payments').doc(orderId);
        const snap = await ref.get();
        if (snap.exists && (snap.data() as any).status === 'created') {
          await ref.set({ status: 'failed', failedAt: Date.now(), updatedAt: Date.now() }, { merge: true });
          console.log(`[payments] PAYMENT_FAILED order=${orderId} (via webhook)`);
        }
        return { handled: true };
      }
    }

    // Handle refunds created or processed from Razorpay Dashboard (Admin-assisted / Method 1)
    if (type === 'payment.refund.created' || type === 'refund.processed' || type === 'refund.created') {
      const refundEntity = event?.payload?.refund?.entity;
      const paymentEntity = event?.payload?.payment?.entity;
      const paymentId = refundEntity?.payment_id || paymentEntity?.id;
      const refundId = refundEntity?.id;
      const refundAmountPaise = refundEntity?.amount;
      const refundAmountRupees = refundAmountPaise ? Math.round(refundAmountPaise / 100) : 199;

      if (paymentId) {
        // Find the payment document by paymentId
        const snap = await db.collection('payments').where('paymentId', '==', paymentId).limit(1).get();
        if (!snap.empty) {
          const doc = snap.docs[0];
          const orderData = doc.data() as any;
          const orderId = doc.id;
          const userId = orderData.userId;
          const now = Date.now();

          await db.runTransaction(async (tx) => {
            tx.set(
              doc.ref,
              {
                status: 'refunded',
                refundId: refundId || `ref_${now}`,
                refundAmountRupees,
                refundedAt: now,
                updatedAt: now,
              },
              { merge: true },
            );

            if (userId && orderData.orderType !== 'class_purchase') {
              tx.set(
                db.collection('users').doc(userId),
                {
                  plan: 'free',
                  isPro: false,
                  subscription: {
                    status: 'refunded',
                    refundId: refundId || `ref_${now}`,
                    refundedAt: now,
                    currentPeriodEnd: now,
                    planName: 'Free',
                    updatedAt: now,
                  },
                },
                { merge: true },
              );
            }
          });

          console.log(`[payments] PAYMENT_REFUND_PROCESSED order=${orderId} payment=${paymentId} refund=${refundId}`);
          
          if (userId) {
            void this.dispatchRefundConfirmation({
              userId,
              orderId,
              paymentId,
              refundId: refundId || `ref_${now}`,
              amountRupees: refundAmountRupees,
              planName: orderData.planName || 'Sadhya Pro',
              method: orderData.method || paymentEntity?.method || 'UPI',
            });
          }
          return { handled: true };
        }
      }
    }

    return { handled: false };
  }

  /**
   * Processes a 7-Day Money-Back Guarantee self-service refund (Method 2).
   * Serialized per user via withUserLock to eliminate double-submit concurrency attacks.
   */
  async requestSelfServiceRefund(params: {
    userId: string;
    orderId: string;
    reason?: string;
  }): Promise<{
    success: boolean;
    refundId?: string;
    amountRupees: number;
    message: string;
  }> {
    return this.withUserLock(params.userId, async () => {
      const { userId, orderId, reason } = params;
      const paymentRef = db.collection('payments').doc(orderId);
      const userRef = db.collection('users').doc(userId);

      const snap = await paymentRef.get();
      if (!snap.exists) {
        fail('ORDER_NOT_FOUND', 'Payment record not found.');
      }

    const orderData = snap.data() as any;
    if (orderData.userId !== userId) {
      fail('UNAUTHORIZED', 'You do not have permission to refund this transaction.');
    }

    if (orderData.status === 'refunded') {
      fail('ALREADY_REFUNDED', 'This order has already been refunded.');
    }

    if (orderData.status !== 'paid') {
      fail('INVALID_STATUS', 'Only completed, paid transactions can be refunded.');
    }

    // 7-day refund guarantee window check (7 days = 7 * 24 * 60 * 60 * 1000 ms)
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const paidAt = Number(orderData.paidAt || orderData.activatedAt || orderData.createdAt || 0);
    const now = Date.now();
    if (paidAt > 0 && now - paidAt > SEVEN_DAYS_MS) {
      fail(
        'GUARANTEE_EXPIRED',
        'The 7-day money-back guarantee period for this transaction has expired. For assistance, contact support@sadhya.app.',
      );
    }

    const paymentId = orderData.paymentId;
    if (!paymentId) {
      fail('MISSING_PAYMENT_ID', 'Payment reference ID is missing for this transaction.');
    }

    const amountRupees = Number(orderData.amountRupees || 199);
    const amountPaise = amountRupees * 100;

    let rzpRefund: any;
    try {
      rzpRefund = await this.client().payments.refund(paymentId, {
        amount: amountPaise,
        notes: {
          reason: reason || '7-day guarantee refund',
          userId,
          orderId,
          refundedBy: 'student_self_service',
        },
      });
    } catch (err: any) {
      console.error(`[payments] Razorpay refund API failed for order ${orderId}:`, err?.message || err);
      const detail = err?.error?.description || err?.message || 'Payment gateway refund failed';
      fail('GATEWAY_REFUND_FAILED', `Refund processing error: ${detail}`);
    }

    const refundId = rzpRefund?.id || `ref_${now}`;

    // Atomic update in Firestore: mark payment refunded and reset user subscription to free
    await db.runTransaction(async (tx) => {
      tx.set(
        paymentRef,
        {
          status: 'refunded',
          refundId,
          refundAmountRupees: amountRupees,
          refundReason: reason || '7-Day Guarantee Refund',
          refundedAt: now,
          updatedAt: now,
        },
        { merge: true },
      );

      // If this was a subscription order, reset user plan to free
      if (orderData.orderType !== 'class_purchase') {
        tx.set(
          userRef,
          {
            plan: 'free',
            isPro: false,
            subscription: {
              status: 'refunded',
              refundId,
              refundedAt: now,
              cancelledAt: now,
              currentPeriodEnd: now,
              planName: 'Free',
              updatedAt: now,
            },
          },
          { merge: true },
        );
      }
    });

    console.log(`[payments] 💸 Self-service refund processed: user=${userId} order=${orderId} refund=${refundId}`);

    // Send Refund Confirmation Email via ZeptoMail
    void this.dispatchRefundConfirmation({
      userId,
      orderId,
      paymentId,
      refundId,
      amountRupees,
      planName: orderData.planName || 'Sadhya Pro',
      method: orderData.method || 'UPI',
    });

      return {
        success: true,
        refundId,
        amountRupees,
        message: `₹${amountRupees} full refund initiated successfully to your original payment method.`,
      };
    });
  }

  /**
   * Helper that fetches user email and dispatches the refund confirmation credit note.
   */
  async dispatchRefundConfirmation(params: {
    userId: string;
    orderId: string;
    paymentId?: string;
    refundId?: string;
    planName: string;
    amountRupees: number;
    method?: string;
  }): Promise<boolean> {
    try {
      const userDoc = await db.collection('users').doc(params.userId).get();
      const userData = userDoc.data();
      const email = userData?.email;
      if (!email) {
        console.warn(`[payments] User ${params.userId} has no email on file; skipping refund confirmation dispatch.`);
        return false;
      }

      const displayName = userData?.displayName || userData?.name || email.split('@')[0];
      const sent = await zeptoMailService.sendRefundConfirmationEmail({
        email,
        displayName,
        planName: params.planName,
        amountRupees: params.amountRupees,
        orderId: params.orderId,
        paymentId: params.paymentId,
        refundId: params.refundId,
        method: params.method,
      });

      if (sent) {
        console.log(`[payments] ✉️ Refund confirmation email sent to ${email} (order=${params.orderId})`);
      }
      return sent;
    } catch (err: any) {
      console.error(`[payments] Failed to dispatch refund confirmation email:`, err?.message || err);
      return false;
    }
  }
}

export const paymentsService = new PaymentsService();
