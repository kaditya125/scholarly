import { Request, Response } from 'express';
import { adminSubscriptionsService } from '../services/adminSubscriptions.service';
import { logger } from '../../utils/logger';

/**
 * Subscriptions reporting endpoints.
 *
 * AUTHORISATION. Mounted behind `requireFinanceAdmin` in admin.routes.ts (super_admin
 * and admin only, moderator excluded) — matches adminNav.ts's `minRole` on the
 * Subscriptions nav entry, which is presentation only and enforces nothing by itself.
 */
export class SubscriptionsController {
  /**
   * GET /api/admin/subscriptions
   *
   * Takes no parameters — every pro-plan account, not a filtered report.
   */
  overview = async (_req: Request, res: Response) => {
    try {
      const data = await adminSubscriptionsService.getOverview();
      res.json(data);
    } catch (error) {
      logger.error('[admin/subscriptions] overview failed', { error });
      res.status(500).json({ error: 'Failed to load subscriptions overview' });
    }
  };
}

export const subscriptionsController = new SubscriptionsController();
