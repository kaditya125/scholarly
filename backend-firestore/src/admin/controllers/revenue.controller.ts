import { Request, Response } from 'express';
import { adminRevenueService } from '../services/adminRevenue.service';
import { logger } from '../../utils/logger';

/**
 * Revenue reporting endpoints.
 *
 * AUTHORISATION. Mounted behind `requireFinanceAdmin` in admin.routes.ts (super_admin
 * and admin only, moderator excluded) — matches adminNav.ts's `minRole` on the Revenue
 * nav entry, which is presentation only and enforces nothing by itself.
 */
export class RevenueController {
  /**
   * GET /api/admin/revenue
   *
   * Takes no parameters — a fixed aggregate over `payments`, not a filtered report.
   */
  overview = async (_req: Request, res: Response) => {
    try {
      const data = await adminRevenueService.getOverview();
      res.json(data);
    } catch (error) {
      logger.error('[admin/revenue] overview failed', { error });
      res.status(500).json({ error: 'Failed to load revenue overview' });
    }
  };
}

export const revenueController = new RevenueController();
