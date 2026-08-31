import { Request, Response, NextFunction } from 'express';
import { paymentsService } from '../services/payments.service';
import { usageService } from '../services/usage.service';

export class PaymentsController {
  /** Public config so the frontend knows whether payments are enabled + the public key id. */
  public getConfig = (_req: Request, res: Response) => {
    res.json({ enabled: paymentsService.isEnabled(), keyId: paymentsService.publicKeyId || null });
  };

  /** Creates a Razorpay order for the authenticated user. */
  public createOrder = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      if (!paymentsService.isEnabled()) {
        return res.status(503).json({ error: 'Payments are not configured on this server.' });
      }

      // 1. Generic amount path (e.g. from standard checkout)
      if (req.body?.amount != null) {
        const amountPaise = Number(req.body.amount);
        if (isNaN(amountPaise) || amountPaise < 100) {
          return res.status(400).json({ error: 'Amount must be at least 100 paise (₹1).' });
        }
        const currency = req.body.currency || 'INR';
        const receipt = req.body.receipt;
        const notes = req.body.notes;
        const order = await paymentsService.createGenericOrder(userId, amountPaise, currency, receipt, notes);
        return res.json(order);
      }

      // 2. Plan/subscription path
      const planId = String(req.body?.plan || 'pro').toLowerCase();
      const yearly = req.body?.billing === 'yearly';

      // The backend is the authority on entitlement, not the button. Hiding the CTA stops an
      // honest double-purchase; this stops a scripted one. A user who already holds active Pro
      // cannot mint another Pro order by calling this endpoint directly.
      const entitlement = await paymentsService.hasActivePro(userId);
      if (entitlement.active) {
        console.log(`[payments] ORDER_REJECTED_ALREADY_PRO user=${userId}`);
        return res.status(409).json({
          code: 'ALREADY_PRO',
          error: "You're already a Pro member.",
          currentPeriodEnd: entitlement.currentPeriodEnd ?? null,
        });
      }

