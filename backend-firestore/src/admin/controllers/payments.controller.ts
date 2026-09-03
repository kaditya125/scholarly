import { Request, Response } from 'express';
import { adminPaymentsService } from '../services/adminPayments.service';
import { logger } from '../../utils/logger';

/**
 * Payments directory endpoints.
 *
 * AUTHORISATION. Mounted behind `requireFinanceAdmin` in admin.routes.ts (super_admin
 * and admin only, moderator excluded) — matches adminNav.ts's `minRole` on the Payments
 * nav entry, which is presentation only and enforces nothing by itself.
 */
export class PaymentsController {
  /**
   * GET /api/admin/payments
   *
   * Takes no parameters. `payments` is small enough today for a capped, unfiltered scan
   * (see adminPayments.service.ts) - search/filter/pagination is the follow-up once the
   * collection grows enough to need it.
   */
  list = async (_req: Request, res: Response) => {
    try {
      const data = await adminPaymentsService.list();
      res.json(data);
    } catch (error) {
      logger.error('[admin/payments] list failed', { error });
      res.status(500).json({ error: 'Failed to load payments' });
    }
  };
}

export const paymentsController = new PaymentsController();
