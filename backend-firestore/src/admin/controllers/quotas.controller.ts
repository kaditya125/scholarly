import { Request, Response } from 'express';
import { adminQuotasService } from '../services/adminQuotas.service';
import { logger } from '../../utils/logger';

/**
 * Quota and entitlement reporting endpoints.
 *
 * AUTHORISATION. None here, deliberately — these are mounted behind `requireAdmin` in
 * admin.routes.ts, which verifies the token signature and role claim before any handler
 * runs. Repeating it would give the rule a second home to drift from.
 */
export class QuotasController {
  /**
   * GET /api/admin/quotas
   *
   * Takes no parameters. The window is always "periods currently being metered", because a
   * quota is only meaningful against the period it resets in — letting a caller ask for an
   * arbitrary range would return numbers that look comparable and are not.
   */
  overview = async (_req: Request, res: Response) => {
    try {
      const data = await adminQuotasService.getOverview();
      res.json(data);
    } catch (error) {
      logger.error('[admin/quotas] overview failed', { error });
      res.status(500).json({ error: 'Failed to load quota overview' });
    }
  };
}

export const quotasController = new QuotasController();
