import { Request, Response, NextFunction } from 'express';
import { paymentsService } from '../services/payments.service';

export class PaymentsController {
  /** Public config so the frontend knows whether payments are enabled + the public key id. */
  public getConfig = (_req: Request, res: Response) => {
    res.json({ enabled: paymentsService.isEnabled(), keyId: paymentsService.publicKeyId || null });
  };

  /** Creates a Razorpay order for the authenticated user. Amount is computed server-side. */
  public createOrder = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      if (!paymentsService.isEnabled()) {
        return res.status(503).json({ error: 'Payments are not configured on this server.' });
      }

      const planId = String(req.body?.plan || 'pro').toLowerCase();
      const yearly = req.body?.billing === 'yearly';

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
      const info = await paymentsService.getUserPlan(userId);
      res.json({ ...info, isPro: info.plan === 'pro' });
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

      const result = await paymentsService.applyOrderPayment(razorpay_order_id, razorpay_payment_id, 'client');
      // Guard against a signed callback for someone else's order.
      if (result.userId && result.userId !== userId) {
        return res.status(403).json({ success: false, error: 'Order does not belong to this user' });
      }
      if (result.orderType === 'class_purchase') {
        return res.json({ success: true, orderType: 'class_purchase', classId: result.classId });
      }
      res.json({ success: true, orderType: 'subscription', plan: 'pro' });
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

      await paymentsService.handleWebhookEvent(req.body);
      res.status(200).json({ received: true });
    } catch (error: any) {
      // Log but still 200 so Razorpay doesn't hammer retries on a transient error we've recorded.
      console.error('[payments] webhook handling error:', error?.message || error);
      res.status(200).json({ received: true });
    }
  };
}