      const order = await paymentsService.createOrder(userId, planId, yearly);
      res.json(order);
    } catch (error: any) {
      if (/Unknown plan/i.test(error?.message || '')) {
        return res.status(400).json({ error: error.message });
      }
      console.error('[payments] createOrder failed:', error?.message || error);
      next(error);
    }
  };

  /** Returns the authenticated user's current plan + subscription (for the UI Pro badge). */
  public getSubscription = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      // `isPro` MUST come from the same predicate the order endpoint enforces. Deriving it from
      // `plan === 'pro'` alone ignored expiry, so a lapsed subscriber was shown as Pro, had the
      // upgrade CTA hidden and was refused at checkout — while the server would have sold to
      // them. One authority, so the UI and the API cannot contradict each other.
      const info = await paymentsService.getUserPlan(userId);
      const entitlement = paymentsService.evaluateEntitlement(info.plan, info.subscription);
      res.json({
        ...info,
        isPro: entitlement.active,
        currentPeriodEnd: entitlement.currentPeriodEnd ?? null,
      });
    } catch (error) {
      next(error);
    }
  };

  /** Returns the authenticated user's payment/invoice history. */
  public getHistory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const payments = await paymentsService.getHistory(userId);
      res.json({ payments });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Reconciliation endpoint. Lets a browser that lost the success callback — closed tab, dropped
   * network, crashed mid-payment — ask the server what actually happened, instead of the user
   * being told "failed" for a payment that succeeded. Scoped to the caller's own orders.
   */
  public getOrderStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const result = await paymentsService.getOrderStatus(String(req.params.orderId), userId);
      if (!result.found) return res.status(404).json({ code: 'ORDER_NOT_FOUND', error: 'Order not found.' });
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  /** Dispatches or re-sends the payment receipt email for an order owned by the user. */
  public resendReceipt = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const orderId = String(req.params.orderId);
      const owned = await paymentsService.getOrderStatus(orderId, userId);
      if (!owned.found) {
        return res.status(404).json({ code: 'ORDER_NOT_FOUND', error: 'Order not found.' });
      }

      const snap = await paymentsService.getUserPlan(userId);
      const history = await paymentsService.getHistory(userId);
      const order = history.find((h) => h.orderId === orderId);

      const sent = await paymentsService.dispatchPaymentReceipt({
        userId,
        orderId,
        paymentId: order?.paymentId || (owned as any)?.paymentId,
        planName: order?.planName || 'Sadhya Pro (Launch Offer)',
        amountRupees: order?.amountRupees || 199,
        billing: order?.billing || 'monthly',
        method: order?.method || undefined,
        currentPeriodEnd: snap.subscription?.currentPeriodEnd,
        orderType: (order?.orderType as any) || 'subscription',
        classTitle: order?.orderType === 'class_purchase' ? order.planName : undefined,
      });

      res.json({ success: sent });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Processes a 7-Day Money-Back Guarantee self-service refund (Method 2).
   */
  public requestRefund = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const { orderId, reason } = req.body;
      if (!orderId) {
        return res.status(400).json({ code: 'MISSING_ORDER_ID', error: 'orderId is required.' });
      }

      const result = await paymentsService.requestSelfServiceRefund({
        userId,
        orderId: String(orderId),
        reason: typeof reason === 'string' ? reason.trim().slice(0, 500) : undefined,
      });

      res.json(result);
    } catch (error: any) {
      const statusMap: Record<string, number> = {
        ORDER_NOT_FOUND: 404,
        UNAUTHORIZED: 403,
        ALREADY_REFUNDED: 400,
        INVALID_STATUS: 400,
        GUARANTEE_EXPIRED: 400,
        GATEWAY_REFUND_FAILED: 502,
      };
      const status = statusMap[error?.code] || (error?.statusCode ?? 500);
      res.status(status).json({
        code: error?.code || 'REFUND_FAILED',
        error: error?.message || 'Failed to process refund request.',
      });
    }
  };

  /**
   * Records that the user dismissed Razorpay checkout. Only moves `created` -> `cancelled`, so
   * it can never overwrite a payment that actually completed — a dismissal racing a real
   * capture leaves the `paid` state intact.
   */
  public cancelOrder = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const result = await paymentsService.markOrderCancelled(String(req.params.orderId), userId);
      res.json({ success: true, cancelled: result.cancelled });
    } catch (error) {
      next(error);
    }
  };

  /** Verifies the client checkout callback signature and upgrades the user on success. */
  public verifyPayment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
      const ok = paymentsService.verifyCheckoutSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
      if (!ok) {
        return res.status(400).json({ success: false, error: 'Invalid payment signature' });
      }

      // Ownership is checked BEFORE any side effect. It used to run *after* applyOrderPayment,
      // so the 403 was cosmetic — the entitlement had already been written by the time the
      // caller was told they had no business touching this order.
      const owned = await paymentsService.getOrderStatus(razorpay_order_id, userId);
      if (!owned.found) {
        console.warn(`[payments] PAYMENT_REJECTED_UNAUTHORIZED_ORDER order=${razorpay_order_id} user=${userId}`);
        return res.status(403).json({ code: 'ORDER_NOT_OWNED', success: false, error: 'Order does not belong to this user' });
      }

      // Confirm with Razorpay that the settled amount/currency match the order the SERVER priced.
      // The signature already binds order+payment, so this is defence in depth; on a lookup
      // failure we decline to activate here and let the webhook (the source of truth) finish,
      // rather than failing open on a security check.
      const remote = await paymentsService.fetchRemotePayment(razorpay_payment_id);
      if (remote) {
        const match = await paymentsService.paymentMatchesOrder(razorpay_order_id, remote.amount, remote.currency);
        if (!match.ok) {
          console.warn(`[payments] PAYMENT_REJECTED_AMOUNT order=${razorpay_order_id} reason=${match.reason}`);
          return res.status(400).json({ code: 'PAYMENT_AMOUNT_MISMATCH', success: false, error: 'Payment could not be verified.' });
        }
      }

      const result = await paymentsService.applyOrderPayment(razorpay_order_id, razorpay_payment_id, 'client');
      if (result.orderType === 'class_purchase') {
        return res.json({ success: true, orderType: 'class_purchase', classId: result.classId });
      }
      if (result.orderType === 'subscription') {
        return res.json({ success: true, orderType: 'subscription', plan: 'pro' });
      }
      // Generic / unrecognised order: payment recorded, but no plan was granted. Reporting
      // `plan: 'pro'` here would have the client show Pro for an entitlement the server
      // never actually applied.
      res.json({ success: true, orderType: result.orderType ?? 'unknown', plan: null });
    } catch (error: any) {
      console.error('[payments] verifyPayment failed:', error?.message || error);
      next(error);
    }
  };

  /**
   * Razorpay webhook. Verifies the signature against the RAW request body, then upgrades the
   * user. Always responds 200 on a successfully-verified event (even if we chose not to act)
   * so Razorpay doesn't retry indefinitely; 400 only on signature failure.
   */
  public webhook = async (req: Request, res: Response) => {
    try {
      const signature = req.headers['x-razorpay-signature'] as string | undefined;
      const rawBody: Buffer | undefined = (req as any).rawBody;
      const payload = rawBody ?? Buffer.from(JSON.stringify(req.body || {}));

      if (!paymentsService.verifyWebhookSignature(payload, signature)) {
        console.warn('[payments] Webhook signature verification failed.');
        return res.status(400).json({ error: 'Invalid signature' });
      }

      const eventId = (req.headers['x-razorpay-event-id'] as string | undefined) || undefined;
      console.log(`[payments] PAYMENT_WEBHOOK_RECEIVED event=${eventId ?? 'n/a'} type=${req.body?.event ?? 'n/a'}`);
      await paymentsService.handleWebhookEvent(req.body, eventId);
      res.status(200).json({ received: true });
    } catch (error: any) {
      // Log but still 200 so Razorpay doesn't hammer retries on a transient error we've recorded.
      console.error('[payments] webhook handling error:', error?.message || error);
      res.status(200).json({ received: true });
    }
  };

  /** Returns user's monthly usage, limits, and reset dates across all metered features. */
  public getUsage = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const summary = await usageService.getUsageSummary(userId);
      res.json(summary);
    } catch (error: any) {
      console.error('[payments] getUsage failed:', error?.message || error);
      next(error);
    }
  };
}
